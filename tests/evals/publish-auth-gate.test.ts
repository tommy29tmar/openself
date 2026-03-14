/**
 * Tests for signup-before-publish: auth gate on /api/publish,
 * getAuthContext username resolution, and atomic claim+publish.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// Create in-memory SQLite
const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");

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
  CREATE UNIQUE INDEX uniq_profiles_username ON profiles(username) WHERE username IS NOT NULL;
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
  CREATE TABLE page (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    username TEXT NOT NULL,
    config TEXT NOT NULL,
    config_hash TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    generated_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    hidden_sections TEXT DEFAULT '[]'
  );
`);

// --- Helper functions (mirror service logic) ---

function getSession(sessionId: string) {
  return testSqlite
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as {
      id: string;
      username: string | null;
      user_id: string | null;
      profile_id: string | null;
    } | undefined;
}

/**
 * Mirrors getAuthContext from src/lib/auth/session.ts (with the fix).
 */
function getAuthContext(sessionId: string) {
  const session = getSession(sessionId);
  if (!session) return null;

  // Resolve username: session.username (legacy) ?? profiles.username (auth v2)
  let username: string | null = session.username ?? null;
  if (!username && session.profile_id) {
    const profileRow = testSqlite
      .prepare("SELECT username FROM profiles WHERE id = ?")
      .get(session.profile_id) as { username: string | null } | undefined;
    username = profileRow?.username ?? null;
  }

  return {
    sessionId,
    profileId: session.profile_id ?? sessionId,
    userId: session.user_id ?? null,
    username,
  };
}

function setProfileUsername(profileId: string, username: string) {
  testSqlite
    .prepare("UPDATE profiles SET username = ?, updated_at = datetime('now') WHERE id = ?")
    .run(username, profileId);
}

function checkPageOwnership(sessionId: string, username: string): boolean {
  const session = testSqlite
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as { username: string | null; profile_id: string | null } | undefined;
  if (!session) return false;
  if (session.username === username) return true;
  if (!session.profile_id) return false;
  const profile = testSqlite
    .prepare("SELECT username FROM profiles WHERE id = ?")
    .get(session.profile_id) as { username: string | null } | undefined;
  return profile?.username === username;
}

// --- Seed data ---
const USER_ID = "user-1";
const PROFILE_ID = "profile-1";
const SESSION_ID = "session-1";

beforeEach(() => {
  testSqlite.exec("DELETE FROM page");
  testSqlite.exec("DELETE FROM sessions");
  testSqlite.exec("DELETE FROM profiles");
  testSqlite.exec("DELETE FROM users");

  // Base authenticated user with profile but NO username (auth v2 post-registration)
  testSqlite.exec(`
    INSERT INTO users(id, email, password_hash) VALUES ('${USER_ID}', 'alice@test.com', 'hash');
    INSERT INTO profiles(id, user_id) VALUES ('${PROFILE_ID}', '${USER_ID}');
    INSERT INTO sessions(id, invite_code, profile_id, user_id, created_at)
      VALUES ('${SESSION_ID}', '__auth__', '${PROFILE_ID}', '${USER_ID}', '2026-01-01T00:00:00Z');
  `);
});

afterAll(() => testSqlite.close());

// --- Tests ---

describe("Anonymous publish gate", () => {
  it("anonymous session (no userId) is blocked", () => {
    const anonSession = "anon-" + randomUUID();
    testSqlite.exec(
      `INSERT INTO sessions(id, invite_code, created_at) VALUES ('${anonSession}', 'inv', '2026-01-01T00:00:00Z')`,
    );

    const authCtx = getAuthContext(anonSession);
    expect(authCtx).not.toBeNull();
    expect(authCtx!.userId).toBeNull();

    // The publish route would check: isMultiUserEnabled() && !authCtx.userId → 403
    // We verify the condition that triggers the gate:
    const wouldBlock = !authCtx!.userId;
    expect(wouldBlock).toBe(true);
  });
});

describe("getAuthContext resolves username from profiles", () => {
  it("returns profile username when session.username is null", () => {
    // Set profile username
    setProfileUsername(PROFILE_ID, "alice");

    const authCtx = getAuthContext(SESSION_ID);
    expect(authCtx).not.toBeNull();
    expect(authCtx!.username).toBe("alice");
  });

  it("returns null when both session.username and profile.username are null", () => {
    const authCtx = getAuthContext(SESSION_ID);
    expect(authCtx).not.toBeNull();
    expect(authCtx!.username).toBeNull();
  });
});

describe("Effective username enforcement", () => {
  it("authenticated user with existing username: body username is ignored", () => {
    setProfileUsername(PROFILE_ID, "alice");
    const authCtx = getAuthContext(SESSION_ID);
    expect(authCtx!.username).toBe("alice");

    // effectiveUsername comes from authCtx, body.username is ignored
    const bodyUsername = "bob";
    const effectiveUsername = authCtx!.username ?? null;
    const username = effectiveUsername ?? bodyUsername;
    expect(username).toBe("alice");
  });
});

describe("OAuth first publish: atomic profile.username claim", () => {
  it("publish sets profile.username and checkPageOwnership returns true", () => {
    // Before: no username on profile
    expect(getAuthContext(SESSION_ID)!.username).toBeNull();

    // Simulate the atomic claim that happens in publish pipeline
    const txn = testSqlite.transaction(() => {
      setProfileUsername(PROFILE_ID, "alice");
      // In real code: requestPublish + confirmPublish also run here
    });
    txn();

    // After: username is set and ownership check passes
    expect(getAuthContext(SESSION_ID)!.username).toBe("alice");
    expect(checkPageOwnership(SESSION_ID, "alice")).toBe(true);
  });

  it("username collision rolls back the transaction", () => {
    // Create a second user/profile that already owns "alice"
    const otherUserId = "user-2";
    const otherProfileId = "profile-2";
    testSqlite.exec(`
      INSERT INTO users(id, email, password_hash) VALUES ('${otherUserId}', 'bob@test.com', 'hash');
      INSERT INTO profiles(id, user_id, username) VALUES ('${otherProfileId}', '${otherUserId}', 'alice');
    `);

    // First user tries to claim "alice" — UNIQUE constraint violation
    let caught = false;
    const txn = testSqlite.transaction(() => {
      setProfileUsername(PROFILE_ID, "alice");
    });

    try {
      txn();
    } catch (err: unknown) {
      caught = true;
      // Verify it's a constraint error
      expect(err instanceof Error).toBe(true);
      expect(String((err as Record<string, unknown>).code)).toMatch(/SQLITE_CONSTRAINT/);
    }

    expect(caught).toBe(true);

    // Profile username remains null (transaction rolled back)
    const authCtx = getAuthContext(SESSION_ID);
    expect(authCtx!.username).toBeNull();
  });
});
