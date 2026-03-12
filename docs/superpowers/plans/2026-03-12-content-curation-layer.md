# Content Curation Layer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable agent and worker to curate page content (text, titles, descriptions) without modifying immutable facts — two-layer architecture with per-item hash guards.

**Architecture:** Layer 1 (item-level): new `fact_display_overrides` table stores per-fact presentation overrides, applied pre-composition in memory. Layer 2 (section-level): existing `section_copy_state` extended with source="agent" for direct agent writes. One unified agent tool `curate_content` routes to the appropriate layer. Weekly worker "page curator" job creates proposals via existing proposal system.

**Tech Stack:** TypeScript, Drizzle ORM, SQLite, Vercel AI SDK, Vitest

**Design doc:** `/tmp/brainstorm-challenge/design-final.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `db/migrations/0032_fact_display_overrides.sql` | New table only (job_type CHECK handled at app level) |
| `src/lib/services/fact-display-override-service.ts` | CRUD for fact display overrides (get, upsert, delete, getValid, cleanup) |
| `src/lib/services/page-curation-service.ts` | LLM-based page curation analysis + rewrite proposals (worker) |
| `src/lib/worker/handlers/curate-page.ts` | Worker handler for `curate_page` job |
| `tests/evals/fact-display-override-service.test.ts` | Unit tests for override service |
| `tests/evals/fact-display-overrides-merge.test.ts` | Tests for pre-composition merge |
| `tests/evals/curate-content-tool.test.ts` | Tests for agent tool routing |
| `tests/evals/page-curation-service.test.ts` | Tests for worker curation analysis |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `factDisplayOverrides` table definition |
| `src/lib/services/page-projection.ts:41-72` | Add `applyFactDisplayOverrides()` call before composition |
| `src/lib/services/section-personalizer.ts` | Skip section if source="agent" in section_copy_state |
| `src/lib/agent/tools.ts:1952+` | Add `curate_content` tool |
| `src/lib/agent/prompts.ts:110-127` | Add curate_content instructions to TOOL_POLICY |
| `src/lib/worker/heartbeat.ts:157-279` | Add curate_page substep to deep heartbeat |
| `src/lib/worker/heartbeat.ts:38-64` | Add orphan cleanup to global housekeeping (import `factDisplayOverrides` from schema) |
| `src/lib/worker/index.ts:~169` | Add `curate_page: handlePageCuration` to handlers map |
| `src/lib/services/section-copy-state-service.ts:17-25` | Widen `UpsertStateInput.source` to include `"agent"` |

---

## Chunk 1: Schema & Service Layer

### Task 1: Migration 0032 — fact_display_overrides table

**Files:**
- Create: `db/migrations/0032_fact_display_overrides.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Content Curation Layer: fact-level display overrides
-- Stores per-fact presentation adjustments (capitalization, wording, polish)
-- applied pre-composition without modifying immutable facts.

CREATE TABLE IF NOT EXISTS fact_display_overrides (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  display_fields TEXT NOT NULL,        -- JSON: { "title": "OpenSelf" }
  fact_value_hash TEXT NOT NULL,       -- SHA256 of original fact.value JSON
  source TEXT NOT NULL DEFAULT 'agent', -- agent | worker | live
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fact_display_override
  ON fact_display_overrides(fact_id);

CREATE INDEX IF NOT EXISTS idx_fdo_owner
  ON fact_display_overrides(owner_key);
```

- [ ] **Step 2: Update job_type CHECK constraint for curate_page**

The jobs table CHECK constraint must include `curate_page`. Since SQLite doesn't support ALTER CHECK, we must recreate the table. **IMPORTANT: The implementor MUST inspect the current jobs table structure from migrations 0027 + 0031 to get the exact columns, defaults, and indexes before recreating.** The pattern:

```sql
-- 1. Read current table structure: .schema jobs
-- 2. Create jobs_v2 with IDENTICAL columns + curate_page in CHECK
-- 3. INSERT INTO jobs_v2 SELECT * FROM jobs
-- 4. DROP TABLE jobs
-- 5. ALTER TABLE jobs_v2 RENAME TO jobs
-- 6. Recreate ALL indexes (check 0027 for expression indexes on json_extract)
```

Key columns to preserve from current schema:
- `id`, `job_type` (with updated CHECK), `status`, `payload` (DEFAULT '{}'), `attempts`, `run_after` (NOT NULL), `last_error`, `created_at`, `updated_at`, `heartbeat_at`
- Expression indexes: `uniq_jobs_dedup_global`, `uniq_jobs_dedup_compaction`, `uniq_jobs_dedup_consolidate` (all use `json_extract(payload, '$.ownerKey')`)

**Do NOT copy the SQL from this plan verbatim — inspect the actual current schema first.**

- [ ] **Step 3: Verify migration applies cleanly**

Run: `npm run db:migrate` (or equivalent)
Expected: Migration 0032 applies without errors

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0032_fact_display_overrides.sql
git commit -m "feat(db): add fact_display_overrides table and curate_page job type (migration 0032)"
```

---

### Task 2: Drizzle schema definition

**Files:**
- Modify: `src/lib/db/schema.ts` (after line ~528, near section_copy_proposals)

- [ ] **Step 1: Add factDisplayOverrides table to Drizzle schema**

Add after the `sectionCopyProposals` table definition (~line 528):

```typescript
export const factDisplayOverrides = sqliteTable(
  "fact_display_overrides",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    factId: text("fact_id").notNull().unique(),
    displayFields: text("display_fields").notNull(), // JSON
    factValueHash: text("fact_value_hash").notNull(),
    source: text("source").notNull().default("agent"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): add factDisplayOverrides Drizzle table definition"
```

---

### Task 3: Fact display override service — core CRUD

**Files:**
- Create: `src/lib/services/fact-display-override-service.ts`
- Create: `tests/evals/fact-display-override-service.test.ts`

- [ ] **Step 1: Write failing tests for core CRUD**

```typescript
// tests/evals/fact-display-override-service.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createFactDisplayOverrideService } from "@/lib/services/fact-display-override-service";
import { db } from "@/lib/db"; // follow existing test patterns — use real DB

describe("fact-display-override-service", () => {
  let service: ReturnType<typeof createFactDisplayOverrideService>;

  beforeEach(() => {
    // db imported at top level: import { db } from "@/lib/db"
    service = createFactDisplayOverrideService();
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
      // Simulate: fact value changed, hash no longer matches
      const valid = service.getValidOverrides("owner-1", [
        { id: "fact-1", valueHash: "current-hash" },
        { id: "fact-2", valueHash: "other-hash" }, // no override exists
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
        { id: "fact-1", valueHash: "new-hash" }, // hash changed
      ]);
      expect(valid.size).toBe(0);
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
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-display-override-service.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the service**

```typescript
// src/lib/services/fact-display-override-service.ts
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { factDisplayOverrides } from "@/lib/db/schema";
import { computeHash } from "@/lib/services/personalization-hashing";

export type UpsertOverrideInput = {
  ownerKey: string;
  factId: string;
  displayFields: Record<string, unknown>;
  factValueHash: string;
  source: "agent" | "worker" | "live";
};

export type FactHashEntry = { id: string; valueHash: string };

/**
 * Editable fields per fact category.
 * Only these fields can be overridden in a fact's display.
 * Non-listed fields (dates, URLs, status flags, tags) are immutable.
 */
export const ITEM_EDITABLE_FIELDS: Record<string, string[]> = {
  identity: ["full", "name", "full_name", "role", "title", "tagline", "company", "organization"],
  experience: ["role", "title", "company", "organization", "description"],
  education: ["institution", "school", "degree", "field", "description"],
  project: ["title", "name", "description"],
  achievement: ["title", "name", "description"],
  interest: ["name", "detail", "description"],
  reading: ["title", "name", "author", "note", "description"],
  music: ["title", "name", "artist", "note", "description"],
  activity: ["name", "description"],
  skill: ["name"],
  social: ["label"],
};

/** Compute SHA256 hash of a fact's value for staleness detection */
export function computeFactValueHash(value: unknown): string {
  return computeHash(JSON.stringify(value));
}

/** Filter displayFields to only allowed editable fields for the category */
export function filterEditableFields(
  category: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ITEM_EDITABLE_FIELDS[category];
  if (!allowed) return {};
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (allowed.includes(key)) filtered[key] = fields[key];
  }
  return filtered;
}

