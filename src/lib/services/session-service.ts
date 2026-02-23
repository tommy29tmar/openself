import { eq, sql } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { randomUUID } from "crypto";

export const DEFAULT_SESSION_ID = "__default__";

export function getDefaultSessionId(): string {
  return DEFAULT_SESSION_ID;
}

export function isMultiUserEnabled(): boolean {
  return !!process.env.INVITE_CODES;
}

export function getMessageLimit(): number {
  return parseInt(process.env.CHAT_MESSAGE_LIMIT ?? "10", 10);
}

export function isValidInviteCode(code: string): boolean {
  const codes = (process.env.INVITE_CODES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return codes.includes(code);
}

export function createSession(inviteCode: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(sessions)
    .values({
      id,
      inviteCode,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export type Session = {
  id: string;
  inviteCode: string;
  username: string | null;
  messageCount: number;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export function getSession(sessionId: string): Session | null {
  const row = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  return row ? (row as Session) : null;
}

export function isUsernameTaken(username: string): boolean {
  const row = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.username, username))
    .get();
  return !!row;
}

export function registerUsername(sessionId: string, username: string): void {
  const now = new Date().toISOString();
  db.update(sessions)
    .set({ username, status: "registered", updatedAt: now })
    .where(eq(sessions.id, sessionId))
    .run();
}

/**
 * Atomic increment — returns true if incremented (under limit), false if limit hit.
 * Uses raw SQL for atomic check-and-increment.
 */
export function tryIncrementMessageCount(
  sessionId: string,
  limit: number,
): boolean {
  const result = sqlite
    .prepare(
      "UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ? AND message_count < ?",
    )
    .run(new Date().toISOString(), sessionId, limit);
  return result.changes > 0;
}

export function getMessageCount(sessionId: string): number {
  const row = db
    .select({ messageCount: sessions.messageCount })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  return row?.messageCount ?? 0;
}
