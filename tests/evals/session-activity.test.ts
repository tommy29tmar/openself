import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
    })),
  },
}));

import { sqlite } from "@/lib/db";
import { isSessionActive, getSessionTtlMinutes, updateLastMessageAt } from "@/lib/services/session-activity";

describe("getSessionTtlMinutes", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns default 120 when env not set", () => {
    delete process.env.CHAT_SESSION_TTL_MINUTES;
    expect(getSessionTtlMinutes()).toBe(120);
  });

  it("reads from env var", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "60";
    expect(getSessionTtlMinutes()).toBe(60);
  });

  it("clamps to minimum 5 minutes", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "1";
    expect(getSessionTtlMinutes()).toBe(5);
  });

  it("ignores non-numeric values", () => {
    process.env.CHAT_SESSION_TTL_MINUTES = "abc";
    expect(getSessionTtlMinutes()).toBe(120);
  });
});

describe("isSessionActive", () => {
  it("returns false when lastMessageAt is null", () => {
    expect(isSessionActive(null, 120)).toBe(false);
  });

  it("returns true when message is within TTL (ISO format)", () => {
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
    expect(isSessionActive(recent, 120)).toBe(true);
  });

  it("returns true when message is within TTL (SQLite format, no Z)", () => {
    // SQLite CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS" (UTC, no Z suffix)
    const d = new Date(Date.now() - 30 * 60 * 1000);
    const sqliteFormat = d.toISOString().replace("T", " ").split(".")[0];
    expect(isSessionActive(sqliteFormat, 120)).toBe(true);
  });

  it("returns false when message is beyond TTL", () => {
    const old = new Date(Date.now() - 180 * 60 * 1000).toISOString(); // 3 hours ago
    expect(isSessionActive(old, 120)).toBe(false);
  });

  it("returns false at exact boundary", () => {
    const exact = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    expect(isSessionActive(exact, 120)).toBe(false);
  });
});

describe("isSessionActive — edge cases", () => {
  it("returns false for empty string", () => {
    expect(isSessionActive("", 120)).toBe(false);
  });
});

describe("updateLastMessageAt", () => {
  it("calls sqlite with correct params", () => {
    const mockRun = vi.fn();
    vi.mocked(sqlite.prepare).mockReturnValue({ run: mockRun, get: vi.fn() } as any);

    updateLastMessageAt("sess-1");

    expect(sqlite.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET last_message_at")
    );
    expect(mockRun).toHaveBeenCalledWith("sess-1");
  });
});
