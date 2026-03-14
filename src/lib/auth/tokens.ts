import { randomBytes, createHash } from "crypto";
import { randomUUID } from "crypto";
import { sqlite } from "@/lib/db";

export type TokenType = "password_reset" | "email_verification" | "magic_link";

/** Default TTL: 1 hour */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Generate a cryptographically random token, store its SHA-256 hash in DB.
 * Returns the raw token (to be sent via email) — never stored in plaintext.
 */
export function createAuthToken(
  profileId: string,
  type: TokenType,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const id = randomUUID();

  sqlite.transaction(() => {
    // Invalidate any existing unused tokens of same type for this profile
    sqlite.prepare(
      `UPDATE auth_tokens SET used_at = ? WHERE profile_id = ? AND type = ? AND used_at IS NULL`,
    ).run(now, profileId, type);
    // Insert new token
    sqlite.prepare(
      `INSERT INTO auth_tokens (id, profile_id, token_hash, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, profileId, tokenHash, type, expiresAt, now);
  })();

  return rawToken;
}

/**
 * Validate and consume a token atomically. Returns the profileId if valid, null otherwise.
 * Uses a single UPDATE...RETURNING to eliminate TOCTOU race conditions and O(n) scans.
 */
export function consumeAuthToken(
  rawToken: string,
  type: TokenType,
): string | null {
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();

  const result = sqlite.prepare(`
    UPDATE auth_tokens
    SET used_at = ?
    WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > ?
    RETURNING profile_id
  `).get(now, tokenHash, type, now) as { profile_id: string } | undefined;

  return result?.profile_id ?? null;
}

/**
 * Validate a token without consuming it. Returns the profileId if valid, null otherwise.
 * Used for checking token validity before showing a form.
 * Uses hash-in-WHERE (O(1) via idx_auth_tokens_hash) — same pattern as consumeAuthToken.
 */
export function validateAuthToken(
  rawToken: string,
  type: TokenType,
): string | null {
  const tokenHash = hashToken(rawToken);
  const now = new Date().toISOString();
  const result = sqlite.prepare(
    `SELECT profile_id FROM auth_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > ?`,
  ).get(tokenHash, type, now) as { profile_id: string } | undefined;
  return result?.profile_id ?? null;
}

/**
 * Delete expired and consumed auth tokens. Returns the number of rows removed.
 * Called from global housekeeping (worker).
 */
export function cleanupExpiredAuthTokens(): number {
  const result = sqlite.prepare(
    `DELETE FROM auth_tokens WHERE expires_at < datetime('now')`,
  ).run();
  return result.changes;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
