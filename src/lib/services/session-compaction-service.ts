/**
 * Session compaction service.
 * Incremental rowid cursor, anti-burn guard, strict JSON.
 */
import { generateText } from "ai";
import { randomUUID } from "crypto";
import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";
import { checkBudget, recordUsage } from "@/lib/services/usage-service";
import { sqlite } from "@/lib/db";
import { getActiveFacts } from "@/lib/services/kb-service";
import { getSummary } from "@/lib/services/summary-service";

const MAX_MESSAGES_CHARS = 60_000;
const MAX_FAILURES_PER_WINDOW = 3;

export type CompactionInput = {
  ownerKey: string;
  sessionKey: string;
  messages: Array<{ rowid: number; role: string; content: string }>;
  existingFacts?: import("@/lib/services/kb-service").FactRow[];
  knowledgeReadKeys?: string[];
};

export type CompactionSummary = {
  topics: string[];
  factsChanged: string[];
  patternsObserved: string[];
  sessionMood: "productive" | "exploratory" | "corrective" | "casual";
  keyTakeaways: string[];
};

export type CompactionResult = {
  success: boolean;
  skipped: boolean;
  factsExtracted: number;
  factsUpdated: number;
  patternsDetected: number;
  structuredSummary: CompactionSummary | null;
  tokensIn: number;
  tokensOut: number;
  modelId: string;
  error?: string;
  errorCode?: "json_parse_failure" | "schema_validation_failure" | "transient";
};

const COMPACTION_PROMPT = (messagesText: string, existingFactsSummary: string, existingSummary: string) =>
  `You are analyzing a conversation between a user and an AI assistant building their personal web page.

${existingSummary ? `PREVIOUS CONTEXT:\n${existingSummary}\n\n` : ""}${existingFactsSummary ? `EXISTING KNOWN FACTS:\n${existingFactsSummary}\n\n` : ""}CONVERSATION TO ANALYZE:
${messagesText}

Produce a JSON object:
{
  "topics": ["string"],
  "factsChanged": ["string"],
  "patternsObserved": ["string"],
  "sessionMood": "productive|exploratory|corrective|casual",
  "keyTakeaways": ["string"]
}

## patternsObserved (array of max 3 strings)
Extract BEHAVIORAL PATTERNS about the user — NOT mechanical tool usage stats.

GOOD patterns (behavioral synthesis):
- "User prefers professional tone for their public page but is casual in conversation"
- "User consistently adds context about career transitions — they seem to be repositioning professionally"
- "User is protective of personal contact info — always marks phone/email as private"

BAD patterns (mechanical summaries — NEVER output these):
- "Tool 'create_fact' called 12 times"
- "User sent 8 messages in this session"
- "Session lasted approximately 15 minutes"

Each pattern must describe a USER PREFERENCE, COMMUNICATION STYLE, or BEHAVIORAL TENDENCY.
If no meaningful behavioral pattern is evident, return an empty array.

Rules: explicit facts only in factsChanged, patternsObserved = behavioral synthesis only (never mechanical stats), strings < 100 chars, ONLY valid JSON.`;

/**
 * Get rowid of last processed message from the most advanced successful/skipped compaction run.
 * Orders by cursor_rowid DESC (monotonic) — NOT by created_at (second-level precision).
 * Returns 0 if no previous run (start from beginning).
 */
export function getLastCompactionRowid(sessionKey: string): number {
  const row = sqlite.prepare(`
    SELECT cursor_rowid FROM session_compaction_log
    WHERE session_key = ? AND status IN ('ok','skipped')
    ORDER BY cursor_rowid DESC LIMIT 1
  `).get(sessionKey) as { cursor_rowid: number } | undefined;
  return row?.cursor_rowid ?? 0;
}

/**
 * Count deterministic (non-transient) failures for a cursor window.
 * Only json_parse_failure / schema_validation_failure count toward anti-burn.
 * Transient errors (network, budget) do NOT count — they must not permanently skip valid windows.
 */
