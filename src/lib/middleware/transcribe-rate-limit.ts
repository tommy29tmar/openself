export const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB

// Simple in-memory rate limiter (per IP, 10 req/min).
// Assumes single-process deployment. For multi-instance, swap to Redis or shared store.
export const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Periodic cleanup: evict expired entries every 100 calls (prevents unbounded growth)
  if (rateLimitMap.size > 100) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }

  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}
