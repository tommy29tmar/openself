import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { getSessionTtlMinutes, isSessionActive } from "@/lib/services/session-activity";

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  },
}));

describe("Messages temporal scoping — cutoff computation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("cutoff format matches SQLite CURRENT_TIMESTAMP (YYYY-MM-DD HH:MM:SS)", () => {
    const ttlMinutes = 120;
    const cutoffDate = new Date(Date.now() - ttlMinutes * 60 * 1000);
    const cutoffSql = cutoffDate.toISOString().replace("T", " ").split(".")[0];
    expect(cutoffSql).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // Must not contain T or Z (SQLite string comparison relies on space separator)
    expect(cutoffSql).not.toContain("T");
    expect(cutoffSql).not.toContain("Z");
  });

  it("cutoff is exactly TTL minutes in the past", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const ttlMinutes = 60;
    const cutoffDate = new Date(now - ttlMinutes * 60 * 1000);
    const cutoffSql = cutoffDate.toISOString().replace("T", " ").split(".")[0];

    // A message exactly at cutoff should be excluded (gt, not gte)
    expect(isSessionActive(cutoffSql, ttlMinutes)).toBe(false);

    // A message 1 second after cutoff should be included
    const justAfter = new Date(now - (ttlMinutes * 60 - 1) * 1000);
    const justAfterSql = justAfter.toISOString().replace("T", " ").split(".")[0];
    expect(isSessionActive(justAfterSql, ttlMinutes)).toBe(true);

    vi.restoreAllMocks();
  });

  it("TTL from env var propagates to cutoff window", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "30";
    const ttl = getSessionTtlMinutes();
    expect(ttl).toBe(30);

    const now = Date.now();
    // Message from 25 min ago should be within 30-min window
    const recent = new Date(now - 25 * 60 * 1000).toISOString().replace("T", " ").split(".")[0];
    expect(isSessionActive(recent, ttl)).toBe(true);

    // Message from 35 min ago should be outside 30-min window
    const old = new Date(now - 35 * 60 * 1000).toISOString().replace("T", " ").split(".")[0];
    expect(isSessionActive(old, ttl)).toBe(false);
  });
});
