# Profile Completeness Score Implementation Plan (v10)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `has_sparse_profile` situation that overrides quick-update mode in `draft_ready`, `active_fresh`, and `active_stale` journey states, keeping the AI in data-collection mode until the profile reaches a minimum publishable fact count (>=10 facts).

**Architecture:** New `Situation` (`"has_sparse_profile"`) detected inside `detectSituations()` via `publishable.length < SPARSE_PROFILE_FACT_THRESHOLD`. State-gating done via `DIRECTIVE_POLICY.eligibleStates`. Threshold constant in new `src/lib/agent/thresholds.ts` (no imports). No new fields in `SituationContext`, `BootstrapPayload`, or `prompts.ts`.

**Verification gate:** `npx vitest run` (no `npm run test` script; repo has pre-existing TS errors unrelated to this feature — do NOT use `npx tsc --noEmit` as a pass gate).

**Critical constraint:** `DirectivePolicy = { [S in Situation]: DirectiveEntry<S> }` is exhaustive. `Situation` type extension and `DIRECTIVE_POLICY` entry must land in the same commit.

**Incompatibility staging:** `incompatibleWith: []` in the Task 1 stub — only `has_archivable_facts` is added in Task 2 when the real builder exists.

**Priority + incompatibility strategy:** `has_sparse_profile` gets priority **1** and is **mutually incompatible** with `has_recent_import` (priority **2**). When both situations are active, `resolveIncompatibilities()` drops `has_recent_import` (the loser) before `build()` ever runs — so `has_recent_import.build()`'s potential empty-string return is irrelevant. Sparse wins and fires. When only `has_recent_import` is active (profile is rich), it fires normally. Note: `validateDirectivePolicy()` requires symmetric `incompatibleWith` entries.

---

## Design Decisions

- **Lightweight thresholds module** (`src/lib/agent/thresholds.ts`): no imports, safe to use from both `journey.ts` and `situations.ts`.
- **Priority + incompatibility for sparse vs recent_import**: sparse (p1) is mutually incompatible with recent_import (p2). When both are active, sparse wins the incompatibility resolution and fires; recent_import is dropped before its build() runs. No silent-empty-directive risk.
- **Symmetric incompatibility staged to Task 2**: sparse (p1) wins over archivable (p4) via incompatibility. Both wired atomically when real directive exists.
- **Hard override**: directive forbids publish-redirect and "profile is ready" framing, with exception for explicit user insistence.
- **Eligible states**: `draft_ready`, `active_fresh`, `active_stale` only.
- **`@/lib/db` mock**: must include both `sqlite` and `db: {}`.

---

## Context: Key Files

| File | Role |
|------|------|
| `src/lib/agent/thresholds.ts` | NEW: no-import threshold constants |
| `src/lib/agent/journey.ts` | `Situation` type, `detectSituations()` |
| `src/lib/agent/policies/directive-registry.ts` | `DIRECTIVE_POLICY`, `SituationContextMap`, `SITUATION_REQUIRED_KEYS` |
| `src/lib/agent/policies/situations.ts` | Directive builders |
| `tests/evals/directive-matrix.test.ts` | Snapshot matrix |
| `tests/evals/journey-state-detection.test.ts` | `detectSituations` tests — line 327-330 MUST be updated |

---

## Relevant Code (for implementer)

### `detectSituations()` actual signature
```typescript
export function detectSituations(
  facts: FactRow[],
  ownerKey: string,
  opts?: {
    pendingProposalCount?: number;
    openConflicts?: Array<{ category: string; key: string }>;
    publishableFacts?: FactRow[];
    childCountMap?: Map<string, number>;
  },
): Situation[]
// Inside: const publishable = opts?.publishableFacts ?? filterPublishableFacts(facts);
```

### `FactRow` fixture shape
```typescript
{ id: "f1", category: "skill", key: "s1", value: {},
  source: "chat", confidence: 1, visibility: "public",  // "visibility" NOT "privacy"
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
// No "sessionId" field.
```

### `@/lib/db` mock (must include both)
```typescript
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) })) },
  db: {},  // REQUIRED
}));
```

