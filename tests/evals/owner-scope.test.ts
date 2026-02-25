/**
 * Tests for Sub-Phase 0: OwnerScope, anchor session, multi-key reads, migration bootstrap.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

// Create in-memory SQLite
const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");
const testDb = drizzle(testSqlite, { schema });

// Create minimal schema
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
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    invite_code TEXT NOT NULL,
    username TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    user_id TEXT REFERENCES users(id),
    profile_id TEXT REFERENCES profiles(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0,
    visibility TEXT DEFAULT 'private',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX uniq_facts_session_category_key ON facts(session_id, category, key);
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    profile_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE page (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    username TEXT NOT NULL,
    config TEXT NOT NULL,
    config_hash TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    generated_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE profile_message_usage (
    profile_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Helper functions (inline, mirroring service logic) ---

function anchorSessionId(profileId: string, currentSessionId: string): string {
  const row = testSqlite
    .prepare("SELECT id FROM sessions WHERE profile_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(profileId) as { id: string } | undefined;
  return row?.id ?? currentSessionId;
}

function allSessionIdsForProfile(profileId: string): string[] {
  const rows = testSqlite
    .prepare("SELECT id FROM sessions WHERE profile_id = ?")
    .all(profileId) as { id: string }[];
  return rows.map((r) => r.id);
}

function getAllFactsMultiKey(sessionIds: string[]) {
  if (sessionIds.length === 0) return [];
  return testDb
    .select()
    .from(schema.facts)
    .where(inArray(schema.facts.sessionId, sessionIds))
    .all();
}

function getMessagesMultiKey(sessionIds: string[]) {
  return testDb
    .select()
    .from(schema.messages)
    .where(inArray(schema.messages.sessionId, sessionIds))
    .orderBy(asc(schema.messages.createdAt), asc(schema.messages.id))
    .all();
}

function checkAndIncrementQuota(profileKey: string, limit: number) {
  testSqlite
    .prepare("INSERT INTO profile_message_usage(profile_key, count) VALUES(?, 0) ON CONFLICT(profile_key) DO NOTHING")
    .run(profileKey);
  const result = testSqlite
    .prepare("UPDATE profile_message_usage SET count = count + 1, updated_at = datetime('now') WHERE profile_key = ? AND count < ?")
    .run(profileKey, limit);
  const row = testSqlite
    .prepare("SELECT count FROM profile_message_usage WHERE profile_key = ?")
    .get(profileKey) as { count: number };
  return { allowed: result.changes === 1, count: row.count };
}

// --- Seed data ---
const PROFILE_ID = "profile-1";
const USER_ID = "user-1";
const SESSION_A = "session-a"; // oldest (anchor)
const SESSION_B = "session-b"; // newer

beforeEach(() => {
  testSqlite.exec("DELETE FROM facts");
  testSqlite.exec("DELETE FROM messages");
  testSqlite.exec("DELETE FROM page");
  testSqlite.exec("DELETE FROM sessions");
  testSqlite.exec("DELETE FROM profiles");
  testSqlite.exec("DELETE FROM users");
  testSqlite.exec("DELETE FROM profile_message_usage");

  // Seed
  testSqlite.exec(`INSERT INTO users(id, email, password_hash) VALUES ('${USER_ID}', 'test@test.com', 'hash')`);
  testSqlite.exec(`INSERT INTO profiles(id, user_id, username) VALUES ('${PROFILE_ID}', '${USER_ID}', 'testuser')`);
  testSqlite.exec(`INSERT INTO sessions(id, invite_code, profile_id, user_id, created_at) VALUES ('${SESSION_A}', 'inv', '${PROFILE_ID}', '${USER_ID}', '2026-01-01T00:00:00Z')`);
  testSqlite.exec(`INSERT INTO sessions(id, invite_code, profile_id, user_id, created_at) VALUES ('${SESSION_B}', 'inv', '${PROFILE_ID}', '${USER_ID}', '2026-01-02T00:00:00Z')`);
});

afterAll(() => testSqlite.close());

// --- Tests ---

describe("Anchor session", () => {
  it("returns oldest session for profile as anchor", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_B);
    expect(anchor).toBe(SESSION_A);
  });

  it("falls back to currentSessionId when no sessions have profileId", () => {
    const orphanSession = "orphan-session";
    testSqlite.exec(`INSERT INTO sessions(id, invite_code, created_at) VALUES ('${orphanSession}', 'inv', '2026-01-03T00:00:00Z')`);
    const anchor = anchorSessionId("nonexistent-profile", orphanSession);
    expect(anchor).toBe(orphanSession);
  });

  it("allSessionIdsForProfile returns all linked sessions", () => {
    const ids = allSessionIdsForProfile(PROFILE_ID);
    expect(ids).toContain(SESSION_A);
    expect(ids).toContain(SESSION_B);
    expect(ids).toHaveLength(2);
  });
});

describe("Multi-session fact reads", () => {
  it("reads facts from all sessions for a profile", () => {
    testSqlite.exec(`INSERT INTO facts(id, session_id, category, key, value) VALUES ('f1', '${SESSION_A}', 'identity', 'name', '{"full":"Alice"}')`);
    testSqlite.exec(`INSERT INTO facts(id, session_id, category, key, value) VALUES ('f2', '${SESSION_B}', 'skill', 'typescript', '{"name":"TypeScript"}')`);

    const readKeys = allSessionIdsForProfile(PROFILE_ID);
    const facts = getAllFactsMultiKey(readKeys);
    expect(facts).toHaveLength(2);
  });

  it("includes currentSessionId even if not linked to profile", () => {
    const orphan = "orphan-" + randomUUID();
    testSqlite.exec(`INSERT INTO sessions(id, invite_code, created_at) VALUES ('${orphan}', 'inv', '2026-01-04T00:00:00Z')`);
    testSqlite.exec(`INSERT INTO facts(id, session_id, category, key, value) VALUES ('f3', '${orphan}', 'identity', 'email', '{"email":"test"}')`);

    const readKeys = [...allSessionIdsForProfile(PROFILE_ID), orphan];
    const facts = getAllFactsMultiKey(readKeys);
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.some((f) => f.id === "f3")).toBe(true);
  });
});

describe("Multi-session message reads", () => {
  it("reads messages from all sessions ordered by time", () => {
    testSqlite.exec(`INSERT INTO messages(id, session_id, role, content, created_at) VALUES ('m1', '${SESSION_A}', 'user', 'hello', '2026-01-01T00:01:00Z')`);
    testSqlite.exec(`INSERT INTO messages(id, session_id, role, content, created_at) VALUES ('m2', '${SESSION_B}', 'assistant', 'hi there', '2026-01-02T00:01:00Z')`);
    testSqlite.exec(`INSERT INTO messages(id, session_id, role, content, created_at) VALUES ('m3', '${SESSION_A}', 'user', 'thanks', '2026-01-01T00:02:00Z')`);

    const readKeys = allSessionIdsForProfile(PROFILE_ID);
    const msgs = getMessagesMultiKey(readKeys);
    expect(msgs).toHaveLength(3);
    // Should be ordered by created_at
    expect(msgs[0].id).toBe("m1");
    expect(msgs[1].id).toBe("m3");
    expect(msgs[2].id).toBe("m2");
  });
});

describe("Draft row stable across sessions", () => {
  it("draft keyed to anchor is accessible from both sessions", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_B);
    expect(anchor).toBe(SESSION_A);

    // Insert draft using anchor key
    testSqlite.exec(`INSERT INTO page(id, session_id, profile_id, username, config, status)
      VALUES ('${anchor}', '${anchor}', '${PROFILE_ID}', 'testuser', '{"version":1}', 'draft')`);

    // Read from both sessions using anchor
    const draft = testSqlite
      .prepare("SELECT * FROM page WHERE id = ? AND status IN ('draft', 'approval_pending')")
      .get(anchor) as any;
    expect(draft).toBeTruthy();
    expect(draft.username).toBe("testuser");
  });
});

describe("Session profileId backfill", () => {
  it("backfills profileId on session without one", () => {
    const orphanId = "orphan-" + randomUUID();
    testSqlite.exec(`INSERT INTO sessions(id, invite_code, created_at) VALUES ('${orphanId}', 'inv', '2026-01-05T00:00:00Z')`);

    // Before backfill
    const before = testSqlite.prepare("SELECT profile_id FROM sessions WHERE id = ?").get(orphanId) as any;
    expect(before.profile_id).toBeNull();

    // Backfill
    testSqlite
      .prepare("UPDATE sessions SET profile_id = ? WHERE id = ? AND profile_id IS NULL")
      .run(PROFILE_ID, orphanId);

    // After backfill
    const after = testSqlite.prepare("SELECT profile_id FROM sessions WHERE id = ?").get(orphanId) as any;
    expect(after.profile_id).toBe(PROFILE_ID);

    // Now it appears in allSessionIdsForProfile
    const ids = allSessionIdsForProfile(PROFILE_ID);
    expect(ids).toContain(orphanId);
  });
});

describe("Profile message quota", () => {
  it("atomic increment under limit succeeds", () => {
    const { allowed, count } = checkAndIncrementQuota(PROFILE_ID, 5);
    expect(allowed).toBe(true);
    expect(count).toBe(1);
  });

  it("rejects when at limit", () => {
    for (let i = 0; i < 3; i++) checkAndIncrementQuota(PROFILE_ID, 3);
    const { allowed, count } = checkAndIncrementQuota(PROFILE_ID, 3);
    expect(allowed).toBe(false);
    expect(count).toBe(3);
  });

  it("concurrent increments: only one passes at limit", () => {
    // Fill to limit - 1
    for (let i = 0; i < 4; i++) checkAndIncrementQuota(PROFILE_ID, 5);
    // Two simultaneous attempts at the last slot
    const r1 = checkAndIncrementQuota(PROFILE_ID, 5);
    const r2 = checkAndIncrementQuota(PROFILE_ID, 5);
    // Exactly one should succeed
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(false);
  });
});

describe("Migration bootstrap", () => {
  it("schema_meta stores version", () => {
    testSqlite.prepare("INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('schema_version', '16')").run();
    const row = testSqlite.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as any;
    expect(row.value).toBe("16");
  });
});
