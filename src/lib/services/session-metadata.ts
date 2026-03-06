import { eq } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export type SessionMeta = Record<string, unknown>;

/**
 * Single operation journal entry. Recorded per tool call in createAgentTools (Task 13).
 * Persisted canonically on assistant messages.toolCalls; sessions.metadata.journal is only
 * a best-effort operational buffer for the active conversation turn.
 */
export type JournalEntry = {
  toolName: string;
  timestamp: string;
  durationMs: number;
  success: boolean;
  args?: Record<string, unknown>;
  summary?: string;
  batchSize?: number;
};

export function getSessionMeta(sessionId: string): SessionMeta {
  const row = db.select({ metadata: sessions.metadata })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row?.metadata) return {};
  try { return JSON.parse(row.metadata); } catch { return {}; }
}

export function setSessionMeta(sessionId: string, meta: SessionMeta): void {
  db.update(sessions)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(sessions.id, sessionId))
    .run();
}

// NOTE (R5-S5): mergeSessionMeta has a read-modify-write pattern that is theoretically
// susceptible to race conditions. For single-user SQLite with WAL mode this is safe in
// practice (one writer at a time), but if we ever move to multi-process writes, consider
// using a SQL JSON_PATCH or a CAS pattern.
export function mergeSessionMeta(sessionId: string, partial: Record<string, unknown>): SessionMeta {
  const current = getSessionMeta(sessionId);
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete current[k];
    else current[k] = v;
  }
  setSessionMeta(sessionId, current);
  return current;
}

/**
 * Aggregate tool-call journal entries from the N most recent sessions for the given owner.
 * Reads canonical assistant message `tool_calls` rows, not sessions.metadata.journal.
 *
 * Matches on profile_id (auth users) or id (anon/single-user) to cover both cases.
 */
export function getRecentJournalEntries(ownerKey: string, sessionCount: number): JournalEntry[] {
  const sessionRows = sqlite.prepare(`
    SELECT id FROM sessions
    WHERE (profile_id = ? OR id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(ownerKey, ownerKey, sessionCount) as Array<{ id: string }>;

  const sessionIds = sessionRows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (sessionIds.length === 0) return [];

  const placeholders = sessionIds.map(() => "?").join(",");
  const messageRows = sqlite.prepare(`
    SELECT tool_calls
    FROM messages
    WHERE session_id IN (${placeholders})
      AND tool_calls IS NOT NULL
    ORDER BY created_at ASC, id ASC
  `).all(...sessionIds) as Array<{ tool_calls: string | null }>;

  const entries: JournalEntry[] = [];
  for (const row of messageRows) {
    if (!row.tool_calls) continue;
    try {
      const toolCalls = JSON.parse(row.tool_calls);
      if (Array.isArray(toolCalls)) {
        entries.push(...toolCalls);
      }
    } catch {
      // Skip malformed toolCalls payloads
    }
  }
  return entries;
}