### Existing broken test (journey-state-detection.test.ts line 327-330)
```typescript
// detectSituations([], "cog-1") will return ["has_sparse_profile"] after our change.
// Must pass 10+ publishable facts to simulate a rich profile.
```

---

## Task 1: Thresholds + type extension + detection + registry stub (atomic commit)

**Files:**
- Create: `src/lib/agent/thresholds.ts`
- Modify: `src/lib/agent/journey.ts`
- Modify: `src/lib/agent/policies/directive-registry.ts`
- Modify: `tests/evals/journey-state-detection.test.ts`
- Modify: `tests/evals/directive-matrix.test.ts`

Note: `incompatibleWith: []` in the stub — both archivable and recent_import incompatibilities are added atomically in Task 2 with the real builder.

### Step 1: Create `src/lib/agent/thresholds.ts`

```typescript
/**
 * Lightweight threshold constants for agent policies.
 * No imports — safe to use from journey.ts and situations.ts without circular deps.
 */

/** Publishable fact count below which a profile is too sparse for quick-update mode. */
export const SPARSE_PROFILE_FACT_THRESHOLD = 10;
```

### Step 2: Add import in `journey.ts`

At the top of `src/lib/agent/journey.ts`:
```typescript
import { SPARSE_PROFILE_FACT_THRESHOLD } from "@/lib/agent/thresholds";
```

### Step 3: Add `"has_sparse_profile"` to `Situation` type in `journey.ts`

```typescript
export type Situation =
  | "has_pending_proposals"
  | "has_thin_sections"
  | "has_stale_facts"
  | "has_open_conflicts"
  | "has_archivable_facts"
  | "has_recent_import"
  | "has_name"
  | "has_soul"
  | "has_pending_soul_proposals"
  | "has_sparse_profile";  // NEW
```

### Step 4: Add detection inside `detectSituations()` — after `publishable` is computed

Find `const publishable = opts?.publishableFacts ?? filterPublishableFacts(facts);`. Add immediately after:
```typescript
if (publishable.length < SPARSE_PROFILE_FACT_THRESHOLD) {
  situations.push("has_sparse_profile");
}
```

### Step 5: Add entries to `directive-registry.ts`

a. `SituationContextMap`:
```typescript
has_sparse_profile: Pick<SituationContext, "thinSections">;
```

b. `SITUATION_REQUIRED_KEYS`:
```typescript
has_sparse_profile: ["thinSections"],
```

c. `DIRECTIVE_POLICY` (stub — priority 1, no incompatibility yet):
```typescript
has_sparse_profile: {
  priority: 1,                            // outranks has_recent_import (p2) when incompatible — sparse wins, recent_import dropped
  tieBreak: "has_sparse_profile",
  eligibleStates: ["draft_ready", "active_fresh", "active_stale"],
  incompatibleWith: [],                   // empty — only archivable added in Task 2 with real builder
  build: (_ctx) => "",                    // stub — replaced in Task 2
},
```

d. **Update `has_recent_import` priority** from 1 to 2 (to make room for sparse at p1):
```typescript
has_recent_import: {
  priority: 2,          // was 1; renumbered so sparse (p1) wins when both situations are active
  // all other fields unchanged
},
```

### Step 6: Fix breaking test in `journey-state-detection.test.ts`

Add import:
```typescript
import { SPARSE_PROFILE_FACT_THRESHOLD } from "@/lib/agent/thresholds";
```

Replace test at line 327-330:
```typescript
// BEFORE:
it("returns empty array when nothing special is detected", () => {
  const result = detectSituations([], "cog-1");
  expect(result).toEqual([]);
});

// AFTER (comprehensive — checks ALL non-expected situations are absent):
it("returns no special situations when profile is rich and no anomalies detected", () => {
  const richFacts = Array.from({ length: SPARSE_PROFILE_FACT_THRESHOLD }, (_, i) => ({
    id: `f${i}`, category: "skill", key: `s${i}`, value: {},
    source: "chat", confidence: 1, visibility: "public",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }));
  const result = detectSituations([], "cog-1", { publishableFacts: richFacts });
  const unexpected = [
    "has_sparse_profile", "has_pending_proposals", "has_stale_facts",
    "has_open_conflicts", "has_thin_sections", "has_archivable_facts",
    "has_recent_import",
  ];
  for (const s of unexpected) {
    expect(result).not.toContain(s);
  }
});
```

