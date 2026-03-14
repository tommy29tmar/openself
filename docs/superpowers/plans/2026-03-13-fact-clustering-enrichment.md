# Fact Enrichment Layer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate fact duplication across sources by clustering related facts and projecting an enriched view at read time.

**Architecture:** Two-phase hybrid. Phase 1 (sync): deterministic identity matchers assign `cluster_id` at write time for obvious matches. Phase 2 (async): LLM-based worker job clusters near-duplicates the deterministic layer missed. Read path projects each cluster into a single virtual fact using source-priority resolution. Facts are never physically mutated.

**Tech Stack:** TypeScript, SQLite (Drizzle ORM), Vitest, Vercel AI SDK (fast tier for async LLM)

**Design doc:** `docs/plans/2026-03-13-fact-enrichment-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/services/fact-cluster-service.ts` | Cluster CRUD, identity matchers, slug normalization, `tryAssignCluster()`, `projectClusteredFacts()` |
| `src/lib/worker/handlers/consolidate-facts.ts` | Async LLM-based clustering worker handler |
| `db/migrations/0035_fact_clusters.sql` | Migration: `fact_clusters` table + `cluster_id` column on facts |
| `tests/evals/fact-cluster-service.test.ts` | Unit tests for clustering + projection |
| `tests/evals/fact-cluster-projection.test.ts` | Integration tests for projected facts in composer/context |
| `tests/evals/consolidate-facts-handler.test.ts` | Worker handler tests |

### Modified files

| File | What changes |
|------|-------------|
| `src/lib/db/schema.ts` | Add `factClusters` table + `clusterId` column on `facts` |
| `src/lib/services/kb-service.ts` | Call `tryAssignCluster()` post-insert in `createFact()` |
| `src/lib/connectors/connector-fact-writer.ts` | Pre-load category facts for batch clustering, report `factsClustered` |
| `src/lib/services/page-projection.ts` | Integrate `projectClusteredFacts()` before composition |
| `src/lib/agent/context.ts` | Use projected facts in facts block |
| `src/lib/agent/tools.ts` | Return cluster metadata in `create_fact` / `batch_facts` responses |
| `src/lib/worker/heartbeat.ts` | Add `consolidate_facts` call in `handleHeartbeatDeep()` |
| `src/lib/connectors/connector-sync-handler.ts` | Enqueue `consolidate_facts` after successful sync |
| `src/lib/worker/index.ts` | Register `consolidate_facts` handler |
| `src/lib/connectors/connector-purge.ts` | Clean up empty clusters after purge |

---

## Chunk 1: Data Model + Core Service

### Task 1: Migration — `fact_clusters` table + `cluster_id` column

**Files:**
- Create: `db/migrations/0035_fact_clusters.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0035_fact_clusters.sql
-- Fact clustering: groups related facts from different sources

---------------------------------------------------------------------
-- Part 1 — fact_clusters table
---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_clusters (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  category TEXT NOT NULL,
  canonical_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fact_clusters_owner
  ON fact_clusters(owner_key);

CREATE INDEX IF NOT EXISTS idx_fact_clusters_owner_category
  ON fact_clusters(owner_key, category);

-- Add cluster_id column to facts table (ON DELETE SET NULL for self-healing FK)
ALTER TABLE facts ADD COLUMN cluster_id TEXT REFERENCES fact_clusters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facts_cluster_id
  ON facts(cluster_id) WHERE cluster_id IS NOT NULL;

---------------------------------------------------------------------
-- Part 2 — Rebuild jobs table with consolidate_facts in CHECK
---------------------------------------------------------------------
-- SQLite cannot ALTER CHECK constraints; full table rebuild required.
-- Same pattern as migration 0033.

CREATE TABLE jobs_v2 (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','consolidate_episodes','curate_page','consolidate_facts','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at TEXT
);

INSERT INTO jobs_v2 SELECT * FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs_v2 RENAME TO jobs;

-- Recreate ALL indexes from migration 0033 (critical for job dedup)
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

CREATE UNIQUE INDEX uniq_jobs_dedup_global
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status IN ('queued','running')
    AND job_type != 'session_compaction'
    AND job_type != 'consolidate_episodes';

CREATE UNIQUE INDEX uniq_jobs_dedup_compaction
  ON jobs(job_type, json_extract(payload, '$.ownerKey'), json_extract(payload, '$.sessionKey'))
  WHERE status = 'queued' AND job_type = 'session_compaction';

CREATE UNIQUE INDEX uniq_jobs_dedup_consolidate
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status = 'queued' AND job_type = 'consolidate_episodes';
```

- [ ] **Step 2: Add Drizzle schema definitions**

In `src/lib/db/schema.ts`, add after the `facts` table definition (~line 93):

```typescript
// -- Fact Clusters (groups related facts from different sources)
export const factClusters = sqliteTable(
  "fact_clusters",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    category: text("category").notNull(),
    canonicalKey: text("canonical_key"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_fact_clusters_owner").on(table.ownerKey),
    index("idx_fact_clusters_owner_category").on(table.ownerKey, table.category),
  ],
);
```

Add `clusterId` column to the existing `facts` table definition:

```typescript
// Inside facts table, after archivedAt:
clusterId: text("cluster_id").references(() => factClusters.id),
```

Update the `FactRow` type in `src/lib/services/kb-service.ts` (~line 65-78) to include `clusterId`:

```typescript
// Add after archivedAt in FactRow type:
clusterId: string | null;
```

- [ ] **Step 3: Run migration and verify**

Run: `npm run db:migrate` (or equivalent)
Expected: Migration applies cleanly, no errors.

- [ ] **Step 4: Update EXPECTED_SCHEMA_VERSION**

Find and update `EXPECTED_SCHEMA_VERSION` constant (grep for it — likely in `src/lib/db/` or `src/lib/agent/context.ts`):

```typescript
export const EXPECTED_SCHEMA_VERSION = 35; // was 34
```

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0035_fact_clusters.sql src/lib/db/schema.ts
git commit -m "feat: add fact_clusters table and cluster_id column (migration 0035)"
```

---

### Task 2: Core cluster service — identity matchers + slug normalization

**Files:**
- Create: `src/lib/services/fact-cluster-service.ts`
- Test: `tests/evals/fact-cluster-service.test.ts`

- [ ] **Step 1: Write failing tests for slug normalization**

```typescript
// tests/evals/fact-cluster-service.test.ts
import { describe, it, expect } from "vitest";

