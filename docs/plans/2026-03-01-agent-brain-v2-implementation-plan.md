# Agent Brain v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve the agent from reactive tool-caller to deliberative planner with rich fact model, batch operations, direct page manipulation, archetype-driven conversation, and cross-section coherence validation.

**Architecture:** Refactor chirurgico — the core fact model and tool layer are redesigned while Phase 1c (personalizer, proposals, conformity) remains intact. 5 implementation layers with strict dependencies.

**Tech Stack:** TypeScript, Vitest, SQLite/Drizzle, Vercel AI SDK v4 (streamText, generateObject), Zod

**Design doc:** `docs/plans/2026-03-01-agent-brain-v2-design.md`

---

## Layer 0: Prerequisites

### Task 1: Migration 0019 — Smart Facts Schema

**Files:**
- Create: `db/migrations/0019_smart_facts.sql`
- Modify: `src/lib/db/schema.ts:70-87` (facts table) and `src/lib/db/schema.ts:57-68` (sessions table)
- Modify: `src/lib/services/kb-service.ts:62-72` (FactRow type)
- Test: `tests/evals/smart-facts-schema.test.ts`

**Step 1: Write the migration**

Create `db/migrations/0019_smart_facts.sql`:

```sql
ALTER TABLE facts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facts ADD COLUMN parent_fact_id TEXT;
ALTER TABLE facts ADD COLUMN archived_at TEXT;

ALTER TABLE sessions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';

CREATE INDEX idx_facts_parent ON facts(parent_fact_id) WHERE parent_fact_id IS NOT NULL;
CREATE INDEX idx_facts_active ON facts(archived_at) WHERE archived_at IS NULL;
```

**Step 2: Update Drizzle schema**

In `src/lib/db/schema.ts`, add to the `facts` table definition (around line 70-87):

```typescript
sortOrder: integer("sort_order").notNull().default(0),
parentFactId: text("parent_fact_id"),
archivedAt: text("archived_at"),
```

In `src/lib/db/schema.ts`, add to the `sessions` table definition (around line 57-68):

```typescript
metadata: text("metadata").notNull().default("{}"),
```

**Step 3: Update FactRow type**

In `src/lib/services/kb-service.ts:62-72`, update:

```typescript
export type FactRow = {
  id: string;
  category: string;
  key: string;
  value: unknown;
  source: string | null;
  confidence: number | null;
  visibility: string | null;
  sortOrder: number;
  parentFactId: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};
```

**Step 4: Write schema test**

```typescript
// tests/evals/smart-facts-schema.test.ts
import { describe, it, expect } from "vitest";
// Test that migration runs and columns exist
// Test defaults: sort_order=0, parent_fact_id=null, archived_at=null, metadata='{}'
```

**Step 5: Run tests**

Run: `npx vitest run tests/evals/smart-facts-schema.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add db/migrations/0019_smart_facts.sql src/lib/db/schema.ts src/lib/services/kb-service.ts tests/evals/smart-facts-schema.test.ts
git commit -m "feat: migration 0019 — sortOrder, parentFactId, archivedAt, sessions.metadata"
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

**Step 5: Update existing tests**

Run: `npx vitest run`
Fix any tests that broke due to `getAllFacts` being made private — change imports to `getActiveFacts`.

**Step 6: Commit**

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

**Step 5: Wire cascade into deleteFact()**

In `src/lib/services/kb-service.ts:228-265`, after deletion:

```typescript
// Orphan cleanup: detach children
db.update(facts)
  .set({ parentFactId: null })
  .where(eq(facts.parentFactId, factId))
  .run();
```

**Step 6: Run tests**

Run: `npx vitest run tests/evals/fact-constraints.test.ts`
Expected: PASS

**Step 7: Commit**

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

In Phase 1, extend the lock check to also handle soft-pins:

```typescript
// Phase 1: locked sections AND soft-pinned sections
for (const section of sections) {
  const lock = locks?.get(section.id) ?? section.lock;
  const draftSlot = draftSlots?.get(section.id);

  if (lock?.position && section.slot) {
    // Hard lock: keep slot unconditionally
    consumeSlot(section.slot);
    result.push(section);
  } else if (draftSlot && isSlotValid(draftSlot, section.type, template)) {
    // Soft-pin: keep draft slot if valid + has capacity
    section.slot = draftSlot;
    consumeSlot(draftSlot);
    result.push(section);
  } else {
    unassigned.push(section);
  }
}
```

**Step 4: Implement carry-over in projectCanonicalConfig**

In `src/lib/services/page-projection.ts:39-93`, after section ordering (line 89):

```typescript
// 5. Build draftSlots map for carry-over
const draftSlots = new Map<string, string>();
if (draftMeta) {
  for (const ds of draftMeta.sections) {
    if (ds.slot) draftSlots.set(ds.id, ds.slot);
  }
}