Add detection tests inside `describe("detectSituations")`:
```typescript
it("returns has_sparse_profile when publishable facts < threshold", () => {
  const sparseFacts = Array.from({ length: SPARSE_PROFILE_FACT_THRESHOLD - 1 }, (_, i) => ({
    id: `f${i}`, category: "skill", key: `s${i}`, value: {},
    source: "chat", confidence: 1, visibility: "public",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }));
  expect(detectSituations([], "cog-1", { publishableFacts: sparseFacts }))
    .toContain("has_sparse_profile");
});

it("does NOT return has_sparse_profile when publishable facts >= threshold", () => {
  const richFacts = Array.from({ length: SPARSE_PROFILE_FACT_THRESHOLD }, (_, i) => ({
    id: `f${i}`, category: "skill", key: `s${i}`, value: {},
    source: "chat", confidence: 1, visibility: "public",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }));
  expect(detectSituations([], "cog-1", { publishableFacts: richFacts }))
    .not.toContain("has_sparse_profile");
});
```

### Step 7: Update `directive-matrix.test.ts`

```typescript
const ALL_SITUATIONS: Situation[] = [
  "has_pending_proposals", "has_thin_sections", "has_stale_facts",
  "has_open_conflicts", "has_archivable_facts", "has_recent_import",
  "has_name", "has_soul", "has_pending_soul_proposals",
  "has_sparse_profile", // NEW
];

const FIRST_VISIT_INELIGIBLE: Situation[] = [
  "has_pending_proposals", "has_thin_sections", "has_stale_facts",
  "has_open_conflicts", "has_archivable_facts", "has_recent_import",
  "has_name", "has_soul",
  "has_sparse_profile", // NEW
];
```

### Step 8: Run tests and update snapshots

```bash
npx vitest run tests/evals/journey-state-detection.test.ts tests/evals/directive-matrix.test.ts --reporter=verbose
```

Update snapshots for new `has_sparse_profile` entries (all produce "" since build is stub):
```bash
npx vitest run tests/evals/directive-matrix.test.ts -u
```

All tests must pass before proceeding.

### Step 9: Commit (atomic)

```bash
git add src/lib/agent/thresholds.ts src/lib/agent/journey.ts src/lib/agent/policies/directive-registry.ts tests/evals/journey-state-detection.test.ts tests/evals/directive-matrix.test.ts "tests/evals/__snapshots__/directive-matrix.test.ts.snap"
git commit -m "feat(journey): add has_sparse_profile situation, detection, and registry stub"
```

---

## Task 2: Real directive + incompatibility wiring (atomic commit)

**Files:**
- Modify: `src/lib/agent/policies/situations.ts`
- Modify: `src/lib/agent/policies/directive-registry.ts`

Both changes land in the same commit so incompatibility + real build go live together.

### Step 1: Read `situations.ts` to understand style conventions

### Step 2: Add import and builder to `situations.ts`

Add import:
```typescript
import { SPARSE_PROFILE_FACT_THRESHOLD } from "@/lib/agent/thresholds";
```

Add at end of file:
```typescript
/**
 * Hard override directive: keeps AI in data-collection mode until profile richness threshold is met.
 * Eligible states: draft_ready, active_fresh, active_stale.
 */
export function sparseProfileDirective(thinSections: string[]): string {
  const missing = thinSections.length > 0
    ? thinSections.slice(0, 5).join(", ")
    : "experience, education, skills";
  return `SPARSE PROFILE — DATA COLLECTION OVERRIDE:
This profile has fewer than ${SPARSE_PROFILE_FACT_THRESHOLD} publishable facts — not enough for a complete page yet.
Thin or missing sections: ${missing}.