describe("slugifyForMatch", () => {
  it("normalizes accented characters", () => {
    expect(slugifyForMatch("Politécnico de Milano")).toBe("politecnico-de-milano");
  });

  it("normalizes case and whitespace", () => {
    expect(slugifyForMatch("  Senior Software  Engineer  ")).toBe("senior-software-engineer");
  });

  it("strips special characters", () => {
    expect(slugifyForMatch("C++ & C#")).toBe("c-c");
  });

  it("returns empty string for nullish input", () => {
    expect(slugifyForMatch(undefined)).toBe("");
    expect(slugifyForMatch(null)).toBe("");
    expect(slugifyForMatch("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-cluster-service.test.ts`
Expected: FAIL — `slugifyForMatch` not found

- [ ] **Step 3: Implement slug normalization**

```typescript
// src/lib/services/fact-cluster-service.ts

/**
 * Normalize a string for identity matching: lowercase, remove accents,
 * strip special chars, collapse whitespace → hyphens.
 */
export function slugifyForMatch(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")      // remove special chars
    .replace(/\s+/g, "-")              // whitespace → hyphens
    .replace(/-+/g, "-")              // collapse hyphens
    .replace(/^-|-$/g, "");           // trim hyphens
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/fact-cluster-service.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for identity matchers**

```typescript
describe("identityMatch", () => {
  it("matches education by institution + degree", () => {
    const a = { institution: "Politecnico di Milano", degree: "Laurea", field: "Informatica" };
    const b = { institution: "Politécnico di Milano", degree: "Laurea Magistrale" };
    // Same institution, different degree → NO match
    expect(identityMatch("education", a, b)).toBe(false);
  });

  it("matches education with same institution and degree slug", () => {
    const a = { institution: "MIT", degree: "MSc" };
    const b = { institution: "MIT", degree: "MSc", field: "Computer Science", startDate: "2015" };
    expect(identityMatch("education", a, b)).toBe(true);
  });

  it("matches skill by name case-insensitive", () => {
    const a = { name: "TypeScript" };
    const b = { name: "typescript" };
    expect(identityMatch("skill", a, b)).toBe(true);
  });

  it("matches experience by company + role", () => {
    const a = { company: "Google", role: "Software Engineer" };
    const b = { company: "Google", role: "Software Engineer", startDate: "2020" };
    expect(identityMatch("experience", a, b)).toBe(true);
  });

  it("does NOT match experience with different roles at same company", () => {
    const a = { company: "Google", role: "Software Engineer" };
    const b = { company: "Google", role: "Tech Lead" };
    expect(identityMatch("experience", a, b)).toBe(false);
  });

  it("matches social by platform", () => {
    const a = { platform: "github", url: "https://github.com/user1" };
    const b = { platform: "GitHub", url: "https://github.com/user2" };
    expect(identityMatch("social", a, b)).toBe(true);
  });

  it("matches music by title + artist", () => {
    const a = { title: "Bohemian Rhapsody", artist: "Queen" };
    const b = { title: "Bohemian Rhapsody", artist: "Queen", url: "https://..." };
    expect(identityMatch("music", a, b)).toBe(true);
  });

  it("does NOT match music with different artists", () => {
    const a = { title: "Yesterday", artist: "The Beatles" };
    const b = { title: "Yesterday", artist: "Leona Lewis" };
    expect(identityMatch("music", a, b)).toBe(false);
  });

  it("returns false for identity category (skip)", () => {
    const a = { name: "Tommaso Rossi" };
    const b = { name: "Tommaso Rossi" };
    expect(identityMatch("identity", a, b)).toBe(false);
  });

  it("matches project by name or url", () => {
    const a = { name: "OpenSelf", url: "https://github.com/openself" };
    const b = { name: "openself" };
    expect(identityMatch("project", a, b)).toBe(true);
  });

  it("matches project by url when names differ", () => {
    const a = { name: "My Project", url: "https://github.com/openself" };
    const b = { name: "OpenSelf", url: "https://github.com/openself" };
    expect(identityMatch("project", a, b)).toBe(true);
  });

  it("matches language by language field or name", () => {
    const a = { language: "Spanish", proficiency: "fluent" };
    const b = { name: "Spanish" };
    expect(identityMatch("language", a, b)).toBe(true);
  });

  it("matches activity by name", () => {
    const a = { name: "Running", type: "sport" };
    const b = { name: "running", activityCount: 5 };
    expect(identityMatch("activity", a, b)).toBe(true);
  });

  it("matches reading by title + author", () => {
    const a = { title: "Clean Code", author: "Robert Martin" };
    const b = { title: "Clean Code", author: "Robert C. Martin", rating: 5 };
    // Authors differ slightly → no match (strict)
    expect(identityMatch("reading", a, b)).toBe(false);
  });

  it("matches reading with identical author slug", () => {
    const a = { title: "Clean Code", author: "Robert Martin" };
    const b = { title: "Clean Code", author: "Robert Martin" };
    expect(identityMatch("reading", a, b)).toBe(true);
  });

  it("matches stat by label", () => {
    const a = { label: "Years Experience", value: "10+" };
    const b = { label: "years experience", value: "12" };
    expect(identityMatch("stat", a, b)).toBe(true);
  });

  it("matches contact by type + value", () => {
    const a = { type: "email", value: "me@example.com" };
    const b = { type: "email", value: "me@example.com", label: "Work" };
    expect(identityMatch("contact", a, b)).toBe(true);
  });

  it("does NOT match contact with different values", () => {
    const a = { type: "email", value: "me@example.com" };
    const b = { type: "email", value: "other@example.com" };
    expect(identityMatch("contact", a, b)).toBe(false);
  });

  it("matches achievement by title", () => {
    const a = { title: "AWS Solutions Architect" };
    const b = { title: "AWS Solutions Architect", issuer: "Amazon", date: "2023" };
    expect(identityMatch("achievement", a, b)).toBe(true);
  });

  it("returns false for unknown categories", () => {
    expect(identityMatch("unknown_cat", { x: 1 }, { x: 1 })).toBe(false);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-cluster-service.test.ts`
Expected: FAIL — `identityMatch` not found

- [ ] **Step 7: Implement identity matchers**

Add to `src/lib/services/fact-cluster-service.ts`:

```typescript
type FactValue = Record<string, unknown>;

/** Safe string extraction from fact value */
function str(v: unknown): string {
  if (typeof v === "string") return v;
  return "";
}

/**
 * Category-specific identity matching.
 * Returns true if two fact values refer to the same real-world entity.
 */
export function identityMatch(
  category: string,
  a: FactValue,
  b: FactValue,
): boolean {
  const s = slugifyForMatch;

  switch (category) {
    // Education: institution AND degree must match
    case "education":
      return s(str(a.institution)) === s(str(b.institution))
        && s(str(a.institution)) !== ""
        && s(str(a.degree)) === s(str(b.degree))
        && s(str(a.degree)) !== "";

    // Experience/position: company AND role must match
    case "experience":
    case "position":
      return s(str(a.company)) === s(str(b.company))
        && s(str(a.company)) !== ""
        && s(str(a.role)) === s(str(b.role))
        && s(str(a.role)) !== "";

    // Skill: name match
    case "skill":
      return s(str(a.name)) === s(str(b.name)) && s(str(a.name)) !== "";

    // Language: language or name field
    case "language": {
      const langA = s(str(a.language) || str(a.name));
      const langB = s(str(b.language) || str(b.name));
      return langA === langB && langA !== "";
    }

    // Social: platform match
    case "social":
      return s(str(a.platform)) === s(str(b.platform)) && s(str(a.platform)) !== "";

    // Music: title AND artist (both must be non-empty)
    case "music":
      return s(str(a.title)) === s(str(b.title))
        && s(str(a.title)) !== ""
        && s(str(a.artist)) === s(str(b.artist))
        && s(str(a.artist)) !== "";

    // Activity: name match
    case "activity":
      return s(str(a.name)) === s(str(b.name)) && s(str(a.name)) !== "";

    // Project: name match OR url match
    case "project": {
      const nameMatch = s(str(a.name)) !== "" && s(str(a.name)) === s(str(b.name));
      const urlMatch = str(a.url) !== "" && str(a.url) === str(b.url);
      return nameMatch || urlMatch;
    }

    // Contact: type AND value (exact)
    case "contact":
      return str(a.type) === str(b.type)
        && str(a.value) === str(b.value)
        && str(a.type) !== "";

    // Achievement: title match
    case "achievement":
      return s(str(a.title)) === s(str(b.title)) && s(str(a.title)) !== "";

    // Reading: title AND author
    case "reading":
      return s(str(a.title)) === s(str(b.title))
        && s(str(a.title)) !== ""
        && s(str(a.author)) === s(str(b.author))
        && s(str(a.author)) !== "";

    // Stat: label match
    case "stat":
      return s(str(a.label)) === s(str(b.label)) && s(str(a.label)) !== "";

    // Identity: skip — unique semantics per key
    case "identity":
      return false;

    default:
      return false;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/evals/fact-cluster-service.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/fact-cluster-service.ts tests/evals/fact-cluster-service.test.ts
git commit -m "feat: add fact cluster service with identity matchers and slug normalization"
```

---

### Task 3: Cluster assignment — `tryAssignCluster()` + DB operations

**Files:**
- Modify: `src/lib/services/fact-cluster-service.ts`
- Test: `tests/evals/fact-cluster-service.test.ts`

- [ ] **Step 1: Write failing tests for `tryAssignCluster()`**

Add to `tests/evals/fact-cluster-service.test.ts`:

```typescript
import { vi, beforeEach } from "vitest";

// --- Mocks (at top of file) ---
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};
const mockSqlite = { prepare: vi.fn() };

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get: (_, prop) => mockDb[prop as keyof typeof mockDb],
  }),
  sqlite: mockSqlite,
}));

vi.mock("@/lib/db/schema", () => ({
  facts: {
    id: "id", sessionId: "session_id", profileId: "profile_id",
    category: "category", key: "key", value: "value", source: "source",
    archivedAt: "archived_at", clusterId: "cluster_id",
  },
  factClusters: {
    id: "id", ownerKey: "owner_key", category: "category",
    canonicalKey: "canonical_key",
  },
}));

// -- Import after mocks --
const { tryAssignCluster } = await import("@/lib/services/fact-cluster-service");

describe("tryAssignCluster", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns to existing cluster when identity matches", async () => {
    // Setup: existing fact in a cluster with matching institution+degree
    const existingFacts = [{
      id: "existing-1",
      category: "education",
      key: "politecnico-milano",
      value: { institution: "Politecnico di Milano", degree: "Laurea", field: "Informatica" },
      source: "chat",
      clusterId: "cluster-abc",
      archivedAt: null,
    }];
    // Mock getActiveFacts to return existing facts
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(existingFacts),
        }),
      }),
    });

    const result = await tryAssignCluster({
      factId: "new-fact-1",
      category: "education",
      value: { institution: "Politecnico di Milano", degree: "Laurea", startDate: "2015" },
      source: "connector",
      ownerKey: "prof-1",
      sessionId: "anchor-sess",
    });

    expect(result).not.toBeNull();
    expect(result!.clusterId).toBe("cluster-abc");
    expect(result!.isNew).toBe(false);
  });

  it("creates new cluster when match found but no existing cluster", async () => {
    const existingFacts = [{
      id: "existing-1",
      category: "skill",
      key: "typescript",
      value: { name: "TypeScript" },
      source: "chat",
      clusterId: null,
      archivedAt: null,
    }];
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(existingFacts),
        }),
      }),
    });
    // Mock cluster insert
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ run: vi.fn() }),
    });
    // Mock fact update (assign cluster_id)
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: vi.fn() }),
      }),
    });

    const result = await tryAssignCluster({
      factId: "new-fact-1",
      category: "skill",
      value: { name: "TypeScript", evidence: "45 repos" },
      source: "connector",
      ownerKey: "prof-1",
      sessionId: "anchor-sess",
    });

    expect(result).not.toBeNull();
    expect(result!.isNew).toBe(true);
  });

  it("returns null when no identity match found", async () => {
    const existingFacts = [{
      id: "existing-1",
      category: "skill",
      key: "python",
      value: { name: "Python" },
      source: "chat",
      clusterId: null,
      archivedAt: null,
    }];
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue(existingFacts),
        }),
      }),
    });

    const result = await tryAssignCluster({
      factId: "new-fact-1",
      category: "skill",
      value: { name: "TypeScript" },
      source: "connector",
      ownerKey: "prof-1",
      sessionId: "anchor-sess",
    });

    expect(result).toBeNull();
  });

  it("skips identity category", async () => {
    const result = await tryAssignCluster({
      factId: "new-fact-1",
      category: "identity",
      value: { name: "Tommaso Rossi" },
      source: "chat",
      ownerKey: "prof-1",
      sessionId: "anchor-sess",
    });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-cluster-service.test.ts`
Expected: FAIL — `tryAssignCluster` not found

- [ ] **Step 3: Implement `tryAssignCluster()`**

Add to `src/lib/services/fact-cluster-service.ts`:

```typescript
import { db } from "@/lib/db";
import { facts, factClusters } from "@/lib/db/schema";
import { eq, and, isNull, ne, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { PROFILE_ID_CANONICAL } from "@/lib/flags";
import type { FactRow } from "@/lib/services/kb-service";

type ClusterAssignInput = {
  factId: string;
  category: string;
  value: Record<string, unknown>;
  source: string;
  ownerKey: string;
  sessionId: string;
};

export type ClusterAssignResult = {
  clusterId: string;
  isNew: boolean;
  matchedFactId: string;
  canonicalKey: string;
} | null;

/**
 * Try to assign a newly created fact to an existing cluster, or create a new one.
 * Called post-insert in createFact().
 *
 * Returns null if no semantic match found (fact stays unclustered).
 */
export function tryAssignCluster(input: ClusterAssignInput): ClusterAssignResult {
  const { factId, category, value, source, ownerKey, sessionId } = input;

  // Identity category is excluded from clustering
  if (category === "identity") return null;

  // Find existing active facts in same category for this owner (excluding self)
  const existing = PROFILE_ID_CANONICAL
    ? db.select().from(facts)
        .where(and(
          eq(facts.profileId, ownerKey),
          eq(facts.category, category),
          ne(facts.id, factId),
          isNull(facts.archivedAt),
        ))
        .all() as (FactRow & { clusterId: string | null })[]
    : db.select().from(facts)
        .where(and(
          eq(facts.sessionId, sessionId),
          eq(facts.category, category),
          ne(facts.id, factId),
          isNull(facts.archivedAt),
        ))
        .all() as (FactRow & { clusterId: string | null })[];

  if (existing.length === 0) return null;

  // Find the first identity match
  const factValue = typeof value === "object" && value !== null ? value : {};
  for (const candidate of existing) {
    const candidateValue = typeof candidate.value === "object" && candidate.value !== null
      ? (candidate.value as Record<string, unknown>)
      : {};

    if (!identityMatch(category, factValue, candidateValue)) continue;

    // Match found!
    if (candidate.clusterId) {
      // Candidate already has a cluster — join it
      db.update(facts)
        .set({ clusterId: candidate.clusterId })
        .where(eq(facts.id, factId))
        .run();

      // Update canonicalKey: prefer non-connector key
      updateCanonicalKey(candidate.clusterId, source, factId, candidate);

      return {
        clusterId: candidate.clusterId,
        isNew: false,
        matchedFactId: candidate.id,
        canonicalKey: candidate.key,
      };
    }

    // Candidate has no cluster — create one and assign both
    const clusterId = randomUUID();
    const canonicalKey = pickCanonicalKey(source, factId, candidate);

    db.insert(factClusters)
      .values({
        id: clusterId,
        ownerKey,
        category,
        canonicalKey,
      })
      .run();

    // Assign cluster to both facts
    db.update(facts)
      .set({ clusterId })
      .where(eq(facts.id, factId))
      .run();

    db.update(facts)
      .set({ clusterId })
      .where(eq(facts.id, candidate.id))
      .run();

    return {
      clusterId,
      isNew: true,
      matchedFactId: candidate.id,
      canonicalKey,
    };
  }

  return null;
}

/**
 * Pick the canonical key for a cluster.
 * Prefer non-connector-prefixed keys (agent-generated keys are cleaner).
 */
function pickCanonicalKey(
  newSource: string,
  newFactId: string,
  existingFact: FactRow,
): string {
  // Connector-prefixed patterns
  const isConnectorKey = (key: string) =>
    /^(li-|gh-|sp-|strava-|rss-)/.test(key);

  if (newSource === "connector" && !isConnectorKey(existingFact.key)) {
    return existingFact.key; // existing non-connector key wins
  }
  if (newSource !== "connector" && isConnectorKey(existingFact.key)) {
    // New fact has cleaner key — but we need to look it up
    const newFact = db.select().from(facts).where(eq(facts.id, newFactId)).get() as FactRow | undefined;
    return newFact?.key ?? existingFact.key;
  }
  return existingFact.key; // first-come-first-served
}

function updateCanonicalKey(
  clusterId: string,
  newSource: string,
  newFactId: string,
  existingFact: FactRow,
): void {
  const preferred = pickCanonicalKey(newSource, newFactId, existingFact);
  const cluster = db.select().from(factClusters).where(eq(factClusters.id, clusterId)).get();
  if (cluster && cluster.canonicalKey !== preferred) {
    db.update(factClusters)
      .set({ canonicalKey: preferred, updatedAt: new Date().toISOString() })
      .where(eq(factClusters.id, clusterId))
      .run();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/fact-cluster-service.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/fact-cluster-service.ts tests/evals/fact-cluster-service.test.ts
git commit -m "feat: implement tryAssignCluster with canonical key selection"
```

---

### Task 4: Integrate `tryAssignCluster()` into `createFact()`

**Files:**
- Modify: `src/lib/services/kb-service.ts`

- [ ] **Step 1: Add cluster assignment post-insert**

In `src/lib/services/kb-service.ts`, add a new import at the top:

```typescript
import type { ClusterAssignResult } from "@/lib/services/fact-cluster-service";
```

Extend the return type. Change `createFact` signature to:

```typescript
export async function createFact(
  input: CreateFactInput,
  sessionId: string = "__default__",
  profileId?: string,
  options?: { actor?: Actor; visibility?: Visibility },
): Promise<FactRow & { _clusterResult?: ClusterAssignResult }>
```

After the final `SELECT` (line 216-222), **after** getting the persisted row, add cluster assignment using the **actual persisted row ID** (not the pre-generated UUID — on upsert the original ID is retained):

```typescript
  const row = db
    .select()
    .from(facts)
    .where(
      sql`${facts.sessionId} = ${sessionId} AND ${facts.category} = ${normalized.canonical} AND ${facts.key} = ${input.key}`,
    )
    .get() as FactRow;

  // Post-insert: try to assign to a cluster (semantic dedup).
  // IMPORTANT: use row.id (the actual persisted ID), not `id` (which is the
  // pre-generated UUID that may not match on upsert).
  let clusterResult: ClusterAssignResult | null = null;
  try {
    const { tryAssignCluster } = await import("@/lib/services/fact-cluster-service");
    clusterResult = tryAssignCluster({
      factId: row.id,
      category: normalized.canonical,
      value: input.value,
      source: input.source ?? "chat",
      ownerKey: profileId ?? sessionId,
      sessionId,
    });
  } catch (err) {
    // Non-fatal — fact is created, clustering is best-effort
    console.warn("[createFact] cluster assignment failed:", err);
  }

  if (clusterResult) {
    return { ...row, _clusterResult: clusterResult };
  }
  return row;
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npx vitest run tests/evals/connector-fact-actor.test.ts tests/evals/connector-fact-writer.test.ts tests/evals/create-fact-profileid.test.ts`
Expected: ALL PASS (cluster assignment is non-fatal, mocked DB won't trigger it)

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/kb-service.ts
git commit -m "feat: integrate tryAssignCluster into createFact post-insert hook"
```

---

### Task 5: Read-time projection — `projectClusteredFacts()`

**Files:**
- Modify: `src/lib/services/fact-cluster-service.ts`
- Test: `tests/evals/fact-cluster-projection.test.ts`

- [ ] **Step 1: Write failing tests for projection**

```typescript
// tests/evals/fact-cluster-projection.test.ts
import { describe, it, expect } from "vitest";
import { projectClusteredFacts } from "@/lib/services/fact-cluster-service";

const makeFact = (overrides: Record<string, unknown>) => ({
  id: "f1",
  category: "skill",
  key: "typescript",
  value: { name: "TypeScript" },
  source: "chat",
  confidence: 1.0,
  visibility: "public",
  sortOrder: 0,
  parentFactId: null,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  clusterId: null,
  ...overrides,
});

describe("projectClusteredFacts", () => {
  it("passes unclustered facts through unchanged", () => {
    const facts = [
      makeFact({ id: "f1", key: "typescript" }),
      makeFact({ id: "f2", key: "python", value: { name: "Python" } }),
    ];
    const result = projectClusteredFacts(facts as any, []);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe("typescript");
    expect(result[0].memberIds).toEqual(["f1"]);
    expect(result[1].key).toBe("python");
    expect(result[1].memberIds).toEqual(["f2"]);
  });

  it("projects cluster into single fact with merged fields", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "education", canonicalKey: "politecnico-milano" };
    const facts = [
      makeFact({
        id: "f1", category: "education", key: "politecnico-milano",
        value: { institution: "Politecnico di Milano", degree: "Laurea", field: "Informatica" },
        source: "chat", clusterId: "c1", sortOrder: 0,
      }),
      makeFact({
        id: "f2", category: "education", key: "li-edu-politecnico-0",
        value: { institution: "Politecnico di Milano", degree: "Laurea", startDate: "2015", endDate: "2018" },
        source: "connector", clusterId: "c1", sortOrder: 1,
      }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("politecnico-milano"); // canonical key
    expect(result[0].value).toEqual({
      institution: "Politecnico di Milano",
      degree: "Laurea",
      field: "Informatica",       // from chat (higher priority)
      startDate: "2015",          // from connector (fills gap)
      endDate: "2018",            // from connector (fills gap)
    });
    expect(result[0].sources).toEqual(["chat", "connector"]);
    expect(result[0].clusterSize).toBe(2);
    expect(result[0].memberIds).toEqual(["f1", "f2"]);
  });

  it("source priority: chat > connector", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({
        id: "f1", category: "skill", key: "ts",
        value: { name: "TypeScript", level: "advanced" },
        source: "chat", clusterId: "c1",
      }),
      makeFact({
        id: "f2", category: "skill", key: "gh-typescript",
        value: { name: "TypeScript", evidence: "45 repos", level: "intermediate" },
        source: "connector", clusterId: "c1",
      }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);

    expect(result[0].value).toEqual({
      name: "TypeScript",
      level: "advanced",      // chat wins (exists in both)
      evidence: "45 repos",   // connector fills gap
    });
  });

  it("visibility: private in any member → private", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", clusterId: "c1", visibility: "private", source: "chat" }),
      makeFact({ id: "f2", clusterId: "c1", visibility: "public", source: "connector" }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result[0].visibility).toBe("private");
  });

  it("visibility: public when any member is public and none private", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", clusterId: "c1", visibility: "proposed", source: "chat" }),
      makeFact({ id: "f2", clusterId: "c1", visibility: "public", source: "connector" }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result[0].visibility).toBe("public");
  });

  it("mixes clustered and unclustered facts", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", key: "ts", clusterId: "c1", source: "chat" }),
      makeFact({ id: "f2", key: "gh-typescript", clusterId: "c1", source: "connector" }),
      makeFact({ id: "f3", key: "python", clusterId: null }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result).toHaveLength(2); // 1 projected cluster + 1 unclustered
  });

  it("preserves sortOrder from highest-priority fact", () => {
    const cluster = { id: "c1", ownerKey: "prof-1", category: "skill", canonicalKey: "ts" };
    const facts = [
      makeFact({ id: "f1", clusterId: "c1", source: "chat", sortOrder: 3 }),
      makeFact({ id: "f2", clusterId: "c1", source: "connector", sortOrder: 7 }),
    ];
    const result = projectClusteredFacts(facts as any, [cluster] as any);
    expect(result[0].sortOrder).toBe(3); // from chat (higher priority)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-cluster-projection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `projectClusteredFacts()`**

Add to `src/lib/services/fact-cluster-service.ts`:

```typescript
/** Source priority for projection (lower = higher priority) */
const SOURCE_PRIORITY: Record<string, number> = {
  user: 0,
  chat: 1,
  worker: 2,
  connector: 3,
};

function getSourcePriority(source: string | null): number {
  return SOURCE_PRIORITY[source ?? "chat"] ?? 2;
}

export type ProjectedFact = FactRow & {
  sources: string[];
  clusterSize: number;
  clusterId: string | null;
  memberIds: string[];  // ALL fact IDs in this cluster (or [self] if unclustered)
};

type ClusterRow = {
  id: string;
  ownerKey: string;
  category: string;
  canonicalKey: string | null;
};

/**
 * Project clustered facts into virtual enriched facts.
 * Each cluster becomes a single ProjectedFact with merged fields.
 * Unclustered facts pass through as-is.
 */
export function projectClusteredFacts(
  allFacts: (FactRow & { clusterId: string | null })[],
  clusters: ClusterRow[],
): ProjectedFact[] {
  const clusterMap = new Map<string, typeof allFacts>();
  const unclustered: typeof allFacts = [];

  for (const fact of allFacts) {
    if (fact.clusterId) {
      const list = clusterMap.get(fact.clusterId) ?? [];
      list.push(fact);
      clusterMap.set(fact.clusterId, list);
    } else {
      unclustered.push(fact);
    }
  }

  const projected: ProjectedFact[] = [];

  // Unclustered → pass through
  for (const fact of unclustered) {
    projected.push({
      ...fact,
      sources: [fact.source ?? "chat"],
      clusterSize: 1,
      clusterId: null,
      memberIds: [fact.id],
    });
  }

  // Clustered → project
  for (const [clusterId, clusterFacts] of clusterMap) {
    const cluster = clusters.find((c) => c.id === clusterId);

    // Sort by source priority (highest priority first)
    const sorted = [...clusterFacts].sort(
      (a, b) => getSourcePriority(a.source) - getSourcePriority(b.source),
    );
    const primary = sorted[0];

    // Per-field resolution: highest-priority source with non-empty value wins
    const mergedValue: Record<string, unknown> = {};
    for (const fact of sorted) {
      const val =
        typeof fact.value === "object" && fact.value !== null
          ? (fact.value as Record<string, unknown>)
          : {};
      for (const [field, value] of Object.entries(val)) {
        if (
          mergedValue[field] === undefined ||
          mergedValue[field] === null ||
          mergedValue[field] === ""
        ) {
          mergedValue[field] = value;
        }
      }
    }

    // Visibility resolution: private wins, then public, then proposed
    const visibility = resolveClusterVisibility(clusterFacts);

    projected.push({
      ...primary,
      key: cluster?.canonicalKey ?? primary.key,
      value: mergedValue,
      visibility,
      sources: [...new Set(clusterFacts.map((f) => f.source ?? "chat"))],
      clusterSize: clusterFacts.length,
      clusterId,
      memberIds: clusterFacts.map((f) => f.id),
    });
  }

  return projected.sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

function resolveClusterVisibility(
  clusterFacts: Array<{ visibility: string | null }>,
): string {
  const visibilities = clusterFacts.map((f) => f.visibility ?? "proposed");
  if (visibilities.includes("private")) return "private";
  if (visibilities.includes("public")) return "public";
  return "proposed";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/fact-cluster-projection.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/fact-cluster-service.ts tests/evals/fact-cluster-projection.test.ts
git commit -m "feat: implement projectClusteredFacts with source-priority resolution"
```

---

## Chunk 2: Integration — Read Path + Agent Awareness

### Task 6: Integrate projection into page-projection.ts

**Files:**
- Modify: `src/lib/services/page-projection.ts`
- Modify: `src/lib/services/fact-cluster-service.ts` (add `getProjectedFacts` convenience function)

- [ ] **Step 1: Add `getProjectedFacts()` helper to cluster service**

This helper loads facts + clusters and returns the projected view:

```typescript
// In fact-cluster-service.ts — add static import at top of file:
import { getActiveFacts } from "@/lib/services/kb-service";

/**
 * Load active facts for an owner and return the projected (cluster-resolved) view.
 * Drop-in replacement for getActiveFacts() in read paths.
 */
export function getProjectedFacts(
  sessionId: string,
  sessionIds?: string[],
): ProjectedFact[] {
  const rawFacts = getActiveFacts(sessionId, sessionIds);

  // Load clusters for all clustered facts
  const clusterIds = [...new Set(
    rawFacts
      .map((f: any) => f.clusterId)
      .filter((id: string | null): id is string => id !== null),
  )];

  if (clusterIds.length === 0) {
    // No clusters — all facts pass through
    return rawFacts.map((f: FactRow) => ({
      ...f,
      sources: [f.source ?? "chat"],
      clusterSize: 1,
      clusterId: (f as any).clusterId ?? null,
      memberIds: [f.id],
    }));
  }

  const clusters = db
    .select()
    .from(factClusters)
    .where(inArray(factClusters.id, clusterIds))
    .all() as ClusterRow[];

  return projectClusteredFacts(rawFacts as any, clusters);
}
```

- [ ] **Step 2: Integrate into `projectCanonicalConfig()`**

In `src/lib/services/page-projection.ts`, modify the import and usage:

Add import:
```typescript
import { getProjectedFacts, type ProjectedFact } from "@/lib/services/fact-cluster-service";
```

In `projectCanonicalConfig()` (line 79), change fact filtering to use projected view:

The function currently receives `facts: FactRow[]` from callers. The projection should happen upstream. Two options:
- Option A: Callers pass projected facts (change callsites)
- Option B: Project inside `projectCanonicalConfig()` if not already projected

Use Option B to minimize changes. Add a flag check:

```typescript
// After line 80 (const publishable = filterPublishableFacts(facts))
// Check if facts are already projected (have .sources field)
const needsProjection = publishable.length > 0 && !(publishable[0] as any).sources;
let displayFacts = publishable;
if (needsProjection) {
  // Facts came in un-projected — apply projection
  const { projectClusteredFacts } = await import("@/lib/services/fact-cluster-service");
  // ... load clusters for these facts and project
}
```

Actually, a cleaner approach: modify `recomposeDraft()` and other callers to use `getProjectedFacts()` instead of `getActiveFacts()`. This is the simplest change with maximum effect.

In `src/lib/connectors/recompose-draft.ts`, add import and change usage:
```typescript
// Add import at top:
import { getProjectedFacts } from "@/lib/services/fact-cluster-service";

// Change (inside recomposeDraft):
// Before:
const allFacts = getActiveFacts(factsReadId, readKeys);
// After:
const allFacts = getProjectedFacts(factsReadId, readKeys);
```

Similarly in `src/lib/agent/context.ts`, add import and change usage:
```typescript
// Add import at top:
import { getProjectedFacts } from "@/lib/services/fact-cluster-service";

// Change (line 294):
// Before:
existingFacts = bootstrapData?.facts ?? getActiveFacts(factsReadId, factsReadKeys);
// After:
existingFacts = bootstrapData?.facts ?? getProjectedFacts(factsReadId, factsReadKeys);
```

- [ ] **Step 3: Fix `applyFactDisplayOverrides` to respect cluster member IDs**

In `src/lib/services/page-projection.ts`, the `applyFactDisplayOverrides` function matches overrides by `fact.id` (line 53). When a cluster is projected to a single virtual fact using the primary fact's ID, overrides on non-primary member IDs are silently lost.

Fix: update `applyFactDisplayOverrides` to check all member IDs when the fact is a `ProjectedFact`:

```typescript
// In applyFactDisplayOverrides, replace:
//   const override = overrides.get(fact.id);
// With:
    const memberIds: string[] = (fact as any).memberIds ?? [fact.id];
    let override: Record<string, unknown> | undefined;
    for (const mid of memberIds) {
      override = overrides.get(mid);
      if (override) break;  // first match wins (primary ID checked first)
    }
    if (!override) return fact;
```

This is backward-compatible: non-projected `FactRow` objects don't have `memberIds`, so it falls back to `[fact.id]`.

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run tests/evals/`
Expected: ALL PASS — projected facts are a superset of FactRow (backward compatible)

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/fact-cluster-service.ts src/lib/services/page-projection.ts \
  src/lib/connectors/recompose-draft.ts src/lib/agent/context.ts
git commit -m "feat: integrate projected facts into read paths (composer, context, recompose)"
```

---

### Task 7: Agent tool awareness — enrichment metadata in responses

**Files:**
- Modify: `src/lib/agent/tools.ts`

- [ ] **Step 1: Add cluster metadata to `create_fact` response**

In `src/lib/agent/tools.ts`, in the `create_fact` execute function (~line 483), after `recomposeAfterMutation()`:

```typescript
        // Check if fact was clustered (typed return from createFact)
        const clusterInfo = fact._clusterResult
          ? {
              clustered: true,
              clusterSize: fact._clusterResult.isNew ? 2 : "existing",
              matchedFactKey: fact._clusterResult.canonicalKey,
              message: `Clustered with existing ${category} fact. Information enriched.`,
            }
          : {};

        return {
          success: true,
          factId: fact.id,
          category: fact.category,
          key: fact.key,
          visibility: fact.visibility,
          pageVisible: fact.visibility === "public" || fact.visibility === "proposed",
          recomposeOk,
          ...clusterInfo,
        };
```

- [ ] **Step 2: Add cluster metadata to `batch_facts` create response**

In the batch_facts create operation handling (~line 653-673), after the create call, add similar cluster info to the per-operation result.

- [ ] **Step 3: Run agent tool tests**

Run: `npx vitest run tests/evals/batch-facts-tool.test.ts tests/evals/create-fact-profileid.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat: return cluster metadata in create_fact and batch_facts tool responses"
```

---

### Task 8: Connector writer — batch clustering optimization

**Files:**
- Modify: `src/lib/connectors/connector-fact-writer.ts`
- Modify: `src/lib/connectors/types.ts`

- [ ] **Step 1: Add `factsClustered` to ImportReport type**

In `src/lib/connectors/types.ts`, add to ImportReport as **optional** field (avoids breaking LinkedIn import and other constructors):

```typescript
export type ImportReport = {
  factsWritten: number;
  factsSkipped: number;
  factsClustered?: number;  // NEW — optional to avoid breaking existing constructors
  errors: Array<{ key: string; reason: string }>;
  createdFacts: Array<{ key: string; factId: string }>;
};
```

- [ ] **Step 2: Track clustering in `batchCreateFacts()`**

In `src/lib/connectors/connector-fact-writer.ts`, update the report initialization and track cluster results:

```typescript
const report: ImportReport = {
  factsWritten: 0,
  factsSkipped: 0,
  factsClustered: 0,  // NEW
  errors: [],
  createdFacts: [],
};

// In the loop, after successful createFact:
if (fact._clusterResult) {
  report.factsClustered++;
}
```

Note: `createFact()` now returns `FactRow & { _clusterResult?: ClusterAssignResult }`, so no `as any` cast needed.

- [ ] **Step 3: Run connector tests**

Run: `npx vitest run tests/evals/connector-fact-writer.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/connectors/connector-fact-writer.ts src/lib/connectors/types.ts
git commit -m "feat: track factsClustered in connector import reports"
```

---

## Chunk 3: Async Worker + Purge + Cleanup

### Task 9: Async `consolidate_facts` worker handler

**Files:**
- Create: `src/lib/worker/handlers/consolidate-facts.ts`
- Test: `tests/evals/consolidate-facts-handler.test.ts`

- [ ] **Step 1: Write failing test for handler**

```typescript
// tests/evals/consolidate-facts-handler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetActiveFacts = vi.fn();
const mockTryAssignCluster = vi.fn();
const mockResolveOwnerScope = vi.fn().mockReturnValue({
  cognitiveOwnerKey: "prof-1",
  knowledgePrimaryKey: "anchor-sess",
  knowledgeReadKeys: ["anchor-sess"],
});
const mockLogEvent = vi.fn();
const mockStreamText = vi.fn();

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
}));
vi.mock("@/lib/services/fact-cluster-service", () => ({
  tryAssignCluster: (...args: any[]) => mockTryAssignCluster(...args),
  identityMatch: vi.fn(),
  slugifyForMatch: vi.fn((s: string) => s?.toLowerCase() ?? ""),
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: any[]) => mockResolveOwnerScope(...args),
}));
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: any[]) => mockLogEvent(...args),
}));
vi.mock("@/lib/flags", () => ({
  PROFILE_ID_CANONICAL: true,
}));