// 6. Re-run slot assignment with soft-pins
if (draftSlots.size > 0 && config.layoutTemplate) {
  const template = getLayoutTemplate(config.layoutTemplate);
  if (template) {
    const locks = new Map(config.sections.filter(s => s.lock).map(s => [s.id, s.lock!]));
    const { sections: reassigned } = assignSlotsFromFacts(template, config.sections, locks, { repair: true }, draftSlots);
    config = { ...config, sections: reassigned };
  }
}
```

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

### Task 8: New Tools — batch_facts, archive_fact, unarchive_fact, reorder_items

**Files:**
- Modify: `src/lib/agent/tools.ts:36+` (add 4 new tools + update constraint error handling)
- Test: `tests/evals/batch-facts-tool.test.ts`
- Test: `tests/evals/archive-fact-tool.test.ts`
- Test: `tests/evals/reorder-items-tool.test.ts`

**Step 1: Write failing tests for batch_facts**

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
});
```

**Step 2: Write failing tests for archive/unarchive**

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
});
```

**Step 3: Write failing tests for reorder_items**

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
});
```

**Step 4: Run all test files to verify they fail**

Run: `npx vitest run tests/evals/batch-facts-tool.test.ts tests/evals/archive-fact-tool.test.ts tests/evals/reorder-items-tool.test.ts`
Expected: FAIL

**Step 5: Implement all 4 tools in tools.ts**

In `src/lib/agent/tools.ts`, inside the `createAgentTools()` closure (after existing tools):

Implement `batch_facts`, `archive_fact`, `unarchive_fact`, `reorder_items` per the design doc (Section 2).

Key implementation details:
- `batch_facts`: wrap in `db.transaction()`, iterate operations, call existing `createFact`/`updateFact`/`deleteFact` per item, single `recomposeAfterMutation()` at end
- `archive_fact`: `UPDATE facts SET archived_at = ? WHERE id = ?` + orphan cleanup + recompose
- `unarchive_fact`: `UPDATE facts SET archived_at = null WHERE id = ?` + recompose
- `reorder_items`: `COMPOSITE_SECTIONS` guard, then `UPDATE facts SET sort_order = ? WHERE id = ?` in loop + recompose

Also update `create_fact` and `update_fact` try/catch blocks to handle `FactConstraintError`:
```typescript
} catch (err) {
  if (err instanceof FactValidationError) { ... }
  if (err instanceof FactConstraintError) {
    return { success: false, code: err.code, existingFactId: err.existingFactId, suggestion: err.suggestion };
  }
  throw err;
}
```

**Step 6: Run tests**

