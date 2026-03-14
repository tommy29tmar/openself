import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { authTokens } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

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
  // Invalidate any existing unused tokens of same type for this profile
  const now = new Date().toISOString();
  db.update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.profileId, profileId),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
      ),
    )
    .run();

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  db.insert(authTokens)
    .values({
      id: randomUUID(),
      profileId,
      tokenHash,
      type,
      expiresAt,
      createdAt: now,
    })
    .run();

  return rawToken;
}

/**
 * Validate and consume a token. Returns the profileId if valid, null otherwise.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function consumeAuthToken(
  rawToken: string,
  type: TokenType,
): string | null {
  const tokenHash = hashToken(rawToken);

  // Find matching token row
  const rows = db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
      ),
    )
    .all();

  // Constant-time comparison against all unused tokens of this type
  const now = new Date();
  for (const row of rows) {
    const storedHash = Buffer.from(row.tokenHash, "hex");
    const candidateHash = Buffer.from(tokenHash, "hex");

    if (storedHash.length !== candidateHash.length) continue;

    if (timingSafeEqual(storedHash, candidateHash)) {
      // Check expiry
      if (new Date(row.expiresAt) < now) {
        // Expired — mark as used
        db.update(authTokens)
          .set({ usedAt: now.toISOString() })
          .where(eq(authTokens.id, row.id))
          .run();
        return null;
      }

      // Valid — consume
      db.update(authTokens)
        .set({ usedAt: now.toISOString() })
        .where(eq(authTokens.id, row.id))
        .run();

      return row.profileId;
    }
  }

  return null;
}

/**
 * Validate a token without consuming it. Returns the profileId if valid, null otherwise.
 * Used for checking token validity before showing a form.
 */
export function validateAuthToken(
  rawToken: string,
  type: TokenType,
): string | null {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const rows = db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
      ),
    )
    .all();

  for (const row of rows) {
    const storedHash = Buffer.from(row.tokenHash, "hex");
    const candidateHash = Buffer.from(tokenHash, "hex");

    if (storedHash.length !== candidateHash.length) continue;

    if (timingSafeEqual(storedHash, candidateHash)) {
      if (new Date(row.expiresAt) < now) return null;
      return row.profileId;
    }
  }

  return null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
