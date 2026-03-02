import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { PageConfig, StyleConfig } from "@/lib/page-config/schema";
import { AVAILABLE_THEMES } from "@/lib/page-config/schema";
import { isAvailableFont } from "@/lib/page-config/fonts";

/**
 * Tests for draft style merging logic (mirrors /api/draft/style behavior).
 * Uses an in-memory DB to avoid touching the real DB file.
 */

const SESSION_ID = "__default__";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");

const testDb = drizzle(testSqlite, { schema });

testSqlite.exec(`
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    invite_code TEXT NOT NULL,
    username TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    user_id TEXT,
    profile_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO sessions (id, invite_code, status) VALUES ('__default__', '__legacy__', 'active');
`);

testSqlite.exec(`
  CREATE TABLE page (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
    profile_id TEXT,
    username TEXT NOT NULL,
    config JSON NOT NULL,
    config_hash TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'approval_pending', 'published')),
    generated_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_language TEXT,
    CHECK (status != 'published' OR username != 'draft')
  );
`);

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
      {
        id: "hero-1",
        type: "hero",
        variant: "large",
        content: { name: "Test User", tagline: "Hello world" },
      },
      { id: "footer-1", type: "footer", content: {} },
    ],
    ...overrides,
  };
}

function getDraft(sessionId: string = SESSION_ID) {
  const row = testDb
    .select()
    .from(schema.page)
    .where(
      and(
        eq(schema.page.id, sessionId),
        inArray(schema.page.status, ["draft", "approval_pending"]),
      ),
    )
    .get();
  if (!row) return null;
  return { config: row.config as PageConfig, username: row.username, status: row.status };
}

function upsertDraft(username: string, config: PageConfig, sessionId: string = SESSION_ID) {
  testDb
    .insert(schema.page)
    .values({ id: sessionId, sessionId, username, config, status: "draft" })
    .onConflictDoUpdate({
      target: schema.page.id,
      set: { username, config, status: "draft", updatedAt: new Date().toISOString() },
    })
    .run();
}

/**
 * Mirrors the merge logic from /api/draft/style route handler.
 */
function applyStylePatch(
  body: { theme?: unknown; style?: Record<string, unknown> },
): { success: boolean; error?: string } {
  const draft = getDraft();
  if (!draft) return { success: false, error: "No draft exists" };

  const config = { ...draft.config };

  if (
    typeof body.theme === "string" &&
    (AVAILABLE_THEMES as readonly string[]).includes(body.theme)
  ) {
    config.theme = body.theme;
  }

  if (body.style && typeof body.style === "object") {
    const style: StyleConfig = { ...config.style };

    if (body.style.colorScheme === "light" || body.style.colorScheme === "dark") {
      style.colorScheme = body.style.colorScheme;
    }

    if (isAvailableFont(body.style.fontFamily)) {
      style.fontFamily = body.style.fontFamily as string;
    }

    if (
      body.style.layout === "centered" ||
      body.style.layout === "split" ||
      body.style.layout === "stack"
    ) {
      style.layout = body.style.layout;
    }

    config.style = style;
  }

  upsertDraft(draft.username, config as PageConfig);
  return { success: true };
}

// -- Setup / teardown --

beforeEach(() => {
  testSqlite.exec("DELETE FROM page");
});

afterAll(() => {
  testSqlite.close();
});

// -- Tests --

describe("draft style merging", () => {
  it("returns error when no draft exists", () => {
    const result = applyStylePatch({ theme: "warm" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no draft/i);
  });

  it("merges theme into existing draft", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ theme: "warm" });
    const draft = getDraft()!;
    expect(draft.config.theme).toBe("warm");
  });

  it("merges colorScheme into existing draft", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ style: { colorScheme: "dark" } });
    const draft = getDraft()!;
    expect(draft.config.style.colorScheme).toBe("dark");
  });

  it("merges fontFamily into existing draft", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ style: { fontFamily: "serif" } });
    const draft = getDraft()!;
    expect(draft.config.style.fontFamily).toBe("serif");
  });

  it("merges layout into existing draft", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ style: { layout: "split" } });
    const draft = getDraft()!;
    expect(draft.config.style.layout).toBe("split");
  });

  it("preserves other fields when changing one style field", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ style: { fontFamily: "mono" } });
    const draft = getDraft()!;
    // fontFamily changed
    expect(draft.config.style.fontFamily).toBe("mono");
    // everything else preserved
    expect(draft.config.style.colorScheme).toBe("light");
    expect(draft.config.style.primaryColor).toBe("#6366f1");
    expect(draft.config.style.layout).toBe("centered");
    expect(draft.config.theme).toBe("minimal");
    expect(draft.config.sections).toHaveLength(2);
  });

  it("applies theme and style together", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ theme: "warm", style: { colorScheme: "dark", fontFamily: "serif" } });
    const draft = getDraft()!;
    expect(draft.config.theme).toBe("warm");
    expect(draft.config.style.colorScheme).toBe("dark");
    expect(draft.config.style.fontFamily).toBe("serif");
  });

  it("ignores invalid theme values", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ theme: "neon" });
    const draft = getDraft()!;
    expect(draft.config.theme).toBe("minimal"); // unchanged
  });

  it("ignores invalid fontFamily values", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ style: { fontFamily: "comic-sans" } });
    const draft = getDraft()!;
    expect(draft.config.style.fontFamily).toBe("inter"); // unchanged
  });

  it("ignores invalid colorScheme values", () => {
    upsertDraft("alice", makeConfig());
    applyStylePatch({ style: { colorScheme: "sepia" } });
    const draft = getDraft()!;
    expect(draft.config.style.colorScheme).toBe("light"); // unchanged
  });
});

