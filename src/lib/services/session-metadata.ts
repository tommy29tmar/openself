import { eq } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export type SessionMeta = Record<string, unknown>;

/**
 * Single operation journal entry. Recorded per tool call in createAgentTools (Task 13).
 * Stored in sessions.metadata.journal (array). Read by Tasks 21, 22.
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
 * Aggregate journal entries from the N most recent sessions for the given owner.
 * Reads sessions.metadata.journal for each session, flattens into a single array.
 *
 * Matches on profile_id (auth users) or id (anon/single-user) to cover both cases.
 */
export function getRecentJournalEntries(ownerKey: string, sessionCount: number): JournalEntry[] {
  const rows = sqlite.prepare(`
    SELECT metadata FROM sessions
    WHERE (profile_id = ? OR id = ?)
    AND metadata IS NOT NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(ownerKey, ownerKey, sessionCount) as Array<{ metadata: string }>;

  const entries: JournalEntry[] = [];
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.metadata);
      if (Array.isArray(meta.journal)) {
        entries.push(...meta.journal);
      }
    } catch {
      // Skip malformed metadata
    }
  }
  return entries;
}
