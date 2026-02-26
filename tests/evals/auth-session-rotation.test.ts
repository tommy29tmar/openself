/**
 * Tests for auth session rotation: after login creates a new session,
 * all endpoints still find drafts/facts/preferences from the anchor session.
 *
 * Covers:
 * 1. isUsernameTaken checks profiles table (not just sessions)
 * 2. /api/preview resolves draft via anchor after rotation
 * 3. /api/preferences resolves language/hasPage via anchor after rotation
 * 4. /api/draft/style finds draft via anchor after rotation
 * 5. /api/draft/lock finds draft via anchor after rotation
 * 6. /api/publish passes anchor key to prepareAndPublish after rotation
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { PageConfig } from "@/lib/page-config/schema";

// ── In-memory DB ──

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");
const testDb = drizzle(testSqlite, { schema });

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
  CREATE UNIQUE INDEX uniq_sessions_username ON sessions(username) WHERE username IS NOT NULL;
  CREATE TABLE page (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    username TEXT NOT NULL,
    config JSON NOT NULL,
    config_hash TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    generated_at TEXT,
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
  CREATE TABLE agent_config (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    preferred_language TEXT DEFAULT 'en',
    fact_language TEXT,
    config JSON,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Constants ──

const USER_ID = "user-1";
const PROFILE_ID = "profile-1";
const SESSION_ANCHOR = "session-anchor"; // oldest — created first
const SESSION_ROTATED = "session-rotated"; // new session after login

// ── Helpers ──

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

function makeConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
    version: 1,
    username: "testuser",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#6366f1",
      fontFamily: "inter",
      layout: "centered",
    },
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test User", tagline: "Hello" } },
      { id: "footer-1", type: "footer", content: {} },
    ],
    ...overrides,
  };
}

function getDraftByKey(key: string) {
  const row = testDb
    .select()
    .from(schema.page)
    .where(and(eq(schema.page.id, key), inArray(schema.page.status, ["draft", "approval_pending"])))
    .get();
  if (!row) return null;
  return { config: row.config as PageConfig, username: row.username, status: row.status, configHash: row.configHash };
}

function upsertDraftByKey(username: string, config: PageConfig, key: string) {
  testDb
    .insert(schema.page)
    .values({ id: key, sessionId: key, username, config, status: "draft" })
    .onConflictDoUpdate({
      target: schema.page.id,
      set: { username, config, status: "draft", updatedAt: new Date().toISOString() },
    })
    .run();
}

// ── Setup / teardown ──

beforeEach(() => {
  testSqlite.exec("DELETE FROM page");
  testSqlite.exec("DELETE FROM facts");
  testSqlite.exec("DELETE FROM agent_config");
  testSqlite.exec("DELETE FROM sessions");
  testSqlite.exec("DELETE FROM profiles");
  testSqlite.exec("DELETE FROM users");

  // Seed: user → profile → 2 sessions (anchor + rotated)
  testSqlite.exec(`INSERT INTO users(id, email, password_hash) VALUES ('${USER_ID}', 'test@test.com', 'hash')`);
  testSqlite.exec(`INSERT INTO profiles(id, user_id, username) VALUES ('${PROFILE_ID}', '${USER_ID}', 'testuser')`);
  testSqlite.exec(`INSERT INTO sessions(id, invite_code, profile_id, user_id, created_at) VALUES ('${SESSION_ANCHOR}', 'inv', '${PROFILE_ID}', '${USER_ID}', '2026-01-01T00:00:00Z')`);
  testSqlite.exec(`INSERT INTO sessions(id, invite_code, profile_id, user_id, created_at) VALUES ('${SESSION_ROTATED}', 'inv', '${PROFILE_ID}', '${USER_ID}', '2026-01-02T00:00:00Z')`);
});

afterAll(() => testSqlite.close());

// ── 1. isUsernameTaken ──

describe("isUsernameTaken checks profiles table", () => {
  it("finds username in profiles table (not in sessions)", () => {
    // profiles.username = 'testuser', sessions have no username set
    // Inline the logic from session-service.ts
    const sessionRow = testSqlite.prepare("SELECT id FROM sessions WHERE username = ?").get("testuser");
    const profileRow = testSqlite.prepare("SELECT id FROM profiles WHERE username = ?").get("testuser");
    const taken = !!(sessionRow || profileRow);
    expect(taken).toBe(true);
  });

  it("finds username in sessions table (legacy)", () => {
    testSqlite.exec("UPDATE sessions SET username = 'legacyuser' WHERE id = 'session-anchor'");
    const sessionRow = testSqlite.prepare("SELECT id FROM sessions WHERE username = ?").get("legacyuser");
    const profileRow = testSqlite.prepare("SELECT id FROM profiles WHERE username = ?").get("legacyuser");
    const taken = !!(sessionRow || profileRow);
    expect(taken).toBe(true);
  });

  it("returns false for nonexistent username", () => {
    const sessionRow = testSqlite.prepare("SELECT id FROM sessions WHERE username = ?").get("nobody");
    const profileRow = testSqlite.prepare("SELECT id FROM profiles WHERE username = ?").get("nobody");
    const taken = !!(sessionRow || profileRow);
    expect(taken).toBe(false);
  });
});

// ── 2. Preview endpoint: draft via anchor ──

describe("Preview resolves draft via anchor after rotation", () => {
  it("draft created under anchor is found from rotated session", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    expect(anchor).toBe(SESSION_ANCHOR);

    upsertDraftByKey("testuser", makeConfig(), anchor);

    // From rotated session, resolve primaryKey = anchor
    const primaryKey = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    const draft = getDraftByKey(primaryKey);
    expect(draft).toBeTruthy();
    expect(draft!.config.username).toBe("testuser");
  });

  it("facts from both sessions are visible via readKeys", () => {
    testSqlite.exec(`INSERT INTO facts(id, session_id, category, key, value) VALUES ('f1', '${SESSION_ANCHOR}', 'identity', 'name', '{"full":"Alice"}')`);
    testSqlite.exec(`INSERT INTO facts(id, session_id, category, key, value) VALUES ('f2', '${SESSION_ROTATED}', 'skill', 'ts', '{"name":"TypeScript"}')`);

    const readKeys = allSessionIdsForProfile(PROFILE_ID);
    const facts = testDb
      .select()
      .from(schema.facts)
      .where(inArray(schema.facts.sessionId, readKeys))
      .all();
    expect(facts).toHaveLength(2);
  });
});

// ── 3. Preferences: language/hasPage via anchor ──

describe("Preferences resolves via anchor after rotation", () => {
  it("preferences written under anchor are found from rotated session", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);

    // Write preferences under anchor key
    testSqlite.exec(`INSERT INTO agent_config(id, session_id, preferred_language, fact_language) VALUES ('${anchor}', '${anchor}', 'it', 'it')`);

    // From rotated session, resolve primaryKey = anchor
    const row = testSqlite.prepare("SELECT preferred_language, fact_language FROM agent_config WHERE id = ?").get(anchor) as any;
    expect(row.preferred_language).toBe("it");
    expect(row.fact_language).toBe("it");
  });

  it("hasAnyPage via anchor finds draft created in earlier session", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    upsertDraftByKey("testuser", makeConfig(), anchor);

    const row = testSqlite.prepare("SELECT id FROM page WHERE session_id = ?").get(anchor) as any;
    expect(row).toBeTruthy();
  });
});

// ── 4. Draft/style: finds draft via anchor ──

describe("Draft/style finds draft via anchor after rotation", () => {
  it("style merge works when draft is under anchor key", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    upsertDraftByKey("testuser", makeConfig(), anchor);

    // Read draft using anchor key (as the migrated endpoint does)
    const draft = getDraftByKey(anchor)!;
    expect(draft).toBeTruthy();

    // Apply style change
    const config = { ...draft.config, theme: "warm" as const };
    upsertDraftByKey(draft.username, config as PageConfig, anchor);

    // Verify
    const updated = getDraftByKey(anchor)!;
    expect(updated.config.theme).toBe("warm");
  });
});

// ── 5. Draft/lock: finds draft via anchor ──

describe("Draft/lock finds draft via anchor after rotation", () => {
  it("lock applied to draft under anchor key persists", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    upsertDraftByKey("testuser", makeConfig(), anchor);

    const draft = getDraftByKey(anchor)!;
    const config = { ...draft.config };
    config.sections = config.sections.map((s) => {
      if (s.id === "hero-1") {
        return {
          ...s,
          lock: {
            position: true,
            widget: true,
            content: false,
            lockedBy: "user" as const,
            lockedAt: new Date().toISOString(),
          },
        };
      }
      return s;
    });
    upsertDraftByKey(draft.username, config as PageConfig, anchor);

    const updated = getDraftByKey(anchor)!;
    const heroSection = updated.config.sections.find((s) => s.id === "hero-1");
    expect(heroSection?.lock).toBeTruthy();
    expect(heroSection?.lock?.lockedBy).toBe("user");
  });

  it("lock removal via anchor key works after rotation", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    const configWithLock = makeConfig();
    configWithLock.sections[0] = {
      ...configWithLock.sections[0],
      lock: { position: true, widget: true, content: false, lockedBy: "user", lockedAt: new Date().toISOString() },
    };
    upsertDraftByKey("testuser", configWithLock, anchor);

    // Remove lock
    const draft = getDraftByKey(anchor)!;
    const config = { ...draft.config };
    config.sections = config.sections.map((s) => {
      if (s.id === "hero-1") {
        const { lock: _, ...rest } = s;
        return rest;
      }
      return s;
    });
    upsertDraftByKey(draft.username, config as PageConfig, anchor);

    const updated = getDraftByKey(anchor)!;
    const heroSection = updated.config.sections.find((s) => s.id === "hero-1");
    expect(heroSection?.lock).toBeUndefined();
  });
});

// ── 6. Publish: passes anchor key ──

describe("Publish uses anchor key after rotation", () => {
  it("anchor key resolves correctly from rotated session", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    expect(anchor).toBe(SESSION_ANCHOR);

    // Draft under anchor
    upsertDraftByKey("testuser", makeConfig(), anchor);
    const draft = getDraftByKey(anchor);
    expect(draft).toBeTruthy();
    expect(draft!.username).toBe("testuser");
  });

  it("draft is NOT found using rotated session ID directly", () => {
    const anchor = anchorSessionId(PROFILE_ID, SESSION_ROTATED);
    upsertDraftByKey("testuser", makeConfig(), anchor);

    // Using rotated session ID directly would fail (the old bug)
    const draftViaRotated = getDraftByKey(SESSION_ROTATED);
    expect(draftViaRotated).toBeNull();

    // But using anchor works
    const draftViaAnchor = getDraftByKey(SESSION_ANCHOR);
    expect(draftViaAnchor).toBeTruthy();
  });
});

// ── Route handler tests with mocked resolveOwnerScope ──

// Storage for mock
let mockDraft: { config: PageConfig; username: string; status: string; configHash: string | null; updatedAt: string | null } | null = null;
let lastUpsertKey: string | null = null;

const MOCK_SCOPE = {
  cognitiveOwnerKey: PROFILE_ID,
  knowledgeReadKeys: [SESSION_ANCHOR, SESSION_ROTATED],
  knowledgePrimaryKey: SESSION_ANCHOR,
  currentSessionId: SESSION_ROTATED,
};

vi.mock("@/lib/services/page-service", () => ({
  getDraft: (key?: string) => {
    // Only return draft if queried with the correct key (anchor)
    if (key === SESSION_ANCHOR) return mockDraft;
    return null;
  },
  upsertDraft: (username: string, config: PageConfig, key?: string) => {
    lastUpsertKey = key ?? null;
    mockDraft = { config, username, status: "draft", configHash: null, updatedAt: null };
  },
  hasAnyPage: (key?: string) => key === SESSION_ANCHOR && mockDraft !== null,
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: () => MOCK_SCOPE,
  getSessionIdFromRequest: () => SESSION_ROTATED,
  createSessionCookie: () => "",
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => true,
  getSession: (id: string) => (id === SESSION_ROTATED ? { id: SESSION_ROTATED, profileId: PROFILE_ID } : null),
  getDefaultSessionId: () => "__default__",
}));

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: () => [],
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: () => ({ language: "it", factLanguage: "it" }),
  setPreferredLanguage: () => {},
  getFactLanguage: () => "it",
  setFactLanguageIfUnset: () => {},
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: () => {},
}));

vi.mock("@/lib/i18n/languages", () => ({
  isLanguageCode: (code: string) => ["en", "it", "de", "fr", "es", "pt", "ja", "zh"].includes(code),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: () => makeConfig(),
}));

vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: async (config: PageConfig) => config,
}));

vi.mock("@/lib/services/publish-pipeline", () => ({
  prepareAndPublish: async (username: string, key: string) => {
    lastUpsertKey = key;
    return { url: `/${username}` };
  },
  PublishError: class extends Error {
    code: string;
    httpStatus: number;
    constructor(msg: string, code: string, status: number) {
      super(msg);
      this.code = code;
      this.httpStatus = status;
    }
  },
}));

// Import route handlers after mocks
const { POST: stylePOST } = await import("@/app/api/draft/style/route");
const { POST: lockPOST, DELETE: lockDELETE } = await import("@/app/api/draft/lock/route");
const { GET: previewGET } = await import("@/app/api/preview/route");
const { GET: prefsGET, POST: prefsPOST } = await import("@/app/api/preferences/route");
const { POST: publishPOST } = await import("@/app/api/publish/route");

function makeRequest(url: string, method: string, body?: Record<string, unknown>): Request {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: `os_session=${SESSION_ROTATED}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("Route handlers use primaryKey (anchor) after session rotation", () => {
  beforeEach(() => {
    mockDraft = null;
    lastUpsertKey = null;
  });

  it("GET /api/preview finds draft via anchor key", async () => {
    mockDraft = { config: makeConfig(), username: "testuser", status: "draft", configHash: "abc", updatedAt: null };
    const res = await previewGET(makeRequest("http://localhost/api/preview?language=en", "GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("optimistic_ready");
    expect(data.config.username).toBe("testuser");
  });

  it("GET /api/preferences resolves via anchor key", async () => {
    const res = await prefsGET(makeRequest("http://localhost/api/preferences", "GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.language).toBe("it");
  });

  it("POST /api/preferences resolves via anchor key", async () => {
    const res = await prefsPOST(makeRequest("http://localhost/api/preferences", "POST", { language: "it" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("POST /api/draft/style finds draft via anchor key", async () => {
    mockDraft = { config: makeConfig(), username: "testuser", status: "draft", configHash: null, updatedAt: null };
    const res = await stylePOST(makeRequest("http://localhost/api/draft/style", "POST", { theme: "warm" }));
    expect(res.status).toBe(200);
    expect(lastUpsertKey).toBe(SESSION_ANCHOR);
  });

  it("POST /api/draft/style returns 404 when queried with wrong key", async () => {
    // mockDraft is null — getDraft(SESSION_ANCHOR) returns null
    const res = await stylePOST(makeRequest("http://localhost/api/draft/style", "POST", { theme: "warm" }));
    expect(res.status).toBe(404);
  });

  it("POST /api/draft/lock finds draft via anchor key", async () => {
    mockDraft = { config: makeConfig(), username: "testuser", status: "draft", configHash: null, updatedAt: null };
    const res = await lockPOST(
      makeRequest("http://localhost/api/draft/lock", "POST", { sectionId: "hero-1" }),
    );
    expect(res.status).toBe(200);
    expect(lastUpsertKey).toBe(SESSION_ANCHOR);
  });

  it("DELETE /api/draft/lock finds draft via anchor key", async () => {
    mockDraft = { config: makeConfig(), username: "testuser", status: "draft", configHash: null, updatedAt: null };
    const res = await lockDELETE(
      makeRequest("http://localhost/api/draft/lock", "DELETE", { sectionId: "hero-1" }),
    );
    expect(res.status).toBe(200);
    expect(lastUpsertKey).toBe(SESSION_ANCHOR);
  });

  it("POST /api/publish passes anchor key to prepareAndPublish", async () => {
    mockDraft = { config: makeConfig(), username: "testuser", status: "approval_pending", configHash: null, updatedAt: null };
    const res = await publishPOST(
      makeRequest("http://localhost/api/publish", "POST", { username: "testuser" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(lastUpsertKey).toBe(SESSION_ANCHOR);
  });
});
