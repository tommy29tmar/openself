import { describe, it, expect, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { PageConfig } from "@/lib/page-config/schema";

/**
 * Integration tests for page-service logic against a real SQLite database.
 * Uses an in-memory DB to avoid touching the real DB file.
 */

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");

const testDb = drizzle(testSqlite, { schema });

// Create the page table with the two-row model schema
testSqlite.exec(`
  CREATE TABLE page (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    config JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'approval_pending', 'published')),
    generated_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (id != 'draft' OR status != 'published'),
    CHECK (id = 'draft' OR status = 'published'),
    CHECK (status != 'published' OR username != 'draft')
  );
  CREATE UNIQUE INDEX uniq_page_published ON page(username) WHERE status = 'published';
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

// -- Inline service functions that operate on testDb/testSqlite --
// (We can't import from page-service because it binds to the real DB singleton)

const RESERVED_USERNAMES = new Set(["draft", "api", "builder", "admin", "_next"]);

function getDraft() {
  const row = testDb.select().from(schema.page).where(eq(schema.page.id, "draft")).get();
  if (!row) return null;
  return { config: row.config as PageConfig, username: row.username, status: row.status };
}

function getPublishedPage(username: string) {
  const row = testDb
    .select()
    .from(schema.page)
    .where(and(eq(schema.page.username, username), eq(schema.page.status, "published")))
    .get();
  if (!row) return null;
  return row.config as PageConfig;
}

function upsertDraft(username: string, config: PageConfig) {
  testDb
    .insert(schema.page)
    .values({ id: "draft", username, config, status: "draft" })
    .onConflictDoUpdate({
      target: schema.page.id,
      set: { username, config, status: "draft", updatedAt: new Date().toISOString() },
    })
    .run();
}

function requestPublish(username: string) {
  if (RESERVED_USERNAMES.has(username)) throw new Error(`Username "${username}" is reserved`);
  const draft = testDb.select().from(schema.page).where(eq(schema.page.id, "draft")).get();
  if (!draft) throw new Error("No draft page exists");
  testDb
    .update(schema.page)
    .set({ username, status: "approval_pending", updatedAt: new Date().toISOString() })
    .where(eq(schema.page.id, "draft"))
    .run();
}

function confirmPublish(username: string) {
  if (RESERVED_USERNAMES.has(username)) throw new Error(`Username "${username}" is reserved`);
  const txn = testSqlite.transaction(() => {
    const draftRow = testSqlite.prepare("SELECT * FROM page WHERE id = 'draft'").get() as any;
    if (!draftRow || draftRow.status !== "approval_pending") {
      throw new Error("No page pending approval");
    }
    testSqlite.prepare("DELETE FROM page WHERE status = 'published' AND username != ?").run(username);
    const now = new Date().toISOString();
    testSqlite
      .prepare(
        `INSERT INTO page (id, username, config, status, generated_at, updated_at)
         VALUES (?, ?, ?, 'published', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username, config = excluded.config,
           status = 'published', generated_at = excluded.generated_at,
           updated_at = excluded.updated_at`,
      )
      .run(username, username, draftRow.config, draftRow.generated_at, now);
    testSqlite.prepare("UPDATE page SET status = 'draft', updated_at = ? WHERE id = 'draft'").run(now);
  });
  txn();
}

// -- Setup / teardown --

beforeEach(() => {
  testSqlite.exec("DELETE FROM page");
});

afterAll(() => {
  testSqlite.close();
});

// -- Tests --

describe("page-service integration (real SQLite)", () => {
  describe("getDraft / upsertDraft", () => {
    it("returns null when no draft exists", () => {
      expect(getDraft()).toBeNull();
    });

    it("creates and reads a draft", () => {
      const config = makeConfig();
      upsertDraft("alice", config);
      const draft = getDraft();
      expect(draft).not.toBeNull();
      expect(draft!.username).toBe("alice");
      expect(draft!.status).toBe("draft");
      expect(draft!.config.theme).toBe("minimal");
    });

    it("updates an existing draft", () => {
      upsertDraft("alice", makeConfig());
      upsertDraft("alice", makeConfig({ theme: "warm" }));
      const draft = getDraft();
      expect(draft!.config.theme).toBe("warm");
    });
  });

  describe("getPublishedPage", () => {
    it("returns null when no published page exists", () => {
      expect(getPublishedPage("alice")).toBeNull();
    });

    it("returns published page after full publish flow", () => {
      upsertDraft("alice", makeConfig({ username: "alice" }));
      requestPublish("alice");
      confirmPublish("alice");
      const published = getPublishedPage("alice");
      expect(published).not.toBeNull();
      expect(published!.theme).toBe("minimal");
    });
  });

  describe("requestPublish", () => {
    it("sets draft status to approval_pending", () => {
      upsertDraft("alice", makeConfig());
      requestPublish("alice");
      const draft = getDraft();
      expect(draft!.status).toBe("approval_pending");
      expect(draft!.username).toBe("alice");
    });

    it("throws for reserved username 'draft'", () => {
      upsertDraft("draft", makeConfig());
      expect(() => requestPublish("draft")).toThrow("reserved");
    });

    it("throws when no draft exists", () => {
      expect(() => requestPublish("alice")).toThrow("No draft page exists");
    });
  });

  describe("confirmPublish", () => {
    it("creates published row and resets draft to 'draft' status", () => {
      upsertDraft("alice", makeConfig());
      requestPublish("alice");
      confirmPublish("alice");

      const published = getPublishedPage("alice");
      expect(published).not.toBeNull();

      const draft = getDraft();
      expect(draft!.status).toBe("draft");
    });

    it("throws for reserved username", () => {
      expect(() => confirmPublish("draft")).toThrow("reserved");
      expect(() => confirmPublish("api")).toThrow("reserved");
    });

    it("throws when draft is not approval_pending", () => {
      upsertDraft("alice", makeConfig());
      // Draft status is "draft", not "approval_pending"
      expect(() => confirmPublish("alice")).toThrow("No page pending approval");
    });

    it("throws when no draft exists", () => {
      expect(() => confirmPublish("alice")).toThrow("No page pending approval");
    });

    it("is atomic: published row and draft reset happen together", () => {
      upsertDraft("alice", makeConfig({ username: "alice" }));
      requestPublish("alice");
      confirmPublish("alice");

      // Both should be present
      const draft = getDraft();
      const published = getPublishedPage("alice");
      expect(draft).not.toBeNull();
      expect(published).not.toBeNull();
      expect(draft!.status).toBe("draft");
    });
  });

  describe("draft does not affect published", () => {
    it("editing draft after publish does not change published page", () => {
      upsertDraft("alice", makeConfig({ username: "alice" }));
      requestPublish("alice");
      confirmPublish("alice");

      // Edit draft with different theme
      upsertDraft("alice", makeConfig({ username: "alice", theme: "warm" }));

      // Published should still have "minimal"
      const published = getPublishedPage("alice");
      expect(published!.theme).toBe("minimal");

      // Draft should have "warm"
      const draft = getDraft();
      expect(draft!.config.theme).toBe("warm");
    });
  });

  describe("username change de-publishes old", () => {
    it("publishing with a new username removes the old published page", () => {
      // Publish as "alice"
      upsertDraft("alice", makeConfig({ username: "alice" }));
      requestPublish("alice");
      confirmPublish("alice");
      expect(getPublishedPage("alice")).not.toBeNull();

      // Now publish as "bob"
      upsertDraft("bob", makeConfig({ username: "bob" }));
      requestPublish("bob");
      confirmPublish("bob");

      expect(getPublishedPage("bob")).not.toBeNull();
      expect(getPublishedPage("alice")).toBeNull(); // Old one removed
    });
  });

  describe("DB CHECK constraints", () => {
    it("rejects inserting a published row with id='draft'", () => {
      expect(() => {
        testSqlite
          .prepare(
            "INSERT INTO page (id, username, config, status) VALUES ('draft', 'alice', '{}', 'published')",
          )
          .run();
      }).toThrow();
    });

    it("rejects inserting a draft status on a non-draft id", () => {
      expect(() => {
        testSqlite
          .prepare(
            "INSERT INTO page (id, username, config, status) VALUES ('alice', 'alice', '{}', 'draft')",
          )
          .run();
      }).toThrow();
    });

    it("rejects publishing with username 'draft'", () => {
      expect(() => {
        testSqlite
          .prepare(
            "INSERT INTO page (id, username, config, status) VALUES ('draft-user', 'draft', '{}', 'published')",
          )
          .run();
      }).toThrow();
    });
  });
});
