import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import {
  createFactDisplayOverrideService,
  computeFactValueHash,
  filterEditableFields,
} from "@/lib/services/fact-display-override-service";
import { applyFactDisplayOverrides } from "@/lib/services/page-projection";
import { parseCurationResponse } from "@/lib/services/page-curation-service";

/* ---------- in-memory test DB ---------- */
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

describe("content curation integration", () => {
  describe("item-level override flow", () => {
    it("override applies to fact value in composed output", () => {
      const facts = [
        {
          id: "f1",
          category: "project",
          key: "openself",
          value: { title: "openself", url: "https://openself.dev" },
          source: null,
          confidence: null,
          visibility: "public",
          sortOrder: null,
          parentFactId: null,
          archivedAt: null,
          createdAt: null,
          updatedAt: null,
        },
      ];
      const overrides = new Map([["f1", { title: "OpenSelf" }]]);
      const result = applyFactDisplayOverrides(facts as never[], overrides);
      expect((result[0].value as Record<string, unknown>).title).toBe(
        "OpenSelf",
      );
      expect((result[0].value as Record<string, unknown>).url).toBe(
        "https://openself.dev",
      );
    });

    it("stale override (hash mismatch) falls back to raw fact", () => {
      testSqlite.exec("DELETE FROM fact_display_overrides");
      const service = createFactDisplayOverrideService(db);
      const originalValue = { title: "openself" };
      const originalHash = computeFactValueHash(originalValue);

      service.upsertOverride({
        ownerKey: "test-owner",
        factId: "f1",
        displayFields: { title: "OpenSelf" },
        factValueHash: originalHash,
        source: "agent",
      });

      // Fact value changed — hash no longer matches
      const newValue = { title: "openself-2" };
      const newHash = computeFactValueHash(newValue);
      const valid = service.getValidOverrides("test-owner", [
        { id: "f1", valueHash: newHash },
      ]);
      expect(valid.size).toBe(0); // Override is stale
    });

    it("adding a new fact does not invalidate existing curations (per-item isolation)", () => {
      testSqlite.exec("DELETE FROM fact_display_overrides");
      const service = createFactDisplayOverrideService(db);
      const value1 = { title: "project-a" };
      const value2 = { title: "project-b" };

      service.upsertOverride({
        ownerKey: "test-owner",
        factId: "f1",
        displayFields: { title: "Project A" },
        factValueHash: computeFactValueHash(value1),
        source: "agent",
      });
      service.upsertOverride({
        ownerKey: "test-owner",
        factId: "f2",
        displayFields: { title: "Project B" },
        factValueHash: computeFactValueHash(value2),
        source: "agent",
      });

      // "Add" a third fact — only its hash matters, others unchanged
      const valid = service.getValidOverrides("test-owner", [
        { id: "f1", valueHash: computeFactValueHash(value1) },
        { id: "f2", valueHash: computeFactValueHash(value2) },
        { id: "f3", valueHash: computeFactValueHash({ title: "new-project" }) },
      ]);
      expect(valid.size).toBe(2); // Both curations survive
      expect(valid.get("f1")).toEqual({ title: "Project A" });
      expect(valid.get("f2")).toEqual({ title: "Project B" });
    });
  });

  describe("field filtering safety", () => {
    it("blocks URL and date overrides", () => {
      const fields = {
        title: "OpenSelf",
        url: "https://malicious.com",
        startDate: "2025-01-01",
        description: "Curated description",
      };
      const filtered = filterEditableFields("project", fields);
      expect(filtered).toEqual({
        title: "OpenSelf",
        description: "Curated description",
      });
      expect(filtered).not.toHaveProperty("url");
      expect(filtered).not.toHaveProperty("startDate");
    });

    it("returns empty for unsupported categories", () => {
      expect(filterEditableFields("unknown", { title: "test" })).toEqual({});
    });
  });

  describe("worker curation response parsing", () => {
    it("respects agent curation priority", () => {
      const response = {
        suggestions: [
          {
            type: "item" as const,
            sectionType: "projects",
            factId: "f1",
            fields: { title: "Worker suggestion" },
            reason: "Better",
          },
          {
            type: "item" as const,
            sectionType: "projects",
            factId: "f2",
            fields: { title: "Also improved" },
            reason: "Polish",
          },
        ],
      };
      const agentCurated = new Set(["f1"]); // f1 is agent-curated
      const parsed = parseCurationResponse(response, agentCurated);
      expect(parsed).toHaveLength(1); // Only f2 survives
      expect(parsed[0].factId).toBe("f2");
    });
  });
});