Run: `npx vitest run tests/evals/batch-facts-tool.test.ts tests/evals/archive-fact-tool.test.ts tests/evals/reorder-items-tool.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git commit -m "feat: batch_facts, archive_fact, unarchive_fact, reorder_items tools"
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
    section.slot = targetSlot;
    upsertDraft(username, { ...draft }, sessionId);

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

### Task 10: Fix reorder_sections + maxSteps → 8

**Files:**
- Modify: `src/lib/agent/tools.ts` (reorder_sections, around line 331-365)
- Modify: `src/app/api/chat/route.ts:259` (maxSteps)
- Test: `tests/evals/reorder-sections-fix.test.ts`

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

In `src/lib/agent/tools.ts`, the `reorder_sections` tool: after reordering the array, call `groupSectionsBySlot()` to validate. If issues found, include as warnings in result (non-blocking).

In `src/app/api/chat/route.ts:259`, change `maxSteps: 5` to `maxSteps: 8`.

**Step 3: Run tests**

Run: `npx vitest run tests/evals/reorder-sections-fix.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git commit -m "fix: reorder_sections slot validation + maxSteps 5→8"
```

---

### Task 11: Planning Protocol (replaces actionAwarenessPolicy)

**Files:**
- Create: `src/lib/agent/policies/planning-protocol.ts`
- Modify: `src/lib/agent/policies/action-awareness.ts` → DELETE
- Modify: `src/lib/agent/policies/index.ts` (remove actionAwareness import/export)
- Modify: `src/lib/agent/prompts.ts:277-333` (buildSystemPrompt — replace actionAwarenessPolicy with planningProtocol)
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

Delete `src/lib/agent/policies/action-awareness.ts`.

Update `src/lib/agent/policies/index.ts`: remove `actionAwarenessPolicy` import/export.

Update `src/lib/agent/prompts.ts:277-333`: in `buildSystemPrompt()`, replace `actionAwarenessPolicy()` call with `planningProtocol()`.

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

describe("archetype context injection", () => {
  it("injects archetype block in onboarding mode", () => {
    // assembleContext in onboarding mode → systemPrompt contains "ARCHETYPE:"
  });

  it("does NOT inject archetype block in steady_state mode", () => {
    // assembleContext in steady_state → no "ARCHETYPE:" in systemPrompt
  });

  it("includes exploration order and coverage", () => {
    // archetype block should show which areas are explored vs empty
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/archetype-wiring.test.ts`
Expected: FAIL

**Step 3: Implement**

1. `src/lib/agent/journey.ts`: update `assembleBootstrapPayload` signature to accept `lastUserMessage?: string`. After detecting journey state, call `detectArchetypeFromSignals()`. Save to session metadata. Return archetype in payload.

2. `src/lib/agent/context.ts`: in `assembleContext()`, if mode is onboarding/returning_no_page and bootstrap has archetype, build archetype context block (~150 tokens) with explorationOrder, toneHint, and coverage (which categories have facts vs empty).

3. `src/app/api/chat/route.ts`: extract last user message text from `messages` array, pass to `assembleBootstrapPayload()`.

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

1. In `src/lib/agent/tools.ts`: add `operationJournal: JournalEntry[]` array at closure level. Each tool execute wraps its result with `operationJournal.push(...)`. Export `getOperationJournal()` from the tools closure.

2. In `src/app/api/chat/route.ts`: in `onFinish`, check if steps used >= maxSteps. If yes and journal is non-empty, save to `sessions.metadata.pendingOperations`.

3. In `src/lib/agent/context.ts`: check `sessions.metadata.pendingOperations`. If exists and timestamp < 1 hour: inject INCOMPLETE_OPERATION block. If timestamp > 1 hour: delete from metadata.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/operation-journal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git commit -m "feat: operation journal — tool call tracking + resume on step exhaustion"
```

---

### Task 14: Page Coherence Check

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
import { checkPageCoherence, type CoherenceIssue } from "@/lib/services/coherence-check";

describe("page coherence check", () => {
  it("returns empty issues for coherent page", () => {
    // page with consistent role, skills, experience → no issues
  });

  it("detects ROLE_MISMATCH", () => {
    // hero says "Senior Architect", experience only shows junior roles
  });

  it("SKILL_GAP is always severity info", () => {
    // skills not in projects → severity must be "info", never "warning"
  });

  it("LEVEL_MISMATCH is always severity info", () => {
    // seniority claim vs experience years → severity must be "info"
  });

  it("returns max 3 issues", () => {
    // page with many inconsistencies → capped at 3
  });

  it("only runs on pages with 3+ content sections", () => {
    // page with only hero + footer → should return empty/skip
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

**Step 3: Implement coherence check service**

Create `src/lib/services/coherence-check.ts`:

```typescript
import { generateObject } from "ai";
import { z } from "zod";
import type { Section } from "@/lib/page-config/schema";
import { getModel } from "@/lib/ai/model";

export type CoherenceIssue = {
  type: "role_mismatch" | "timeline_overlap" | "skill_gap" | "level_mismatch" | "completeness_gap";
  severity: "info" | "warning";
  description: string;
  suggestion: string;
  affectedSections: string[];
};

const coherenceSchema = z.object({
  issues: z.array(z.object({
    type: z.enum(["role_mismatch", "timeline_overlap", "skill_gap", "level_mismatch", "completeness_gap"]),
    severity: z.enum(["info", "warning"]),
    description: z.string(),
    suggestion: z.string(),
    affectedSections: z.array(z.string()),
  })).max(3),
});

