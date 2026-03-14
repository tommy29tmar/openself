import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { createFactDisplayOverrideService } from "@/lib/services/fact-display-override-service";

const testSqlite = new Database(":memory:");
testSqlite.pragma("journal_mode = WAL");

testSqlite.exec(`
  CREATE TABLE fact_display_overrides (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    fact_id TEXT NOT NULL,
    display_fields TEXT NOT NULL,
    fact_value_hash TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'agent',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX uniq_fact_display_override ON fact_display_overrides(fact_id);
  CREATE INDEX idx_fdo_owner ON fact_display_overrides(owner_key);
`);

const testDb = drizzle(testSqlite, { schema });
const db = testDb as typeof import("@/lib/db").db;

describe("fact-display-override-service", () => {
  let service: ReturnType<typeof createFactDisplayOverrideService>;

  beforeEach(() => {
    testSqlite.exec("DELETE FROM fact_display_overrides");
    service = createFactDisplayOverrideService(db);
  });

  describe("upsertOverride", () => {
    it("creates a new override for a fact", () => {
      const result = service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "OpenSelf" },
        factValueHash: "abc123",
        source: "agent",
      });
      expect(result.id).toBeDefined();
      expect(result.factId).toBe("fact-1");
    });

    it("upserts on same factId (replaces existing)", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "openself" },
        factValueHash: "hash1",
        source: "agent",
      });
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "OpenSelf" },
        factValueHash: "hash2",
        source: "agent",
      });
      const overrides = service.getOverridesForOwner("owner-1");
      expect(overrides).toHaveLength(1);
      expect(JSON.parse(overrides[0].displayFields).title).toBe("OpenSelf");
    });

    it("preserves ownerKey isolation between owners", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "Alice" },
        factValueHash: "h1",
        source: "agent",
      });
      service.upsertOverride({
        ownerKey: "owner-2",
        factId: "fact-2",
        displayFields: { title: "Bob" },
        factValueHash: "h2",
        source: "agent",
      });
      expect(service.getOverridesForOwner("owner-1")).toHaveLength(1);
      expect(service.getOverridesForOwner("owner-2")).toHaveLength(1);
    });
  });

  describe("getValidOverrides", () => {
    it("returns only overrides with matching fact hash", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "OpenSelf" },
        factValueHash: "current-hash",
        source: "agent",
      });
      const valid = service.getValidOverrides("owner-1", [
        { id: "fact-1", valueHash: "current-hash" },
        { id: "fact-2", valueHash: "other-hash" },
      ]);
      expect(valid.size).toBe(1);
      expect(valid.get("fact-1")).toEqual({ title: "OpenSelf" });
    });

    it("excludes stale overrides where fact hash changed", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "OpenSelf" },
        factValueHash: "old-hash",
        source: "agent",
      });
      const valid = service.getValidOverrides("owner-1", [
        { id: "fact-1", valueHash: "new-hash" },
      ]);
      expect(valid.size).toBe(0);
    });

    it("returns empty map when no overrides exist", () => {
      const valid = service.getValidOverrides("owner-1", [
        { id: "fact-1", valueHash: "hash" },
      ]);
      expect(valid.size).toBe(0);
    });

    it("handles multiple valid overrides", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "Title 1" },
        factValueHash: "hash-1",
        source: "agent",
      });
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-2",
        displayFields: { title: "Title 2" },
        factValueHash: "hash-2",
        source: "worker",
      });
      const valid = service.getValidOverrides("owner-1", [
        { id: "fact-1", valueHash: "hash-1" },
        { id: "fact-2", valueHash: "hash-2" },
      ]);
      expect(valid.size).toBe(2);
    });
  });

  describe("getValidOverrides with readKeys", () => {
    it("finds overrides from readKeys sessions", () => {
      const oldSession = "old-session-123";
      const newProfile = "profile-456";
      const factId = "fact-abc";
      const valueHash = "hash-xyz";

      service.upsertOverride({
        ownerKey: oldSession,
        factId,
        displayFields: { title: "Custom Title" },
        factValueHash: valueHash,
        source: "agent",
      });

      // Without readKeys: not found
      const without = service.getValidOverrides(newProfile, [{ id: factId, valueHash }]);
      expect(without.size).toBe(0);

      // With readKeys: found
      const withKeys = service.getValidOverrides(newProfile, [{ id: factId, valueHash }], [oldSession]);
      expect(withKeys.size).toBe(1);
      expect(withKeys.get(factId)).toEqual({ title: "Custom Title" });
    });
  });

  describe("deleteOverride", () => {
    it("deletes an override by factId", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "OpenSelf" },
        factValueHash: "hash1",
        source: "agent",
      });
      service.deleteOverride("fact-1");
      const overrides = service.getOverridesForOwner("owner-1");
      expect(overrides).toHaveLength(0);
    });

    it("is a no-op for non-existent factId", () => {
      // Should not throw
      service.deleteOverride("non-existent");
      expect(service.getOverridesForOwner("owner-1")).toHaveLength(0);
    });
  });

  describe("cleanupOrphans", () => {
    it("deletes overrides for facts that no longer exist", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-deleted",
        displayFields: { title: "Gone" },
        factValueHash: "hash1",
        source: "agent",
      });
      const cleaned = service.cleanupOrphans("owner-1", ["fact-alive"]);
      expect(cleaned).toBe(1);
    });

    it("keeps overrides for facts that still exist", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-alive",
        displayFields: { title: "Still here" },
        factValueHash: "hash1",
        source: "agent",
      });
      const cleaned = service.cleanupOrphans("owner-1", ["fact-alive"]);
      expect(cleaned).toBe(0);
      expect(service.getOverridesForOwner("owner-1")).toHaveLength(1);
    });

    it("returns 0 when no orphans", () => {
      const cleaned = service.cleanupOrphans("owner-1", []);
      expect(cleaned).toBe(0);
    });
  });

  describe("getOverrideForFact", () => {
    it("returns the override for a specific factId", () => {
      service.upsertOverride({
        ownerKey: "owner-1",
        factId: "fact-1",
        displayFields: { title: "OpenSelf" },
        factValueHash: "hash1",
        source: "agent",
      });
      const row = service.getOverrideForFact("fact-1");
      expect(row).toBeDefined();
      expect(row!.factId).toBe("fact-1");
      expect(JSON.parse(row!.displayFields)).toEqual({ title: "OpenSelf" });
    });

    it("returns undefined for non-existent factId", () => {
      const row = service.getOverrideForFact("nope");
      expect(row).toBeUndefined();
    });
  });
});