export function countDeterministicFailures(sessionKey: string, cursorRowid: number): number {
  const row = sqlite.prepare(`
    SELECT COUNT(*) as cnt FROM session_compaction_log
    WHERE session_key = ? AND cursor_rowid = ? AND status = 'error'
      AND error_code IN ('json_parse_failure', 'schema_validation_failure')
  `).get(sessionKey, cursorRowid) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export async function runSessionCompaction(input: CompactionInput): Promise<CompactionResult> {
  const noResult = (error: string, skipped = false): CompactionResult => ({
    success: false, skipped, factsExtracted: 0, factsUpdated: 0, patternsDetected: 0,
    structuredSummary: null, tokensIn: 0, tokensOut: 0, modelId: "", error,
  });

  const budget = checkBudget();
  if (!budget.allowed) return noResult("budget_exceeded");
  if (input.messages.length < 4) return noResult("insufficient_messages");

  const cursorRowid = input.messages[input.messages.length - 1].rowid;
  const deterministicFailures = countDeterministicFailures(input.sessionKey, cursorRowid);
  if (deterministicFailures >= MAX_FAILURES_PER_WINDOW) {
    // Already exceeded limit in prior runs (shouldn't reach here, but guard)
    return noResult(`window_failure_limit_guard (${deterministicFailures} deterministic failures)`, true);
  }
  // willSkip: if THIS attempt is also deterministic failure, it's the Nth → skip immediately
  // (ensures skip fires within MAX_ATTEMPTS=3 — no 4th attempt needed)
  const willSkipOnDeterministicFailure = deterministicFailures + 1 >= MAX_FAILURES_PER_WINDOW;

  let messagesText = input.messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");
  if (messagesText.length > MAX_MESSAGES_CHARS) {
    messagesText = "...[truncated]\n" + messagesText.slice(-MAX_MESSAGES_CHARS);
  }

  const existingFacts = input.existingFacts ?? getActiveFacts(input.ownerKey, input.knowledgeReadKeys);
  const existingFactsSummary = existingFacts.length > 0
    ? existingFacts.slice(0, 30).map(f => `- ${f.category}/${f.key}: ${JSON.stringify(f.value)}`).join("\n")
    : "";
  const existingSummary = getSummary(input.ownerKey) ?? "";
  const prompt = COMPACTION_PROMPT(messagesText, existingFactsSummary, existingSummary);

  try {
    const model = getModelForTier("fast");
    const modelId = getModelIdForTier("fast");
    const provider = getProviderForTier("fast");
    const result = await generateText({ model, prompt, maxTokens: 600 });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    if (tokensIn > 0 || tokensOut > 0) recordUsage(provider, modelId, tokensIn, tokensOut);

    let parsed: CompactionSummary;
    try {
      parsed = JSON.parse(result.text.trim()) as CompactionSummary;
    } catch {
      console.warn("[compaction] non-JSON response — json_parse_failure");
      return { ...noResult("json_parse_failure"), errorCode: "json_parse_failure", skipped: willSkipOnDeterministicFailure, tokensIn, tokensOut, modelId };
    }

    // Runtime shape validation — validate both presence and element types.
    // Shape errors are deterministic (bad model output), so they count toward anti-burn.
    const VALID_MOODS = new Set(["productive", "exploratory", "corrective", "casual"]);
    const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && (v as unknown[]).every(x => typeof x === "string");
    const validShape =
      parsed != null &&
      isStringArray(parsed.topics) &&
      isStringArray(parsed.factsChanged) &&
      isStringArray(parsed.patternsObserved) &&
      isStringArray(parsed.keyTakeaways) &&
      VALID_MOODS.has(parsed.sessionMood);
    if (!validShape) {
      console.warn("[compaction] JSON shape validation failed — schema_validation_failure");
      return { ...noResult("schema_validation_failure"), errorCode: "schema_validation_failure", skipped: willSkipOnDeterministicFailure, tokensIn, tokensOut, modelId };
    }

    return {
      success: true, skipped: false,
      factsExtracted: parsed.factsChanged.filter(f => f.toLowerCase().startsWith("added")).length,
      factsUpdated: parsed.factsChanged.filter(f => f.toLowerCase().startsWith("updated")).length,
      patternsDetected: parsed.patternsObserved.length,
      structuredSummary: parsed, tokensIn, tokensOut, modelId,
    };
  } catch (error) {
    // Transient (network, provider, etc.) — does NOT count toward anti-burn
    return { ...noResult(String(error)), errorCode: "transient", skipped: false };
  }
}

export function persistCompactionLog(
  ownerKey: string,
  sessionKey: string,
  cursorRowid: number,
  result: CompactionResult,
): void {
  const status = result.success ? "ok" : result.skipped ? "skipped" : "error";
  sqlite.prepare(`
    INSERT INTO session_compaction_log
      (id, owner_key, session_key, cursor_rowid, facts_extracted, facts_updated,
       patterns_detected, structured_summary, model, tokens_in, tokens_out, status, error, error_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), ownerKey, sessionKey, cursorRowid,
    result.factsExtracted, result.factsUpdated, result.patternsDetected,
    result.structuredSummary ? JSON.stringify(result.structuredSummary) : null,
    result.modelId || null, result.tokensIn, result.tokensOut,
    status, result.error ?? null, result.errorCode ?? null,
  );
}