export function createFactDisplayOverrideService(db: typeof defaultDb = defaultDb) {
  function upsertOverride(input: UpsertOverrideInput) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const displayFieldsJson = JSON.stringify(input.displayFields);

    db.insert(factDisplayOverrides)
      .values({
        id,
        ownerKey: input.ownerKey,
        factId: input.factId,
        displayFields: displayFieldsJson,
        factValueHash: input.factValueHash,
        source: input.source,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: factDisplayOverrides.factId,
        set: {
          displayFields: displayFieldsJson,
          factValueHash: input.factValueHash,
          source: input.source,
          updatedAt: now,
        },
      })
      .run();

    return { id, factId: input.factId };
  }

  function getOverridesForOwner(ownerKey: string) {
    return db
      .select()
      .from(factDisplayOverrides)
      .where(eq(factDisplayOverrides.ownerKey, ownerKey))
      .all();
  }

  function getValidOverrides(
    ownerKey: string,
    factHashes: FactHashEntry[],
  ): Map<string, Record<string, unknown>> {
    const overrides = getOverridesForOwner(ownerKey);
    const hashMap = new Map(factHashes.map((f) => [f.id, f.valueHash]));
    const valid = new Map<string, Record<string, unknown>>();

    for (const row of overrides) {
      const currentHash = hashMap.get(row.factId);
      if (currentHash && currentHash === row.factValueHash) {
        try {
          valid.set(row.factId, JSON.parse(row.displayFields));
        } catch {
          // skip malformed JSON
        }
      }
    }
    return valid;
  }

  function deleteOverride(factId: string) {
    db.delete(factDisplayOverrides)
      .where(eq(factDisplayOverrides.factId, factId))
      .run();
  }

  function cleanupOrphans(ownerKey: string, activeFactIds: string[]): number {
    const overrides = getOverridesForOwner(ownerKey);
    const activeSet = new Set(activeFactIds);
    let cleaned = 0;
    for (const row of overrides) {
      if (!activeSet.has(row.factId)) {
        deleteOverride(row.factId);
        cleaned++;
      }
    }
    return cleaned;
  }

  function getOverrideForFact(factId: string) {
    return db
      .select()
      .from(factDisplayOverrides)
      .where(eq(factDisplayOverrides.factId, factId))
      .get();
  }

  return {
    upsertOverride,
    getOverridesForOwner,
    getValidOverrides,
    deleteOverride,
    cleanupOrphans,
    getOverrideForFact,
  };
}