describe("font constants", () => {
  it("recognizes all valid fonts", () => {
    expect(isAvailableFont("inter")).toBe(true);
    expect(isAvailableFont("serif")).toBe(true);
    expect(isAvailableFont("mono")).toBe(true);
  });

  it("rejects invalid font names", () => {
    expect(isAvailableFont("comic")).toBe(false);
    expect(isAvailableFont("")).toBe(false);
    expect(isAvailableFont(null)).toBe(false);
    expect(isAvailableFont(42)).toBe(false);
  });
});

// -- Route handler tests (mock page-service, test real handler) --

// Storage for the mock — shared between mock and tests
let mockDraft: { config: PageConfig; username: string; status: string; configHash: string | null; updatedAt: string | null } | null = null;
let lastUpserted: { username: string; config: PageConfig; sessionId: string } | null = null;

vi.mock("@/lib/services/page-service", () => ({
  getDraft: (_sessionId?: string) => mockDraft,
  upsertDraft: (username: string, config: PageConfig, sessionId?: string) => {
    lastUpserted = { username, config, sessionId: sessionId ?? "__default__" };
    // Also update mockDraft so subsequent reads see the change
    mockDraft = { config, username, status: "draft", configHash: null, updatedAt: null };
  },
  getPublishedPage: () => null,
  hasAnyPage: () => mockDraft !== null,
  requestPublish: () => {},
  confirmPublish: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: () => "__default__",
  resolveOwnerScope: () => ({
    cognitiveOwnerKey: "__default__",
    knowledgeReadKeys: ["__default__"],
    knowledgePrimaryKey: "__default__",
    currentSessionId: "__default__",
  }),
  createSessionCookie: () => "",
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: () => false,
  getSession: () => null,
  getDefaultSessionId: () => "__default__",
}));

// Must import AFTER vi.mock so the mock is in place
const { POST } = await import("@/app/api/draft/style/route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/draft/style", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/draft/style (route handler)", () => {
  beforeEach(() => {
    mockDraft = null;
    lastUpserted = null;
  });

  it("returns 404 when no draft exists", async () => {
    const res = await POST(makeRequest({ theme: "warm" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/no draft/i);
  });

  it("merges theme and returns 200", async () => {
    mockDraft = { config: makeConfig(), username: "alice", status: "draft", configHash: null, updatedAt: null };
    const res = await POST(makeRequest({ theme: "warm" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(lastUpserted!.config.theme).toBe("warm");
  });

  it("merges style fields and preserves the rest", async () => {
    mockDraft = { config: makeConfig(), username: "alice", status: "draft", configHash: null, updatedAt: null };
    const res = await POST(
      makeRequest({ style: { colorScheme: "dark", fontFamily: "mono" } }),
    );
    expect(res.status).toBe(200);
    expect(lastUpserted!.config.style.colorScheme).toBe("dark");
    expect(lastUpserted!.config.style.fontFamily).toBe("mono");
    // Preserved
    expect(lastUpserted!.config.style.primaryColor).toBe("#6366f1");
    expect(lastUpserted!.config.style.layout).toBe("centered");
    expect(lastUpserted!.config.theme).toBe("minimal");
  });

  it("ignores invalid values without error", async () => {
    mockDraft = { config: makeConfig(), username: "alice", status: "draft", configHash: null, updatedAt: null };
    const res = await POST(
      makeRequest({ theme: "neon", style: { fontFamily: "comic" } }),
    );
    expect(res.status).toBe(200);
    // Nothing changed
    expect(lastUpserted!.config.theme).toBe("minimal");
    expect(lastUpserted!.config.style.fontFamily).toBe("inter");
  });

  it("preserves username from draft", async () => {
    mockDraft = { config: makeConfig(), username: "bob", status: "draft", configHash: null, updatedAt: null };
    await POST(makeRequest({ theme: "warm" }));
    expect(lastUpserted!.username).toBe("bob");
  });
});
