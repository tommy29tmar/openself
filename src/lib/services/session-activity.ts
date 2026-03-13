// src/lib/services/session-activity.ts

/**
 * Session activity detection for the concierge chat model.
 *
 * A session is "active" if its last message was sent within the TTL window.
 * When a session is not active, the client shows a clean chat with a fresh greeting.
 */

import { sqlite } from "@/lib/db";

const DEFAULT_TTL_MINUTES = 120;
const MIN_TTL_MINUTES = 5;

/**
 * Get the session TTL in minutes from env var, with sensible defaults.
 */
export function getSessionTtlMinutes(): number {
  const raw = process.env.CHAT_SESSION_TTL_MINUTES;
  if (!raw) return DEFAULT_TTL_MINUTES;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return DEFAULT_TTL_MINUTES;
  return Math.max(MIN_TTL_MINUTES, parsed);
}

/**
 * Check if a session is still active based on last message timestamp.
 */
export function isSessionActive(
  lastMessageAt: string | null,
  ttlMinutes: number,
): boolean {
  if (!lastMessageAt) return false;
  // SQLite CURRENT_TIMESTAMP stores UTC without "Z" suffix (e.g. "2026-03-13 10:00:00").
  // Normalize to valid ISO 8601: replace space separator with "T", ensure "Z" suffix.
  const normalized = lastMessageAt.replace(" ", "T").replace(/Z?$/, "Z");
  const lastMs = new Date(normalized).getTime();
  if (isNaN(lastMs)) return false; // Malformed timestamp — treat as expired
  const cutoffMs = Date.now() - ttlMinutes * 60 * 1000;
  return lastMs > cutoffMs;
}

/**
 * Update the last_message_at timestamp on a session.
 * Called after each message write (user or assistant).
 */
export function updateLastMessageAt(sessionId: string): void {
  sqlite
    .prepare("UPDATE sessions SET last_message_at = datetime('now') WHERE id = ?")
    .run(sessionId);
}

/**
 * Get the last_message_at for a session, or compute it from messages if the
 * column is null (pre-migration sessions that haven't had messages since).
 */
export function getLastMessageAt(sessionId: string): string | null {
  const row = sqlite
    .prepare("SELECT last_message_at FROM sessions WHERE id = ?")
    .get(sessionId) as { last_message_at: string | null } | undefined;

  if (row?.last_message_at) return row.last_message_at;

  // Fallback: compute from messages table (for sessions not yet backfilled)
  const msgRow = sqlite
    .prepare("SELECT MAX(created_at) as latest FROM messages WHERE session_id = ?")
    .get(sessionId) as { latest: string | null } | undefined;

  return msgRow?.latest ?? null;
}
