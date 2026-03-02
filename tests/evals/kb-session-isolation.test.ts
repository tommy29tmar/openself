import { describe, it, expect, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, like, or, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { randomUUID } from "crypto";

/**
 * Cross-session isolation tests for kb-service logic.
 * Uses an in-memory DB to verify that updateFact / deleteFact
 * respect session_id boundaries.
 */

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");
testSqlite.pragma("foreign_keys = ON");

const testDb = drizzle(testSqlite, { schema });

// Bootstrap schema
testSqlite.exec(`
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    invite_code TEXT NOT NULL,
    username TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    user_id TEXT,
    profile_id TEXT,
    journey_state TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE category_registry (
    category TEXT PRIMARY KEY,
    status TEXT DEFAULT 'active',
    created_by TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE category_aliases (
    alias TEXT PRIMARY KEY,
    category TEXT NOT NULL REFERENCES category_registry(category),
    source TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__',
    profile_id TEXT,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSON NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0,
    visibility TEXT DEFAULT 'private',
    sort_order INTEGER DEFAULT 0,
    parent_fact_id TEXT,
    archived_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX uniq_facts_session_category_key ON facts(session_id, category, key);

  INSERT INTO sessions (id, invite_code) VALUES ('session-a', 'inv-a');
  INSERT INTO sessions (id, invite_code) VALUES ('session-b', 'inv-b');

  INSERT INTO category_registry (category) VALUES ('identity');
  INSERT INTO category_registry (category) VALUES ('skill');
`);

// -- Inline kb-service functions operating on testDb --

function createFact(
  input: { category: string; key: string; value: Record<string, unknown> },
  sessionId: string,
): { id: string; category: string; key: string; value: unknown } {
  const id = randomUUID();
  const now = new Date().toISOString();
  testDb
    .insert(schema.facts)
    .values({
      id,
      sessionId,
      category: input.category,
      key: input.key,
      value: input.value,
      source: "chat",
      confidence: 1.0,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.facts.sessionId, schema.facts.category, schema.facts.key],
      set: { value: input.value, updatedAt: now },
    })
    .run();

  const row = testDb
    .select()
    .from(schema.facts)
    .where(
      sql`${schema.facts.sessionId} = ${sessionId} AND ${schema.facts.category} = ${input.category} AND ${schema.facts.key} = ${input.key}`,
    )
    .get();

  return row as any;
}

function updateFact(
  input: { factId: string; value: Record<string, unknown> },
  sessionId: string,
): { id: string; value: unknown } | null {
  const existing = testDb
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.id, input.factId), eq(schema.facts.sessionId, sessionId)))
    .get();

  if (!existing) return null;

  const now = new Date().toISOString();
  testDb
    .update(schema.facts)
    .set({ value: input.value, updatedAt: now })
    .where(and(eq(schema.facts.id, input.factId), eq(schema.facts.sessionId, sessionId)))
    .run();

  return { ...existing, value: input.value } as any;
}

function deleteFact(factId: string, sessionId: string): boolean {
  const existing = testDb
    .select()
    .from(schema.facts)
    .where(and(eq(schema.facts.id, factId), eq(schema.facts.sessionId, sessionId)))
    .get();

  if (!existing) return false;

  testDb
    .delete(schema.facts)
    .where(and(eq(schema.facts.id, factId), eq(schema.facts.sessionId, sessionId)))
    .run();

  return true;
}

function getActiveFacts(sessionId: string) {
  return testDb
    .select()
    .from(schema.facts)
    .where(eq(schema.facts.sessionId, sessionId))
    .all();
}

function searchFacts(query: string, sessionId: string) {
  const pattern = `%${query}%`;
  return testDb
    .select()
    .from(schema.facts)
    .where(
      and(
        eq(schema.facts.sessionId, sessionId),
        or(
          like(schema.facts.category, pattern),
          like(schema.facts.key, pattern),
          sql`json_extract(${schema.facts.value}, '$') LIKE ${pattern}`,
        ),
      ),
    )
    .all();
}

// -- Setup / teardown --

beforeEach(() => {
  testSqlite.exec("DELETE FROM facts");
});

afterAll(() => {
  testSqlite.close();
});

// -- Tests --

