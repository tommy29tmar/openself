# Agent Brain v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve the agent from reactive tool-caller to deliberative planner with rich fact model, batch operations, direct page manipulation, archetype-driven conversation, and cross-section coherence validation.

**Architecture:** Refactor chirurgico — the core fact model and tool layer are redesigned while Phase 1c (personalizer, proposals, conformity) remains intact. 5 implementation layers with strict dependencies.

**Tech Stack:** TypeScript, Vitest, SQLite/Drizzle, Vercel AI SDK v4 (streamText, generateObject), Zod

**Design doc:** `docs/plans/2026-03-01-agent-brain-v2-design.md`

> **Note (M1):** Line numbers in this plan are approximate references to the codebase at time of writing. They may drift as earlier tasks modify files. Always verify the target location before editing.

> **Note (M3):** FACT_SCHEMA_REFERENCE compression (~50 tokens recoverable) is not a separate task. Apply opportunistically when editing `prompts.ts` in Task 16.

---

## Layer 0: Prerequisites

### Task 1: Migration 0022 — Smart Facts v2 Schema

**Files:**
- Create: `db/migrations/0022_smart_facts_v2.sql`
- Modify: `src/lib/db/schema.ts` (facts table + sessions table)
- Modify: `src/lib/db/migrate.ts:9` (EXPECTED_SCHEMA_VERSION bump)
- Modify: `src/lib/services/kb-service.ts:62-72` (FactRow type)
- Test: `tests/evals/smart-facts-schema.test.ts`

> **C1 (post-1814e4b):** Migrations 0019-0021 already exist. This migration is numbered 0022.
>
> **C2 (post-1814e4b):** `sort_order` column already exists on `facts` (added by migration 0021 as nullable `INTEGER DEFAULT 0`). Do NOT add it again. The `sortOrder` Drizzle field already exists from commit 1814e4b.
>
> **S2 (post-1814e4b):** FactRow type is already out of sync — `sortOrder` is in the DB schema but missing from the FactRow type. This task fixes that gap AND adds the new fields.

**Step 1: Write the migration**

Create `db/migrations/0022_smart_facts_v2.sql`:

```sql
-- sort_order already exists from migration 0021. Only add new columns.
ALTER TABLE facts ADD COLUMN parent_fact_id TEXT;
ALTER TABLE facts ADD COLUMN archived_at TEXT;

ALTER TABLE sessions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';

CREATE INDEX idx_facts_parent ON facts(parent_fact_id) WHERE parent_fact_id IS NOT NULL;
CREATE INDEX idx_facts_active ON facts(archived_at) WHERE archived_at IS NULL;
```

**Step 2: Update EXPECTED_SCHEMA_VERSION**

> **NOTE (R5-S2):** `EXPECTED_SCHEMA_VERSION` in `src/lib/db/migrate.ts:9` is currently `18`. Adding migration 0022 requires bumping it to `22`. Verify current value and update accordingly.

In `src/lib/db/migrate.ts`, update:
```typescript
const EXPECTED_SCHEMA_VERSION = 22;
```

**Step 3: Update Drizzle schema**

In `src/lib/db/schema.ts`, add to the `facts` table definition (`sortOrder` should already be present from 1814e4b — verify):

```typescript
// sortOrder: integer("sort_order").default(0),  ← already exists from 1814e4b, verify present
parentFactId: text("parent_fact_id"),
archivedAt: text("archived_at"),
```

In `src/lib/db/schema.ts`, add to the `sessions` table definition:

```typescript
metadata: text("metadata").notNull().default("{}"),
```

**Step 4: Update FactRow type**

In `src/lib/services/kb-service.ts:62-72`, update to include ALL fields (fixing the existing sortOrder gap + adding new fields):

```typescript
export type FactRow = {
  id: string;
  category: string;
  key: string;
  value: unknown;
  source: string | null;
  confidence: number | null;
  visibility: string | null;
  sortOrder: number | null;    // nullable in DB (migration 0021 used DEFAULT 0 without NOT NULL)
  parentFactId: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};
```

> Note: `sortOrder` is `number | null` because migration 0021 created it as nullable. In practice, `getNextSortOrder()` populates it on create, so values are always non-null. Use `?? 0` fallback where needed.

**Step 5: Write schema test**

```typescript
// tests/evals/smart-facts-schema.test.ts
import { describe, it, expect } from "vitest";
// Test that migration runs and new columns exist (parent_fact_id, archived_at, sessions.metadata)
// Test defaults: parent_fact_id=null, archived_at=null, metadata='{}'
// Test that sort_order (pre-existing from 0021) still works
// Test FactRow includes sortOrder, parentFactId, archivedAt
```

**Step 6: Run tests**

Run: `npx vitest run tests/evals/smart-facts-schema.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add db/migrations/0022_smart_facts_v2.sql src/lib/db/schema.ts src/lib/db/migrate.ts src/lib/services/kb-service.ts tests/evals/smart-facts-schema.test.ts
git commit -m "feat: migration 0022 — parentFactId, archivedAt, sessions.metadata + fix FactRow type gap + bump EXPECTED_SCHEMA_VERSION"
```

---

### Task 1b: Session Metadata Helper

**Files:**
- Create: `src/lib/services/session-metadata.ts`
- Test: `tests/evals/session-metadata.test.ts`

> **S1:** This helper is used by 3 tasks: Task 12 (archetype caching in session), Task 13 (operation journal persistence), Task 14 (coherence issues storage). Defining it once here avoids inline duplication.

**Step 1: Write failing tests**

```typescript
// tests/evals/session-metadata.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getSessionMeta, setSessionMeta, mergeSessionMeta } from "@/lib/services/session-metadata";

describe("session-metadata helper", () => {
  it("getSessionMeta returns parsed JSON from sessions.metadata", () => {
    // session has metadata='{"archetype":"developer"}'
    // getSessionMeta(sessionId) → { archetype: "developer" }
  });

  it("getSessionMeta returns {} for default metadata", () => {
    // session has metadata='{}'
    // getSessionMeta(sessionId) → {}
  });

  it("setSessionMeta writes entire metadata object", () => {
    // setSessionMeta(sessionId, { archetype: "developer" })
    // getSessionMeta(sessionId) → { archetype: "developer" }
  });

  it("mergeSessionMeta merges without overwriting existing keys", () => {
    // session has metadata='{"archetype":"developer"}'
    // mergeSessionMeta(sessionId, { coherenceIssues: [...] })
    // result → { archetype: "developer", coherenceIssues: [...] }
  });

  it("mergeSessionMeta can delete a key by setting to undefined", () => {
    // session has metadata='{"archetype":"developer","stale":true}'
    // mergeSessionMeta(sessionId, { stale: undefined })
    // result → { archetype: "developer" }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/session-metadata.test.ts`
Expected: FAIL

**Step 3: Implement**

Create `src/lib/services/session-metadata.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export type SessionMeta = Record<string, unknown>;

export function getSessionMeta(sessionId: string): SessionMeta {
  const row = db.select({ metadata: sessions.metadata })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row?.metadata) return {};
  try { return JSON.parse(row.metadata); } catch { return {}; }
}

export function setSessionMeta(sessionId: string, meta: SessionMeta): void {
  db.update(sessions)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(sessions.id, sessionId))
    .run();
}

// NOTE (R5-S5): mergeSessionMeta has a read-modify-write pattern that is theoretically
// susceptible to race conditions. For single-user SQLite with WAL mode this is safe in
// practice (one writer at a time), but if we ever move to multi-process writes, consider
// using a SQL JSON_PATCH or a CAS pattern.
export function mergeSessionMeta(sessionId: string, partial: Record<string, unknown>): SessionMeta {
  const current = getSessionMeta(sessionId);
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete current[k];
    else current[k] = v;
  }
  setSessionMeta(sessionId, current);
  return current;
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/session-metadata.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: session-metadata helper — get/set/merge for sessions.metadata JSON"
```

---

## Layer 1: Data Layer Changes

### Task 2: Archived Fact Filtering + getActiveFacts() Helper

**Files:**
- Modify: `src/lib/services/kb-service.ts:293-331` (getAllFacts, getFactsByCategory, searchFacts, countFacts, getFactByKey)
- Test: `tests/evals/archived-facts.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/archived-facts.test.ts
import { describe, it, expect, beforeEach } from "vitest";

describe("archived fact filtering", () => {
  // Setup: create 3 facts, archive 1

  it("getActiveFacts excludes archived facts", () => {
    // fact with archived_at set should not appear
  });

  it("getActiveFacts includes facts with archived_at = null", () => {
    // normal facts should appear
  });

  it("getFactById returns archived facts (for unarchive)", () => {
    // getFactById should NOT filter by archived_at
  });

  it("searchFacts excludes archived facts", () => {
    // archived facts should not appear in search results
  });

  it("getFactsByCategory excludes archived facts", () => {
    // archived facts should not appear in category results
  });

  it("countFacts excludes archived facts", () => {
    // count should not include archived facts
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/archived-facts.test.ts`
Expected: FAIL

**Step 3: Implement getActiveFacts and add WHERE clauses**

In `src/lib/services/kb-service.ts`:

1. Add `WHERE archived_at IS NULL` to: `getAllFacts()`, `getFactsByCategory()`, `searchFacts()`, `countFacts()`, `getFactByKey()`
2. Create `getActiveFacts(sessionId | readKeys)` as the public wrapper
3. Make raw `getAllFacts()` private (rename to `_getAllFactsIncludingArchived()`)
4. `getFactById()` does NOT filter (needed for unarchive + display)

Use Drizzle's `isNull(facts.archivedAt)` in WHERE clauses.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/archived-facts.test.ts`
Expected: PASS

**Step 5: Update production callers**

Run: `grep -r "getAllFacts" src/` to find all production code importing `getAllFacts`. Key callers to migrate to `getActiveFacts`:
- `src/lib/services/page-projection.ts`
- `src/lib/agent/context.ts`
- `src/lib/worker/heartbeat.ts`
- Any other files in `src/` that import `getAllFacts`

Replace all production imports with `getActiveFacts`. Only `_getAllFactsIncludingArchived()` should remain (internal to kb-service).

**Step 6: Update existing tests**

Run: `npx vitest run`
Fix any tests that broke due to `getAllFacts` being made private — change imports to `getActiveFacts`.

**Step 7: Commit**

```bash
git commit -m "feat: archived fact filtering — getActiveFacts() replaces getAllFacts()"
```

---

### Task 3: FactConstraintError + Current Uniqueness

**Files:**
- Create: `src/lib/services/fact-constraints.ts`
- Modify: `src/lib/services/kb-service.ts:76-176` (createFact)
- Test: `tests/evals/fact-constraints.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/fact-constraints.test.ts
import { describe, it, expect } from "vitest";

describe("FactConstraintError — current uniqueness", () => {
  it("blocks creating second current experience when one exists", () => {
    // create experience with status:current
    // attempt to create another experience with status:current
    // expect FactConstraintError with code EXISTING_CURRENT
  });

  it("allows creating current experience when no current exists", () => {
    // create experience with status:past
    // create experience with status:current → should succeed
  });

  it("allows two current education facts (dual degree is valid)", () => {
    // create education with status:current
    // create another education with status:current → should succeed
  });

  it("error includes existingFactId and suggestion", () => {
    // verify error shape: { code, existingFactId, suggestion }
  });
});

describe("Cascade check — parent warnings", () => {
  it("updateFact warns when fact has children", () => {
    // create parent experience, create child project with parentFactId
    // update parent → result should include warnings array
  });

  it("deleteFact orphans children (sets parent_fact_id to null)", () => {
    // create parent + child
    // delete parent → child.parentFactId should be null
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/fact-constraints.test.ts`
Expected: FAIL

**Step 3: Create FactConstraintError class**

Create `src/lib/services/fact-constraints.ts`:

```typescript
export class FactConstraintError extends Error {
  code: "EXISTING_CURRENT" | "CASCADE_WARNING";
  existingFactId?: string;
  suggestion: string;

  constructor(opts: { code: FactConstraintError["code"]; existingFactId?: string; suggestion: string }) {
    super(`Fact constraint: ${opts.code} — ${opts.suggestion}`);
    this.name = "FactConstraintError";
    this.code = opts.code;
    this.existingFactId = opts.existingFactId;
    this.suggestion = opts.suggestion;
  }
}

export const CURRENT_UNIQUE_CATEGORIES = new Set(["experience"]);
```

**Step 4: Wire into createFact()**

In `src/lib/services/kb-service.ts:76-176`, after `validateFactValue()` call:

```typescript
// Current uniqueness check
if (CURRENT_UNIQUE_CATEGORIES.has(normalized.canonical)) {
  const val = typeof input.value === "object" ? input.value : {};
  if ((val as Record<string, unknown>).status === "current") {
    // Search for existing current fact in same category
    const existingCurrent = db.select().from(facts)
      .where(and(
        eq(facts.sessionId, sessionId),
        eq(facts.category, normalized.canonical),
        isNull(facts.archivedAt),
        sql`json_extract(value, '$.status') = 'current'`,
      )).get();
    if (existingCurrent) {
      throw new FactConstraintError({
        code: "EXISTING_CURRENT",
        existingFactId: existingCurrent.id,
        suggestion: `Update existing fact ${existingCurrent.id} to status:"past" first, then create the new one.`,
      });
    }
  }
}
```

**Step 5: Wire constraint check + cascade warning into updateFact()**

> **NOTE (R5-S1):** The constraint check (CURRENT_UNIQUE_CATEGORIES) must also run in `updateFact()`, not just `createFact()`. If a user updates `status: "past"` → `status: "current"`, the uniqueness constraint should be enforced.

In `src/lib/services/kb-service.ts`, inside `updateFact()`, after the existing fact lookup and `validateFactValue()` call:

```typescript
// Current uniqueness check (R5-S1) — analogous to createFact, with self-exclusion
if (CURRENT_UNIQUE_CATEGORIES.has(existing.category)) {
  const newVal = typeof input.value === "object" ? input.value : {};
  if ((newVal as Record<string, unknown>).status === "current") {
    const existingCurrent = db.select().from(facts)
      .where(and(
        eq(facts.sessionId, existing.sessionId),
        eq(facts.category, existing.category),
        isNull(facts.archivedAt),
        sql`json_extract(value, '$.status') = 'current'`,
        sql`${facts.id} != ${input.factId}`,  // exclude self
      )).get();
    if (existingCurrent) {
      throw new FactConstraintError({
        code: "EXISTING_CURRENT",
        existingFactId: existingCurrent.id,
        suggestion: `Another fact (${existingCurrent.id}) already has status:"current". Update it to "past" first.`,
      });
    }
  }
}

// Cascade warning: check if fact has children
const children = db.select({ count: sql<number>`count(*)` })
  .from(facts)
  .where(and(eq(facts.parentFactId, input.factId), isNull(facts.archivedAt)))
  .get();
const hasChildren = (children?.count ?? 0) > 0;
```

Then include `warnings` in the return when `hasChildren`:

```typescript
return {
  ...existing,
  value: input.value,
  updatedAt: now,
  ...(hasChildren ? { _warnings: [`This fact has ${children!.count} child fact(s) that may need updating`] } : {}),
} as FactRow;
```

> Note: `_warnings` is a transient field, not part of FactRow — the tool layer reads it and surfaces to the LLM.

**Step 6: Wire cascade into deleteFact()**

In `src/lib/services/kb-service.ts:228-265`, after deletion:

```typescript
// Orphan cleanup: detach children
db.update(facts)
  .set({ parentFactId: null })
  .where(eq(facts.parentFactId, factId))
  .run();
```

**Step 7: Run tests**

Run: `npx vitest run tests/evals/fact-constraints.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git commit -m "feat: FactConstraintError — current uniqueness per-category + cascade orphan cleanup"
```

---

### Task 4: Archetype Detection Constants

