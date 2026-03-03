import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("/api/transcribe route contracts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("rate limiter allows 10 requests then blocks", async () => {
    const { checkRateLimit, rateLimitMap } = await import("@/lib/middleware/transcribe-rate-limit");
    rateLimitMap.clear();
    const ip = "test-ip-" + Date.now();
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(ip)).toBe(true);
    }
    expect(checkRateLimit(ip)).toBe(false); // 11th request blocked
  });

  it("rate limiter resets after 60s window", async () => {
    const { checkRateLimit, rateLimitMap } = await import("@/lib/middleware/transcribe-rate-limit");
    rateLimitMap.clear();
    const ip = "test-ip-reset-" + Date.now();
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    expect(checkRateLimit(ip)).toBe(false);
    // Manually expire the entry
    const entry = rateLimitMap.get(ip)!;
    entry.resetAt = Date.now() - 1;
    expect(checkRateLimit(ip)).toBe(true); // reset happened
  });

  it("MAX_CONTENT_LENGTH is 5MB (5242880 bytes)", async () => {
    const { MAX_CONTENT_LENGTH } = await import("@/lib/middleware/transcribe-rate-limit");
    expect(MAX_CONTENT_LENGTH).toBe(5242880);
  });

  it("language field is extracted from incoming form and forwarded to upstream", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/app/api/transcribe/route.ts", "utf-8");
    expect(src).toContain('formData.get("language")');
    expect(src).toContain('upstreamForm.append("language"');
  });
});
