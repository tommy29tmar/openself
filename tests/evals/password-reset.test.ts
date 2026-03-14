import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID, createHash } from "crypto";
import * as schema from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// In-memory SQLite setup
// ---------------------------------------------------------------------------

let testSqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

function freshDb() {
  testSqlite = new Database(":memory:");
  testSqlite.pragma("journal_mode = WAL");
  testSqlite.pragma("foreign_keys = ON");

  testSqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      username TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_feed_viewed_at TEXT
    );

    CREATE TABLE auth_tokens (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      token_hash TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('password_reset', 'email_verification', 'magic_link')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
  `);

  testDb = drizzle(testSqlite, { schema });
  return { testSqlite, testDb };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestUser(db: InstanceType<typeof Database>) {
  const userId = randomUUID();
  const profileId = randomUUID();

  db.prepare(
    "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
  ).run(userId, "test@example.com", "dummy_hash");

  db.prepare(
    "INSERT INTO profiles (id, user_id, username) VALUES (?, ?, ?)",
  ).run(profileId, userId, "testuser");

  return { userId, profileId };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function insertToken(
  db: InstanceType<typeof Database>,
  opts: {
    profileId: string;
    tokenHash: string;
    type: string;
    expiresAt: string;
    usedAt?: string;
  },
) {
  db.prepare(
    "INSERT INTO auth_tokens (id, profile_id, token_hash, type, expires_at, used_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), opts.profileId, opts.tokenHash, opts.type, opts.expiresAt, opts.usedAt ?? null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auth_tokens table", () => {
  beforeEach(() => freshDb());

  it("creates token with correct fields", () => {
    const { profileId } = createTestUser(testSqlite);
    const rawToken = "abc123";
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    insertToken(testSqlite, { profileId, tokenHash, type: "password_reset", expiresAt });

    const row = testSqlite
      .prepare("SELECT * FROM auth_tokens WHERE token_hash = ?")
      .get(tokenHash) as any;

    expect(row).toBeTruthy();
    expect(row.profile_id).toBe(profileId);
    expect(row.type).toBe("password_reset");
    expect(row.used_at).toBeNull();
  });

  it("enforces type CHECK constraint", () => {
    const { profileId } = createTestUser(testSqlite);

    expect(() => {
      insertToken(testSqlite, {
        profileId,
        tokenHash: "hash",
        type: "invalid_type" as any,
        expiresAt: new Date().toISOString(),
      });
    }).toThrow();
  });

  it("marks token as used", () => {
    const { profileId } = createTestUser(testSqlite);
    const tokenHash = hashToken("mytoken");
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    insertToken(testSqlite, { profileId, tokenHash, type: "password_reset", expiresAt });

    testSqlite
      .prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE token_hash = ?")
      .run(tokenHash);

    const row = testSqlite
      .prepare("SELECT used_at FROM auth_tokens WHERE token_hash = ?")
      .get(tokenHash) as any;

    expect(row.used_at).toBeTruthy();
  });

  it("does not find used tokens", () => {
    const { profileId } = createTestUser(testSqlite);
    const tokenHash = hashToken("usedtoken");
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    insertToken(testSqlite, {
      profileId,
      tokenHash,
      type: "password_reset",
      expiresAt,
      usedAt: new Date().toISOString(),
    });

    const row = testSqlite
      .prepare("SELECT * FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL")
      .get(tokenHash);

    expect(row).toBeUndefined();
  });

  it("identifies expired tokens", () => {
    const { profileId } = createTestUser(testSqlite);
    const tokenHash = hashToken("expiredtoken");
    // Expired 1 hour ago
    const expiresAt = new Date(Date.now() - 3600000).toISOString();

    insertToken(testSqlite, { profileId, tokenHash, type: "password_reset", expiresAt });

    const row = testSqlite
      .prepare("SELECT * FROM auth_tokens WHERE token_hash = ? AND used_at IS NULL")
      .get(tokenHash) as any;

    expect(row).toBeTruthy();
    expect(new Date(row.expires_at).getTime()).toBeLessThan(Date.now());
  });

  it("supports all three token types", () => {
    const { profileId } = createTestUser(testSqlite);
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    for (const type of ["password_reset", "email_verification", "magic_link"]) {
      insertToken(testSqlite, {
        profileId,
        tokenHash: hashToken(`token-${type}`),
        type,
        expiresAt,
      });
    }

    const count = testSqlite
      .prepare("SELECT COUNT(*) as cnt FROM auth_tokens")
      .get() as { cnt: number };

    expect(count.cnt).toBe(3);
  });
});

describe("SHA-256 hashing", () => {
  it("produces consistent 64-char hex digest", () => {
    const token = "my-random-token-value";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
  });

  it("different tokens produce different hashes", () => {
    const hash1 = hashToken("token-a");
    const hash2 = hashToken("token-b");
    expect(hash1).not.toBe(hash2);
  });
});