// Singleton
let _service: ReturnType<typeof createFactDisplayOverrideService> | null = null;
export function getFactDisplayOverrideService() {
  if (!_service) {
    _service = createFactDisplayOverrideService(defaultDb);
  }
  return _service;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/fact-display-override-service.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/fact-display-override-service.ts tests/evals/fact-display-override-service.test.ts
git commit -m "feat: add fact-display-override service with CRUD, hash validation, and orphan cleanup"
```

---

## Chunk 2: Pre-Composition Merge

### Task 4: applyFactDisplayOverrides function

**Files:**
- Modify: `src/lib/services/page-projection.ts:41-72`
- Create: `tests/evals/fact-display-overrides-merge.test.ts`

- [ ] **Step 1: Write failing tests for pre-composition merge**

```typescript
// tests/evals/fact-display-overrides-merge.test.ts
import { describe, it, expect } from "vitest";
import { applyFactDisplayOverrides } from "@/lib/services/page-projection";

// Minimal FactRow-like object for testing
function makeFact(id: string, category: string, value: Record<string, unknown>) {
  return {
    id,
    category,
    key: "test",
    value,
    source: null,
    confidence: null,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

describe("applyFactDisplayOverrides", () => {
  it("applies valid override to fact value", () => {
    const facts = [makeFact("f1", "project", { title: "openself", url: "https://x.com" })];
    const overrides = new Map([["f1", { title: "OpenSelf" }]]);

    const result = applyFactDisplayOverrides(facts, overrides);
    expect((result[0].value as Record<string, unknown>).title).toBe("OpenSelf");
    expect((result[0].value as Record<string, unknown>).url).toBe("https://x.com");
  });

  it("does not mutate original facts array", () => {
    const facts = [makeFact("f1", "project", { title: "openself" })];
    const overrides = new Map([["f1", { title: "OpenSelf" }]]);

    const result = applyFactDisplayOverrides(facts, overrides);
    expect((facts[0].value as Record<string, unknown>).title).toBe("openself");
    expect((result[0].value as Record<string, unknown>).title).toBe("OpenSelf");
  });

  it("passes through facts without overrides unchanged", () => {
    const facts = [
      makeFact("f1", "project", { title: "openself" }),
      makeFact("f2", "project", { title: "other" }),
    ];
    const overrides = new Map([["f1", { title: "OpenSelf" }]]);

    const result = applyFactDisplayOverrides(facts, overrides);
    expect((result[0].value as Record<string, unknown>).title).toBe("OpenSelf");
    expect((result[1].value as Record<string, unknown>).title).toBe("other");
  });

  it("returns original array when no overrides exist", () => {
    const facts = [makeFact("f1", "project", { title: "openself" })];
    const overrides = new Map();

    const result = applyFactDisplayOverrides(facts, overrides);
    expect(result).toEqual(facts);
  });

  it("merges override fields without removing non-overridden fields", () => {
    const facts = [makeFact("f1", "experience", {
      role: "developer",
      company: "acme",
      startDate: "2024-01",
      description: "old desc",
    })];
    const overrides = new Map([["f1", { company: "Acme Corp", description: "New description" }]]);

    const result = applyFactDisplayOverrides(facts, overrides);
    const v = result[0].value as Record<string, unknown>;
    expect(v.company).toBe("Acme Corp");
    expect(v.description).toBe("New description");
    expect(v.role).toBe("developer");
    expect(v.startDate).toBe("2024-01");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-display-overrides-merge.test.ts`
Expected: FAIL (function not found)

- [ ] **Step 3: Implement applyFactDisplayOverrides**

Add to `src/lib/services/page-projection.ts` (before `projectCanonicalConfig`):

```typescript
import type { FactRow } from "@/lib/services/kb-service";

/**
 * Apply fact display overrides to facts in memory (pre-composition).
 * Returns a new array with overridden fact values — original array is not mutated.
 * Only fields present in the override are replaced; all other fact value fields preserved.
 */
export function applyFactDisplayOverrides(
  facts: FactRow[],
  overrides: Map<string, Record<string, unknown>>,
): FactRow[] {
  if (overrides.size === 0) return facts;

  return facts.map((fact) => {
    const override = overrides.get(fact.id);
    if (!override) return fact;

    const currentValue = (typeof fact.value === "object" && fact.value !== null)
      ? fact.value as Record<string, unknown>
      : {};

    return {
      ...fact,
      value: { ...currentValue, ...override },
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/fact-display-overrides-merge.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/page-projection.ts tests/evals/fact-display-overrides-merge.test.ts
git commit -m "feat: add applyFactDisplayOverrides for pre-composition fact value overlay"
```

---

### Task 5: Integrate into projectCanonicalConfig

**Files:**
- Modify: `src/lib/services/page-projection.ts:41-72`

- [ ] **Step 1: Write integration test**

Add to `tests/evals/fact-display-overrides-merge.test.ts`:

```typescript
describe("projectCanonicalConfig with overrides", () => {
  it("composes page with curated fact values", () => {
    // This test requires a real DB with facts + overrides
    // Test that a project fact with title "openself" + override { title: "OpenSelf" }
    // produces a projects section with item title "OpenSelf"
    // (integration test — may need test DB setup)
  });
});
```

- [ ] **Step 2: Modify projectCanonicalConfig to apply overrides**

In `src/lib/services/page-projection.ts`, modify `projectCanonicalConfig()`:

Add at the top of `page-projection.ts`:
```typescript
import { getFactDisplayOverrideService, computeFactValueHash } from "@/lib/services/fact-display-override-service";
```

Then in `projectCanonicalConfig()`, after line 49 (`filterPublishableFacts`):

```typescript
// After line 49 (filterPublishableFacts):
const publishable = filterPublishableFacts(facts);

// NEW: Apply fact display overrides pre-composition
let displayFacts = publishable;
if (profileId) {
  const overrideService = getFactDisplayOverrideService();
  const factHashes = publishable.map((f) => ({
    id: f.id,
    valueHash: computeFactValueHash(f.value),
  }));
  const validOverrides = overrideService.getValidOverrides(profileId, factHashes);
  displayFacts = applyFactDisplayOverrides(publishable, validOverrides);
}

// Then pass displayFacts to composeOptimisticPage instead of publishable:
// (line ~65-72)
const composed = composeOptimisticPage(
  displayFacts, // was: publishable
  username,
  language,
  layoutTemplate,
  draftSlots,
  profileId,
);
```

Note: `profileId` parameter is already the 5th param of `projectCanonicalConfig()` — maps to `ownerKey`.

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run tests/evals/page-service-integration.test.ts tests/evals/page-validation.test.ts`
Expected: All PASS (no overrides = no change in behavior)

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/page-projection.ts
git commit -m "feat: integrate fact display overrides into projectCanonicalConfig pre-composition pipeline"
```

---

### Task 6a: Widen UpsertStateInput.source to include "agent"

**Files:**
- Modify: `src/lib/services/section-copy-state-service.ts:17-25`

- [ ] **Step 1: Update the source type union**

Change `UpsertStateInput.source` from `"live" | "proposal"` to `"live" | "proposal" | "agent"`:

```typescript
export type UpsertStateInput = {
  ownerKey: string;
  sectionType: string;
  language: string;
  personalizedContent: string;
  factsHash: string;
  soulHash: string;
  source: "live" | "proposal" | "agent"; // was: "live" | "proposal"
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/section-copy-state-service.ts
git commit -m "feat: widen UpsertStateInput.source to include 'agent' for direct content curation"
```

---

### Task 6b: Source priority — skip LLM personalization for agent-curated sections

**Files:**
- Modify: `src/lib/services/section-personalizer.ts`

- [ ] **Step 1: Add source check to personalizeSection**

In `section-personalizer.ts`, at the beginning of `personalizeSection()`, after the personalizable check:

```typescript
// Skip if section already has agent-curated content (don't overwrite explicit edits)
import { getActiveCopy } from "@/lib/services/section-copy-state-service";
// ... in personalizeSection(), after the personalizable check:
const existingState = getActiveCopy(input.ownerKey, input.section.type, input.language);
if (existingState?.source === "agent") {
  return null; // Agent curations are highest priority — never overwrite
}
```

- [ ] **Step 2: Write test for source priority**

Add test in `tests/evals/section-personalizer.test.ts` or new file:

```typescript
it("skips personalization when section has agent-curated content", async () => {
  // Setup: write section_copy_state with source="agent"
  // Call personalizeSection()
  // Assert: returns null, no LLM call made
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/section-personalizer.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/section-personalizer.ts tests/evals/section-personalizer.test.ts
git commit -m "feat: skip LLM personalization for agent-curated sections (source priority)"
```

---

## Chunk 3: Agent Tool

### Task 7: curate_content tool — implementation

**Files:**
- Modify: `src/lib/agent/tools.ts` (add after `inspect_page_state` tool, ~line 1952+)
- Create: `tests/evals/curate-content-tool.test.ts`

- [ ] **Step 1: Write failing tests for the tool**

```typescript
// tests/evals/curate-content-tool.test.ts
import { describe, it, expect } from "vitest";
import {
  filterEditableFields,
  ITEM_EDITABLE_FIELDS,
} from "@/lib/services/fact-display-override-service";

describe("curate_content validation", () => {
  it("filters to only editable fields for project category", () => {
    const input = { title: "OpenSelf", url: "https://evil.com", description: "desc" };
    const filtered = filterEditableFields("project", input);
    expect(filtered).toEqual({ title: "OpenSelf", description: "desc" });
    expect(filtered).not.toHaveProperty("url");
  });

  it("returns empty object for unknown category", () => {
    const input = { title: "test" };
    const filtered = filterEditableFields("unknown_category", input);
    expect(filtered).toEqual({});
  });

  it("allows identity field edits", () => {
    const input = { name: "John Doe", role: "Engineer", tagline: "Building stuff" };
    const filtered = filterEditableFields("identity", input);
    expect(Object.keys(filtered)).toHaveLength(3);
  });

  it("blocks date fields in experience", () => {
    const input = { role: "Dev", startDate: "2024-01", endDate: "2025-01" };
    const filtered = filterEditableFields("experience", input);
    expect(filtered).toEqual({ role: "Dev" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/curate-content-tool.test.ts`
Expected: FAIL or PASS (filterEditableFields already implemented in Task 3)

- [ ] **Step 3: Add curate_content tool to tools.ts**

**Note on imports:** All imports used inside the tool must be top-level `import` statements at the top of `tools.ts` (lines 1-56), NOT `require()`. The codebase uses ESM — `require()` with `@/` aliases may not resolve. Add these imports at the top of tools.ts:

```typescript
import { getFactDisplayOverrideService, computeFactValueHash, filterEditableFields, ITEM_EDITABLE_FIELDS } from "@/lib/services/fact-display-override-service";
import { PERSONALIZABLE_FIELDS } from "@/lib/services/personalizer-schemas";
import { upsertState as upsertCopyState, getActiveCopy } from "@/lib/services/section-copy-state-service";
```

Then add the tool after the last tool in the tools object (~line 1952+):

```typescript
curate_content: tool({
  description:
    "Curate the display text of page content without modifying facts. " +
    "Use for capitalization fixes, wording improvements, tone adjustments, and professional polish. " +
    "If factId is provided, curates a specific item (e.g., project title). " +
    "If factId is omitted, curates the section-level description (e.g., bio text). " +
    "The underlying facts remain unchanged — this only affects presentation.",
  parameters: z.object({
    sectionType: z
      .string()
      .describe("Section type to curate (e.g., 'projects', 'bio', 'experience')"),
    factId: z
      .string()
      .optional()
      .describe(
        "Fact UUID for item-level curation (e.g., a specific project). " +
        "Omit for section-level curation (e.g., bio description).",
      ),
    fields: z
      .record(z.string())
      .describe(
        "Fields to override. Only text fields allowed (no dates, URLs, or structural data). " +
        "Example: { title: 'OpenSelf', description: 'AI-powered page builder' }",
      ),
  }),
  execute: async ({ sectionType, factId, fields }) => {
    if (factId) {
      // --- ITEM-LEVEL: route to fact_display_overrides ---
      // All imports are top-level (see note above)

      // Find the fact
      const allFacts = getActiveFacts(sessionId, readKeys);
      const fact = allFacts.find((f: { id: string }) => f.id === factId);
      if (!fact) {
        return { success: false, error: `Fact ${factId} not found` };
      }

      // Filter to editable fields only
      const editableFields = filterEditableFields(fact.category, fields);
      if (Object.keys(editableFields).length === 0) {
        return {
          success: false,
          error: `No editable fields for category '${fact.category}'. Editable: ${ITEM_EDITABLE_FIELDS[fact.category]?.join(", ") ?? "none"}`,
        };
      }

      const service = getFactDisplayOverrideService();
      service.upsertOverride({
        ownerKey: effectiveOwnerKey ?? sessionId,
        factId,
        displayFields: editableFields,
        factValueHash: computeFactValueHash(fact.value),
        source: "agent",
      });

      // Trigger recomposition so preview updates
      recomposeAfterMutation();

      operationJournal.push({
        tool: "curate_content",
        action: "item_override",
        factId,
        fields: editableFields,
      });

      return {
        success: true,
        level: "item",
        factId,
        category: fact.category,
        appliedFields: editableFields,
      };
    } else {
      // --- SECTION-LEVEL: route to section_copy_state ---
      // PERSONALIZABLE_FIELDS imported at top level
      const allowed = PERSONALIZABLE_FIELDS[sectionType];
      if (!allowed) {
        return { success: false, error: `Section '${sectionType}' does not support curation` };
      }

      // Filter to allowed fields
      const filteredFields: Record<string, string> = {};
      for (const key of Object.keys(fields)) {
        if (allowed.includes(key)) filteredFields[key] = fields[key];
      }
      if (Object.keys(filteredFields).length === 0) {
        return {
          success: false,
          error: `No editable fields for section '${sectionType}'. Allowed: ${allowed.join(", ")}`,
        };
      }

      // Compute hashes for section-level
      // computeSectionFactsHash, computeHash, getActiveFacts, upsertCopyState, getActiveSoul
      // all imported at top level of tools.ts

      const allFacts = getActiveFacts(sessionId, readKeys);
      const factsHash = computeSectionFactsHash(allFacts, sectionType);
      const soul = getActiveSoul(effectiveOwnerKey ?? sessionId);
      const soulHash = computeHash(soul?.compiled ?? "");

      upsertCopyState({
        ownerKey: effectiveOwnerKey ?? sessionId,
        sectionType,
        language: sessionLanguage,
        personalizedContent: JSON.stringify(filteredFields),
        factsHash,
        soulHash,
        source: "agent",
      });

      // Trigger recomposition
      recomposeAfterMutation();

      operationJournal.push({
        tool: "curate_content",
        action: "section_override",
        sectionType,
        fields: filteredFields,
      });

      return {
        success: true,
        level: "section",
        sectionType,
        appliedFields: filteredFields,
      };
    }
  },
}),
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/curate-content-tool.test.ts
git commit -m "feat: add curate_content agent tool with dual routing (item-level + section-level)"
```

---

### Task 8: System prompt — TOOL_POLICY and grounding rules

**Files:**
- Modify: `src/lib/agent/prompts.ts:110-127`

- [ ] **Step 1: Add curate_content instructions to TOOL_POLICY**

In `prompts.ts`, add to the TOOL_POLICY section (after the existing tool descriptions):

```typescript
// Add to TOOL_POLICY string:
`
## CONTENT CURATION (curate_content)
- Use curate_content to improve how facts appear on the page WITHOUT changing facts.
- Provide factId for item-level edits (project title, experience description, skill name).
- Omit factId for section-level edits (bio description, hero tagline).
- GROUNDING RULES:
  - Only improve presentation: capitalization, wording, tone, professional polish.
  - NEVER change factual content (don't rename companies, change roles, alter dates).
  - NEVER invent information not present in the underlying facts.
  - When uncertain, use search_facts first to read the original data.
  - The curated text must be recognizably derived from the original fact.
- Use curate_content AFTER creating facts to polish the page presentation.
- Example: user says "openself" → fact stores "openself" → curate_content({ factId, fields: { title: "OpenSelf" } }).
`
```

- [ ] **Step 2: Update EXPECTED_HANDLER_COUNT if tools.ts tool count changed**

Check `src/worker.ts:16` for `EXPECTED_HANDLER_COUNT` — increment by 1 if applicable. Also check `src/lib/db/migrate.ts:9` for `EXPECTED_SCHEMA_VERSION`.

- [ ] **Step 3: Run tests to check prompt assembly**

Run: `npx vitest run tests/evals/prompt-assembly.test.ts` (or equivalent)
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/prompts.ts src/lib/agent/context.ts
git commit -m "feat: add curate_content grounding rules to TOOL_POLICY"
```

---

## Chunk 4: Worker Page Curator

### Task 9: Page curation service — LLM analysis

**Files:**
- Create: `src/lib/services/page-curation-service.ts`
- Create: `tests/evals/page-curation-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/evals/page-curation-service.test.ts
import { describe, it, expect } from "vitest";
import { buildCurationPrompt, parseCurationResponse } from "@/lib/services/page-curation-service";

describe("page-curation-service", () => {
  describe("buildCurationPrompt", () => {
    it("builds a prompt for a single section with facts and soul", () => {
      const prompt = buildCurationPrompt({
        sectionType: "bio",
        currentContent: { text: "i am a developer at acme" },
        relevantFacts: [
          { id: "f1", category: "identity", key: "role", value: { role: "Software Developer" } },
          { id: "f2", category: "identity", key: "company", value: { company: "Acme Corp" } },
        ],
        soulCompiled: "Professional, confident tone. First person.",
        existingOverrides: [],
      });
      expect(prompt).toContain("bio");
      expect(prompt).toContain("Software Developer");
      expect(prompt).toContain("Acme Corp");
      expect(prompt).toContain("Professional, confident tone");
    });
  });

  describe("parseCurationResponse", () => {
    it("parses section-level suggestion", () => {
      const response = {
        suggestions: [
          {
            type: "section",
            sectionType: "bio",
            fields: { description: "I'm a software developer crafting solutions at Acme Corp." },
            reason: "More professional wording",
          },
        ],
      };
      const parsed = parseCurationResponse(response);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe("section");
    });

    it("parses item-level suggestion", () => {
      const response = {
        suggestions: [
          {
            type: "item",
            sectionType: "projects",
            factId: "f1",
            fields: { title: "OpenSelf" },
            reason: "Correct capitalization",
          },
        ],
      };
      const parsed = parseCurationResponse(response);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe("item");
      expect(parsed[0].factId).toBe("f1");
    });

    it("skips suggestions for agent-curated items", () => {
      const response = {
        suggestions: [
          {
            type: "item",
            sectionType: "projects",
            factId: "f1",
            fields: { title: "Better Title" },
            reason: "Improvement",
          },
        ],
      };
      const agentCuratedFactIds = new Set(["f1"]);
      const parsed = parseCurationResponse(response, agentCuratedFactIds);
      expect(parsed).toHaveLength(0); // skipped because agent already curated
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/page-curation-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement page curation service**

```typescript
// src/lib/services/page-curation-service.ts
import { generateObject } from "ai";
import { z } from "zod";
import { getModelForTier } from "@/lib/ai/provider";

export type CurationPromptInput = {
  sectionType: string;
  currentContent: Record<string, unknown>;
  relevantFacts: Array<{ id: string; category: string; key: string; value: unknown }>;
  soulCompiled: string;
  existingOverrides: Array<{ factId: string; source: string }>;
};

export type CurationSuggestion = {
  type: "section" | "item";
  sectionType: string;
  factId?: string;
  fields: Record<string, string>;
  reason: string;
};

const curationResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      type: z.enum(["section", "item"]),
      sectionType: z.string(),
      factId: z.string().optional(),
      fields: z.record(z.string()),
      reason: z.string(),
    }),
  ),
});

export function buildCurationPrompt(input: CurationPromptInput): string {
  const factsBlock = input.relevantFacts
    .map((f) => `- [${f.category}/${f.key}] (id: ${f.id}): ${JSON.stringify(f.value)}`)
    .join("\n");

  const overridesNote =
    input.existingOverrides.length > 0
      ? `\n\nAlready curated (DO NOT suggest changes for these):\n${input.existingOverrides.filter((o) => o.source === "agent").map((o) => `- fact ${o.factId} (agent-curated)`).join("\n")}`
      : "";

  return `You are a professional copywriter reviewing a "${input.sectionType}" section of a personal page.

## Voice & Tone
${input.soulCompiled}

## Current Content
${JSON.stringify(input.currentContent, null, 2)}

## Source Facts
${factsBlock}
${overridesNote}

## Instructions
Review the section content and suggest improvements:
- Fix capitalization, grammar, and formatting
- Improve wording for professionalism and clarity
- Ensure tone matches the voice guidelines
- Stay GROUNDED in facts — never invent information
- For item-level improvements, include the factId
- For section-level improvements (description, tagline), use type "section"
- Only suggest changes where improvement is meaningful — skip if content is already good
- Maximum 5 suggestions per section`;
}

export function parseCurationResponse(
  response: z.infer<typeof curationResponseSchema>,
  agentCuratedFactIds?: Set<string>,
): CurationSuggestion[] {
  return response.suggestions.filter((s) => {
    // Skip items already curated by agent
    if (s.type === "item" && s.factId && agentCuratedFactIds?.has(s.factId)) {
      return false;
    }
    // Validate fields exist
    return Object.keys(s.fields).length > 0;
  });
}

export async function analyzeSectionForCuration(
  input: CurationPromptInput,
  agentCuratedFactIds: Set<string>,
): Promise<CurationSuggestion[]> {
  const model = getModelForTier("standard");
  const prompt = buildCurationPrompt(input);

  try {
    const { object } = await generateObject({
      model,
      schema: curationResponseSchema,
      prompt,
    });
    return parseCurationResponse(object, agentCuratedFactIds);
  } catch (error) {
    // Log but don't throw — curation is best-effort
    console.error("[page-curation] LLM analysis failed:", error);
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/page-curation-service.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/page-curation-service.ts tests/evals/page-curation-service.test.ts
git commit -m "feat: add page-curation-service for LLM-based content improvement analysis"
```

---

### Task 10: Worker handler — curate_page

**Files:**
- Create: `src/lib/worker/handlers/curate-page.ts`

- [ ] **Step 1: Implement curate_page handler**

```typescript
// src/lib/worker/handlers/curate-page.ts
import { getActiveFacts } from "@/lib/services/kb-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getFactDisplayOverrideService, computeFactValueHash } from "@/lib/services/fact-display-override-service";
import { getActiveCopy } from "@/lib/services/section-copy-state-service";
import { createProposal } from "@/lib/services/proposal-service";
import { analyzeSectionForCuration, type CurationSuggestion } from "@/lib/services/page-curation-service";
import { SECTION_FACT_CATEGORIES, computeSectionFactsHash, computeHash } from "@/lib/services/personalization-hashing";
import { filterPublishableFacts, projectCanonicalConfig } from "@/lib/services/page-projection";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { logEvent } from "@/lib/services/event-service";

export async function handlePageCuration(payload: Record<string, unknown>): Promise<void> {
  const { ownerKey } = payload as { ownerKey: string };
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const allFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
  const publishable = filterPublishableFacts(allFacts);

  if (publishable.length === 0) return;

  const soul = getActiveSoul(scope.cognitiveOwnerKey);
  if (!soul?.compiled) return; // No soul = no tone guidance

  // Find which facts already have agent-curated overrides (don't touch these)
  const overrideService = getFactDisplayOverrideService();
  const existingOverrides = overrideService.getOverridesForOwner(scope.cognitiveOwnerKey);
  const agentCuratedFactIds = new Set(
    existingOverrides.filter((o) => o.source === "agent").map((o) => o.factId),
  );

  // Section copy state + proposal singletons imported at top of file

  // Compose current page for context
  const page = projectCanonicalConfig(allFacts, "draft", "en", undefined, scope.cognitiveOwnerKey);

  let totalProposals = 0;
  const MAX_PROPOSALS_PER_RUN = 10;

  // Analyze each personalizable section
  for (const [sectionType, categories] of Object.entries(SECTION_FACT_CATEGORIES)) {
    if (totalProposals >= MAX_PROPOSALS_PER_RUN) break;

    // Skip if section has agent-curated copy
    const existingState = getActiveCopy(scope.cognitiveOwnerKey, sectionType, "en");
    if (existingState?.source === "agent") continue;

    const sectionFacts = publishable.filter((f) => categories.includes(f.category));
    if (sectionFacts.length === 0) continue;

    const section = page.sections?.find((s) => s.type === sectionType);
    if (!section) continue;

    const suggestions = await analyzeSectionForCuration(
      {
        sectionType,
        currentContent: section.content as Record<string, unknown>,
        relevantFacts: sectionFacts,
        soulCompiled: soul.compiled,
        existingOverrides: existingOverrides.map((o) => ({ factId: o.factId, source: o.source })),
      },
      agentCuratedFactIds,
    );

    for (const suggestion of suggestions) {
      if (totalProposals >= MAX_PROPOSALS_PER_RUN) break;

      if (suggestion.type === "item" && suggestion.factId) {
        // Item-level: create proposal with factId context in reason
        const fact = publishable.find((f) => f.id === suggestion.factId);
        if (!fact) continue;

        const factsHash = computeSectionFactsHash(publishable, sectionType);
        const soulHash = computeHash(soul.compiled);
        const baselineHash = computeHash(existingState?.personalizedContent ?? "");

        createProposal({
          ownerKey: scope.cognitiveOwnerKey,
          sectionType,
          language: "en",
          currentContent: JSON.stringify(fact.value),
          proposedContent: JSON.stringify(suggestion.fields),
          issueType: "curation",
          reason: `[item:${suggestion.factId}] ${suggestion.reason}`,
          severity: "low",
          factsHash,
          soulHash,
          baselineStateHash: baselineHash,
        });
        totalProposals++;
      } else {
        // Section-level: create proposal via existing flow
        const factsHash = computeSectionFactsHash(publishable, sectionType);
        const soulHash = computeHash(soul.compiled);
        const baselineHash = computeHash(existingState?.personalizedContent ?? "");

        createProposal({
          ownerKey: scope.cognitiveOwnerKey,
          sectionType,
          language: "en",
          currentContent: JSON.stringify(section.content),
          proposedContent: JSON.stringify(suggestion.fields),
          issueType: "curation",
          reason: suggestion.reason,
          severity: "low",
          factsHash,
          soulHash,
          baselineStateHash: baselineHash,
        });
        totalProposals++;
      }
    }
  }

  logEvent({
    eventType: "curate_page",
    actor: "worker",
    payload: { ownerKey: scope.cognitiveOwnerKey, proposalsCreated: totalProposals },
  });
}
```

- [ ] **Step 2: Register handler in worker index**

In `src/lib/worker/index.ts`, add to the `handlers` record map (~line 169, near `consolidate_episodes`):

```typescript
import { handlePageCuration } from "@/lib/worker/handlers/curate-page";

// In the handlers object:
curate_page: handlePageCuration,
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/worker/handlers/curate-page.ts src/lib/worker/index.ts
git commit -m "feat: add curate_page worker handler for weekly content improvement proposals"
```

---

### Task 11: Integrate curate_page into deep heartbeat

**Files:**
- Modify: `src/lib/worker/heartbeat.ts:157-279`

- [ ] **Step 1: Add curate_page as third substep of deep heartbeat**

After the coherence check (line ~271) in `handleHeartbeatDeep()`:

```typescript
// --- Substep 3: Page curation (weekly, after conformity + coherence) ---
let curationCompleted = false;
// import { handlePageCuration } from "@/lib/worker/handlers/curate-page" — add at TOP of heartbeat.ts
try {
  await handlePageCuration({ ownerKey });
  curationCompleted = true;
} catch (error) {
  logEvent({
    eventType: "curate_page_error",
    actor: "worker",
    payload: { ownerKey, error: String(error) },
  });
  // Non-fatal: curation failure doesn't block heartbeat recording
  curationCompleted = true; // Don't block heartbeat completion
}
```

Update the recording condition:
```typescript
// Was: if (conformityCompleted && coherenceCompleted)
if (conformityCompleted && coherenceCompleted) {
  // curationCompleted is best-effort, doesn't gate recording
  recordHeartbeatRun(ownerKey, "deep", outcome, 0, ownerDay, startMs);
}
```

- [ ] **Step 2: Run existing heartbeat tests**

Run: `npx vitest run tests/evals/heartbeat.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/worker/heartbeat.ts
git commit -m "feat: integrate curate_page into deep heartbeat as non-blocking substep"
```

---

## Chunk 5: Cleanup, Integration & Proposal Acceptance

### Task 12: Orphan cleanup in global housekeeping

**Files:**
- Modify: `src/lib/worker/heartbeat.ts:38-64`

- [ ] **Step 1: Add orphan cleanup to runGlobalHousekeeping**

In `runGlobalHousekeeping()`, add. **Note:** Add `import { factDisplayOverrides } from "@/lib/db/schema"` at the top of heartbeat.ts.

```typescript
// Clean up orphaned fact display overrides (facts that were deleted)
try {
  const overrideService = getFactDisplayOverrideService(); // import at top of file
  // db and factDisplayOverrides already imported at top of heartbeat.ts

  // Get all unique owner keys from overrides
  const allOverrides = db.select({ ownerKey: factDisplayOverrides.ownerKey })
    .from(factDisplayOverrides)
    .groupBy(factDisplayOverrides.ownerKey)
    .all();

  for (const { ownerKey } of allOverrides) {
    const scope = resolveOwnerScopeForWorker(ownerKey);
    const activeFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);
    const activeFactIds = activeFacts.map((f: { id: string }) => f.id);
    overrideService.cleanupOrphans(ownerKey, activeFactIds);
  }
} catch (error) {
  // Non-fatal — orphans will be cleaned next cycle
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/worker/heartbeat.ts
git commit -m "feat: add orphan cleanup for fact display overrides in global housekeeping"
```

---

### Task 13: Proposal acceptance for item-level curations

**Files:**
- Modify: `src/lib/services/proposal-service.ts:141-233`

- [ ] **Step 1: Extend acceptProposal to handle curation proposals**

When a curation proposal with `issueType === "curation"` and reason starting with `[item:factId]` is accepted, write to `fact_display_overrides` instead of `section_copy_state`:

```typescript
// In acceptProposal(), after the existing guard checks:
if (proposal.issueType === "curation" && proposal.reason.startsWith("[item:")) {
  // Extract factId from reason: "[item:uuid] reason text"
  const factIdMatch = proposal.reason.match(/^\[item:([^\]]+)\]/);
  if (factIdMatch) {
    const factId = factIdMatch[1];
    const { getFactDisplayOverrideService, computeFactValueHash } =
      require("@/lib/services/fact-display-override-service");
    const { getActiveFacts } = require("@/lib/services/kb-service");

    const facts = getActiveFacts(proposal.ownerKey);
    const fact = facts.find((f: { id: string }) => f.id === factId);
    if (!fact) {
      return { error: "FACT_NOT_FOUND", message: "Source fact no longer exists" };
    }

    const overrideService = getFactDisplayOverrideService();
    overrideService.upsertOverride({
      ownerKey: proposal.ownerKey,
      factId,
      displayFields: JSON.parse(proposal.proposedContent),
      factValueHash: computeFactValueHash(fact.value),
      source: "worker",
    });

    // Mark proposal as accepted
    db.update(sectionCopyProposals)
      .set({ status: "accepted", reviewedAt: new Date().toISOString() })
      .where(eq(sectionCopyProposals.id, id))
      .run();

    return { ok: true };
  }
}

// ... existing section-level acceptance flow continues below
```

- [ ] **Step 2: Write test for item-level proposal acceptance**

```typescript
it("accepts curation proposal and writes to fact_display_overrides", () => {
  // Create a curation proposal with [item:factId] reason
  // Accept it
  // Verify fact_display_overrides has the override
  // Verify section_copy_state is NOT modified
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/proposal-service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/proposal-service.ts tests/evals/proposal-service.test.ts
git commit -m "feat: extend proposal acceptance to route curation proposals to fact_display_overrides"
```

---

### Task 14: Integration test — full curation flow

**Files:**
- Create: `tests/evals/content-curation-integration.test.ts`

- [ ] **Step 1: Write end-to-end integration test**

```typescript
// tests/evals/content-curation-integration.test.ts
import { describe, it, expect, beforeEach } from "vitest";

describe("content curation integration", () => {
  it("item-level: fact override appears in composed page", () => {
    // 1. Create a project fact with value { title: "openself", description: "my project" }
    // 2. Create a fact_display_override with { title: "OpenSelf" }
    // 3. Call projectCanonicalConfig()
    // 4. Verify projects section has item with title "OpenSelf"
    // 5. Verify fact in DB still has title "openself" (immutable)
  });

  it("item-level: stale override falls back to raw fact", () => {
    // 1. Create fact + override
    // 2. Delete fact, create new fact with different value
    // 3. Call projectCanonicalConfig()
    // 4. Verify override is NOT applied (hash mismatch)
  });

  it("section-level: agent-curated bio appears in page", () => {
    // 1. Create identity facts
    // 2. Write section_copy_state for bio with source="agent"
    // 3. Compose page + mergeActiveSectionCopy
    // 4. Verify bio has curated text
  });

  it("LLM personalizer skips agent-curated sections", () => {
    // 1. Write section_copy_state for bio with source="agent"
    // 2. Call personalizeSection() for bio
    // 3. Verify it returns null (skipped)
  });

  it("adding a fact does not invalidate other items' curations", () => {
    // 1. Create 2 project facts, curate both with display overrides
    // 2. Create a 3rd project fact (no curation)
    // 3. Call projectCanonicalConfig()
    // 4. Verify first 2 projects still have curated titles
    // 5. Verify 3rd project has raw title
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/evals/content-curation-integration.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/evals/content-curation-integration.test.ts
git commit -m "test: add content curation integration tests (item-level, section-level, staleness, isolation)"
```

---

### Task 15: ADR-0017 — Content Curation Layer

**Files:**
- Create: `docs/decisions/ADR-0017-content-curation-layer.md`

- [ ] **Step 1: Write ADR**

```markdown
# ADR-0017: Content Curation Layer

## Status
Accepted — 2026-03-12

## Context
Users want polished, professional pages without being precise in chat. The agent extracts
facts from conversation (e.g., "openself" for a project name), but the page shows the raw
text. There was no way to curate presentation (fix capitalization, improve wording) without
modifying the immutable facts.

## Decision
Two-layer curation architecture:

**Layer 1 — Fact Display Overrides (pre-composition):**
- New `fact_display_overrides` table stores per-fact presentation adjustments.
- Applied in memory before the page composer runs — composer stays unchanged.
- Per-fact hash guard: if the underlying fact changes, the override is invalidated.
- Adding a new fact does NOT invalidate other facts' overrides (per-item isolation).

**Layer 2 — Section Copy State (post-composition, existing):**
- Section-level text overrides (bio description, hero tagline) continue unchanged.
- Extended with source="agent" for direct agent writes (highest priority).
- LLM personalizer skips sections with source="agent".

**Unified agent tool:** `curate_content` routes to the appropriate layer based on
whether `factId` is provided.

**Worker "page curator":** Weekly job in deep heartbeat analyzes sections and creates
proposals via existing proposal system. Never overwrites agent-curated content.

## Consequences
- Facts remain immutable — presentation is a separate concern.
- Page composer is untouched — zero risk to existing composition logic.
- Per-item hash guards prevent cascading invalidation.
- Existing proposal UI (ProposalBanner) works for worker suggestions.
- Migration 0032 adds one table + updates job_type CHECK.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/ADR-0017-content-curation-layer.md
git commit -m "docs: add ADR-0017 Content Curation Layer"
```

---

### Task 16: Update EXPECTED_SCHEMA_VERSION and handler counts

**Files:**
- Modify: `src/lib/db/migrate.ts:9` — EXPECTED_SCHEMA_VERSION from 31→32
- Modify: `src/worker.ts:16` — EXPECTED_HANDLER_COUNT from 11→12 (if applicable)

- [ ] **Step 1: Update constants**

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass, no regressions

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/migrate.ts src/worker.ts
git commit -m "chore: update EXPECTED_SCHEMA_VERSION and EXPECTED_HANDLER_COUNT for content curation"
```

---

## Final Verification

- [ ] **Run full test suite**: `npx vitest run` — all tests pass
- [ ] **TypeScript check**: `npx tsc --noEmit` — zero errors
- [ ] **Run migration on test DB**: verify 0032 applies cleanly
- [ ] **Manual smoke test**: create fact → curate_content → verify page shows curated value
