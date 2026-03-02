import { getSessionMeta, setSessionMeta } from "@/lib/services/session-metadata";
import { sqlite } from "@/lib/db";

const FLAG_KEY = "pending_import_event";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ImportEventFlag = {
  importId: string;
  factsWritten: number;
  timestamp: number;
  status: "pending" | "processing" | "consumed";
};

/**
 * Write a pending import event flag after successful import.
 * Called by the import route.
 */
export function writeImportEvent(sessionId: string, factsWritten: number): void {
  const flag: ImportEventFlag = {
    importId: crypto.randomUUID(),
    factsWritten,
    timestamp: Date.now(),
    status: "pending",
  };
  const meta = getSessionMeta(sessionId);
  meta[FLAG_KEY] = flag;
  setSessionMeta(sessionId, meta);
}

/**
 * Attempt to atomically consume the import event flag.
 * Returns the flag (with status="processing") if successfully claimed,
 * null if already consumed, processing, expired, or absent.
 *
 * True CAS: uses conditional SQL UPDATE with JSON_EXTRACT check on status='pending'.
 * Only the first caller wins — the WHERE clause ensures atomicity at the SQLite level.
 */
export function consumeImportEvent(sessionId: string): ImportEventFlag | null {
  // First, read to check existence and TTL
  const meta = getSessionMeta(sessionId);
  const raw = meta[FLAG_KEY] as ImportEventFlag | undefined;
  if (!raw) return null;

  // TTL check (G3)
  if (Date.now() - raw.timestamp > TTL_MS) {
    delete meta[FLAG_KEY];
    setSessionMeta(sessionId, meta);
    return null;
  }

  if (raw.status !== "pending") return null;

  // Atomic CAS: use json_set to update ONLY the status field (not the entire metadata blob).
  // This avoids overwriting concurrent changes to other metadata fields (e.g., journal).
  // The WHERE clause ensures only one caller transitions pending → processing.
  const result = sqlite.prepare(`
    UPDATE sessions
    SET metadata = json_set(metadata, '$.pending_import_event.status', 'processing')
    WHERE id = ?
    AND json_extract(metadata, '$.pending_import_event.status') = 'pending'
  `).run(sessionId);

  // If changes === 0, another request already consumed the flag (CAS failed)
  if (result.changes === 0) return null;

  raw.status = "processing";
  return raw;
}

/**
 * Mark the flag as consumed after successful LLM response.
 */
export function markImportEventConsumed(sessionId: string): void {
  const meta = getSessionMeta(sessionId);
  const raw = meta[FLAG_KEY] as ImportEventFlag | undefined;
  if (!raw) return;
  raw.status = "consumed";
  meta[FLAG_KEY] = raw;
  setSessionMeta(sessionId, meta);
}

/**
 * Revert the flag to pending after LLM failure (G2).
 */
export function revertImportEvent(sessionId: string): void {
  const meta = getSessionMeta(sessionId);
  const raw = meta[FLAG_KEY] as ImportEventFlag | undefined;
  if (!raw || raw.status !== "processing") return;
  raw.status = "pending";
  meta[FLAG_KEY] = raw;
  setSessionMeta(sessionId, meta);
}