const { handleConsolidateFacts } = await import("@/lib/worker/handlers/consolidate-facts");

describe("consolidate-facts handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires ownerKey in payload", async () => {
    await expect(handleConsolidateFacts({})).rejects.toThrow("missing ownerKey");
  });

  it("skips when no unclustered facts", async () => {
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "skill", key: "ts", clusterId: "c1", value: { name: "TS" }, source: "chat" },
    ]);

    await handleConsolidateFacts({ ownerKey: "prof-1" });
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "consolidate_facts_skip" }),
    );
  });

  it("logs completion event with cluster count", async () => {
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "skill", key: "ts", clusterId: null, value: { name: "TypeScript" }, source: "chat" },
      { id: "f2", category: "skill", key: "gh-typescript", clusterId: null, value: { name: "TypeScript", evidence: "45 repos" }, source: "connector" },
    ]);
    mockTryAssignCluster.mockReturnValue({ clusterId: "c-new", isNew: true, matchedFactId: "f1" });

    await handleConsolidateFacts({ ownerKey: "prof-1" });

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "consolidate_facts_complete",
        payload: expect.objectContaining({ clustersCreated: expect.any(Number) }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/consolidate-facts-handler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement handler**

```typescript
// src/lib/worker/handlers/consolidate-facts.ts
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getActiveFacts } from "@/lib/services/kb-service";
import {
  tryAssignCluster,
  identityMatch,
} from "@/lib/services/fact-cluster-service";
import { logEvent } from "@/lib/services/event-service";
import { checkBudget } from "@/lib/services/usage-service";

/**
 * Worker handler: consolidate unclustered facts using deterministic matching.
 * Phase 1: deterministic slug-based clustering for facts tryAssignCluster missed.
 * Phase 2 (future): LLM-based near-duplicate detection for ambiguous cases.
 */
export async function handleConsolidateFacts(
  payload: Record<string, unknown>,
): Promise<void> {
  const ownerKey = payload.ownerKey as string;
  if (!ownerKey) throw new Error("consolidate_facts: missing ownerKey");

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const allFacts = getActiveFacts(scope.cognitiveOwnerKey, scope.knowledgeReadKeys);

  // Find unclustered facts
  const unclustered = allFacts.filter((f: any) => !f.clusterId);
  if (unclustered.length === 0) {
    logEvent({
      eventType: "consolidate_facts_skip",
      actor: "worker",
      payload: { ownerKey, reason: "no_unclustered_facts" },
    });
    return;
  }

  // Group unclustered facts by category
  const byCategory = new Map<string, typeof unclustered>();
  for (const fact of unclustered) {
    const list = byCategory.get(fact.category) ?? [];
    list.push(fact);
    byCategory.set(fact.category, list);
  }

  let clustersCreated = 0;
  let factsAssigned = 0;

  // Deterministic pass: try to cluster unclustered facts against ALL facts (including clustered ones)
  for (const [category, categoryFacts] of byCategory) {
    if (category === "identity") continue;
    if (categoryFacts.length < 1) continue;

    for (const fact of categoryFacts) {
      // Skip if already assigned by a previous iteration
      if ((fact as any)._assigned) continue;

      const result = tryAssignCluster({
        factId: fact.id,
        category,
        value: typeof fact.value === "object" && fact.value !== null
          ? (fact.value as Record<string, unknown>)
          : {},
        source: fact.source ?? "chat",
        ownerKey: scope.cognitiveOwnerKey,
        sessionId: scope.knowledgePrimaryKey,
      });

      if (result) {
        factsAssigned++;
        if (result.isNew) clustersCreated++;
        (fact as any)._assigned = true;
      }
    }
  }

  // TODO Phase 2: LLM pass for remaining unclustered facts (confidence-based)
  // Gated by: checkBudget() + at least 2 unclustered facts in same category after deterministic pass

  logEvent({
    eventType: "consolidate_facts_complete",
    actor: "worker",
    payload: {
      ownerKey,
      totalFacts: allFacts.length,
      unclusteredBefore: unclustered.length,
      clustersCreated,
      factsAssigned,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/consolidate-facts-handler.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/worker/handlers/consolidate-facts.ts tests/evals/consolidate-facts-handler.test.ts
git commit -m "feat: add consolidate_facts worker handler (deterministic phase)"
```

---

### Task 10: Register handler + trigger post-sync + deep heartbeat

**Files:**
- Modify: `src/lib/worker/index.ts` (register handler)
- Modify: `src/lib/connectors/connector-sync-handler.ts` (post-sync trigger)
- Modify: `src/lib/worker/heartbeat.ts` (deep heartbeat trigger)

- [ ] **Step 1: Register in worker index**

In `src/lib/worker/index.ts`, add handler registration:

```typescript
import { handleConsolidateFacts } from "@/lib/worker/handlers/consolidate-facts";

// In the handler map:
consolidate_facts: handleConsolidateFacts,
```

- [ ] **Step 2: Trigger after successful connector sync**

In `src/lib/connectors/connector-sync-handler.ts`, after line 86 (`updateConnectorStatus(connector.id, "connected")`):

```typescript
        // Post-sync: trigger fact consolidation if new facts were created
        if (result.factsCreated > 0) {
          try {
            const { enqueueJob } = await import("@/lib/worker/index");
            enqueueJob("consolidate_facts", { ownerKey });
          } catch (err) {
            console.warn("[connector-sync] Failed to enqueue consolidate_facts:", err);
          }
        }
```

- [ ] **Step 3: Trigger in deep heartbeat**

In `src/lib/worker/heartbeat.ts`, after the page curation substep (~line 303), add.
**IMPORTANT: Use `enqueueJob` (not direct call) to ensure dedup protection against concurrent post-sync triggers:**

```typescript
  // --- Substep 4: Fact consolidation (enqueue, don't call directly — dedup safety) ---
  try {
    enqueueJob("consolidate_facts", { ownerKey });
  } catch (error) {
    logEvent({
      eventType: "consolidate_facts_error",
      actor: "worker",
      payload: { ownerKey, error: String(error) },
    });
    // Non-fatal: consolidation failure doesn't block heartbeat recording
  }
```

Add static import at top of `heartbeat.ts`:
```typescript
import { enqueueJob } from "@/lib/worker/index";
```

**Note**: `enqueueJob` is already used in `scheduler.ts` which imports from `@/lib/worker/index`. `heartbeat.ts` already imports from `@/lib/worker/handlers/curate-page` (static import pattern), so this follows the established convention. The job dedup indexes (`uniq_jobs_dedup_global`) ensure only one `consolidate_facts` job runs per owner at a time.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run tests/evals/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/worker/index.ts src/lib/connectors/connector-sync-handler.ts src/lib/worker/heartbeat.ts
git commit -m "feat: register consolidate_facts handler, trigger post-sync and in deep heartbeat"
```

---

### Task 11: Purge cleanup — remove empty clusters

**Files:**
- Modify: `src/lib/connectors/connector-purge.ts`
- Modify: `src/lib/worker/heartbeat.ts` (global housekeeping)

- [ ] **Step 1: Add empty cluster cleanup to purge**

In `src/lib/connectors/connector-purge.ts`, add **inside the existing `sqlite.transaction(() => { ... })()` block**, after step 6 (connector state reset) and before the `return` statement.
**IMPORTANT: UPDATE facts first (clear FK references), then DELETE clusters. Scope UPDATE to active facts only (`archived_at IS NULL`):**

```typescript
    // Step 7: Clear cluster_id from active facts in single-member clusters
    // MUST run before DELETE to avoid FK constraint violation.
    // Only clear active facts (archived facts are inert).
    sqlite.prepare(`
      UPDATE facts SET cluster_id = NULL
      WHERE archived_at IS NULL AND cluster_id IN (
        SELECT fc.id FROM fact_clusters fc
        LEFT JOIN facts f ON f.cluster_id = fc.id AND f.archived_at IS NULL
        WHERE fc.owner_key = ?
        GROUP BY fc.id
        HAVING COUNT(f.id) <= 1
      )
    `).run(ownerKey);

    // Step 8: Delete empty/single-member clusters (now unreferenced by active facts).
    // ON DELETE SET NULL handles any remaining archived fact references.
    sqlite.prepare(`
      DELETE FROM fact_clusters
      WHERE owner_key = ? AND id NOT IN (
        SELECT DISTINCT cluster_id FROM facts
        WHERE cluster_id IS NOT NULL AND archived_at IS NULL
      )
    `).run(ownerKey);
```

- [ ] **Step 2: Add empty cluster cleanup to global housekeeping**

In `src/lib/worker/heartbeat.ts` `runGlobalHousekeeping()`, add:

```typescript
  // Clean up empty fact clusters (all member facts deleted/archived)
  // Uses existing `sqlite` import (ESM — no require())
  // Two-step: UPDATE facts first (clear FK refs), then DELETE clusters
  try {
    // Step 1: NULL out cluster_id on archived facts referencing soon-to-be-deleted clusters
    sqlite.prepare(`
      UPDATE facts SET cluster_id = NULL
      WHERE cluster_id IS NOT NULL AND cluster_id NOT IN (
        SELECT DISTINCT cluster_id FROM facts
        WHERE cluster_id IS NOT NULL AND archived_at IS NULL
      )
    `).run();

    // Step 2: Delete now-unreferenced clusters
    const result = sqlite.prepare(`
      DELETE FROM fact_clusters
      WHERE id NOT IN (
        SELECT DISTINCT cluster_id FROM facts
        WHERE cluster_id IS NOT NULL
      )
    `).run();
    if (result.changes > 0) {
      logEvent({
        eventType: "housekeeping",
        actor: "worker",
        payload: { action: "empty_cluster_cleanup", cleaned: result.changes },
      });
    }
  } catch {
    // Non-fatal
  }
```

- [ ] **Step 3: Run purge tests**

Run: `npx vitest run tests/evals/` (focus on connector-purge tests if they exist)
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/connectors/connector-purge.ts src/lib/worker/heartbeat.ts
git commit -m "feat: clean up empty clusters on purge and global housekeeping"
```

---

### Task 12: Update schema version + structural constants

**Files:**
- Modify: `src/lib/agent/context.ts` or wherever EXPECTED_SCHEMA_VERSION lives

- [ ] **Step 1: Find and update EXPECTED_SCHEMA_VERSION**

Run: `grep -rn "EXPECTED_SCHEMA_VERSION" src/`

Update to `35`.

- [ ] **Step 2: Update EXPECTED_HANDLER_COUNT if applicable**

If `EXPECTED_HANDLER_COUNT` exists, increment by 1 (for `consolidate_facts`).

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run tests/evals/`
Expected: ALL PASS — no structural test failures

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: update schema version to 35 and handler count"
```

---

## Chunk 4: Full Integration Test

### Task 13: End-to-end scenario test

**Files:**
- Create: `tests/evals/fact-enrichment-e2e.test.ts`

- [ ] **Step 1: Write E2E scenario test**

```typescript
// tests/evals/fact-enrichment-e2e.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// This test validates the full enrichment pipeline:
// 1. Agent creates education fact via chat
// 2. Connector imports LinkedIn education fact for same institution
// 3. Projection returns single enriched fact with merged fields

// ... (full mock setup following connector-fact-writer.test.ts pattern)

describe("fact enrichment e2e", () => {
  it("chat fact + LinkedIn import → single enriched education entry", async () => {
    // Step 1: Agent creates fact
    // Step 2: Connector imports same entity with extra fields
    // Step 3: Verify cluster created
    // Step 4: Verify projection returns single fact with merged fields
  });

  it("connector import first, then chat enrichment → same result", async () => {
    // Reverse order: connector first, then chat
  });

  it("purge removes connector facts, projection falls back to chat data", async () => {
    // After purge, cluster adjusts and only chat data remains
  });

  it("different degrees at same institution → NOT clustered", async () => {
    // BSc and MSc at MIT should remain separate
  });
});
```

- [ ] **Step 2: Run and iterate until tests pass**

Run: `npx vitest run tests/evals/fact-enrichment-e2e.test.ts`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run tests/evals/`
Expected: ALL PASS (including all 3019+ existing tests)

- [ ] **Step 4: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Final commit**

```bash
git add tests/evals/fact-enrichment-e2e.test.ts
git commit -m "test: add fact enrichment e2e scenario tests"
```

---

## Implementation Notes

### What is NOT included (deferred)

1. **LLM-based async clustering (Phase 2 of async)**: The `consolidate_facts` handler currently only does deterministic matching. The LLM pass is stubbed with a TODO comment. This is a natural follow-up once the deterministic layer is validated in production.

2. **Materialized projection cache**: Projection is computed on-demand. For typical fact counts (<200), this is fast enough. Cache can be added if profiling shows a bottleneck.

3. **Agent situation `has_ambiguous_clusters`**: Future enhancement for agent-driven resolution of edge cases.

4. **Facts block annotation with sources**: The agent context could show `[sources: chat, linkedin]` per fact. Deferred to avoid prompt bloat — cluster metadata in tool responses is sufficient for now.

5. **Stale cluster membership detection**: When a fact's value changes (via delete+create pattern), it may no longer match the identity of its cluster. No automatic unassignment mechanism exists yet — the async `consolidate_facts` worker would need to verify existing cluster memberships and split stale ones.

### Addressed in review

- **Fact display overrides for non-primary cluster members** (HIGH): `ProjectedFact` includes `memberIds: string[]` containing all fact IDs in the cluster. `applyFactDisplayOverrides` checks all member IDs, not just the projected primary ID. This ensures display overrides set on any cluster member are applied correctly.

### Key invariants to maintain

- Facts are **never** physically mutated by the enrichment layer
- `tryAssignCluster()` is **non-fatal** — if it fails, the fact is still created
- Connector disconnect + purge works unchanged (deletes source facts → projection adjusts)
- `ProjectedFact` is a superset of `FactRow` — backward compatible everywhere
