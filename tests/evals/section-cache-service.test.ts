import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { createSectionCacheService } from "@/lib/services/section-cache-service";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");

testSqlite.exec(`
  CREATE TABLE section_copy_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_key TEXT NOT NULL,
    section_type TEXT NOT NULL,
    facts_hash TEXT NOT NULL,
    soul_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    personalized_content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(owner_key, section_type, facts_hash, soul_hash, language)
  );
  CREATE INDEX idx_section_cache_lookup
    ON section_copy_cache(owner_key, section_type, facts_hash, soul_hash, language);
`);

const testDb = drizzle(testSqlite, { schema });
const svc = createSectionCacheService(testDb as typeof import("@/lib/db").db);

beforeEach(() => {
  testSqlite.exec("DELETE FROM section_copy_cache");
});

describe("getCachedCopy", () => {
  it("returns null on cache miss", () => {
    const result = svc.getCachedCopy("owner1", "bio", "fh1", "sh1", "en");
    expect(result).toBeNull();
  });
});

describe("putCachedCopy + getCachedCopy", () => {
  it("stores and retrieves a cached copy", () => {
    svc.putCachedCopy("owner1", "bio", "fh1", "sh1", "en", "A creative developer.");
    const result = svc.getCachedCopy("owner1", "bio", "fh1", "sh1", "en");
    expect(result).toBe("A creative developer.");
  });

  it("returns null when any field differs", () => {
    svc.putCachedCopy("owner1", "bio", "fh1", "sh1", "en", "text");

    // Different owner
    expect(svc.getCachedCopy("owner2", "bio", "fh1", "sh1", "en")).toBeNull();
    // Different section type
    expect(svc.getCachedCopy("owner1", "hero", "fh1", "sh1", "en")).toBeNull();
    // Different facts hash
    expect(svc.getCachedCopy("owner1", "bio", "fh2", "sh1", "en")).toBeNull();
    // Different soul hash
    expect(svc.getCachedCopy("owner1", "bio", "fh1", "sh2", "en")).toBeNull();
    // Different language
    expect(svc.getCachedCopy("owner1", "bio", "fh1", "sh1", "it")).toBeNull();
  });
});

describe("upsert on conflict", () => {
  it("overwrites content when same 5-key tuple is inserted again", () => {
    svc.putCachedCopy("owner1", "bio", "fh1", "sh1", "en", "version 1");
    svc.putCachedCopy("owner1", "bio", "fh1", "sh1", "en", "version 2");

    const result = svc.getCachedCopy("owner1", "bio", "fh1", "sh1", "en");
    expect(result).toBe("version 2");

    // Verify only one row exists
    const count = testSqlite
      .prepare("SELECT COUNT(*) as cnt FROM section_copy_cache")
      .get() as { cnt: number };
    expect(count.cnt).toBe(1);
  });
});

describe("cleanupExpiredCache", () => {
  it("removes entries older than TTL", () => {
    // Insert a row with a backdated created_at
    testSqlite.exec(`
      INSERT INTO section_copy_cache
        (owner_key, section_type, facts_hash, soul_hash, language, personalized_content, created_at)
      VALUES
        ('owner1', 'bio', 'fh1', 'sh1', 'en', 'old content', datetime('now', '-31 days'))
    `);

    // Insert a fresh row
    svc.putCachedCopy("owner1", "hero", "fh2", "sh2", "en", "fresh content");

    const deleted = svc.cleanupExpiredCache(30);
    expect(deleted).toBe(1);

    // Old one gone
    expect(svc.getCachedCopy("owner1", "bio", "fh1", "sh1", "en")).toBeNull();
    // Fresh one still there
    expect(svc.getCachedCopy("owner1", "hero", "fh2", "sh2", "en")).toBe("fresh content");
  });

  it("returns 0 when nothing is expired", () => {
    svc.putCachedCopy("owner1", "bio", "fh1", "sh1", "en", "content");
    const deleted = svc.cleanupExpiredCache(30);
    expect(deleted).toBe(0);
  });
});