describe("kb-service session isolation (real SQLite)", () => {
  describe("createFact scoping", () => {
    it("same category+key in different sessions creates separate facts", () => {
      createFact({ category: "identity", key: "full-name", value: { full: "Alice" } }, "session-a");
      createFact({ category: "identity", key: "full-name", value: { full: "Bob" } }, "session-b");

      const factsA = getActiveFacts("session-a");
      const factsB = getActiveFacts("session-b");

      expect(factsA).toHaveLength(1);
      expect(factsB).toHaveLength(1);
      expect((factsA[0].value as any).full).toBe("Alice");
      expect((factsB[0].value as any).full).toBe("Bob");
    });
  });

  describe("updateFact isolation", () => {
    it("cannot update a fact belonging to another session", () => {
      const factA = createFact(
        { category: "identity", key: "full-name", value: { full: "Alice" } },
        "session-a",
      );

      // Session B tries to update session A's fact
      const result = updateFact({ factId: factA.id, value: { full: "Hacked" } }, "session-b");

      expect(result).toBeNull();

      // Verify original is untouched
      const factsA = getActiveFacts("session-a");
      expect((factsA[0].value as any).full).toBe("Alice");
    });

    it("can update own session's fact", () => {
      const factA = createFact(
        { category: "identity", key: "full-name", value: { full: "Alice" } },
        "session-a",
      );

      const result = updateFact({ factId: factA.id, value: { full: "Alice Smith" } }, "session-a");

      expect(result).not.toBeNull();
      const factsA = getActiveFacts("session-a");
      expect((factsA[0].value as any).full).toBe("Alice Smith");
    });
  });

  describe("deleteFact isolation", () => {
    it("cannot delete a fact belonging to another session", () => {
      const factA = createFact(
        { category: "skill", key: "typescript", value: { name: "TypeScript" } },
        "session-a",
      );

      // Session B tries to delete session A's fact
      const deleted = deleteFact(factA.id, "session-b");

      expect(deleted).toBe(false);

      // Verify still exists
      const factsA = getActiveFacts("session-a");
      expect(factsA).toHaveLength(1);
    });

    it("can delete own session's fact", () => {
      const factA = createFact(
        { category: "skill", key: "typescript", value: { name: "TypeScript" } },
        "session-a",
      );

      const deleted = deleteFact(factA.id, "session-a");

      expect(deleted).toBe(true);
      expect(getActiveFacts("session-a")).toHaveLength(0);
    });
  });

  describe("getActiveFacts / searchFacts scoping", () => {
    it("getActiveFacts only returns facts for the given session", () => {
      createFact({ category: "skill", key: "ts", value: { name: "TypeScript" } }, "session-a");
      createFact({ category: "skill", key: "rust", value: { name: "Rust" } }, "session-a");
      createFact({ category: "skill", key: "go", value: { name: "Go" } }, "session-b");

      expect(getActiveFacts("session-a")).toHaveLength(2);
      expect(getActiveFacts("session-b")).toHaveLength(1);
    });

    it("searchFacts only returns facts for the given session", () => {
      createFact({ category: "skill", key: "typescript", value: { name: "TypeScript" } }, "session-a");
      createFact({ category: "skill", key: "typescript", value: { name: "TypeScript" } }, "session-b");

      const resultsA = searchFacts("typescript", "session-a");
      const resultsB = searchFacts("typescript", "session-b");

      expect(resultsA).toHaveLength(1);
      expect(resultsB).toHaveLength(1);
      // IDs should be different
      expect(resultsA[0].id).not.toBe(resultsB[0].id);
    });
  });

  describe("cross-session attack scenarios", () => {
    it("session B cannot enumerate session A's fact IDs via update probing", () => {
      const factA = createFact(
        { category: "identity", key: "email", value: { email: "alice@example.com" } },
        "session-a",
      );

      // Even with the exact ID, session B gets null
      const probe = updateFact({ factId: factA.id, value: { email: "evil@example.com" } }, "session-b");
      expect(probe).toBeNull();
    });

    it("session B cannot delete session A's facts even with known ID", () => {
      const factA = createFact(
        { category: "identity", key: "phone", value: { phone: "+1234567890" } },
        "session-a",
      );

      expect(deleteFact(factA.id, "session-b")).toBe(false);
      expect(getActiveFacts("session-a")).toHaveLength(1);
    });
  });
});