**Files:**
- Create: `src/lib/agent/archetypes.ts`
- Test: `tests/evals/archetype-detection.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/archetype-detection.test.ts
import { describe, it, expect } from "vitest";
import { detectArchetypeFromSignals, refineArchetype, ARCHETYPE_STRATEGIES } from "@/lib/agent/archetypes";

describe("detectArchetypeFromSignals", () => {
  it("detects developer from English role", () => {
    expect(detectArchetypeFromSignals("software engineer", null)).toBe("developer");
  });

  it("detects developer from Italian role", () => {
    expect(detectArchetypeFromSignals("ingegnere del software", null)).toBe("developer");
  });

  it("detects designer before executive for 'Art Director'", () => {
    expect(detectArchetypeFromSignals("Art Director", null)).toBe("designer");
  });

  it("does not classify 'Scrum Master' as student", () => {
    expect(detectArchetypeFromSignals("Scrum Master", null)).not.toBe("student");
  });

  it("detects student from 'Master degree student'", () => {
    expect(detectArchetypeFromSignals("Master degree student", null)).toBe("student");
  });

  it("falls back to generalist for unknown roles", () => {
    expect(detectArchetypeFromSignals("florist", null)).toBe("generalist");
  });

  it("uses lastUserMessage as fallback when role is null", () => {
    expect(detectArchetypeFromSignals(null, "I'm a frontend developer")).toBe("developer");
  });
});

describe("refineArchetype", () => {
  it("refines to creator when 3+ project facts dominate", () => {
    const facts = [
      { category: "project" }, { category: "project" }, { category: "project" },
      { category: "identity" }, { category: "skill" },
    ];
    expect(refineArchetype(facts as any, "developer")).toBe("creator");
  });

  it("does not refine with fewer than 5 facts", () => {
    const facts = [{ category: "project" }, { category: "project" }, { category: "project" }];
    expect(refineArchetype(facts as any, "developer")).toBe("developer");
  });

  it("does not refine when dominant category has fewer than 3 facts", () => {
    const facts = [
      { category: "project" }, { category: "project" },
      { category: "skill" }, { category: "skill" },
      { category: "identity" },
    ];
    expect(refineArchetype(facts as any, "developer")).toBe("developer");
  });

  it("does not use 'experience' category for refinement (not discriminating)", () => {
    const facts = [
      { category: "experience" }, { category: "experience" }, { category: "experience" },
      { category: "experience" }, { category: "experience" },
    ];
    // experience is NOT in CATEGORY_TO_ARCHETYPE — everyone has experience
    expect(refineArchetype(facts as any, "developer")).toBe("developer");
  });
});

describe("ARCHETYPE_STRATEGIES", () => {
  it("has strategies for all 8 archetypes", () => {
    const archetypes = ["developer", "designer", "executive", "student", "creator", "consultant", "academic", "generalist"];
    for (const a of archetypes) {
      expect(ARCHETYPE_STRATEGIES[a]).toBeDefined();
      expect(ARCHETYPE_STRATEGIES[a].explorationOrder).toBeDefined();
      expect(ARCHETYPE_STRATEGIES[a].sectionPriority).toBeDefined();
      expect(ARCHETYPE_STRATEGIES[a].toneHint).toBeTruthy();
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/archetype-detection.test.ts`
Expected: FAIL

**Step 3: Implement archetype module**

Create `src/lib/agent/archetypes.ts` with:
- `Archetype` type (8 values + generalist)
- `ARCHETYPE_SIGNALS` — regex patterns per archetype, 5 languages (en, it, de, fr, es)
- Detection order: designer → academic → executive → consultant → developer → creator → student → generalist
- `detectArchetypeFromSignals(role: string | null, lastUserMessage: string | null): Archetype`
- `refineArchetype(facts: FactRow[], currentArchetype: Archetype): Archetype` with `CATEGORY_TO_ARCHETYPE` mapping (project→creator, achievement→executive, education→academic, skill→developer, social→creator). Dominant category needs ≥3 facts.
- `ARCHETYPE_STRATEGIES` record with `explorationOrder`, `sectionPriority`, `toneHint` per archetype
- Student regex: `/master.*(?:degree|stud|thesis|program)/i` (not bare `/master\b/i`)

**Step 4: Run tests**

Run: `npx vitest run tests/evals/archetype-detection.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: archetype detection — 8 archetypes, multilingual regex, strategy templates"
```

---

## Layer 2: Composer & Projection Changes

### Task 5: sortOrder in Page Composer

**Files:**
- Modify: `src/lib/services/page-composer.ts` (build*Section functions)
- Test: `tests/evals/composer-sort-order.test.ts`

> **S3 (post-1814e4b):** `getAllFacts()` already ORDER BY sort_order ASC, created_at ASC (from commit 1814e4b). The `sortFacts()` helper added here is defense-in-depth for code paths that construct fact arrays manually (e.g., filtered subsets, tests). It does not duplicate the DB ordering — it ensures correctness regardless of fact source.

**Step 1: Write failing tests**

```typescript
// tests/evals/composer-sort-order.test.ts
import { describe, it, expect } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";

describe("sortOrder in page composition", () => {
  it("skills section respects sortOrder", () => {
    const facts = [
      { id: "s1", category: "skill", key: "react", value: { name: "React" }, sortOrder: 2, visibility: "public" },
      { id: "s2", category: "skill", key: "ts", value: { name: "TypeScript" }, sortOrder: 0, visibility: "public" },
      { id: "s3", category: "skill", key: "node", value: { name: "Node.js" }, sortOrder: 1, visibility: "public" },
      // ... identity fact for hero
    ];
    const page = composeOptimisticPage(facts as any, "test", "en");
    const skills = page.sections.find(s => s.type === "skills");
    const items = (skills?.content as any)?.groups?.[0]?.skills;
    expect(items).toEqual(["TypeScript", "Node.js", "React"]);
  });

  it("experience section respects sortOrder", () => {
    // Similar: create 3 experience facts with sortOrder 2, 0, 1
    // Verify they appear in order 0, 1, 2 in the section content
  });

  it("falls back to createdAt when sortOrder is equal", () => {
    // Two facts with sortOrder=0, different createdAt
    // Earlier createdAt should come first
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/composer-sort-order.test.ts`
Expected: FAIL

**Step 3: Add sorting to build*Section functions**

In `src/lib/services/page-composer.ts`, add a helper:

```typescript
function sortFacts(factsArr: FactRow[]): FactRow[] {
  return [...factsArr].sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
}
```

Apply `sortFacts()` in every `build*Section()` function after category grouping, BEFORE building content arrays. Key locations:
- `buildSkillsSection()` — sort skill facts before building groups
- `buildExperienceSection()` — sort experience facts before building items
- `buildProjectsSection()` — sort project facts before building items
- `buildInterestsSection()` — sort interest facts
- All other section builders that iterate over fact arrays

**Step 4: Run tests**

Run: `npx vitest run tests/evals/composer-sort-order.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass (sortOrder defaults to 0, preserving current behavior)

**Step 6: Commit**

```bash
git commit -m "feat: sortOrder in page composer — facts ordered by sort_order ASC, createdAt ASC"
```

---

### Task 6: parentFactId Grouping in Composer

**Files:**
- Modify: `src/lib/services/page-composer.ts` (buildExperienceSection, buildProjectsSection)
- Test: `tests/evals/composer-parent-grouping.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/composer-parent-grouping.test.ts
import { describe, it, expect } from "vitest";