MANDATORY BEHAVIOR:
- Do NOT redirect to publishing or re-publishing yet.
- Do NOT frame the profile as "solid", "complete", or "ready".
- After handling any quick tweak the user explicitly requests, ask ONE focused question to fill in a missing area (experience, background, projects, education, skills, or interests).
- Keep the conversation flowing toward richer data.
- Exception: if the user explicitly says they want to publish or are done, respect that — do not block indefinitely.`;
}
```

### Step 3: Update `directive-registry.ts`

a. Add to import list:
```typescript
import {
  ...,
  sparseProfileDirective, // NEW
} from "@/lib/agent/policies/situations";
```

b. Replace stub build and add incompatibility (archivable + recent_import — both land atomically):
```typescript
has_sparse_profile: {
  priority: 1,                                                    // outranks recent_import (p2) — wins incompatibility resolution
  tieBreak: "has_sparse_profile",
  eligibleStates: ["draft_ready", "active_fresh", "active_stale"],
  incompatibleWith: ["has_archivable_facts", "has_recent_import"], // symmetric; sparse wins both conflicts
  build: (ctx) => sparseProfileDirective(ctx.thinSections),
},
```

c. Update `has_archivable_facts` entry:
```typescript
has_archivable_facts: {
  // existing fields unchanged...
  incompatibleWith: ["has_thin_sections", "has_sparse_profile"],  // added has_sparse_profile
  // ...
},
```

d. Update `has_recent_import` entry (add symmetric incompatibility):
```typescript
has_recent_import: {
  priority: 2,        // was 1; renumbered so sparse (p1) wins when both situations are incompatible and active
  // all other fields unchanged...
  incompatibleWith: ["has_sparse_profile"],  // symmetric; sparse (p1) wins — recent_import dropped before build() runs
  // ...
},
```

### Step 4: Run eval tests and update snapshots (stub was "", now real text)

```bash
npx vitest run tests/evals/directive-matrix.test.ts tests/evals/journey-state-detection.test.ts --reporter=verbose
npx vitest run tests/evals/directive-matrix.test.ts -u
```

All tests must pass.

### Step 5: Commit (atomic — real builder + incompatibility together)

```bash
git add src/lib/agent/policies/situations.ts src/lib/agent/policies/directive-registry.ts "tests/evals/__snapshots__/directive-matrix.test.ts.snap"
git commit -m "feat(policies): implement sparseProfileDirective with hard override and archivable incompatibility"
```

---

## Task 3: Add directive/eligibility tests

**Files:**
- Create: `tests/evals/sparse-profile.test.ts`

### Step 1: Create test file

