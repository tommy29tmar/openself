import { sqlite } from "@/lib/db";

/**
 * Auth-specific rate limit actions and their limits.
 * Uses SQLite for persistence (survives restarts, no memory leak).
 */
type AuthAction = "login" | "password_reset" | "magic_link";

const LIMITS: Record<AuthAction, { maxAttempts: number; windowSeconds: number }> = {
  login: { maxAttempts: 5, windowSeconds: 15 * 60 }, // 5 per 15 minutes
  password_reset: { maxAttempts: 3, windowSeconds: 60 * 60 }, // 3 per hour
  magic_link: { maxAttempts: 3, windowSeconds: 60 * 60 }, // 3 per hour
};

export type AuthRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

/**
 * Check if an IP is rate-limited for a given auth action.
 * Records the attempt if allowed.
 */
export function checkAuthRateLimit(
  ip: string,
  action: AuthAction,
): AuthRateLimitResult {
  const limit = LIMITS[action];
  if (!limit) return { allowed: true };

  try {
    // Use SQLite's own datetime arithmetic to avoid format mismatch
    // (SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS', not ISO 8601)
    const count = (
      sqlite
        .prepare(
          "SELECT COUNT(*) as cnt FROM auth_rate_limits WHERE ip = ? AND action = ? AND attempted_at > datetime('now', ?)",
        )
        .get(ip, action, `-${limit.windowSeconds} seconds`) as { cnt: number }
    ).cnt;

    if (count >= limit.maxAttempts) {
      // Find the oldest attempt in the window to compute retry-after
      const oldest = sqlite
        .prepare(
          "SELECT attempted_at FROM auth_rate_limits WHERE ip = ? AND action = ? AND attempted_at > datetime('now', ?) ORDER BY attempted_at ASC LIMIT 1",
        )
        .get(ip, action, `-${limit.windowSeconds} seconds`) as { attempted_at: string } | undefined;

      let retryAfterSeconds = limit.windowSeconds;
      if (oldest) {
        // Parse SQLite datetime format (YYYY-MM-DD HH:MM:SS) — add Z for UTC
        const oldestMs = new Date(oldest.attempted_at.replace(" ", "T") + "Z").getTime();
        retryAfterSeconds = Math.ceil(
          (oldestMs + limit.windowSeconds * 1000 - Date.now()) / 1000,
        );
        if (retryAfterSeconds < 1) retryAfterSeconds = 1;
      }

      return { allowed: false, retryAfterSeconds };
    }

    // Record the attempt
    sqlite
      .prepare(
        "INSERT INTO auth_rate_limits (ip, action, attempted_at) VALUES (?, ?, datetime('now'))",
      )
      .run(ip, action);

    return { allowed: true };
  } catch (err) {
    // If table doesn't exist yet (pre-migration), allow through
    console.warn("[auth-rate-limit] Check failed (allowing):", err);
    return { allowed: true };
  }
}

/**
 * Clean up old rate limit records (older than 24 hours).
 * Called from global housekeeping.
 */
export function cleanupAuthRateLimits(): number {
  try {
    const result = sqlite
      .prepare(
        "DELETE FROM auth_rate_limits WHERE attempted_at < datetime('now', '-24 hours')",
      )
      .run();
    return result.changes;
  } catch {
    return 0;
  }
}