describe("parentFactId grouping", () => {
  it("projects with parentFactId appear under their parent experience", () => {
    const facts = [
      { id: "exp1", category: "experience", key: "acme", value: { role: "Dev", company: "Acme", status: "current" }, parentFactId: null },
      { id: "proj1", category: "project", key: "alpha", value: { name: "Alpha" }, parentFactId: "exp1" },
      { id: "proj2", category: "project", key: "beta", value: { name: "Beta" }, parentFactId: null },
      // ... identity fact
    ];
    const page = composeOptimisticPage(facts as any, "test", "en");
    // proj1 should be nested under exp1 in experience section
    // proj2 should appear in projects section as top-level
  });

  it("orphaned children (parentFactId points to non-existent fact) are treated as top-level", () => {
    // project with parentFactId = "deleted-fact-id" → top-level in projects
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/composer-parent-grouping.test.ts`
Expected: FAIL

**Step 3: Implement parent grouping**

In `src/lib/services/page-composer.ts`:

1. After grouping by category, build a parent-child index:
```typescript
const childrenOf = new Map<string, FactRow[]>();
for (const fact of allFacts) {
  if (fact.parentFactId) {
    const children = childrenOf.get(fact.parentFactId) ?? [];
    children.push(fact);
    childrenOf.set(fact.parentFactId, children);
  }
}
```

2. In `buildExperienceSection()`: for each experience fact, look up `childrenOf.get(expFact.id)` to find child projects. Include them as `relatedProjects` in the experience item content.

3. In `buildProjectsSection()`: exclude project facts that have a `parentFactId` pointing to an existing experience fact (they're shown under experience instead). Only include top-level projects (parentFactId is null OR points to non-existent fact).

**Step 4: Run tests**

Run: `npx vitest run tests/evals/composer-parent-grouping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: parentFactId grouping — child projects appear under parent experience"
```

---

### Task 7: Slot Carry-Over in projectCanonicalConfig + Soft-Pin in assignSlotsFromFacts

**Files:**
- Modify: `src/lib/services/page-projection.ts:39-93` (projectCanonicalConfig)
- Modify: `src/lib/layout/assign-slots.ts:19+` (assignSlotsFromFacts — add draftSlots param)
- Test: `tests/evals/slot-carry-over.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/slot-carry-over.test.ts
import { describe, it, expect } from "vitest";

describe("slot carry-over", () => {
  it("preserves section.slot from draft after recompose", () => {
    // Setup: draft has skills-1 in slot "sidebar"
    // Recompose via projectCanonicalConfig with draftMeta
    // Result: skills-1 should still be in "sidebar"
  });

  it("does not carry over slot if slot does not exist in current template", () => {
    // Setup: draft has skills-1 in slot "sidebar" (sidebar-left template)
    // Switch to vertical template (no "sidebar" slot)
    // Result: skills-1 gets reassigned to "main"
  });

  it("does not carry over slot if section type not accepted by target slot", () => {
    // Setup: draft has timeline-1 in slot "sidebar"
    // sidebar doesn't accept "timeline"
    // Result: timeline-1 falls to Phase 3
  });

  it("respects slot capacity — does not over-assign", () => {
    // Setup: slot "feature-left" has maxSections: 1
    // Draft has 2 sections assigned to "feature-left"
    // First gets carry-over, second falls to Phase 3
  });

  it("new sections (not in draft) go through Phase 2-3 as before", () => {
    // Setup: draft has hero + skills, new fact creates projects section
    // projects should be assigned via Phase 3 (not carry-over)
  });
});

describe("assignSlotsFromFacts — soft-pin", () => {
  it("assigns section to draftSlot when valid and has capacity", () => {
    // draftSlots: Map(["skills-1", "sidebar"])
    // sidebar accepts skills, has capacity → assign to sidebar
  });

  it("falls through to Phase 3 when draftSlot is invalid", () => {
    // draftSlots: Map(["skills-1", "nonexistent"])
    // nonexistent slot → Phase 3 assigns to first compatible
  });

  it("falls through when draftSlot is full", () => {
    // draftSlots: Map(["skills-1", "feature-left"])
    // feature-left already at max capacity → Phase 3
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/slot-carry-over.test.ts`
Expected: FAIL

**Step 3: Implement soft-pin in assignSlotsFromFacts**

In `src/lib/layout/assign-slots.ts`, add optional parameter:

```typescript
export function assignSlotsFromFacts(
  template: LayoutTemplateDefinition,
  sections: Section[],
  locks?: Map<string, SectionLock>,
  options?: { repair?: boolean },
  draftSlots?: Map<string, string>,  // NEW: sectionId → slotId from previous draft
): AssignResult
```

Add a `isSlotValid` helper (local to this module):

```typescript
/** Check slot exists, accepts the section type, and has remaining capacity */
function isSlotValid(
  slotId: string,
  sectionType: string,
  template: LayoutTemplateDefinition,
  slotUsage: Map<string, number>,
): boolean {
  const slot = template.slots.find(s => s.id === slotId);
  if (!slot) return false;
  if (!slot.accepts.includes(sectionType as any)) return false;
  const used = slotUsage.get(slotId) ?? 0;
  if (slot.maxSections && used >= slot.maxSections) return false;
  return true;
}
```

In Phase 1, extend the lock check to also handle soft-pins:

```typescript
// Phase 1: locked sections AND soft-pinned sections
const slotUsage = new Map<string, number>(); // track consumed capacity

for (const section of sections) {
  const lock = locks?.get(section.id) ?? section.lock;
  const draftSlot = draftSlots?.get(section.id);

  if (lock?.position && section.slot) {
    // Hard lock: keep slot unconditionally
    consumeSlot(section.slot, slotUsage);
    result.push(section);
  } else if (draftSlot && isSlotValid(draftSlot, section.type, template, slotUsage)) {
    // Soft-pin: keep draft slot if valid + has capacity
    section.slot = draftSlot;
    consumeSlot(draftSlot, slotUsage);
    result.push(section);
  } else {
    unassigned.push(section);
  }
}
```

**Step 4: Implement carry-over in projectCanonicalConfig**

> **CRITICAL (C3):** `composeOptimisticPage()` already calls `assignSlotsFromFacts()` internally.
> Calling it again in `projectCanonicalConfig()` would be a double-run.
> Solution: pass `draftSlots` into `composeOptimisticPage()` so the FIRST call already applies soft-pins.
> This avoids re-running the entire Phase 1→2→3 pipeline twice.

In `src/lib/services/page-composer.ts`, update `composeOptimisticPage()` signature to accept optional `draftSlots`:

```typescript
export function composeOptimisticPage(
  facts: FactRow[],
  username: string,
  language: string,
  layoutTemplate?: LayoutTemplateId,
  draftSlots?: Map<string, string>,  // NEW: carry-over from previous draft
): PageConfig
```

Pass `draftSlots` through to `assignSlotsFromFacts()` at the point where it's called inside `composeOptimisticPage`.

In `src/lib/services/page-projection.ts:39-93`, build the `draftSlots` map and pass it through:

```typescript
// 5. Build draftSlots map for carry-over
const draftSlots = new Map<string, string>();
if (draftMeta) {
  for (const ds of draftMeta.sections) {
    if (ds.slot) draftSlots.set(ds.id, ds.slot);
  }
}

// Pass draftSlots through to composeOptimisticPage (which passes them to assignSlotsFromFacts)
const composed = composeOptimisticPage(
  publishable, username, factLanguage,
  draftMeta?.layoutTemplate,
  draftSlots.size > 0 ? draftSlots : undefined,
);
```

> This replaces the naive approach of re-running assignSlotsFromFacts a second time.
> The `draftSlots` parameter flows: `projectCanonicalConfig` → `composeOptimisticPage` → `assignSlotsFromFacts`.

**Step 5: Run tests**

Run: `npx vitest run tests/evals/slot-carry-over.test.ts`
Expected: PASS

**Step 6: Run existing assign-slots tests**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: All still pass (draftSlots defaults to undefined, preserving current behavior)

**Step 7: Commit**

```bash
git commit -m "feat: slot carry-over — soft-pin in assignSlotsFromFacts + projectCanonicalConfig preservation"
```

---

### Task 8a: batch_facts Tool (replaces create_facts)

**Files:**
- Modify: `src/lib/agent/tools.ts:36+` (add batch_facts, DELETE create_facts, + FactConstraintError handling in create/update)
- Delete: `tests/evals/batch-create-facts.test.ts` (269 lines — replaced by batch-facts-tool.test.ts)
- Test: `tests/evals/batch-facts-tool.test.ts`

> **C3 (post-1814e4b):** `create_facts` tool exists from commit 1814e4b (create-only, non-atomic, partial success). `batch_facts` is architecturally superior (create+update+delete, all-or-nothing transaction). **batch_facts REPLACES create_facts.** Remove `create_facts` from tools.ts entirely — having both would confuse the LLM.

**Step 1: Write failing tests**

```typescript
// tests/evals/batch-facts-tool.test.ts
import { describe, it, expect } from "vitest";

describe("batch_facts tool", () => {
  it("creates multiple facts in a single transaction", () => {
    // batch 3 create operations → all should exist
  });

  it("single recompose after batch (not per-operation)", () => {
    // verify recomposeAfterMutation called once, not 3 times
  });

  it("rolls back all operations if one fails validation", () => {
    // batch: [valid create, valid create, invalid create (placeholder value)]
    // all 3 should fail — first two should NOT be persisted
  });

  it("respects constraint layer within batch", () => {
    // batch: [create experience current, create experience current]
    // second should trigger EXISTING_CURRENT → entire batch fails
  });

  it("rejects batches over 20 operations", () => {
    // 21 operations → error
  });

  it("returns summary with counts", () => {
    // batch: [2 creates, 1 update, 1 delete]
    // result: { success: true, created: 2, updated: 1, deleted: 1 }
  });

  // Edge cases (R5-M1)
  it("handles empty operations array (0 ops)", () => {
    // batch: [] → { success: true, created: 0, updated: 0, deleted: 0 }
  });

  it("handles single operation (degenerate batch)", () => {
    // batch: [1 create] → should work identically to create_fact
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/batch-facts-tool.test.ts`
Expected: FAIL

**Step 3: Implement batch_facts tool**

In `src/lib/agent/tools.ts`, inside the `createAgentTools()` closure:

> **CRITICAL (C1):** `batch_facts` MUST call kb-service functions directly (`createFact`, `updateFact`, `deleteFact` from `kb-service.ts`), NOT the tool wrappers (which each trigger `recomposeAfterMutation`). The tool layer performs ONE recompose at the end of the batch, not N recomposes per operation.

```typescript
batch_facts: tool({
  description: "Execute multiple fact operations atomically (all-or-nothing).",
  parameters: z.object({
    operations: z.array(z.object({
      action: z.enum(["create", "update", "delete"]),
      // create: category, key, value required
      // update: factId, value required
      // delete: factId required
      category: z.string().optional(),
      key: z.string().optional(),
      value: z.record(z.unknown()).optional(),
      factId: z.string().optional(),
      source: z.string().optional(),
      confidence: z.number().optional(),
    })).max(20),
  }),
  execute: async ({ operations }) => {
    try {
      let created = 0, updated = 0, deleted = 0;

      // CRITICAL (R5-C1): createFact is async (uses `await normalizeCategory()`),
      // but db.transaction() in better-sqlite3 is synchronous.
      // Solution: pre-normalize all categories BEFORE the transaction,
      // then use sync-only DB calls inside the transaction.
      //
      // Step 1: Pre-normalize categories for all "create" operations
      const normalizedCategories = new Map<number, string>();
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (op.action === "create") {
          const normalized = await normalizeCategory(op.category!, taxonomyStore);
          normalizedCategories.set(i, normalized.canonical);
        }
      }

      // Step 2: Run all DB mutations in a sync transaction
      // NOTE: requires `import { db } from "@/lib/db"` at top of tools.ts
      // Inside the transaction, call SYNC kb-service internals directly:
      // - For "create": use db.insert(facts) directly (not async createFact)
      //   with the pre-normalized category. Apply validateFactValue() and
      //   constraint checks before the insert.
      // - For "update": updateFact is already sync — safe to call directly.
      // - For "delete": deleteFact is already sync — safe to call directly.
      db.transaction(() => {
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          switch (op.action) {
            case "create": {
              const canonical = normalizedCategories.get(i)!;
              // Validate + constraint check + insert (all sync)
              validateFactValue(canonical, op.key!, op.value!);
              // (CURRENT_UNIQUE_CATEGORIES check here)
              // db.insert(facts).values({...}).onConflictDoUpdate({...}).run();
              created++;
              break;
            }
            case "update":
              updateFact({ factId: op.factId!, value: op.value! }, sessionId, readKeys);
              updated++;
              break;
            case "delete":
              deleteFact(op.factId!, sessionId, readKeys);
              deleted++;
              break;
          }
        }
      })();

      // Circuito G: Trust ledger — log batch with reverse payload
      // reverseOps is built during the transaction: collect created factIds for
      // delete, old values for update, old facts for re-create on delete.
      logTrustAction(ownerKey, "batch_facts",
        `Batch: ${created} created, ${updated} updated, ${deleted} deleted`,
        { undoPayload: { action: "reverse_batch", reverseOps } },
      );

      // Single recompose after entire batch
      recomposeAfterMutation();

      return { success: true, created, updated, deleted };
    } catch (err) {
      if (err instanceof FactValidationError) {
        return { success: false, error: "VALIDATION_ERROR", message: err.message, hint: "Entire batch rolled back — no operations were applied" };
      }
      if (err instanceof FactConstraintError) {
        return { success: false, code: err.code, existingFactId: err.existingFactId, suggestion: err.suggestion, hint: "Entire batch rolled back — no operations were applied" };
      }
      throw err;
    }
  },
}),
```

Also update existing `create_fact` and `update_fact` try/catch blocks to handle `FactConstraintError`:
```typescript
} catch (err) {
  if (err instanceof FactValidationError) { ... }
  if (err instanceof FactConstraintError) {
    return { success: false, code: err.code, existingFactId: err.existingFactId, suggestion: err.suggestion };
  }
  throw err;
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/batch-facts-tool.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: batch_facts tool — atomic multi-operation with single recompose"
```

---

### Task 8b: archive_fact, unarchive_fact, reorder_items Tools (reorder_items replaces reorder_section_items)

**Files:**
- Modify: `src/lib/agent/tools.ts` (add 3 tools, DELETE reorder_section_items)
- Modify: `src/lib/services/kb-service.ts` (DELETE updateFactSortOrder — reorder_items uses factId-based updates, not key-based)
- Delete: `tests/evals/item-reorder.test.ts` (252 lines — replaced by reorder-items-tool.test.ts)
- Test: `tests/evals/archive-fact-tool.test.ts`
- Test: `tests/evals/reorder-items-tool.test.ts`

> **C4 (post-1814e4b):** `reorder_section_items` tool exists from commit 1814e4b (category+orderedKeys, no composite section guard). `reorder_items` adds guards and uses factIds instead of keys. **reorder_items REPLACES reorder_section_items.** Remove `reorder_section_items` from tools.ts and `updateFactSortOrder()` from kb-service.ts.

**Step 1: Write failing tests for archive/unarchive**

```typescript
// tests/evals/archive-fact-tool.test.ts
import { describe, it, expect } from "vitest";

describe("archive_fact tool", () => {
  it("sets archived_at timestamp", () => {});
  it("fact disappears from getActiveFacts", () => {});
  it("orphans children (sets parent_fact_id to null)", () => {});
  it("triggers recompose — fact removed from page", () => {});
});

describe("unarchive_fact tool", () => {
  it("clears archived_at", () => {});
  it("fact reappears in getActiveFacts", () => {});
  it("triggers recompose — fact reappears on page", () => {});

  // Edge cases (R5-M1)
  it("archive_fact on already-archived fact is idempotent", () => {
    // archive already-archived → no error, archived_at unchanged or refreshed
  });
  it("unarchive_fact on non-archived fact is no-op", () => {
    // unarchive active fact → no error, fact unchanged
  });
  it("archive_fact with non-existent factId returns error", () => {
    // bad factId → { success: false, error: "FACT_NOT_FOUND" }
  });
});
```

**Step 2: Write failing tests for reorder_items**

```typescript
// tests/evals/reorder-items-tool.test.ts
import { describe, it, expect } from "vitest";

describe("reorder_items tool", () => {
  it("writes sortOrder 0, 1, 2 on specified facts", () => {});
  it("unmentioned facts keep their sortOrder", () => {});
  it("triggers single recompose", () => {});
  it("rejects composite sections (hero, bio, at-a-glance, footer)", () => {
    // expect error: "Cannot reorder items in composite section 'hero'"
  });
  it("rejects if factIds belong to different categories", () => {});

  // Edge cases (R5-M1)
  it("handles 0 factIds (empty reorder)", () => {
    // empty array → no-op, success
  });
  it("handles 1 factId (single-element reorder)", () => {
    // single fact → sets sortOrder 0, success
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/evals/archive-fact-tool.test.ts tests/evals/reorder-items-tool.test.ts`
Expected: FAIL

**Step 4: Implement 3 tools**

In `src/lib/agent/tools.ts`:

- `archive_fact`: `UPDATE facts SET archived_at = ? WHERE id = ?` + orphan cleanup + recompose + trust ledger
- `unarchive_fact`: `UPDATE facts SET archived_at = null WHERE id = ?` + recompose
- `reorder_items`: `COMPOSITE_SECTIONS` guard, then `UPDATE facts SET sort_order = ? WHERE id = ?` in loop + recompose

**Circuito E: archive_fact → Trust Ledger**

After the archive UPDATE, log to trust ledger with undo payload:

```typescript
// In archive_fact, after UPDATE and orphan cleanup:
logTrustAction(ownerKey, "archive_fact", `Archived fact ${factId}`, {
  undoPayload: { action: "unarchive_fact", factId },
});
```

In `src/lib/services/trust-ledger-service.ts`, add undo handler for `unarchive_fact`:

```typescript
// In executeUndo inside reverseTrustAction:
case "unarchive_fact":
  db.update(facts).set({ archivedAt: null }).where(eq(facts.id, payload.factId)).run();
  recomposeAfterMutation();
  break;
```

> **Architecture note (R5-M2):** `reorder_items` currently writes dense ranks (0, 1, 2, ...). A future optimization could use spaced ranks (0, 1000, 2000, ...) to allow single-row inserts between items without rewriting all sortOrders. Not needed now — the current approach is simpler and reorder_items already rewrites all ranks in the array. Consider spaced ranks if insert-between becomes a hot path.

**Step 5: Run tests**

Run: `npx vitest run tests/evals/archive-fact-tool.test.ts tests/evals/reorder-items-tool.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git commit -m "feat: archive_fact, unarchive_fact, reorder_items tools"
```

---

## Layer 3: Page Manipulation + Agent Intelligence

### Task 9: move_section Tool

**Files:**
- Modify: `src/lib/agent/tools.ts` (add move_section tool)
- Test: `tests/evals/move-section-tool.test.ts`

**Depends on:** Task 7 (slot carry-over — move_section is useless without carry-over persistence)

**Step 1: Write failing tests**

```typescript
// tests/evals/move-section-tool.test.ts
import { describe, it, expect } from "vitest";

describe("move_section tool", () => {
  it("moves section to target slot", () => {
    // setup: sidebar-left layout, skills in "main"
    // move_section("skills-1", "sidebar") → skills in sidebar
  });

  it("auto-switches widget when current doesn't fit", () => {
    // skills-list only fits "wide" → moving to "half" slot triggers widget switch
  });

  it("returns error when target slot doesn't accept section type", () => {
    // try to move timeline to sidebar (sidebar doesn't accept timeline)
  });

  it("returns error when target slot is full", () => {
    // bento feature-left has maxSections:1, already has a section
  });

  it("respects user position locks", () => {
    // section has lock.position = true, lockedBy = "user" → error
  });

  it("survives recompose after move", () => {
    // move section → create_fact → recomposeAfterMutation
    // section should still be in the moved slot (thanks to carry-over)
  });

  // Edge cases (R5-M1)
  it("move to same slot is no-op", () => {
    // section already in "main", move to "main" → success, no change
  });
  it("non-existent sectionId returns error", () => {
    // move_section("does-not-exist", "main") → SECTION_NOT_FOUND
  });
});
```

**Step 2: Run tests, verify fail**

Run: `npx vitest run tests/evals/move-section-tool.test.ts`
Expected: FAIL

**Step 3: Implement move_section**

In `src/lib/agent/tools.ts`:

```typescript
move_section: tool({
  description: "Move a section to a different layout slot.",
  parameters: z.object({
    sectionId: z.string(),
    targetSlot: z.string(),
  }),
  execute: async ({ sectionId, targetSlot }) => {
    const draft = ensureDraft();
    const section = draft.sections.find(s => s.id === sectionId);
    if (!section) return { success: false, error: "SECTION_NOT_FOUND" };

    // Check lock
    if (section.lock?.position && section.lock.lockedBy === "user") {
      return { success: false, error: "POSITION_LOCKED" };
    }

    // Get layout template
    const templateId = draft.layoutTemplate ?? "vertical";
    const template = getLayoutTemplate(templateId);
    if (!template) return { success: false, error: "NO_TEMPLATE" };

    // Validate target slot
    const slot = template.slots.find(s => s.id === targetSlot);
    if (!slot) return { success: false, error: "SLOT_NOT_FOUND", available: template.slots.map(s => s.id) };
    if (!slot.accepts.includes(section.type as any)) {
      return { success: false, error: "TYPE_NOT_ACCEPTED", accepted: slot.accepts };
    }

    // Check capacity
    const currentInSlot = draft.sections.filter(s => s.slot === targetSlot).length;
    if (slot.maxSections && currentInSlot >= slot.maxSections) {
      return { success: false, error: "SLOT_FULL", current: currentInSlot, max: slot.maxSections };
    }

    // Auto-switch widget if needed
    const previousWidget = section.widgetId;
    let widgetChanged = false;
    if (section.widgetId) {
      const currentWidget = getWidgetById(section.widgetId);
      if (currentWidget && !currentWidget.fitsIn.includes(slot.size)) {
        const better = getBestWidget(section.type, slot.size);
        if (better) {
          section.widgetId = better.id;
          widgetChanged = true;
        }
      }
    }

    // Apply move
    // NOTE (R5-C2): `username` is NOT in the createAgentTools closure — it's a
    // parameter on individual tools like set_theme. Use the draft's own username
    // (same pattern as recomposeAfterMutation which uses currentDraft?.username ?? "draft").
    section.slot = targetSlot;
    upsertDraft(draft.username ?? "draft", { ...draft }, sessionId);

    return {
      success: true,
      movedTo: targetSlot,
      widgetChanged,
      ...(widgetChanged ? { previousWidget, newWidget: section.widgetId } : {}),
    };
  },
}),
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/move-section-tool.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: move_section tool — cross-slot section movement with auto-widget-switch"
```

---

### Task 10: Fix reorder_sections + maxSteps 10 → 8

**Files:**
- Modify: `src/lib/agent/tools.ts` (reorder_sections, around line 331-365)
- Modify: `src/app/api/chat/route.ts:259` (maxSteps)
- Test: `tests/evals/reorder-sections-fix.test.ts`

> **S1 (post-1814e4b):** maxSteps is currently 10 (changed from 5 in commit 1814e4b). With `batch_facts` replacing individual calls, 8 is sufficient — 10 was needed without batch but is now excessive (doubles worst-case LLM cost for marginal benefit). Reduce 10 → 8.

**Step 1: Write failing test**

```typescript
// tests/evals/reorder-sections-fix.test.ts
import { describe, it, expect } from "vitest";

describe("reorder_sections — slot validation", () => {
  it("returns warnings when reorder creates slot incompatibility", () => {
    // reorder sections such that a section ends up in incompatible position
    // expect { success: true, warnings: [...] }
  });
});
```

**Step 2: Implement fix**

> **NOTE (R5-S3):** `groupSectionsBySlot()` only groups sections by slot — it does NOT produce validation warnings. For slot compatibility validation, use `toSlotAssignments()` from `src/lib/layout/validate-adapter.ts` (which calls the quality validator internally) or call `validateLayout()` from `src/lib/layout/quality.ts` directly. The validator returns `{errors, warnings}`. Include non-empty warnings in the result.

In `src/lib/agent/tools.ts`, the `reorder_sections` tool: after reordering the array, run the reordered config through `validateLayout()` from `quality.ts`. If `warnings.length > 0`, include as warnings in result (non-blocking).

In `src/app/api/chat/route.ts:259`, change `maxSteps: 10` to `maxSteps: 8`.

**Step 3: Run tests**

Run: `npx vitest run tests/evals/reorder-sections-fix.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git commit -m "fix: reorder_sections slot validation + maxSteps 10→8"
```

---

### Task 11: Planning Protocol (replaces actionAwarenessPolicy)

**Files:**
- Create: `src/lib/agent/policies/planning-protocol.ts`
- Modify: `src/lib/agent/policies/action-awareness.ts` → DELETE
- Modify: `src/lib/agent/prompts.ts:277-333` (buildSystemPrompt — replace actionAwarenessPolicy import+call with planningProtocol)
- Test: `tests/evals/planning-protocol.test.ts`

**Step 1: Write test**

```typescript
// tests/evals/planning-protocol.test.ts
import { describe, it, expect } from "vitest";
import { planningProtocol } from "@/lib/agent/policies/planning-protocol";
import { buildSystemPrompt } from "@/lib/agent/prompts";

describe("Planning Protocol", () => {
  it("returns non-empty string", () => {
    expect(planningProtocol()).toBeTruthy();
  });

  it("includes SIMPLE/COMPOUND/STRUCTURAL classification", () => {
    const text = planningProtocol();
    expect(text).toContain("SIMPLE");
    expect(text).toContain("COMPOUND");
    expect(text).toContain("STRUCTURAL");
  });

  it("mentions batch_facts", () => {
    const text = planningProtocol();
    expect(text).toContain("batch_facts");
  });

  it("is included in buildSystemPrompt", () => {
    // build a mock bootstrap, check that system prompt contains planning protocol
  });

  it("actionAwarenessPolicy is NOT in buildSystemPrompt", () => {
    // verify the old policy is gone
  });
});
```

**Step 2: Implement**

Create `src/lib/agent/policies/planning-protocol.ts` with the Planning Protocol text from the design doc (Section 3A).

**Circuito H: Planning Protocol → Memory Tier 3.** Append to the protocol text:

```
After completing a COMPOUND or STRUCTURAL operation:
- Use save_memory to record the strategy and outcome
- Example: "User asked to reorganize projects by date. Used batch_facts to reorder + archive 2 old projects. Outcome: cleaner projects section."
- This helps you learn which approaches work for this user.
```

This is prompt text only (~5 lines), zero code. The agent learns to persist its own strategies.

Delete `src/lib/agent/policies/action-awareness.ts`.

Update `src/lib/agent/prompts.ts:277-333`: in `buildSystemPrompt()`, replace `actionAwarenessPolicy` import (line 11) and call with `planningProtocol` from the new module.

> Note: `actionAwarenessPolicy` is imported directly in `prompts.ts`, NOT re-exported from `policies/index.ts`. No changes needed to `index.ts`.

**Step 3: Run tests**

Run: `npx vitest run tests/evals/planning-protocol.test.ts`
Expected: PASS

Run: `npx vitest run tests/evals/action-awareness.test.ts`
Expected: This test file should be DELETED or updated to test the planning protocol instead.

Run: `npx vitest run tests/evals/build-system-prompt.test.ts`
Expected: May need updates if it checks for actionAwareness text.

**Step 4: Commit**

```bash
git commit -m "feat: Planning Protocol replaces actionAwarenessPolicy — SIMPLE/COMPOUND/STRUCTURAL classification"
```

---

### Task 12: Archetype Wiring (journey.ts + context.ts + chat route)

**Files:**
- Modify: `src/lib/agent/journey.ts:218+` (assembleBootstrapPayload — add lastUserMessage param + archetype detection)
- Modify: `src/lib/agent/context.ts:117+` (assembleContext — inject archetype block in onboarding)
- Modify: `src/app/api/chat/route.ts:128` (pass lastUserMessage to bootstrap)
- Test: `tests/evals/archetype-wiring.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/archetype-wiring.test.ts
import { describe, it, expect } from "vitest";

describe("archetype in bootstrap payload", () => {
  it("includes archetype field in BootstrapPayload", () => {
    // call assembleBootstrapPayload with role fact "software engineer"
    // expect payload.archetype === "developer"
  });

  it("uses lastUserMessage when no role fact exists", () => {
    // no identity facts, lastUserMessage = "I'm a designer"
    // expect payload.archetype === "designer"
  });

  it("saves archetype to session metadata", () => {
    // after bootstrap, session.metadata.archetype should be set
  });

  it("uses cached archetype from session on subsequent calls", () => {
    // first call detects "developer", saves to session
    // second call with different message → still "developer" (cached)
  });
});

describe("archetype → soul proposal (circuito A)", () => {
  it("proposes initial soul when no soul exists and archetype is not generalist", () => {
    // no soul profile, archetype = "developer"
    // → proposeSoulChange called with toneHint + communicationStyle
  });

  it("does NOT propose soul when one already exists", () => {
    // existing soul profile → proposeSoulChange NOT called
  });

  it("does NOT propose soul for generalist archetype", () => {
    // archetype = "generalist" → no proposal (too generic)
  });
});

describe("archetype context injection", () => {
  it("injects archetype block in onboarding mode", () => {
    // assembleContext in onboarding mode → systemPrompt contains "ARCHETYPE:"
  });

  it("does NOT inject archetype block in steady_state mode", () => {
    // assembleContext in steady_state → no "ARCHETYPE:" in systemPrompt
  });

  it("uses archetype-weighted exploration priorities (circuito C)", () => {
    // developer archetype, projects: empty, skills: thin
    // → prompt contains "EXPLORATION PRIORITIES" with projects before skills
  });

  it("includes richness classification per exploration category", () => {
    // each priority line should show empty/thin/adequate
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/archetype-wiring.test.ts`
Expected: FAIL

**Step 3: Implement**

1. `src/lib/agent/journey.ts`: update `assembleBootstrapPayload` signature to accept `lastUserMessage?: string`. After detecting journey state:
   - Call `detectArchetypeFromSignals(role, lastUserMessage)` for initial detection
   - Call `refineArchetype(facts, rawArchetype)` to refine based on accumulated facts (only meaningful when ≥5 facts exist; identity function otherwise)
   - Save to session metadata via `mergeSessionMeta(sessionId, { archetype })` (from Task 1b)
   - Return archetype in payload

2. **Circuito A: Archetype → Soul.** In `assembleBootstrapPayload`, after archetype detection:

```typescript
// Propose initial soul from archetype when no soul exists
const soul = getActiveSoul(ownerKey);
if (!soul && archetype !== "generalist") {
  const strategy = ARCHETYPE_STRATEGIES[archetype];
  proposeSoulChange(ownerKey, {
    tone: strategy.toneHint,
    communicationStyle: strategy.communicationStyle, // NEW field in ARCHETYPE_STRATEGIES
  }, `Auto-suggested from detected archetype: ${archetype}`);
}
```

> Requires adding `communicationStyle: string` to each entry in `ARCHETYPE_STRATEGIES` (Task 4). Examples: developer → "technical, concrete", designer → "visual, evocative", academic → "precise, nuanced".

3. **Circuito C: Archetype × Richness → Weighted Exploration.** In `src/lib/agent/context.ts`, replace the static richnessBlock with archetype-weighted exploration priorities:

```typescript
// BEFORE (static):
// "SECTION RICHNESS: skills: thin, projects: empty, experience: rich"

// AFTER (archetype-weighted):
const archetype = bootstrap?.archetype ?? "generalist";
const strategy = ARCHETYPE_STRATEGIES[archetype];
const weighted = strategy.explorationOrder
  .map(category => ({ category, richness: classifySectionRichness(publishable, category) }))
  .filter(x => x.richness !== "rich");

// Output format:
// "EXPLORATION PRIORITIES (developer profile):
//  1. projects: empty ← central to a developer's identity
//  2. skills: thin ← explore specific technologies
//  3. experience: adequate"
```

This replaces the existing richnessBlock in `assembleContext()`. The exploration order comes from the archetype strategy, not a static list.

4. `src/app/api/chat/route.ts`: extract last user message text from `messages` array, pass to `assembleBootstrapPayload()`.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/archetype-wiring.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: archetype wiring — detection in bootstrap, injection in onboarding context"
```

---

## Layer 4: Intelligence Features

### Task 13: Operation Journal

**Files:**
- Modify: `src/lib/agent/tools.ts` (journal array + journaled wrapper)
- Modify: `src/app/api/chat/route.ts` (onFinish — save journal on step exhaustion)
- Modify: `src/lib/agent/context.ts` (resume injection + TTL cleanup)
- Test: `tests/evals/operation-journal.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/operation-journal.test.ts
import { describe, it, expect } from "vitest";

describe("operation journal", () => {
  it("records tool calls in journal", () => {
    // after calling create_fact, journal should have an entry
  });

  it("journal entry includes tool name, summary, success", () => {
    // verify JournalEntry shape
  });
});

describe("journal resume injection", () => {
  it("injects INCOMPLETE_OPERATION when session has pending operations", () => {
    // set sessions.metadata.pendingOperations
    // assembleContext → system prompt should contain "INCOMPLETE_OPERATION"
  });

  it("skips injection when pendingOperations is older than 1 hour", () => {
    // set pendingOperations with old timestamp
    // assembleContext → no "INCOMPLETE_OPERATION" in prompt
  });

  it("cleans up stale pendingOperations from session metadata", () => {
    // old pendingOperations → assembleContext → metadata should be cleared
  });
});
```

**Step 2: Run tests to verify fail**

Run: `npx vitest run tests/evals/operation-journal.test.ts`
Expected: FAIL

**Step 3: Implement**

1. In `src/lib/agent/tools.ts`: add `operationJournal: JournalEntry[]` array at closure level. Each tool execute wraps its result with `operationJournal.push(...)`.

> **S2 — Journal export mechanism:** `createAgentTools()` currently returns just the tools record. Change the return type to expose the journal:
> ```typescript
> export function createAgentTools(...): { tools: Record<string, CoreTool>; getJournal: () => JournalEntry[] } {
>   const operationJournal: JournalEntry[] = [];
>   // ... tool definitions ...
>   return {
>     tools: { create_fact, update_fact, ... },
>     getJournal: () => operationJournal,
>   };
> }
> ```
> Update ALL callers of `createAgentTools()` to destructure: `const { tools, getJournal } = createAgentTools(...)`.
> **NOTE (R5-S4):** Run `grep -r "createAgentTools" src/ tests/` to find all callers. Known callers:
> - `src/app/api/chat/route.ts` (production caller)
> - Test files that construct tools for testing (may use `createAgentTools` directly)
> All must be updated or they will get a type error (receiving `{tools, getJournal}` where they expect a tools record).

2. In `src/app/api/chat/route.ts`: in `onFinish`, detect step exhaustion. In Vercel AI SDK v4, when `maxSteps` is exhausted while the model wanted another tool call, `finishReason === "tool-calls"` (NOT `"length"` — that's token limit). Use the robust check:
```typescript
// Extract constant before streamText call: const MAX_STEPS = 8;
// Then in onFinish:
if (steps.length >= MAX_STEPS && finishReason === "tool-calls" && getJournal().length > 0) {
  mergeSessionMeta(sessionId, {
    pendingOperations: { journal: getJournal(), timestamp: new Date().toISOString() },
  });
}
```

3. In `src/lib/agent/context.ts`: use `getSessionMeta()` to read `pendingOperations`. If exists and timestamp < 1 hour: inject INCOMPLETE_OPERATION block. If timestamp > 1 hour: delete via `mergeSessionMeta(sessionId, { pendingOperations: undefined })`.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/operation-journal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: operation journal — tool call tracking + resume on step exhaustion"
```

---

### Task 14: Page Coherence Check

> **Integration circuits:** I (soul-aware coherence), D1 (coherence issues → proposals instead of session.metadata)

**Files:**
- Create: `src/lib/services/coherence-check.ts`
- Modify: `src/lib/agent/tools.ts` (wire into generate_page)
- Modify: `src/lib/agent/context.ts` (inject coherence issues as situation directive)
- Modify: `src/lib/agent/policies/situations.ts` (add coherenceIssuesDirective)
- Test: `tests/evals/coherence-check.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/coherence-check.test.ts
import { describe, it, expect } from "vitest";
import { checkPageCoherence, quickCoherenceCheck, type CoherenceIssue } from "@/lib/services/coherence-check";
import type { FactRow } from "@/lib/services/kb-service";

describe("quickCoherenceCheck — deterministic", () => {
  it("detects timeline_overlap: two current experiences with overlapping dates", () => {
    // experience A: 2022-01 to present (current), experience B: 2023-06 to present (current)
    // → timeline_overlap warning
  });

  it("does not flag non-overlapping current experiences", () => {
    // experience A: 2020-01 to 2022-06 (past), experience B: 2023-01 to present (current)
    // → no timeline_overlap
  });

  it("detects role_mismatch: hero title not found among experience titles", () => {
    // hero title: "Senior Architect", experiences: ["Junior Dev", "Mid Dev"]
    // → role_mismatch warning
  });

  it("does not flag role_mismatch when hero title appears in experience", () => {
    // hero title: "Software Engineer", experiences: ["Software Engineer at Acme"]
    // → no role_mismatch
  });

  it("detects completeness_gap: section with 1 item when category has ≥3 facts", () => {
    // skills section shows 1 skill, but 3 skill facts exist (2 are low visibility)
    // → completeness_gap info
  });

  it("returns max 3 issues", () => {
    // many deterministic issues → capped at 3
  });
});

describe("checkPageCoherence — hybrid", () => {
  it("returns empty issues for coherent page", () => {
    // page with consistent role, skills, experience → no issues
  });

  it("SKILL_GAP is always severity info", () => {
    // skills not in projects → severity must be "info", never "warning"
  });

  it("LEVEL_MISMATCH is always severity info", () => {
    // seniority claim vs experience years → severity must be "info"
  });

  it("returns max 3 issues total (deterministic + LLM)", () => {
    // page with many inconsistencies → capped at 3
  });

  it("only runs on pages with 3+ content sections", () => {
    // page with only hero + footer → should return empty/skip
  });

  it("skips LLM when deterministic check already found ≥3 issues", () => {
    // quickCoherenceCheck returns 3 issues → generateObject NOT called
  });

  it("skips LLM when page has <5 content sections", () => {
    // 3-4 content sections → deterministic only, no LLM call
  });

  it("deduplicates issues from deterministic + LLM by type+affectedSections", () => {
    // both layers find role_mismatch for same sections → keep one
  });

  it("passes soulCompiled to LLM prompt when provided (circuit I)", () => {
    // soul tone="professional" → coherence check considers tone alignment
    // mock generateObject, verify prompt includes soul context
  });

  it("works without soulCompiled (backward compat)", () => {
    // checkPageCoherence(sections, facts) without 3rd arg → no error
  });
});

describe("coherence → proposals integration (circuit D1)", () => {
  it("warning-severity issues create proposals instead of session.metadata", () => {
    // verify createProposal() called for each warning-severity issue
  });

  it("info-severity issues stored in session.metadata only (not proposals)", () => {
    // verify mergeSessionMeta called, createProposal NOT called for info issues
  });
});

describe("coherence situation directive", () => {
  it("coherenceIssuesDirective formats issues for system prompt", () => {
    // verify output format
  });
});
```

**Step 2: Run tests to verify fail**

Run: `npx vitest run tests/evals/coherence-check.test.ts`
Expected: FAIL

**Step 3a: Implement deterministic quickCoherenceCheck**

Create `src/lib/services/coherence-check.ts` with types and deterministic layer:

```typescript
import { generateObject } from "ai";
import { z } from "zod";
import type { Section } from "@/lib/page-config/schema";
import type { FactRow } from "@/lib/services/kb-service";
import { getModel } from "@/lib/ai/provider"; // NOTE (R5-C3): getModel is in provider.ts, not model.ts

export type CoherenceIssue = {
  type: "role_mismatch" | "timeline_overlap" | "skill_gap" | "level_mismatch" | "completeness_gap";
  severity: "info" | "warning";
  description: string;
  suggestion: string;
  affectedSections: string[];
};

/**
 * Deterministic coherence checks — zero LLM cost, ~O(n) on facts.
 * Catches structural inconsistencies via date math, string match, and counting.
 */
export function quickCoherenceCheck(sections: Section[], facts: FactRow[]): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  // 1. timeline_overlap: two experiences with status:"current" and overlapping date ranges
  const currentExperiences = facts.filter(f =>
    f.category === "experience" && !f.archivedAt &&
    (f.value as Record<string, unknown>)?.status === "current"
  );
  if (currentExperiences.length >= 2) {
    // Check pairwise for date overlap (startDate comparison)
    for (let i = 0; i < currentExperiences.length; i++) {
      for (let j = i + 1; j < currentExperiences.length; j++) {
        const aVal = currentExperiences[i].value as Record<string, unknown>;
        const bVal = currentExperiences[j].value as Record<string, unknown>;
        const aStart = String(aVal.startDate ?? "");
        const bStart = String(bVal.startDate ?? "");
        // Both current with start dates → overlap (both run to present)
        if (aStart && bStart) {
          issues.push({
            type: "timeline_overlap",
            severity: "warning",
            description: `Two concurrent current roles: "${aVal.role ?? aVal.company}" and "${bVal.role ?? bVal.company}"`,
            suggestion: "Verify both roles are truly concurrent, or archive the ended one.",
            affectedSections: ["experience"],
          });
          break; // one overlap is enough
        }
      }
    }
  }

  // 2. role_mismatch (base): hero title not found among experience role titles
  const heroSection = sections.find(s => s.type === "hero");
  const heroTitle = heroSection ? String((heroSection.content as Record<string, unknown>)?.tagline ?? "") : "";
  if (heroTitle) {
    const expRoles = facts
      .filter(f => f.category === "experience" && !f.archivedAt)
      .map(f => String((f.value as Record<string, unknown>)?.role ?? "").toLowerCase());
    const heroLower = heroTitle.toLowerCase();
    const roleMatch = expRoles.some(r => r && (heroLower.includes(r) || r.includes(heroLower)));
    if (expRoles.length > 0 && !roleMatch) {
      issues.push({
        type: "role_mismatch",
        severity: "warning",
        description: `Hero title "${heroTitle}" doesn't match any experience role`,
        suggestion: "Update hero tagline to reflect current role, or add the matching experience.",
        affectedSections: ["hero", "experience"],
      });
    }
  }

  // 3. completeness_gap: section with 1 item when category has ≥3 active facts
  const categoryFactCounts = new Map<string, number>();
  for (const f of facts) {
    if (!f.archivedAt) {
      categoryFactCounts.set(f.category, (categoryFactCounts.get(f.category) ?? 0) + 1);
    }
  }
  for (const section of sections) {
    if (section.type === "hero" || section.type === "footer") continue;
    const content = section.content as Record<string, unknown>;
    // Count items in section content (heuristic: arrays in content)
    const arrays = Object.values(content).filter(v => Array.isArray(v));
    const itemCount = arrays.reduce((sum, arr) => sum + (arr as unknown[]).length, 0);
    // Map section type → likely category
    const categoryForSection = section.type; // simplification: type ≈ category
    const factCount = categoryFactCounts.get(categoryForSection) ?? 0;
    if (itemCount === 1 && factCount >= 3) {
      issues.push({
        type: "completeness_gap",
        severity: "info",
        description: `Section "${section.type}" shows 1 item but ${factCount} facts exist`,
        suggestion: "Check visibility settings — some facts may be hidden.",
        affectedSections: [section.id],
      });
    }
  }

  return issues.slice(0, 3);
}
```

**Step 3b: Implement hybrid checkPageCoherence (deterministic + LLM)**

Below `quickCoherenceCheck` in the same file, add the LLM layer and the hybrid orchestrator:

```typescript
const coherenceSchema = z.object({
  issues: z.array(z.object({
    type: z.enum(["role_mismatch", "timeline_overlap", "skill_gap", "level_mismatch", "completeness_gap"]),
    severity: z.enum(["info", "warning"]),
    description: z.string(),
    suggestion: z.string(),
    affectedSections: z.array(z.string()),
  })).max(3),
});

/**
 * Hybrid coherence check: deterministic first, LLM only if needed.
 *
 * - Always runs quickCoherenceCheck (zero cost).
 * - Invokes LLM only when deterministic found <3 issues AND page has ≥5 content sections.
 *   (Pages with 3-4 sections rarely have nuanced cross-section issues worth an LLM call.)
 * - Deduplicates results by type+affectedSections. Cap: 3 issues total.
 */
export async function checkPageCoherence(sections: Section[], facts: FactRow[], soulCompiled?: string): Promise<CoherenceIssue[]> {
  const contentSections = sections.filter(s => s.type !== "hero" && s.type !== "footer" && Object.keys(s.content).length > 0);
  if (contentSections.length < 3) return [];

  // Phase 1: deterministic
  const deterministicIssues = quickCoherenceCheck(sections, facts);

  // Short-circuit: if deterministic already found 3 issues, skip LLM
  if (deterministicIssues.length >= 3) return deterministicIssues.slice(0, 3);

  // Phase 2: LLM only for richer pages (≥5 content sections)
  if (contentSections.length < 5) return deterministicIssues;

  // Circuit I: pass soul context so LLM can check tone/style coherence
  const { object } = await generateObject({
    model: getModel(),
    schema: coherenceSchema,
    prompt: buildCoherencePrompt(sections, soulCompiled),
  });

  // Force severity rules on LLM output
  const llmIssues = object.issues.map(issue => ({
    ...issue,
    severity: (issue.type === "skill_gap" || issue.type === "level_mismatch") ? "info" as const : issue.severity,
  }));

  // Deduplicate: merge deterministic + LLM, dedup by type+affectedSections key
  const seen = new Set(deterministicIssues.map(i => `${i.type}:${i.affectedSections.sort().join(",")}`));
  const merged = [...deterministicIssues];
  for (const issue of llmIssues) {
    const key = `${issue.type}:${issue.affectedSections.sort().join(",")}`;
    if (!seen.has(key)) {
      merged.push(issue);
      seen.add(key);
    }
  }

  return merged.slice(0, 3);
}
```

**Step 4: Wire into generate_page**

In `src/lib/agent/tools.ts`, in the `generate_page` tool execute, after the personalization fire-and-forget block: add another fire-and-forget for coherence.

> **Circuit I:** Pass soul context to `checkPageCoherence` so LLM can detect tone/style misalignment.
> **Circuit D1:** Warning-severity issues become proposals (user-reviewable), not session.metadata. Info-severity issues still go to session.metadata for agent context only.

```typescript
if (mode === "steady_state") {
  (async () => {
    try {
      const activeFacts = getActiveFacts(sessionId, readKeys);
      // Circuit I: pass compiled soul for tone-aware coherence
      const soulCompiled = getActiveSoul(ownerKey)?.compiled;
      const issues = await checkPageCoherence(config.sections, activeFacts, soulCompiled);
      if (issues.length > 0) {
        // Circuit D1: warning issues → proposals (user-visible, reviewable)
        const warnings = issues.filter(i => i.severity === "warning");
        for (const issue of warnings) {
          createProposal(ownerKey, {
            type: "coherence",
            description: issue.description,
            suggestion: issue.suggestion,
            affectedSections: issue.affectedSections,
          }, `Coherence: ${issue.type}`);
        }
        // Info issues → session metadata only (agent context, not user-facing)
        const infos = issues.filter(i => i.severity === "info");
        if (infos.length > 0) {
          mergeSessionMeta(sessionId, { coherenceIssues: infos });
        }
      }
    } catch (err) {
      console.error("[generate_page] coherence check error:", err);
    }
  })();
}
```

**Step 5: Add situation directive**

In `src/lib/agent/policies/situations.ts`, add:

```typescript
export function coherenceIssuesDirective(issues: CoherenceIssue[]): string {
  if (issues.length === 0) return "";
  const lines = issues.map(i => `- ${i.severity}: ${i.description}\n  → ${i.suggestion}`);
  return `COHERENCE ISSUES (from last page generation):\n${lines.join("\n")}`;
}
```

Wire in `src/lib/agent/context.ts`: read coherenceIssues via `getSessionMeta(sessionId).coherenceIssues` (from Task 1b), inject via directive.

**Step 6: Run tests**

Run: `npx vitest run tests/evals/coherence-check.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git commit -m "feat: page coherence check — cross-section factual consistency validation"
```

---

### Task 15: has_archivable_facts Situation Directive

**Files:**
- Modify: `src/lib/agent/journey.ts:137+` (detectSituations — add archivable detection)
- Modify: `src/lib/agent/policies/situations.ts` (add archivableFactsDirective)
- Modify: `src/lib/agent/policies/index.ts` (wire new directive)
- Test: `tests/evals/archivable-facts-directive.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/archivable-facts-directive.test.ts
import { describe, it, expect } from "vitest";

describe("has_archivable_facts situation", () => {
  it("detects facts with relevance below 0.3", () => {
    // fact with confidence 0.5, updatedAt 200 days ago, no children
    // relevance = 0.5 × 0.2 × 1.0 = 0.1 → archivable
  });

  it("does not suggest archival if active count would drop below 5", () => {
    // 5 total facts, 2 archivable → should NOT flag (would leave 3)
  });

  it("uses correct recency factors", () => {
    // <30d: 1.0, 30-90d: 0.7, 90-180d: 0.4, >180d: 0.2
  });

  it("includes child count in relevance calculation", () => {
    // fact with 3 children → relevance multiplied by (1 + 3 × 0.1) = 1.3
  });
});
```

**Step 2: Implement**

> **M3 — Preserve separation of concerns:** `detectSituations()` is a pure detection function that receives data from its caller — it should not query the DB directly. Pre-calculate `childCounts` in `assembleBootstrapPayload()` and pass as parameter.

In `assembleBootstrapPayload()` (the caller), compute `childCounts` and pass to `detectSituations`:

> **CAUTION (R5-C4):** `assembleBootstrapPayload()` has a local variable named `facts` (the array of fact objects). The Drizzle table schema import is also `facts`. To avoid collision, alias the table import: `import { facts as factsTable } from "@/lib/db/schema"`, or compute childCounts before the local `facts` variable is declared, or use a raw SQL query.

```typescript
// In assembleBootstrapPayload, before calling detectSituations:
// Use factsTable (aliased import) to avoid collision with local `facts` variable
const childCounts = db.select({
  parentId: factsTable.parentFactId,
  count: sql<number>`count(*)`,
}).from(factsTable)
  .where(and(isNotNull(factsTable.parentFactId), isNull(factsTable.archivedAt)))
  .groupBy(factsTable.parentFactId)
  .all();
const childCountMap = new Map(childCounts.map(r => [r.parentId!, r.count]));

// Pass to detectSituations
const situations = detectSituations(...existingArgs, childCountMap);
```

In `detectSituations()`, add parameter and relevance calculation:

```typescript
// detectSituations signature gains: childCountMap?: Map<string, number>
// Archivable facts detection
if (activeFacts.length > 5) {
  const archivable = activeFacts.filter(f => {
    const recency = recencyFactor(f.updatedAt);
    const children = childCountMap?.get(f.id) ?? 0;
    const relevance = (f.confidence ?? 1.0) * recency * (1 + children * 0.1);
    return relevance < 0.3;
  });

  // Safety floor: don't suggest if it would leave fewer than 5 active facts
  if (archivable.length > 0 && activeFacts.length - archivable.length >= 5) {
    situations.push("has_archivable_facts");
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/evals/archivable-facts-directive.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git commit -m "feat: has_archivable_facts situation — relevance-based archival suggestions"
```

---

### Task 16: TOOL_POLICY + DATA_MODEL_REFERENCE Update

**Files:**
- Modify: `src/lib/agent/prompts.ts:41+` (TOOL_POLICY block)
- Modify: `src/lib/agent/prompts.ts` (DATA_MODEL_REFERENCE block — add sortOrder, parentFactId, archivedAt)
- Test: `tests/evals/tool-policy-update.test.ts`

> **M2 (post-1814e4b):** SAFETY_POLICY and TOOL_POLICY already contain additions from commit 1814e4b (anti-fabrication guards, visibility feedback guidance, `create_facts` reference, `reorder_section_items` reference, `pageVisible`/`recomposeOk` guidance). **Preserve** anti-fabrication guards and visibility feedback. **Remove** references to `create_facts` (replaced by `batch_facts`) and `reorder_section_items` (replaced by `reorder_items`). Do a careful manual merge.

**Step 1: Write test**

```typescript
// tests/evals/tool-policy-update.test.ts
import { describe, it, expect } from "vitest";

describe("TOOL_POLICY includes new tools", () => {
  it("mentions batch_facts", () => {});
  it("mentions move_section", () => {});
  it("mentions reorder_items", () => {});
  it("mentions archive_fact and unarchive_fact", () => {});
  it("mentions batch_facts is all-or-nothing", () => {});
  it("mentions identity/tagline pattern for text customization", () => {});
});

describe("DATA_MODEL_REFERENCE includes new fields", () => {
  it("mentions sortOrder", () => {});
  it("mentions parentFactId", () => {});
  it("mentions archivedAt", () => {});
  it("describes sortOrder usage for item ordering", () => {});
  it("describes parentFactId for child-parent fact relationships", () => {});
});
```

**Step 2: Update TOOL_POLICY**

Add to the TOOL_POLICY block in `src/lib/agent/prompts.ts`:

```
- Use batch_facts for multiple fact changes (all-or-nothing: validate data before calling)
- Use move_section to move a section between layout slots (auto-switches widget if needed)
- Use reorder_items to change the order of items within a section (not for composite sections: hero, bio, at-a-glance, footer)
- Use archive_fact/unarchive_fact for soft-delete/restore (prefer over delete_fact for recoverable removal)
- To customize display text (tagline, bio), create/update the corresponding fact (e.g., identity/tagline). The composer prioritizes explicit facts over derived text.
```

**Step 3: Update DATA_MODEL_REFERENCE**

In the `DATA_MODEL_REFERENCE` block in `src/lib/agent/prompts.ts`, add the new fact fields:

```
Fact fields:
- sortOrder (integer, default 0): Controls item ordering within sections. Set via reorder_items tool. Lower values appear first.
- parentFactId (text, nullable): Links child facts to parent facts (e.g., project → parent experience). Set on create_fact.
- archivedAt (text, nullable): Soft-delete timestamp. Set via archive_fact/unarchive_fact. Archived facts are hidden from page and search.
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/tool-policy-update.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "docs: TOOL_POLICY + DATA_MODEL_REFERENCE updated for Agent Brain v2"
```

---

## Layer 5: Final Integration & Test Suite

### Task 17: Full Integration Test

**Files:**
- Test: `tests/evals/agent-brain-v2-integration.test.ts`

**Step 1: Write integration test**

```typescript
// tests/evals/agent-brain-v2-integration.test.ts
import { describe, it, expect } from "vitest";

describe("Agent Brain v2 — end-to-end", () => {
  it("job change scenario: batch update old + create new + generate", () => {
    // 1. Create current experience fact
    // 2. Call batch_facts([update old to past, create new current])
    // 3. Constraint layer should NOT block (old is updated first in same batch)
    // 4. generate_page → page shows new role, old role in experience history
  });

  it("move + recompose: section stays in moved slot after fact mutation", () => {
    // 1. Create skills facts
    // 2. generate_page (sidebar-left layout)
    // 3. move_section("skills-1", "sidebar")
    // 4. create_fact (new skill) → recomposeAfterMutation
    // 5. Verify: skills-1 is STILL in "sidebar" (carry-over works)
  });

  it("reorder items: sortOrder persists through recompose", () => {
    // 1. Create 3 skill facts
    // 2. reorder_items("skills", [fact3, fact1, fact2])
    // 3. create_fact (new skill) → recomposeAfterMutation
    // 4. Verify: skills appear in order [fact3, fact1, fact2, fact4]
  });

  it("archive + unarchive roundtrip", () => {
    // 1. Create fact
    // 2. archive_fact → fact disappears from page
    // 3. unarchive_fact → fact reappears
  });

  it("archetype detection flows into context", () => {
    // 1. Create identity/role = "software engineer"
    // 2. assembleBootstrapPayload → archetype = "developer"
    // 3. assembleContext (onboarding) → prompt contains "ARCHETYPE: developer"
  });
});
```

**Step 2: Run integration tests**

Run: `npx vitest run tests/evals/agent-brain-v2-integration.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass. Fix any regressions.

**Step 4: Commit**

```bash
git commit -m "test: Agent Brain v2 integration tests — job change, move+recompose, reorder, archive"
```

---

### Task 18: Update Existing Tests

**Files:**
- Multiple test files that reference `getAllFacts` → update to `getActiveFacts`
- `tests/evals/action-awareness.test.ts` → DELETE (replaced by planning-protocol.test.ts)
- `tests/evals/agent-auto-recompose.test.ts` → update for new FactRow shape
- `tests/evals/batch-create-facts.test.ts` → DELETE (replaced by batch-facts-tool.test.ts in Task 8a)
- `tests/evals/item-reorder.test.ts` → DELETE (replaced by reorder-items-tool.test.ts in Task 8b)
- `tests/evals/journey-state-pin.test.ts` → VERIFY compatibility with sessions.metadata (these tests use the dedicated `journey_state` column, not metadata — they should still pass but verify)

> **M1 (post-1814e4b):** Commit 1814e4b added 3 test files (batch-create-facts, item-reorder, journey-state-pin) totaling ~750 lines. The first two test tools that are being replaced. The third tests journey_state column caching which is orthogonal to sessions.metadata.

**Step 1: Delete replaced test files**

```bash
rm tests/evals/batch-create-facts.test.ts tests/evals/item-reorder.test.ts
```

**Step 2: Find all test files importing getAllFacts**

Run: `grep -r "getAllFacts" tests/`

**Step 3: Update imports**

Replace `getAllFacts` with `getActiveFacts` in all test files (except any that explicitly test archived fact behavior).

**Step 4: Delete action-awareness.test.ts**

This test file tests `actionAwarenessPolicy()` which no longer exists.

**Step 5: Verify journey-state-pin tests**

Run: `npx vitest run tests/evals/journey-state-pin.test.ts`
Expected: PASS (these test the dedicated `journey_state` column, not `sessions.metadata` — orthogonal)

**Step 6: Run full suite**

Run: `npx vitest run`
Expected: ALL pass

**Step 7: Commit**

```bash
git commit -m "test: update existing tests for Smart Facts model — getActiveFacts, FactRow, tool replacements"
```

---

## Layer 5b: Integration Circuits

> Tasks 19-23 close feedback loops between new v2 systems and existing Phase 1 infrastructure.
> These are the "connective tissue" that makes the agent truly learn from its own behavior.

### Task 19: Archetype-Weighted Personalization Priority (Circuit B)

> **Circuit B:** Archetype drives personalization priority — "developer" prioritizes projects/skills, "creative" prioritizes portfolio/interests.

**Files:**
- Modify: `src/lib/services/section-personalizer.ts` (priority ordering)
- Modify: `src/lib/agent/tools.ts` (pass archetype to personalizeSections in generate_page)
- Test: `tests/evals/archetype-personalization.test.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/archetype-personalization.test.ts
import { describe, it, expect } from "vitest";

describe("archetype-weighted personalization", () => {
  it("developer archetype prioritizes projects and skills sections", () => {
    // archetype = "developer"
    // → personalizeSections receives priority order: ["projects", "skills", "experience", ...]
    // → first sections personalized are projects + skills
  });

  it("creative archetype prioritizes interests and portfolio sections", () => {
    // archetype = "creative"
    // → priority order: ["interests", "projects", "skills", ...]
  });

  it("generalist uses default section order (no reordering)", () => {
    // archetype = "generalist" or undefined
    // → sections processed in original order
  });

  it("priority only affects personalization order, not page layout", () => {
    // archetype reorders personalization calls, NOT section positions
    // → page layout unchanged
  });
});
```

**Step 2: Run test to verify fail**

Run: `npx vitest run tests/evals/archetype-personalization.test.ts`
Expected: FAIL

**Step 3: Implement priority ordering**

In `src/lib/services/section-personalizer.ts`, add archetype-based priority:

```typescript
import { ARCHETYPE_STRATEGIES } from "@/lib/agent/archetype"; // from Task 4

/**
 * Reorder sections for personalization priority based on archetype.
 * Archetype-priority sections are processed first (more LLM budget),
 * remaining sections follow in original order.
 */
function prioritizeSections(sections: Section[], archetype?: string): Section[] {
  if (!archetype || archetype === "generalist") return sections;
  const strategy = ARCHETYPE_STRATEGIES[archetype as keyof typeof ARCHETYPE_STRATEGIES];
  if (!strategy) return sections;

  const priorityTypes = new Set(strategy.explorationOrder);
  const priority = sections.filter(s => priorityTypes.has(s.type));
  const rest = sections.filter(s => !priorityTypes.has(s.type));
  return [...priority, ...rest];
}
```

Wire in `personalizeSections()`:
```typescript
export async function personalizeSections(
  sections: Section[],
  facts: FactRow[],
  soul: Soul | null,
  archetype?: string,  // new param
): Promise<Section[]> {
  const ordered = prioritizeSections(sections, archetype);
  // ... existing personalization loop over `ordered` instead of `sections`
}
```

**Step 4: Wire in generate_page**

In `src/lib/agent/tools.ts`, in the personalization fire-and-forget block:
```typescript
// existing: personalizeSections(config.sections, activeFacts, soul);
// updated: pass archetype from bootstrap
const archetype = bootstrap?.archetype;
personalizeSections(config.sections, activeFacts, soul, archetype);
```

**Step 5: Run tests**

Run: `npx vitest run tests/evals/archetype-personalization.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git commit -m "feat: archetype-weighted personalization priority (circuit B)"
```

---

### Task 20: Coherence Check in Deep Heartbeat → Proposals (Circuit D2)

> **Circuit D2:** Deep heartbeat runs coherence check and creates proposals for the user to review. This is the "self-improvement" loop — the agent reflects on its own output periodically.

**Files:**
- Modify: `src/lib/worker/heartbeat.ts` (add coherence check to deep heartbeat)
- Test: `tests/evals/heartbeat-coherence.test.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/heartbeat-coherence.test.ts
import { describe, it, expect, vi } from "vitest";

describe("deep heartbeat coherence check", () => {
  it("runs checkPageCoherence on latest draft and creates proposals for warnings", () => {
    // setup: draft with role_mismatch (hero title ≠ experience role)
    // run deep heartbeat
    // → createProposal called with type "coherence"
  });

  it("skips coherence check when no draft exists", () => {
    // no draft → checkPageCoherence NOT called
  });

  it("does not duplicate proposals already created by generate_page (circuit D1)", () => {
    // existing proposal for same coherence type+sections
    // → heartbeat skips creating duplicate
  });

  it("marks stale proposals before creating new ones", () => {
    // old coherence proposals exist
    // → markStaleProposals called first, then new proposals created
  });
});
```

**Step 2: Run test to verify fail**

Run: `npx vitest run tests/evals/heartbeat-coherence.test.ts`
Expected: FAIL

**Step 3: Implement coherence in deep heartbeat**

In `src/lib/worker/heartbeat.ts`, in `handleHeartbeatDeep()`, after the conformity check block:

```typescript
// Circuit D2: coherence check → proposals
const draft = getDraft(ownerKey);
if (draft?.config) {
  const parsed = typeof draft.config === "string" ? JSON.parse(draft.config) : draft.config;
  const activeFacts = getActiveFacts(ownerKey, readKeys);
  const soulCompiled = getActiveSoul(ownerKey)?.compiled;
  const coherenceIssues = await checkPageCoherence(parsed.sections ?? [], activeFacts, soulCompiled);
  const warnings = coherenceIssues.filter(i => i.severity === "warning");
  if (warnings.length > 0) {
    // Mark old coherence proposals stale before creating new ones
    markStaleProposals(ownerKey, "coherence");
    for (const issue of warnings) {
      createProposal(ownerKey, {
        type: "coherence",
        description: issue.description,
        suggestion: issue.suggestion,
        affectedSections: issue.affectedSections,
      }, `Heartbeat coherence: ${issue.type}`);
    }
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/heartbeat-coherence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: coherence check in deep heartbeat → proposals (circuit D2)"
```

---

### Task 21: Journal Enrichment in Summary Generation (Circuit F1)

> **Circuit F1:** Operation journal entries feed into conversation summaries. When generateSummary runs, it includes a digest of recent tool operations so summaries capture what the agent *did*, not just what was said.

**Files:**
- Modify: `src/lib/services/summary-service.ts` (inject journal digest into summary prompt)
- Test: `tests/evals/journal-summary.test.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/journal-summary.test.ts
import { describe, it, expect } from "vitest";

describe("journal enrichment in summaries", () => {
  it("includes journal digest in summary when journal entries exist", () => {
    // messages: user asked to update bio
    // journal: [create_fact(identity/role), generate_page]
    // → summary includes "Updated identity role and regenerated page"
  });

  it("omits journal section when no journal entries", () => {
    // pure conversation, no tool calls
    // → summary has no "Actions taken" section
  });

  it("journal digest is max 3 lines regardless of entry count", () => {
    // 10 journal entries → digest compressed to 3 lines
  });
});
```

**Step 2: Run test to verify fail**

Run: `npx vitest run tests/evals/journal-summary.test.ts`
Expected: FAIL

**Step 3: Implement journal digest injection**

In `src/lib/services/summary-service.ts`, before the LLM call in `generateSummary()`:

```typescript
/**
 * Compress journal entries into a max-3-line digest for summary enrichment.
 */
function buildJournalDigest(journal: JournalEntry[]): string {
  if (journal.length === 0) return "";
  // Group by tool name, count operations
  const toolCounts = new Map<string, number>();
  for (const entry of journal) {
    toolCounts.set(entry.toolName, (toolCounts.get(entry.toolName) ?? 0) + 1);
  }
  const lines = Array.from(toolCounts.entries())
    .map(([tool, count]) => `${tool}: ${count}x`)
    .slice(0, 3);
  return `\nActions taken in this conversation:\n${lines.join("\n")}`;
}

// In generateSummary(), append to the summary prompt:
const journalDigest = buildJournalDigest(journal);
const prompt = `Summarize this conversation...${journalDigest}`;
```

Update `generateSummary` signature to accept optional journal:
```typescript
export async function generateSummary(
  messages: Message[],
  journal?: JournalEntry[],  // from Task 13: getJournal()
): Promise<string> {
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/journal-summary.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: journal digest in conversation summaries (circuit F1)"
```

---

### Task 22: Journal Pattern Analysis → Meta-memories (Circuit F2)

> **Circuit F2:** Deep heartbeat analyzes recent journal entries across conversations to detect behavioral patterns and saves them as meta-memories. This is the "intuition" loop — the agent learns from what it repeatedly does.

**Files:**
- Create: `src/lib/services/journal-patterns.ts`
- Modify: `src/lib/worker/heartbeat.ts` (wire into deep heartbeat)
- Test: `tests/evals/journal-patterns.test.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/journal-patterns.test.ts
import { describe, it, expect } from "vitest";
import { detectJournalPatterns, type JournalPattern } from "@/lib/services/journal-patterns";

describe("detectJournalPatterns", () => {
  it("detects repeated_tool: same tool called 5+ times across sessions", () => {
    // 3 sessions, each with 2+ create_fact calls
    // → pattern: { type: "repeated_tool", tool: "create_fact", frequency: 7 }
  });

  it("detects tool_sequence: same A→B pattern 3+ times", () => {
    // pattern: create_fact → generate_page appears 3 times
    // → { type: "tool_sequence", sequence: ["create_fact", "generate_page"], count: 3 }
  });

  it("detects correction_pattern: update immediately after create for same category", () => {
    // create_fact(skills/x) → update_fact(skills/x) within same conversation, 2+ times
    // → { type: "correction_pattern", category: "skills", suggestion: "Ask for confirmation before saving skills" }
  });

  it("returns max 2 patterns per analysis", () => {
    // many patterns → capped at 2 most significant
  });

  it("returns empty when journal has <5 entries total", () => {
    // too little data → no patterns
  });
});

describe("journal patterns → meta-memories", () => {
  it("saves detected patterns as meta-memories via saveMemory", () => {
    // pattern detected → saveMemory called with type "behavioral_pattern"
  });

  it("deduplicates: does not save pattern if identical meta-memory exists", () => {
    // same pattern already in meta-memories → skip
  });
});
```

**Step 2: Run test to verify fail**

Run: `npx vitest run tests/evals/journal-patterns.test.ts`
Expected: FAIL

**Step 3: Implement detectJournalPatterns**

Create `src/lib/services/journal-patterns.ts`:

```typescript
import type { JournalEntry } from "@/lib/services/session-metadata"; // from Task 1b/13

export type JournalPattern = {
  type: "repeated_tool" | "tool_sequence" | "correction_pattern";
  description: string;
  suggestion: string;
  evidence: { tool?: string; sequence?: string[]; category?: string; frequency?: number };
};

/**
 * Analyze journal entries across recent conversations to detect behavioral patterns.
 * Deterministic — no LLM. Designed for deep heartbeat.
 *
 * @param entries Journal entries from multiple recent sessions
 * @returns Max 2 most significant patterns
 */
export function detectJournalPatterns(entries: JournalEntry[]): JournalPattern[] {
  if (entries.length < 5) return [];
  const patterns: JournalPattern[] = [];

  // 1. repeated_tool: same tool 5+ times
  const toolCounts = new Map<string, number>();
  for (const e of entries) {
    toolCounts.set(e.toolName, (toolCounts.get(e.toolName) ?? 0) + 1);
  }
  for (const [tool, count] of toolCounts) {
    if (count >= 5) {
      patterns.push({
        type: "repeated_tool",
        description: `Tool "${tool}" called ${count} times across recent sessions`,
        suggestion: `Consider batch operations or ask if the user wants to do multiple ${tool} ops at once.`,
        evidence: { tool, frequency: count },
      });
    }
  }

  // 2. tool_sequence: A→B pattern 3+ times
  const seqCounts = new Map<string, number>();
  for (let i = 0; i < entries.length - 1; i++) {
    const key = `${entries[i].toolName}→${entries[i + 1].toolName}`;
    seqCounts.set(key, (seqCounts.get(key) ?? 0) + 1);
  }
  for (const [seq, count] of seqCounts) {
    if (count >= 3) {
      const [a, b] = seq.split("→");
      patterns.push({
        type: "tool_sequence",
        description: `Sequence ${a} → ${b} repeated ${count} times`,
        suggestion: `This is a common workflow. Consider combining these steps proactively.`,
        evidence: { sequence: [a, b], frequency: count },
      });
    }
  }

  // 3. correction_pattern: create→update for same category within conversation
  const corrections = new Map<string, number>();
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].toolName === "create_fact" && entries[i + 1].toolName === "update_fact") {
      const cat = entries[i].args?.category ?? "unknown";
      corrections.set(cat, (corrections.get(cat) ?? 0) + 1);
    }
  }
  for (const [cat, count] of corrections) {
    if (count >= 2) {
      patterns.push({
        type: "correction_pattern",
        description: `Frequently corrects ${cat} facts right after creating them (${count}x)`,
        suggestion: `Ask for confirmation before saving ${cat} facts.`,
        evidence: { category: cat, frequency: count },
      });
    }
  }

  // Return top 2 by frequency
  return patterns
    .sort((a, b) => (b.evidence.frequency ?? 0) - (a.evidence.frequency ?? 0))
    .slice(0, 2);
}
```

**Step 4: Wire into deep heartbeat**

In `src/lib/worker/heartbeat.ts`, in `handleHeartbeatDeep()`:

```typescript
// Circuit F2: journal patterns → meta-memories
const recentJournals = getRecentJournalEntries(ownerKey, 5); // last 5 sessions
const patterns = detectJournalPatterns(recentJournals);
for (const pattern of patterns) {
  saveMemory(ownerKey, {
    type: "behavioral_pattern",
    content: `${pattern.description}. ${pattern.suggestion}`,
    source: "journal_analysis",
  });
}
```

> **Note:** `getRecentJournalEntries` aggregates journal from `sessions.metadata` across the N most recent sessions for the owner. This is a simple SQL query joining sessions → parsing metadata → extracting journal arrays.

**Step 5: Run tests**

Run: `npx vitest run tests/evals/journal-patterns.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git commit -m "feat: journal pattern analysis → meta-memories (circuit F2)"
```

---

### Task 23: reverse_batch Undo Handler (Circuit G Undo)

> **Circuit G Undo:** Trust ledger can reverse batch_facts operations. Each batch stores reverseOps in undoPayload; this task implements the handler that executes them.

**Files:**
- Modify: `src/lib/services/trust-ledger-service.ts` (add reverse_batch case)
- Test: `tests/evals/trust-ledger-batch.test.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/trust-ledger-batch.test.ts
import { describe, it, expect } from "vitest";

describe("reverse_batch undo handler", () => {
  it("reverses a batch: deletes created facts, restores updated facts, recreates deleted facts", () => {
    // batch created 2 facts, updated 1, deleted 1
    // → reverse_batch: delete 2 created, restore 1 updated to old value, recreate 1 deleted
  });

  it("handles empty reverseOps gracefully", () => {
    // undoPayload.reverseOps = []
    // → no error, no DB changes
  });

  it("triggers recomposeAfterMutation after reverse", () => {
    // → recomposeAfterMutation called once at the end
  });

  it("reverse is idempotent: second undo is a no-op", () => {
    // undo twice → no error, same state
  });
});
```

**Step 2: Run test to verify fail**

Run: `npx vitest run tests/evals/trust-ledger-batch.test.ts`
Expected: FAIL

**Step 3: Implement reverse_batch handler**

In `src/lib/services/trust-ledger-service.ts`, in the `executeUndo` switch:

```typescript
case "reverse_batch": {
  const reverseOps = payload.reverseOps as Array<{
    action: "delete" | "restore" | "recreate";
    factId: string;
    previousValue?: unknown;
    previousFact?: Record<string, unknown>;
  }>;

  db.transaction(() => {
    for (const op of reverseOps) {
      switch (op.action) {
        case "delete":
          // Undo a create → delete the created fact
          db.delete(factsTable).where(eq(factsTable.id, op.factId)).run();
          break;
        case "restore":
          // Undo an update → restore previous value
          db.update(factsTable)
            .set({ value: op.previousValue, updatedAt: new Date().toISOString() })
            .where(eq(factsTable.id, op.factId))
            .run();
          break;
        case "recreate":
          // Undo a delete → re-insert the fact
          if (op.previousFact) {
            db.insert(factsTable).values(op.previousFact).onConflictDoNothing().run();
          }
          break;
      }
    }
  })();

  recomposeAfterMutation();
  break;
}
```

> **Note:** `factsTable` alias (from R5-C4 fix) avoids collision with any local `facts` variable.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/trust-ledger-batch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: reverse_batch undo handler in trust ledger (circuit G undo)"
```

---

## Layer 6: Efficiency & Cost

> Tasks 24-26 reduce token waste, eliminate duplicate DB queries, and systematize model tier selection.
> These are pure optimizations — zero behavior change, measurable cost reduction.

### Task 24: Conditional Context Injection by Journey State

> **Problem:** `assembleContext()` injects ALL blocks (facts, soul, summary, memories, conflicts, richness, layout intelligence) into every message regardless of journey state. ~7700 tokens of system prompt per message. Most of it is irrelevant to what the agent needs to do in the current state.
>
> **Solution:** Define a `CONTEXT_PROFILE` per JourneyState that specifies which blocks to include and at what budget. Estimated -30/40% input tokens.

**Files:**
- Modify: `src/lib/agent/context.ts` (conditional block injection)
- Test: `tests/evals/conditional-context.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/conditional-context.test.ts
import { describe, it, expect } from "vitest";
import { assembleContext, estimateTokens } from "@/lib/agent/context";

describe("conditional context by journey state", () => {
  it("first_visit: includes FACT_SCHEMA_REFERENCE but omits richness/layout intelligence", () => {
    // bootstrap.journeyState = "first_visit"
    // → systemPrompt contains FACT_SCHEMA_REFERENCE
    // → systemPrompt does NOT contain "SECTION RICHNESS" or "PAGE LAYOUT INTELLIGENCE"
  });

  it("draft_ready: omits FACT_SCHEMA_REFERENCE, includes soul + style", () => {
    // bootstrap.journeyState = "draft_ready"
    // → systemPrompt does NOT contain FACT_SCHEMA_REFERENCE
    // → systemPrompt contains "SOUL PROFILE" (if soul exists)
  });

  it("active_fresh: includes only topic-relevant facts (not all 50)", () => {
    // bootstrap.journeyState = "active_fresh"
    // → facts block is smaller than full dump
    // → contains recent summary
  });

  it("active_stale: includes stale facts + soul + summary", () => {
    // bootstrap.journeyState = "active_stale"
    // → systemPrompt contains stale fact references
  });

  it("blocked: minimal context (auth info only, ~200 tokens)", () => {
    // bootstrap.journeyState = "blocked"
    // → systemPrompt is very short
    // → no facts, no soul, no memories
  });

  it("returning_no_page: same as first_visit (needs onboarding)", () => {
    // bootstrap.journeyState = "returning_no_page"
    // → includes FACT_SCHEMA_REFERENCE
  });

  it("conditional context saves ≥25% tokens vs unconditional (steady_state)", () => {
    // Compare: assembleContext with draft_ready bootstrap vs without bootstrap
    // → conditional version uses ≤75% of unconditional tokens
    const unconditional = assembleContext(scope, "en", messages);
    const conditional = assembleContext(scope, "en", messages, authInfo, bootstrapDraftReady);
    const savings = 1 - estimateTokens(conditional.systemPrompt) / estimateTokens(unconditional.systemPrompt);
    expect(savings).toBeGreaterThanOrEqual(0.25);
  });
});
```

**Step 2: Run tests to verify fail**

Run: `npx vitest run tests/evals/conditional-context.test.ts`
Expected: FAIL

**Step 3: Define CONTEXT_PROFILE**

In `src/lib/agent/context.ts`, add before `assembleContext`:

```typescript
/**
 * Context profile per journey state.
 * Controls which blocks are injected and their budgets.
 * Omitted blocks are not loaded from DB at all (saves both tokens AND queries).
 */
type ContextProfile = {
  facts: { include: boolean; budget: number; filterStaleOnly?: boolean };
  soul: { include: boolean; budget: number };
  summary: { include: boolean; budget: number };
  memories: { include: boolean; budget: number };
  conflicts: { include: boolean; budget: number };
  richness: { include: boolean };
  layoutIntelligence: { include: boolean };
};

const CONTEXT_PROFILES: Record<JourneyState, ContextProfile> = {
  first_visit: {
    facts: { include: true, budget: 2000 },
    soul: { include: false, budget: 0 },
    summary: { include: false, budget: 0 },
    memories: { include: false, budget: 0 },
    conflicts: { include: false, budget: 0 },
    richness: { include: false },
    layoutIntelligence: { include: false },
  },
  returning_no_page: {
    facts: { include: true, budget: 2000 },
    soul: { include: true, budget: 800 },
    summary: { include: true, budget: 800 },
    memories: { include: true, budget: 400 },
    conflicts: { include: true, budget: 200 },
    richness: { include: false },
    layoutIntelligence: { include: false },
  },
  draft_ready: {
    facts: { include: true, budget: 1500 },
    soul: { include: true, budget: 1500 },
    summary: { include: false, budget: 0 },
    memories: { include: false, budget: 0 },
    conflicts: { include: true, budget: 200 },
    richness: { include: true },
    layoutIntelligence: { include: true },
  },
  active_fresh: {
    facts: { include: true, budget: 1500 },
    soul: { include: true, budget: 1000 },
    summary: { include: true, budget: 800 },
    memories: { include: true, budget: 400 },
    conflicts: { include: true, budget: 200 },
    richness: { include: true },
    layoutIntelligence: { include: true },
  },
  active_stale: {
    facts: { include: true, budget: 2000, filterStaleOnly: true },
    soul: { include: true, budget: 1000 },
    summary: { include: true, budget: 800 },
    memories: { include: true, budget: 400 },
    conflicts: { include: true, budget: 200 },
    richness: { include: true },
    layoutIntelligence: { include: false },
  },
  blocked: {
    facts: { include: false, budget: 0 },
    soul: { include: false, budget: 0 },
    summary: { include: false, budget: 0 },
    memories: { include: false, budget: 0 },
    conflicts: { include: false, budget: 0 },
    richness: { include: false },
    layoutIntelligence: { include: false },
  },
};
```

**Step 4: Refactor assembleContext to use profiles**

In `assembleContext`, when `bootstrap` is available, use the profile to conditionally skip blocks:

```typescript
// Determine context profile
const profile = bootstrap
  ? CONTEXT_PROFILES[bootstrap.journeyState]
  : null; // null = legacy unconditional path

// Facts block — conditional
let factsBlock = "";
if (!profile || profile.facts.include) {
  const existingFacts = getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
  let relevantFacts = existingFacts;
  if (profile?.facts.filterStaleOnly) {
    const now = new Date();
    relevantFacts = existingFacts.filter(f =>
      f.updatedAt && daysBetween(new Date(f.updatedAt), now) > 30
    );
  }
  const topFacts = relevantFacts.slice(0, 50);
  factsBlock = topFacts.length > 0
    ? `KNOWN FACTS ABOUT THE USER (${topFacts.length} facts):\n${topFacts
        .map((f) => `- [${f.category}/${f.key}]: ${JSON.stringify(f.value)}`)
        .join("\n")}`
    : "";
  factsBlock = truncateToTokenBudget(factsBlock, profile?.facts.budget ?? BUDGET.facts);
}

// Soul block — conditional
let soulBlock = "";
if (!profile || profile.soul.include) {
  const activeSoul = getActiveSoul(scope.cognitiveOwnerKey);
  soulBlock = activeSoul?.compiled ?? "";
  soulBlock = truncateToTokenBudget(soulBlock, profile?.soul.budget ?? BUDGET.soul);
}

// Summary, memories, conflicts — same pattern...
// Richness, layout intelligence — same pattern...
```

> **Key:** When `profile.X.include === false`, the DB query is not executed at all. This saves both tokens AND query latency.

**Step 5: Run tests**

Run: `npx vitest run tests/evals/conditional-context.test.ts`
Expected: PASS

**Step 6: Run full suite**

Run: `npx vitest run`
Expected: ALL pass (no behavior change for existing tests — they don't provide bootstrap)

**Step 7: Commit**

```bash
git commit -m "perf: conditional context injection by journey state — ~30% token reduction"
```

---

### Task 25: Bootstrap → Context Data Passthrough (DB Dedup)

> **Problem:** `assembleBootstrapPayload()` reads `getAllFacts()`, `getOpenConflicts()`, `filterPublishableFacts()`, `classifySectionRichness()`. Then `assembleContext()` re-reads `getAllFacts()`, `getActiveSoul()`, `getOpenConflicts()`. Facts and conflicts are queried twice per message.
>
> **Solution:** Bootstrap collects all shared data, passes it to `assembleContext` via a `BootstrapData` struct. Zero behavior change, fewer DB queries per message.
>
> **Ref:** `src/app/api/chat/route.ts:123-124` TODO comment.

**Files:**
- Modify: `src/lib/agent/journey.ts` (return shared data alongside payload)
- Modify: `src/lib/agent/context.ts` (accept shared data, skip re-query)
- Modify: `src/app/api/chat/route.ts` (pass shared data through)
- Test: `tests/evals/context-data-passthrough.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/context-data-passthrough.test.ts
import { describe, it, expect, vi } from "vitest";

describe("bootstrap → context data passthrough", () => {
  it("assembleContext does not call getAllFacts when bootstrapData.facts provided", () => {
    // spy on getAllFacts
    // call assembleContext with bootstrapData containing facts
    // → getAllFacts NOT called
  });

  it("assembleContext does not call getActiveSoul when bootstrapData.soul provided", () => {
    // spy on getActiveSoul
    // → NOT called when bootstrapData.soul is present
  });

  it("assembleContext does not call getOpenConflicts when bootstrapData.conflicts provided", () => {
    // spy on getOpenConflicts
    // → NOT called
  });

  it("falls back to DB query when bootstrapData is not provided", () => {
    // no bootstrapData → getAllFacts IS called (backward compat)
  });

  it("produces identical system prompt with and without passthrough", () => {
    // same scope, same data
    // assembleContext(scope, lang, msgs, auth, bootstrap) vs
    // assembleContext(scope, lang, msgs, auth, bootstrap, bootstrapData)
    // → systemPrompt is identical
  });
});
```

**Step 2: Run tests to verify fail**

Run: `npx vitest run tests/evals/context-data-passthrough.test.ts`
Expected: FAIL

**Step 3: Define BootstrapData type**

In `src/lib/agent/journey.ts`:

```typescript
import type { FactRow } from "@/lib/services/kb-service";
import type { SoulProfile } from "@/lib/services/soul-service";

/**
 * Shared data collected during bootstrap, passed to assembleContext
 * to avoid duplicate DB queries. Pure optimization — same data, fewer reads.
 */
export type BootstrapData = {
  facts: FactRow[];
  soul: SoulProfile | null;
  conflicts: Array<{ id: string; category: string; key: string; factAId: string; sourceA: string; factBId?: string; sourceB?: string }>;
  publishableFacts: FactRow[];
};
```

**Step 4: Return BootstrapData from assembleBootstrapPayload**

Change return type to `{ payload: BootstrapPayload; data: BootstrapData }`:

```typescript
export function assembleBootstrapPayload(
  scope: OwnerScope,
  language: string,
  authInfo?: AuthInfo,
): { payload: BootstrapPayload; data: BootstrapData } {
  const facts = getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
  const soul = getActiveSoul(scope.cognitiveOwnerKey);      // NEW: also read soul here
  const openConflictRecords = getOpenConflicts(scope.cognitiveOwnerKey);
  const publishable = filterPublishableFacts(facts);
  // ... existing payload assembly ...

  return {
    payload: { /* existing BootstrapPayload */ },
    data: { facts, soul, conflicts: openConflictRecords, publishableFacts: publishable },
  };
}
```

> **Note:** `getActiveSoul` is added to bootstrap. Previously only read in `assembleContext`. This centralizes all shared reads.

**Step 5: Update assembleContext signature**

```typescript
export function assembleContext(
  scope: OwnerScope,
  language: string,
  clientMessages: Array<{ role: string; content: string }>,
  authInfo?: AuthInfo,
  bootstrap?: BootstrapPayload,
  bootstrapData?: BootstrapData,  // NEW: pre-fetched data from bootstrap
): ContextResult {
  // ...
  // Facts: use passthrough or query
  const existingFacts = bootstrapData?.facts
    ?? getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);

  // Soul: use passthrough or query
  const activeSoul = bootstrapData?.soul
    ?? getActiveSoul(scope.cognitiveOwnerKey);

  // Conflicts: use passthrough or query
  const openConflicts = bootstrapData?.conflicts
    ?? getOpenConflicts(scope.cognitiveOwnerKey);

  // Richness: use passthrough publishable or re-filter
  const publishable = bootstrapData?.publishableFacts
    ?? filterPublishableFacts(existingFacts);
  // ...
}
```

**Step 6: Update chat route**

In `src/app/api/chat/route.ts`:

```typescript
// Before:
const bootstrap = assembleBootstrapPayload(effectiveScope, sessionLanguage, authInfoForBootstrap);

// After:
const { payload: bootstrap, data: bootstrapData } = assembleBootstrapPayload(
  effectiveScope, sessionLanguage, authInfoForBootstrap
);

// Pass data through to assembleContext:
const { systemPrompt, trimmedMessages, mode } = assembleContext(
  effectiveScope, sessionLanguage, messages, authInfo, bootstrap, bootstrapData
);
```

**Step 7: Remove TODO comment**

Delete the TODO at `route.ts:123-124`:
```typescript
// TODO(Sprint 2): bootstrap and assembleContext both query facts/soul/conflicts independently.
// Refactor assembleContext to consume bootstrap data and avoid duplicate DB reads.
```

**Step 8: Run tests**

Run: `npx vitest run tests/evals/context-data-passthrough.test.ts`
Expected: PASS

**Step 9: Run full suite**

Run: `npx vitest run`
Expected: ALL pass

**Step 10: Commit**

```bash
git commit -m "perf: bootstrap → context data passthrough — eliminate duplicate DB queries"
```

---

### Task 26: Systematic Model Tiering

> **Problem:** Model tier infrastructure exists (`getModelForTier` with cheap/medium/capable in `provider.ts`) but 5 of 7 LLM call sites use `getModel()` (= cheap tier) directly. Schema-constrained `generateObject` calls don't need reasoning quality — they should use the cheapest tier. Conversational `streamText` may benefit from a higher tier.
>
> **Solution:** Assign explicit tiers to every LLM call site. Rename tiers to be more intentional: `fast` (cheapest, mechanical tasks), `standard` (default chat), `reasoning` (complex analysis). No behavior change if env vars unchanged — tiers resolve to the same model by default.

**Files:**
- Modify: `src/lib/ai/provider.ts` (rename tiers, add `fast` tier)
- Modify: `src/lib/ai/translate.ts` (use `fast` tier)
- Modify: `src/lib/services/section-personalizer.ts` (use `fast` tier)
- Modify: `src/lib/services/conformity-analyzer.ts` (use `reasoning` tier)
- Modify: `src/lib/services/summary-service.ts` (already uses `medium` → rename to `standard`)
- Modify: `src/app/api/chat/route.ts` (use `standard` tier for chat, `fast` for title generation)
- Test: `tests/evals/model-tiering.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/model-tiering.test.ts
import { describe, it, expect } from "vitest";
import { getModelForTier } from "@/lib/ai/provider";

describe("model tiering", () => {
  it("fast tier returns a valid model", () => {
    const model = getModelForTier("fast");
    expect(model).toBeDefined();
  });

  it("standard tier returns a valid model", () => {
    const model = getModelForTier("standard");
    expect(model).toBeDefined();
  });

  it("reasoning tier returns a valid model", () => {
    const model = getModelForTier("reasoning");
    expect(model).toBeDefined();
  });

  it("all tiers resolve to same model when no env overrides (single-model setup)", () => {
    // default config: all tiers use same model
    // → all 3 return the same model ID
  });

  it("AI_MODEL_FAST env override is respected", () => {
    // set AI_MODEL_FAST=custom-model
    // → getModelForTier("fast") returns custom model
  });
});
```

**Step 2: Run tests to verify fail**

Run: `npx vitest run tests/evals/model-tiering.test.ts`
Expected: FAIL

**Step 3: Update tier definitions**

In `src/lib/ai/provider.ts`, update the tier system:

```typescript
/**
 * Model tier for cost-aware routing.
 *
 * | Tier      | Use case                                    | Default model      |
 * |-----------|---------------------------------------------|--------------------|
 * | fast      | Schema-constrained generateObject,          | Same as AI_MODEL   |
 * |           | translation, mechanical tasks               |                    |
 * | standard  | Chat conversation, summaries,               | Same as AI_MODEL   |
 * |           | text compression                            |                    |
 * | reasoning | Conformity analysis, complex multi-step     | gemini-2.5-pro /   |
 * |           | evaluation                                  | claude-sonnet-4-6  |
 *
 * By default, fast and standard resolve to AI_MODEL (= cheapest).
 * Override per tier with AI_MODEL_FAST, AI_MODEL_STANDARD, AI_MODEL_REASONING.
 * In single-model setups, all tiers use the same model and the system is a no-op.
 */
export type ModelTier = "fast" | "standard" | "reasoning";
```

Update tier model tables:
```typescript
const FAST_MODELS: Record<Provider, string> = {
  google: "gemini-2.0-flash",     // cheapest
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  ollama: "llama3.3",
};

const STANDARD_MODELS: Record<Provider, string> = {
  google: "gemini-2.0-flash",     // same as fast by default
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  ollama: "llama3.3",
};

const REASONING_MODELS: Record<Provider, string> = {
  google: "gemini-2.5-pro",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  ollama: "llama3.3",
};
```

> **Backward compat:** The existing `"cheap"` and `"medium"` types are replaced. `summary-service.ts` already uses `getModelForTier("medium")` — update to `"standard"`. If any external code references old tiers, a deprecation alias can be added.

**Step 4: Update all LLM call sites**

| File | Current | New tier | Rationale |
|------|---------|----------|-----------|
| `src/app/api/chat/route.ts:253` | `getModel()` | `getModelForTier("standard")` | Conversational, needs tone |
| `src/app/api/chat/route.ts:262` | `getModel()` (title gen) | `getModelForTier("fast")` | One-line title, mechanical |
| `src/lib/ai/translate.ts:162` | `getModel()` | `getModelForTier("fast")` | Mechanical translation |
| `src/lib/services/section-personalizer.ts:92` | `getModel()` | `getModelForTier("fast")` | Schema-constrained, Zod output |
| `src/lib/services/conformity-analyzer.ts:44` | `getModel()` | `getModelForTier("reasoning")` | Qualitative judgment |
| `src/lib/services/conformity-analyzer.ts:100` | `getModel()` | `getModelForTier("reasoning")` | Rewrite requires reasoning |
| `src/lib/services/summary-service.ts:143` | `getModelForTier("medium")` | `getModelForTier("standard")` | Text compression |

New call sites from v2 plan:
| File | Tier | Rationale |
|------|------|-----------|
| `coherence-check.ts` (Task 14) | `fast` | Schema-constrained, 3 fields |
| `journal-patterns.ts` (Task 22) | N/A | Deterministic, no LLM |

**Step 5: Run tests**

Run: `npx vitest run tests/evals/model-tiering.test.ts`
Expected: PASS

**Step 6: Run full suite**

Run: `npx vitest run`
Expected: ALL pass

**Step 7: Commit**

```bash
git commit -m "perf: systematic model tiering — fast/standard/reasoning across all LLM call sites"
```

---

## Summary

| Task | Layer | Description | Depends On |
|------|-------|-------------|------------|
| 1 | L0 | Migration 0022 + schema + FactRow (fix sortOrder type gap) | — |
| 1b | L0 | Session metadata helper (get/set/merge) | T1 |
| 2 | L1 | Archived filtering + getActiveFacts | T1 |
| 3 | L1 | FactConstraintError + current uniqueness + cascade warning | T1 |
| 4 | L1 | Archetype detection constants | — |
| 5 | L2 | sortOrder in composer | T1 |
| 6 | L2 | parentFactId grouping in composer | T1 |
| 7 | L2 | Slot carry-over + soft-pin (single-run via composeOptimisticPage) | T1 |
| 8a | L2 | batch_facts tool (REPLACES create_facts, kb-service direct, atomic) + trust ledger (G) | T2, T3 |
| 8b | L2 | archive_fact, unarchive_fact, reorder_items (REPLACES reorder_section_items) + trust ledger (E) | T2 |
| 9 | L3 | move_section tool | T7 |
| 10 | L3 | Fix reorder_sections + maxSteps 10→8 | — |
| 11 | L3 | Planning Protocol + memory directive (H) | — |
| 12 | L3 | Archetype wiring + soul proposal (A) + weighted exploration (C) | T4, T1b |
| 13 | L4 | Operation Journal (createAgentTools returns {tools, getJournal}) | T1b |
| 14 | L4 | Page Coherence Check + soul-aware (I) + proposals (D1) | T1b |
| 15 | L4 | has_archivable_facts directive | T2 |
| 16 | L4 | TOOL_POLICY + DATA_MODEL_REFERENCE update (merge with 1814e4b prompts) | T8a, T8b, T9 |
| 17 | L5 | Integration tests | All |
| 18 | L5 | Update existing tests (delete replaced test files from 1814e4b) | All |
| 19 | L5b | Archetype-weighted personalization priority (B) | T4, T12 |
| 20 | L5b | Coherence check in deep heartbeat → proposals (D2) | T14 |
| 21 | L5b | Journal enrichment in summaries (F1) | T13 |
| 22 | L5b | Journal pattern analysis → meta-memories (F2) | T13 |
| 23 | L5b | reverse_batch undo handler (G undo) | T8a |
| 24 | L6 | Conditional context injection by journey state (-30% tokens) | T1b |
| 25 | L6 | Bootstrap → context data passthrough (DB dedup) | T24 |
| 26 | L6 | Systematic model tiering (fast/standard/reasoning) | — |

**Parallelism:** Within each layer, tasks are independent and can be done in parallel. Cross-layer dependencies are strict. Exception: T24 and T25 both modify `context.ts` — implement T24 first, T25 on top. T26 is independent of both.

**Estimated tests:** ~135 new + ~35 updated = ~1300 total (from 1151 current).

**Integration circuit map:**

| Circuit | What it connects | Task(s) |
|---------|-----------------|---------|
| A | Archetype → Soul (propose initial soul) | T12 |
| B | Archetype → Personalizer (weighted priority) | T19 |
| C | Archetype × Richness → Dynamic Exploration | T12 |
| D1 | Coherence → Proposals (in generate_page) | T14 |
| D2 | Coherence → Proposals (in heartbeat) | T20 |
| E | Archive → Trust Ledger (reversible archival) | T8b |
| F1 | Journal → Summaries (digest enrichment) | T21 |
| F2 | Journal → Meta-memories (pattern detection) | T22 |
| G | batch_facts → Trust Ledger (reversible batch) | T8a |
| G undo | Trust Ledger → reverse_batch handler | T23 |
| H | Planning Protocol → Memory Tier 3 | T11 |
| I | Coherence → Soul (soul-aware checks) | T14 |

---

### Delivery Strategy

Split implementation into three delivery scopes. The integration circuits (v2.2) form a separate scope because they connect v2 systems to existing Phase 1 infrastructure and benefit from stable foundations.

**v2 core (11 tasks):** 1, 1b, 2, 3, 5, 8a, 8b, 11, 16, 17, 18

| Task | What it delivers |
|------|------------------|
| 1, 1b | Schema foundation — migration 0022 (parentFactId, archivedAt, sessions.metadata), FactRow type fix, session metadata helper |
| 2 | Archived fact filtering — `getActiveFacts()` replaces `getAllFacts()` across codebase |
| 3 | Constraint layer — CURRENT_UNIQUE_CATEGORIES enforcement in create + update, cascade warnings, orphan cleanup |
| 5 | Sort order in composer — facts ordered by sortOrder ASC, createdAt ASC |
| 8a | `batch_facts` tool — atomic multi-operation with single recompose + trust ledger (circuit G) |
| 8b | `archive_fact`, `unarchive_fact`, `reorder_items` tools + trust ledger (circuit E) |
| 11 | Planning Protocol — SIMPLE/COMPOUND/STRUCTURAL classification + memory directive (circuit H) |
| 16 | TOOL_POLICY + DATA_MODEL_REFERENCE updated for new tools and fact fields |
| 17, 18 | Integration tests + existing test updates |

These are the highest-impact features: the enriched data model, batch operations, archived facts, sort order, and the planning protocol. Integration circuits G, E, and H are embedded here because they're 5-15 lines each inside code already being written.

**v2.1 (7 tasks):** 4, 6, 7, 9, 12, 13, 14, 15

| Task | What it delivers |
|------|------------------|
| 4, 12 | Archetype detection + wiring + soul proposal (circuit A) + weighted exploration (circuit C) |
| 6 | Parent-child grouping in composer — projects nested under parent experience |
| 7, 9 | Slot carry-over + move_section — section position persistence across recompose, cross-slot movement |
| 13 | Operation Journal — tool call tracking, resume on step exhaustion |
| 14 | Page Coherence Check — deterministic + LLM hybrid + soul-aware (circuit I) + proposals (circuit D1) |
| 15 | `has_archivable_facts` directive — relevance-based archival suggestions |

All v2.1 tasks rely on columns already created by migration 0022. No schema changes needed. Circuits A, C, I, and D1 are embedded in tasks already being written (12 and 14).

**v2.2 — Integration Circuits (5 tasks):** 19, 20, 21, 22, 23

| Task | What it delivers |
|------|------------------|
| 19 | Archetype-weighted personalization priority (circuit B) — archetype drives LLM budget allocation |
| 20 | Coherence check in deep heartbeat → proposals (circuit D2) — self-improvement loop |
| 21 | Journal enrichment in summaries (circuit F1) — summaries capture agent actions |
| 22 | Journal pattern analysis → meta-memories (circuit F2) — agent learns from behavioral patterns |
| 23 | reverse_batch undo handler (circuit G undo) — trust ledger can reverse batch operations |

These tasks close the remaining feedback loops. All are pure additive — no schema changes, no breaking changes. They depend on v2.1 tasks (T19→T12, T20→T14, T21/T22→T13, T23→T8a) but not on each other. Can be implemented in parallel within v2.2.

**v2.3 — Efficiency (3 tasks):** 24, 25, 26

| Task | What it delivers |
|------|------------------|
| 24 | Conditional context injection — journey-state-aware block selection, -30% input tokens |
| 25 | Bootstrap → context data passthrough — zero duplicate DB queries per message |
| 26 | Systematic model tiering — fast/standard/reasoning across all 7+ LLM call sites |

These are pure optimizations. T26 is independent and can be done anytime (even before v2 core). T24 and T25 modify `context.ts` and should be done in order. T25 resolves the existing `route.ts:123-124` TODO.

**Why this four-tier split works:**

1. **Risk reduction.** v2 core is 11 tasks with straightforward data-layer + tool-layer changes. v2.1 adds intelligence features. v2.2 wires the feedback loops. v2.3 optimizes cost/latency.
2. **Faster feedback.** Batch operations, archived facts, and sort order are immediately useful. Archetype and coherence are refinements. Integration circuits are the "agent learns" layer. Efficiency is the "scale without breaking the bank" layer.
3. **Independent deployment.** Each scope is pure additive on the previous one. v2.2 and v2.3 tasks can be rolled back without data loss.
4. **Embedded circuits.** 7 of 12 circuits (A, C, E, G, H, I, D1) are embedded in existing tasks because they're small enough. The remaining 5 (B, D2, F1, F2, G-undo) are standalone because they introduce new patterns.
5. **T26 is scope-independent.** Model tiering can be deployed at any point — it only changes which model ID is passed to existing calls. Zero code structure change.
6. **Task 10 (reorder_sections fix + maxSteps 10→8)** fits either v2 core or v2.1 scope. Include in v2 core if touched during Task 8b work, or defer to v2.1 if the change is isolated.

---

### Review Fixes Applied

**Round 1 (11 fixes):**

| ID | Severity | Fix | Location |
|----|----------|-----|----------|
| C1 | Critical | batch_facts calls kb-service directly, NOT tool wrappers | Task 8a |
| C2 | Critical | updateFact cascade warning implementation step added | Task 3, Step 5 |
| C3 | Critical | Single-run: draftSlots flows through composeOptimisticPage, not double-run | Task 7, Step 4 |
| S1 | Significant | session-metadata.ts helper module added | Task 1b (new) |
| S2 | Significant | createAgentTools returns `{tools, getJournal}`, callers updated | Task 13 |
| S3 | Significant | DATA_MODEL_REFERENCE updated with sortOrder/parentFactId/archivedAt | Task 16 |
| S4 | Significant | Task 8 split into 8a (batch_facts) and 8b (archive/unarchive/reorder) | Task 8a, 8b |
| M1 | Minor | Line numbers caveat note at top of plan | Header |
| M2 | Minor | isSlotValid helper defined with full signature | Task 7, Step 3 |
| M3 | Minor | FACT_SCHEMA_REFERENCE compression noted as opportunistic, not a task | Header |
| M4 | Minor | Test that experience is NOT in CATEGORY_TO_ARCHETYPE | Task 4 |

**Round 2 (6 fixes):**

| ID | Severity | Fix | Location |
|----|----------|-----|----------|
| R2-S1 | Significant | finishReason === "tool-calls" (not "length") for step exhaustion detection | Task 13 |
| R2-S2 | Significant | batch_facts try/catch with structured error responses + "batch rolled back" hint | Task 8a |
| R2-M1 | Minor | Production callers of getAllFacts explicitly listed for migration | Task 2, Step 5 |
| R2-M2 | Minor | refineArchetype() wired into assembleBootstrapPayload (was dead code) | Task 12 |
| R2-M3 | Minor | childCounts pre-computed in caller, not in detectSituations (separation of concerns) | Task 15 |
| R2-M4 | Minor | T10 removed from T13 dependencies (journal works with any maxSteps) | Summary table |

**Round 3 — post-1814e4b reconciliation (9 fixes):**

| ID | Severity | Fix | Location |
|----|----------|-----|----------|
| R3-C1 | Critical | Migration renamed 0019→0022 (0019-0021 already exist) | Task 1 |
| R3-C2 | Critical | sort_order removed from migration SQL (already exists from 0021), FactRow sortOrder typed as `number \| null` | Task 1 |
| R3-C3 | Critical | batch_facts REPLACES create_facts (delete create_facts tool + test file) | Task 8a |
| R3-C4 | Critical | reorder_items REPLACES reorder_section_items (delete tool + updateFactSortOrder + test file) | Task 8b |
| R3-S1 | Significant | maxSteps documented as 10→8 (was 5→8, commit changed to 10) | Task 10 |
| R3-S2 | Significant | FactRow sortOrder type gap annotated (DB has it, type didn't) | Task 1 |
| R3-S3 | Significant | sortFacts() annotated as defense-in-depth (DB already orders) | Task 5 |
| R3-M1 | Minor | 3 test files from 1814e4b listed for deletion/verification in Task 18 | Task 18 |
| R3-M2 | Minor | Prompt merge annotation: preserve anti-fabrication guards, remove create_facts/reorder_section_items refs | Task 16 |

**Round 4 — final review (4 fixes):**

| ID | Severity | Fix | Location |
|----|----------|-----|----------|
| R4-S1 | Significant | Removed `profileId` from batch_facts createFact call (not in closure) | Task 8a |
| R4-S2 | Significant | Added `import { db }` note for batch transaction in tools.ts | Task 8a |
| R4-M1 | Minor | Removed `policies/index.ts` from Task 11 files (actionAwareness imported directly in prompts.ts) | Task 11 |
| R4-M2 | Minor | Extract `MAX_STEPS` constant for onFinish check (maxSteps is inline in streamText call) | Task 13 |

**Round 5 — external architecture review (11 fixes):**

| ID | Severity | Fix | Location |
|----|----------|-----|----------|
| R5-C1 | Critical | batch_facts: createFact is async (normalizeCategory), can't be inside sync db.transaction(). Pre-normalize categories before txn, use sync DB inserts inside. | Task 8a |
| R5-C2 | Critical | move_section: `username` not in createAgentTools closure. Use `draft.username ?? "draft"` pattern. | Task 9 |
| R5-C3 | Critical | Coherence service import: `@/lib/ai/model` → `@/lib/ai/provider` (getModel lives in provider.ts) | Task 14 |
| R5-C4 | Critical | Task 15 `facts` symbol collision: local `facts` array in assembleBootstrapPayload shadows Drizzle table import. Alias as `factsTable`. | Task 15 |
| R5-S1 | Significant | Constraint enforcement (CURRENT_UNIQUE_CATEGORIES) also needed in updateFact, not just createFact | Task 3, Step 5 |
| R5-S2 | Significant | EXPECTED_SCHEMA_VERSION bump (18→22) added to Task 1 as new Step 2 | Task 1 |
| R5-S3 | Significant | Task 10: groupSectionsBySlot only groups, doesn't validate. Use validateLayout() from quality.ts instead. | Task 10 |
| R5-S4 | Significant | createAgentTools return shape change: grep all callers in src/ and tests/ to update | Task 13 |
| R5-S5 | Significant | mergeSessionMeta read-modify-write race condition noted (safe for single-user SQLite, document for future) | Task 1b |
| R5-M1 | Minor | Edge-case tests added: batch 0 ops, single op, archive idempotent, unarchive no-op, reorder 0/1 facts, move to same slot | Tasks 8a, 8b, 9 |
| R5-M2 | Minor | Architecture note: spaced ranks for sortOrder as future optimization (not needed now) | Task 8b |

**Round 6 — integration circuits (12 circuits across 10 tasks):**

| Circuit | Description | Location |
|---------|-------------|----------|
| A | Archetype → Soul: propose initial soul when archetype detected and no soul exists | T12 |
| B | Archetype → Personalizer: weighted section priority for LLM budget allocation | T19 (new) |
| C | Archetype × Richness → Dynamic Exploration: replace static richnessBlock with archetype-driven priorities | T12 |
| D1 | Coherence → Proposals: warning-severity issues become proposals (user-reviewable), not session.metadata | T14 |
| D2 | Coherence in heartbeat → Proposals: deep heartbeat runs coherence check periodically | T20 (new) |
| E | Archive → Trust Ledger: reversible archival with undo handler | T8b |
| F1 | Journal → Summaries: operation journal digest enriches conversation summaries | T21 (new) |
| F2 | Journal → Meta-memories: pattern detection across sessions → behavioral meta-memories | T22 (new) |
| G | batch_facts → Trust Ledger: reversible batch operations with reverseOps | T8a |
| G undo | Trust Ledger → reverse_batch: handler to execute batch reversal | T23 (new) |
| H | Planning Protocol → Memory Tier 3: prompt directive to save strategies as meta-memories | T11 |
| I | Coherence → Soul: soul-aware coherence checks (soulCompiled parameter) | T14 |