```typescript
// tests/evals/sparse-profile.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
  db: {},  // REQUIRED: journey.ts imports both sqlite and db
}));

import { sparseProfileDirective } from "@/lib/agent/policies/situations";
import { getSituationDirectives } from "@/lib/agent/policies/directive-registry";
import { SPARSE_PROFILE_FACT_THRESHOLD } from "@/lib/agent/thresholds";
import type { SituationContext } from "@/lib/agent/policies";

const mockCtx: SituationContext = {
  pendingProposalCount: 0,
  pendingProposalSections: [],
  thinSections: ["experience", "education", "skills"],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
};

describe("sparseProfileDirective text", () => {
  it("contains DATA COLLECTION OVERRIDE", () => {
    expect(sparseProfileDirective([])).toContain("DATA COLLECTION OVERRIDE");
  });

  it("embeds the threshold value", () => {
    expect(sparseProfileDirective([])).toContain(String(SPARSE_PROFILE_FACT_THRESHOLD));
  });

  it("lists provided thin sections", () => {
    const text = sparseProfileDirective(["experience", "education"]);
    expect(text).toContain("experience");
    expect(text).toContain("education");
  });

  it("falls back to default sections when thinSections is empty", () => {
    expect(sparseProfileDirective([])).toMatch(/experience|education|skills/);
  });

  it("explicitly forbids publish redirect", () => {
    expect(sparseProfileDirective([])).toMatch(/do not redirect.*publish/i);
  });

  it("explicitly forbids praising the profile", () => {
    expect(sparseProfileDirective([])).toMatch(/do not frame/i);
  });

  it("provides exception path for user insistence", () => {
    expect(sparseProfileDirective([])).toMatch(/exception/i);
  });
});

describe("has_sparse_profile directive eligibility", () => {
  it("produces directive in draft_ready", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "draft_ready", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces directive in active_fresh", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "active_fresh", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces directive in active_stale", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "active_stale", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces NO directive in first_visit", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "first_visit", mockCtx)).toBe("");
  });

  it("produces NO directive in returning_no_page", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "returning_no_page", mockCtx)).toBe("");
  });

  it("produces NO directive in blocked", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "blocked", mockCtx)).toBe("");
  });

  it("has_sparse_profile wins over has_archivable_facts in active_stale (incompatible)", () => {
    const ctxWithArchivable = { ...mockCtx, archivableFacts: ["experience/old-job"] };
    const combined = getSituationDirectives(
      ["has_sparse_profile", "has_archivable_facts"],
      "active_stale",
      ctxWithArchivable,
    );
    const sparseOnly = getSituationDirectives(["has_sparse_profile"], "active_stale", mockCtx);

    expect(combined).toContain("DATA COLLECTION OVERRIDE");
    // combined equals sparse-only (archivable fully dropped via incompatibility)
    expect(combined).toBe(sparseOnly);
  });

  it("has_sparse_profile wins over has_recent_import even when importGapReport is present (incompatible, p1 vs p2)", () => {
    // Regression test: when both are active and importGapReport is present (post-import path),
    // has_sparse_profile (p1) must win the incompatibility resolution so that recent_import
    // guidance (e.g. "POST-IMPORT") does NOT leak through alongside sparse override.
    const ctxWithImport: SituationContext = {
      ...mockCtx,
      importGapReport: { importedAt: new Date().toISOString(), newFactCount: 3, gapAreas: ["education"] },
    };
    const combined = getSituationDirectives(
      ["has_sparse_profile", "has_recent_import"],
      "active_stale",
      ctxWithImport,
    );
    // Sparse directive fires
    expect(combined).toContain("DATA COLLECTION OVERRIDE");
    // Recent-import directive does NOT appear (it was dropped by incompatibility resolution)
    expect(combined).not.toMatch(/post-import/i);
  });
});
```

### Step 2: Run sparse-profile tests

```bash
npx vitest run tests/evals/sparse-profile.test.ts --reporter=verbose
```

All tests must pass.

### Step 3: Run full eval suite

```bash
npx vitest run tests/evals/ --reporter=verbose
```

All tests must pass.

### Step 4: Commit

```bash
git add tests/evals/sparse-profile.test.ts
git commit -m "test(evals): add sparse-profile directive and eligibility tests"
```

---

## Task 4: Final verification

### Step 1: Run full test suite

```bash
npx vitest run
```

All tests must pass. Zero failures.

---

## Summary

| File | Change |
|------|--------|
| `src/lib/agent/thresholds.ts` | NEW: `SPARSE_PROFILE_FACT_THRESHOLD = 10` (no imports) |
| `src/lib/agent/journey.ts` | Import threshold; `"has_sparse_profile"` in `Situation`; detection in `detectSituations()` |
| `src/lib/agent/policies/situations.ts` | Import threshold; `sparseProfileDirective(thinSections)` |
| `src/lib/agent/policies/directive-registry.ts` | All new entries; `has_recent_import.priority` 1→2 + `incompatibleWith` updated; `has_archivable_facts.incompatibleWith` updated |
| `tests/evals/journey-state-detection.test.ts` | Fix broken test (comprehensive) + add detection tests |
| `tests/evals/sparse-profile.test.ts` | NEW: directive text + eligibility + conflict tests (including sparse-vs-recent_import) |
| `tests/evals/directive-matrix.test.ts` | `"has_sparse_profile"` in `ALL_SITUATIONS` and `FIRST_VISIT_INELIGIBLE` |

**Not changed:** `SituationContext`, `BootstrapPayload`, `prompts.ts`, `detectSituations()` signature, any existing policy text.
