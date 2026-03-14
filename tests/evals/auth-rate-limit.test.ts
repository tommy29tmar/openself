import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// In-memory SQLite setup — simulates the auth_rate_limits table
// ---------------------------------------------------------------------------

let testSqlite: InstanceType<typeof Database>;

function freshDb() {
  testSqlite = new Database(":memory:");
  testSqlite.pragma("journal_mode = WAL");

  testSqlite.exec(`
    CREATE TABLE auth_rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      action TEXT NOT NULL,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_auth_rate_ip_action ON auth_rate_limits(ip, action, attempted_at);
  `);
}

// ---------------------------------------------------------------------------
// Helpers — mirror the rate-limit service logic without importing it
// (avoids db module side effects)
// ---------------------------------------------------------------------------

type AuthAction = "login" | "password_reset" | "magic_link";

const LIMITS: Record<AuthAction, { maxAttempts: number; windowSeconds: number }> = {
  login: { maxAttempts: 5, windowSeconds: 15 * 60 },
  password_reset: { maxAttempts: 3, windowSeconds: 60 * 60 },
  magic_link: { maxAttempts: 3, windowSeconds: 60 * 60 },
};

function checkRateLimit(
  ip: string,
  action: AuthAction,
): { allowed: boolean; retryAfterSeconds?: number } {
  const limit = LIMITS[action];

  // Use SQLite datetime arithmetic to avoid format mismatch
  const count = (
    testSqlite
      .prepare(
        "SELECT COUNT(*) as cnt FROM auth_rate_limits WHERE ip = ? AND action = ? AND attempted_at > datetime('now', ?)",
      )
      .get(ip, action, `-${limit.windowSeconds} seconds`) as { cnt: number }
  ).cnt;

  if (count >= limit.maxAttempts) {
    const oldest = testSqlite
      .prepare(
        "SELECT attempted_at FROM auth_rate_limits WHERE ip = ? AND action = ? AND attempted_at > datetime('now', ?) ORDER BY attempted_at ASC LIMIT 1",
      )
      .get(ip, action, `-${limit.windowSeconds} seconds`) as { attempted_at: string } | undefined;

    let retryAfterSeconds = limit.windowSeconds;
    if (oldest) {
      const oldestMs = new Date(oldest.attempted_at.replace(" ", "T") + "Z").getTime();
      retryAfterSeconds = Math.ceil(
        (oldestMs + limit.windowSeconds * 1000 - Date.now()) / 1000,
      );
      if (retryAfterSeconds < 1) retryAfterSeconds = 1;
    }

    return { allowed: false, retryAfterSeconds };
  }

  testSqlite
    .prepare(
      "INSERT INTO auth_rate_limits (ip, action, attempted_at) VALUES (?, ?, datetime('now'))",
    )
    .run(ip, action);

  return { allowed: true };
}

function cleanupOldRecords(): number {
  return testSqlite
    .prepare("DELETE FROM auth_rate_limits WHERE attempted_at < datetime('now', '-24 hours')")
    .run().changes;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth rate limiting", () => {
  beforeEach(() => freshDb());

  it("allows first request", () => {
    const result = checkRateLimit("1.2.3.4", "login");
    expect(result.allowed).toBe(true);
  });

  it("allows up to maxAttempts requests", () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit("1.2.3.4", "login");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks after maxAttempts", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("1.2.3.4", "login");
    }
    const result = checkRateLimit("1.2.3.4", "login");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates different IPs", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("1.2.3.4", "login");
    }

    // Different IP should still be allowed
    const result = checkRateLimit("5.6.7.8", "login");
    expect(result.allowed).toBe(true);
  });

  it("isolates different actions", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("1.2.3.4", "login");
    }

    // Same IP, different action should be allowed
    const result = checkRateLimit("1.2.3.4", "password_reset");
    expect(result.allowed).toBe(true);
  });

  it("password_reset has 3 attempt limit", () => {
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit("1.2.3.4", "password_reset");
      expect(result.allowed).toBe(true);
    }
    const result = checkRateLimit("1.2.3.4", "password_reset");
    expect(result.allowed).toBe(false);
  });

  it("magic_link has 3 attempt limit", () => {
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit("1.2.3.4", "magic_link");
      expect(result.allowed).toBe(true);
    }
    const result = checkRateLimit("1.2.3.4", "magic_link");
    expect(result.allowed).toBe(false);
  });

  it("records are inserted in the table", () => {
    checkRateLimit("1.2.3.4", "login");
    checkRateLimit("1.2.3.4", "login");

    const count = (
      testSqlite
        .prepare("SELECT COUNT(*) as cnt FROM auth_rate_limits")
        .get() as { cnt: number }
    ).cnt;

    expect(count).toBe(2);
  });
});

describe("Auth rate limit cleanup", () => {
  beforeEach(() => freshDb());

  it("removes records older than 24 hours", () => {
    // Insert an old record (25 hours ago)
    testSqlite
      .prepare(
        "INSERT INTO auth_rate_limits (ip, action, attempted_at) VALUES (?, ?, datetime('now', '-25 hours'))",
      )
      .run("1.2.3.4", "login");

    // Insert a recent record
    testSqlite
      .prepare(
        "INSERT INTO auth_rate_limits (ip, action, attempted_at) VALUES (?, ?, datetime('now'))",
      )
      .run("1.2.3.4", "login");

    const cleaned = cleanupOldRecords();
    expect(cleaned).toBe(1);

    const remaining = (
      testSqlite
        .prepare("SELECT COUNT(*) as cnt FROM auth_rate_limits")
        .get() as { cnt: number }
    ).cnt;
    expect(remaining).toBe(1);
  });

  it("returns 0 when nothing to clean", () => {
    checkRateLimit("1.2.3.4", "login");
    const cleaned = cleanupOldRecords();
    expect(cleaned).toBe(0);
  });
});