export async function checkPageCoherence(sections: Section[]): Promise<CoherenceIssue[]> {
  const contentSections = sections.filter(s => s.type !== "hero" && s.type !== "footer" && Object.keys(s.content).length > 0);
  if (contentSections.length < 3) return [];

  const { object } = await generateObject({
    model: getModel(),
    schema: coherenceSchema,
    prompt: buildCoherencePrompt(sections),
  });

  // Force severity rules
  return object.issues.map(issue => ({
    ...issue,
    severity: (issue.type === "skill_gap" || issue.type === "level_mismatch") ? "info" : issue.severity,
  }));
}
```

**Step 4: Wire into generate_page**

In `src/lib/agent/tools.ts`, in the `generate_page` tool execute, after the personalization fire-and-forget block: add another fire-and-forget for coherence:

```typescript
if (mode === "steady_state") {
  (async () => {
    try {
      const issues = await checkPageCoherence(config.sections);
      if (issues.length > 0) {
        // Save to session metadata
        saveToSession(sessionId, "coherenceIssues", issues);
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

Wire in `src/lib/agent/context.ts`: read `sessions.metadata.coherenceIssues`, inject via directive.

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

In `detectSituations()`, add relevance calculation:

```typescript
// Archivable facts detection
const activeFacts = getActiveFacts(ownerKey);
if (activeFacts.length > 5) {
  const childCounts = db.select({
    parentId: facts.parentFactId,
    count: sql<number>`count(*)`,
  }).from(facts)
    .where(and(isNotNull(facts.parentFactId), isNull(facts.archivedAt)))
    .groupBy(facts.parentFactId)
    .all();
  const childMap = new Map(childCounts.map(r => [r.parentId, r.count]));

  const archivable = activeFacts.filter(f => {
    const recency = recencyFactor(f.updatedAt);
    const children = childMap.get(f.id) ?? 0;
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

### Task 16: TOOL_POLICY Update

**Files:**
- Modify: `src/lib/agent/prompts.ts:41+` (TOOL_POLICY block)
- Test: `tests/evals/tool-policy-update.test.ts`

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

**Step 3: Run tests**

Run: `npx vitest run tests/evals/tool-policy-update.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git commit -m "docs: TOOL_POLICY updated with batch_facts, move_section, reorder_items, archive/unarchive"
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

**Step 1: Find all test files importing getAllFacts**

Run: `grep -r "getAllFacts" tests/`

**Step 2: Update imports**

Replace `getAllFacts` with `getActiveFacts` in all test files (except any that explicitly test archived fact behavior).

**Step 3: Delete action-awareness.test.ts**

This test file tests `actionAwarenessPolicy()` which no longer exists.

**Step 4: Run full suite**

Run: `npx vitest run`
Expected: ALL pass

**Step 5: Commit**

```bash
git commit -m "test: update existing tests for Smart Facts model — getActiveFacts, FactRow, planning protocol"
```

---

## Summary

| Task | Layer | Description | Depends On |
|------|-------|-------------|------------|
| 1 | L0 | Migration 0019 + schema + FactRow | — |
| 2 | L1 | Archived filtering + getActiveFacts | T1 |
| 3 | L1 | FactConstraintError + current uniqueness | T1 |
| 4 | L1 | Archetype detection constants | — |
| 5 | L2 | sortOrder in composer | T1 |
| 6 | L2 | parentFactId grouping in composer | T1 |
| 7 | L2 | Slot carry-over + soft-pin | T1 |
| 8 | L2 | batch_facts, archive, unarchive, reorder_items tools | T2, T3 |
| 9 | L3 | move_section tool | T7 |
| 10 | L3 | Fix reorder_sections + maxSteps→8 | — |
| 11 | L3 | Planning Protocol | — |
| 12 | L3 | Archetype wiring | T4 |
| 13 | L4 | Operation Journal | T10 |
| 14 | L4 | Page Coherence Check | — |
| 15 | L4 | has_archivable_facts directive | T2 |
| 16 | L4 | TOOL_POLICY update | T8, T9 |
| 17 | L5 | Integration tests | All |
| 18 | L5 | Update existing tests | All |

**Parallelism:** Within each layer, tasks are independent and can be done in parallel. Cross-layer dependencies are strict.

**Estimated tests:** ~90 new + ~35 updated = ~1250 total (from 1151 current).
