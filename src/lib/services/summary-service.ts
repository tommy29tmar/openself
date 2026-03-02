import { eq, and, or, gt, inArray, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { messages, conversationSummaries } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { generateText } from "ai";
import { getModelForTier, getModelIdForTier, getProviderName } from "@/lib/ai/provider";
import { recordUsage, checkBudget } from "@/lib/services/usage-service";
import { enqueueJob } from "@/lib/worker/index";
import { getSessionMeta, type JournalEntry } from "@/lib/services/session-metadata";

type SummaryRow = {
  id: string;
  ownerKey: string;
  summary: string;
  cursorCreatedAt: string;
  cursorMessageId: string;
  messageCount: number;
};

/**
 * Get the current summary for an owner.
 */
export function getSummary(ownerKey: string): string | null {
  const row = db
    .select({ summary: conversationSummaries.summary })
    .from(conversationSummaries)
    .where(eq(conversationSummaries.ownerKey, ownerKey))
    .get();
  return row?.summary ?? null;
}

/**
 * Get messages after the current summary cursor, across all session keys.
 */
function getUnsummarizedMessages(
  ownerKey: string,
  messageKeys: string[],
): Array<{ id: string; role: string; content: string; createdAt: string | null }> {
  if (messageKeys.length === 0) return [];

  // Get current cursor
  const cursor = sqlite
    .prepare(
      "SELECT cursor_created_at, cursor_message_id FROM conversation_summaries WHERE owner_key = ?",
    )
    .get(ownerKey) as
    | { cursor_created_at: string; cursor_message_id: string }
    | undefined;

  if (!cursor) {
    // No summary yet — return all messages
    return db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.sessionId, messageKeys))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .all();
  }

  // Messages after cursor (compound: created_at > cursor OR (created_at = cursor AND id > cursor_id))
  return db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        inArray(messages.sessionId, messageKeys),
        or(
          gt(messages.createdAt, cursor.cursor_created_at),
          and(
            eq(messages.createdAt, cursor.cursor_created_at),
            gt(messages.id, cursor.cursor_message_id),
          ),
        ),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();
}

/**
 * Compress journal entries into a max-3-line digest for summary enrichment.
 * Groups by tool name, counts operations.
 */
export function buildJournalDigest(journal: JournalEntry[]): string {
  if (journal.length === 0) return "";
  const toolCounts = new Map<string, number>();
  for (const entry of journal) {
    toolCounts.set(entry.toolName, (toolCounts.get(entry.toolName) ?? 0) + 1);
  }
  const lines = Array.from(toolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `- ${tool}: ${count}x`)
    .slice(0, 3);
  return `\nActions taken in this conversation:\n${lines.join("\n")}`;
}

/**
 * Generate/update the conversation summary for an owner.
 * Uses CAS (compare-and-swap) for race safety.
 */
export async function generateSummary(
  ownerKey: string,
  messageKeys: string[],
): Promise<boolean> {
  // Budget check
  const budget = checkBudget();
  if (!budget.allowed) return false;

  const unsummarized = getUnsummarizedMessages(ownerKey, messageKeys);
  if (unsummarized.length < 5) return false; // not enough to summarize

  // Get existing summary for merge
  const existingSummary = getSummary(ownerKey) ?? "";

  // Build prompt
  const messagesText = unsummarized
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n");

  const prompt = existingSummary
    ? `You are summarizing a conversation for an AI assistant's memory.

PREVIOUS SUMMARY:
${existingSummary}

NEW MESSAGES TO INCORPORATE:
${messagesText}

Write an updated summary that merges the previous summary with the new messages. Focus on:
- Key facts about the user (name, occupation, interests, skills, projects)
- Important decisions made
- User preferences expressed
- Current state of their page/profile

Keep the summary concise (under 500 words). Write in third person.`
    : `You are summarizing a conversation for an AI assistant's memory.

MESSAGES:
${messagesText}

Write a concise summary focusing on:
- Key facts about the user (name, occupation, interests, skills, projects)
- Important decisions made
- User preferences expressed
- Current state of their page/profile

Keep the summary concise (under 500 words). Write in third person.`;

  // Circuit F1: read journal from session metadata and build digest
  const journalEntries: JournalEntry[] = [];
  for (const sessionKey of messageKeys) {
    const meta = getSessionMeta(sessionKey);
    if (meta?.journal && Array.isArray(meta.journal)) {
      journalEntries.push(...(meta.journal as JournalEntry[]));
    }
  }
  const journalDigest = buildJournalDigest(journalEntries);
  const fullPrompt = journalDigest ? `${prompt}\n\n${journalDigest}` : prompt;

  try {
    const model = getModelForTier("medium");
    const modelId = getModelIdForTier("medium");

    const result = await generateText({
      model,
      prompt: fullPrompt,
      maxTokens: 800,
    });

    const newSummary = result.text.trim();
    if (!newSummary) return false;

    // Determine new cursor from last unsummarized message
    const lastMsg = unsummarized[unsummarized.length - 1];
    const newCursorCreatedAt = lastMsg.createdAt ?? new Date().toISOString();
    const newCursorMessageId = lastMsg.id;
    const totalCount = unsummarized.length;

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;

    // Atomic CAS update
    const success = sqlite.transaction(() => {
      // Step A: Ensure row exists (race-safe via ON CONFLICT)
      const newId = randomUUID();
      sqlite
        .prepare(
          `INSERT INTO conversation_summaries(id, owner_key, summary, cursor_created_at, cursor_message_id, message_count)
           VALUES (?, ?, '', '1970-01-01T00:00:00Z', '__init__', 0)
           ON CONFLICT(owner_key) DO NOTHING`,
        )
        .run(newId, ownerKey);

      // Read current cursor for CAS
      const current = sqlite
        .prepare(
          "SELECT cursor_created_at, cursor_message_id FROM conversation_summaries WHERE owner_key = ?",
        )
        .get(ownerKey) as {
        cursor_created_at: string;
        cursor_message_id: string;
      };

      // Step B: CAS update
      const updateResult = sqlite
        .prepare(
          `UPDATE conversation_summaries
           SET summary=?, cursor_created_at=?, cursor_message_id=?, message_count=?,
               tokens_in=?, tokens_out=?, model=?, updated_at=datetime('now')
           WHERE owner_key=? AND cursor_created_at=? AND cursor_message_id=?`,
        )
        .run(
          newSummary,
          newCursorCreatedAt,
          newCursorMessageId,
          totalCount,
          tokensIn,
          tokensOut,
          modelId,
          ownerKey,
          current.cursor_created_at,
          current.cursor_message_id,
        );

      return updateResult.changes === 1;
    })();

    // Record usage regardless of CAS outcome (LLM was already called)
    if (tokensIn > 0 || tokensOut > 0) {
      recordUsage(getProviderName(), modelId, tokensIn, tokensOut);
    }

    return success;
  } catch (error) {
    console.error("[summary] Failed to generate summary:", error);
    return false;
  }
}

/**
 * Enqueue a summary job for the worker. Dedup via job_type+payload.
 */
export function enqueueSummaryJob(ownerKey: string, messageKeys?: string[]): void {
  try {
    enqueueJob("memory_summary", { ownerKey, messageKeys: messageKeys ?? [ownerKey] });
  } catch {
    // Best-effort — don't fail the chat request
  }
}
