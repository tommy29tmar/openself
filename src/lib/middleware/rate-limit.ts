/**
 * In-memory rate limiter.
 * - Per-IP: max 30 requests per 60 seconds
 * - Conversation pace: max 1 message per 2 seconds (per IP)
 */

type Entry = {
  timestamps: number[];
  lastMessage: number;
};

const store = new Map<string, Entry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;
const MIN_GAP_MS = 2_000; // 2 seconds between messages
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

export type RateLimitResult = {
  allowed: boolean;
  retryAfter?: number; // seconds
  reason?: string;
};

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function checkRateLimit(
  req: Request,
  opts?: { maxRequests?: number; windowMs?: number; skipPace?: boolean },
): RateLimitResult {
  const ip = getClientIp(req);
  const now = Date.now();
  const maxReq = opts?.maxRequests ?? MAX_REQUESTS;
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const skipPace = opts?.skipPace ?? false;

  let entry = store.get(ip);
  if (!entry) {
    entry = { timestamps: [], lastMessage: 0 };
    store.set(ip, entry);
  }

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  // Check conversation pace (1 message per 2 seconds) — skip for auth endpoints
  if (!skipPace) {
    const gapMs = now - entry.lastMessage;
    if (entry.lastMessage > 0 && gapMs < MIN_GAP_MS) {
      const retryAfter = Math.ceil((MIN_GAP_MS - gapMs) / 1000);
      return {
        allowed: false,
        retryAfter,
        reason: "Too fast — please wait a moment before sending another message.",
      };
    }
  }

  // Check per-IP rate limit
  if (entry.timestamps.length >= maxReq) {
    const oldest = entry.timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      retryAfter,
      reason: "Rate limit exceeded. Please try again shortly.",
    };
  }

  // Record this request
  entry.timestamps.push(now);
  entry.lastMessage = now;

  return { allowed: true };
}

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    // Remove if no activity for 2 windows
    if (entry.timestamps.length === 0 && now - entry.lastMessage > WINDOW_MS * 2) {
      store.delete(ip);
    }
  }
  for (const [ip, ts] of inviteStore) {
    const filtered = ts.filter((t) => now - t < INVITE_WINDOW_MS);
    if (filtered.length === 0) inviteStore.delete(ip);
    else inviteStore.set(ip, filtered);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Rate limiter for /api/invite — max 5 attempts per 60 seconds per IP.
 * Prevents brute-force of invite codes.
 */
const inviteStore = new Map<string, number[]>();
const INVITE_WINDOW_MS = 60_000;
const INVITE_MAX_ATTEMPTS = 5;

export function checkInviteRateLimit(req: Request): RateLimitResult {
  const ip = getClientIp(req);
  const now = Date.now();

  let timestamps = inviteStore.get(ip) ?? [];
  timestamps = timestamps.filter((t) => now - t < INVITE_WINDOW_MS);

  if (timestamps.length >= INVITE_MAX_ATTEMPTS) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + INVITE_WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      retryAfter,
      reason: "Too many attempts. Please try again in a minute.",
    };
  }

  timestamps.push(now);
  inviteStore.set(ip, timestamps);

  return { allowed: true };
}
