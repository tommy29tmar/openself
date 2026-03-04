# Agent Behavior Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the agent prompt pipeline to eliminate silent directive conflicts, stale archetype data, broken welcome messages, and vague personality instructions — making the LLM interaction maximally natural and self-consistent.

**Architecture:** Single-source-of-truth `DIRECTIVE_POLICY` matrix with eligibility/priority/incompatibility per situation. Schema injection controlled by `schemaMode` per journey state. Archetype TTL + DB-backed soul cooldown. Unified welcome message. Rewritten `CORE_CHARTER`.

**Design doc:** `docs/plans/2026-03-04-agent-behavior-refactor-design.md`

**Tech Stack:** TypeScript, Next.js App Router, Vitest, SQLite/Drizzle, Vercel AI SDK

**Test runner:** `npx vitest run tests/evals/<file>.test.ts`
**Run all tests:** `npx vitest run`

---

## Task 1: Create `DirectiveConflictError` and `SITUATION_REQUIRED_KEYS`

> Foundation types needed by Tasks 2–4. No logic yet — just types and constants.

**Files:**
- Create: `src/lib/agent/policies/directive-registry.ts`

**Step 1: Create the file with types only**

```typescript
// src/lib/agent/policies/directive-registry.ts

import type { JourneyState, Situation } from "@/lib/agent/journey";
import type { SituationContext } from "@/lib/agent/policies";

// ── Type-safe context mapping ────────────────────────────────────────────────
// Each Situation maps to ONLY the SituationContext fields it is allowed to use.
// Accessing ctx.staleFacts inside a has_thin_sections build() is a compile error.
export type SituationContextMap = {
  has_pending_proposals: Pick<SituationContext, "pendingProposalCount" | "pendingProposalSections">;
  has_thin_sections:     Pick<SituationContext, "thinSections">;
  has_stale_facts:       Pick<SituationContext, "staleFacts">;
  has_open_conflicts:    Pick<SituationContext, "openConflicts">;
  has_archivable_facts:  Pick<SituationContext, "archivableFacts">;
  has_recent_import:     Pick<SituationContext, "importGapReport">;
  has_name:              Record<never, never>;
  has_soul:              Record<never, never>;
};

export type DirectiveEntry<S extends Situation> = {
  /** Lower number = higher priority. Wins on incompatibleWith conflicts. */
  priority: number;
  /** Deterministic tie-break when priority is equal. Use situation name string. */
  tieBreak: string;
  /** Whitelist of journey states where this directive may appear. Single source of truth. */
  eligibleStates: JourneyState[];
  /**
   * Other situations whose directives must not co-exist with this one.
   * MUST be symmetric: if A lists B, B must list A — enforced by validateDirectivePolicy().
   * If intentionally asymmetric, document why here.
   */
  incompatibleWith: Situation[];
  build: (ctx: SituationContextMap[S]) => string;
};

export type DirectivePolicy = {
  [S in Situation]: DirectiveEntry<S>;
};

export class DirectiveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectiveConflictError";
  }
}

// Runtime validation: which context keys each situation requires.
// Used by getCtxFor() to validate before build().
export const SITUATION_REQUIRED_KEYS: { [S in Situation]: (keyof SituationContext)[] } = {
  has_pending_proposals: ["pendingProposalCount", "pendingProposalSections"],
  has_thin_sections:     ["thinSections"],
  has_stale_facts:       ["staleFacts"],
  has_open_conflicts:    ["openConflicts"],
  has_archivable_facts:  ["archivableFacts"],
  has_recent_import:     ["importGapReport"],
  has_name:              [],
  has_soul:              [],
};
```

**Step 2: Write a trivial smoke test to confirm the file compiles**

```typescript
// tests/evals/directive-registry-types.test.ts
import { describe, it, expect } from "vitest";
import { DirectiveConflictError, SITUATION_REQUIRED_KEYS } from "@/lib/agent/policies/directive-registry";

describe("directive-registry types", () => {
  it("DirectiveConflictError is an Error", () => {
    const e = new DirectiveConflictError("test");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("DirectiveConflictError");
  });

  it("SITUATION_REQUIRED_KEYS covers all situations", () => {
    const keys = Object.keys(SITUATION_REQUIRED_KEYS);
    expect(keys).toContain("has_thin_sections");
    expect(keys).toContain("has_pending_proposals");
    expect(keys).toContain("has_recent_import");
  });
});
```

**Step 3: Run the test — must pass**

```bash
npx vitest run tests/evals/directive-registry-types.test.ts
```

Expected: PASS (no logic yet, just types)

**Step 4: Commit**

```bash
git add src/lib/agent/policies/directive-registry.ts tests/evals/directive-registry-types.test.ts
git commit -m "feat(agent): add directive-registry types and DirectiveConflictError"
```

---

## Task 2: Build `DIRECTIVE_POLICY` and `getCtxFor()`

> The single-source-of-truth policy matrix and its type-safe context accessor.

**Files:**
- Modify: `src/lib/agent/policies/directive-registry.ts`
- Modify: `src/lib/agent/policies/situations.ts` (import directive functions)

**Step 1: Write failing tests for `getCtxFor`**

```typescript
// tests/evals/directive-registry-getctxfor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logEvent so we don't need full app context
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { getCtxFor } from "@/lib/agent/policies/directive-registry";
import type { SituationContext } from "@/lib/agent/policies";

const fullCtx: SituationContext = {
  pendingProposalCount: 2,
  pendingProposalSections: ["skills"],
  thinSections: ["education"],
  staleFacts: ["experience/acme"],
  openConflicts: [],
  archivableFacts: [],
  importGapReport: undefined,
};

describe("getCtxFor", () => {
  it("returns correct pick for has_thin_sections", () => {
    const ctx = getCtxFor("has_thin_sections", fullCtx);
    expect(ctx).not.toBeNull();
    expect((ctx as any).thinSections).toEqual(["education"]);
    // Should NOT have staleFacts (TypeScript enforces, runtime does not need to, but ctx shape is correct)
  });

  it("returns null in production when required field is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    const badCtx = { ...fullCtx, thinSections: undefined as any };
    const result = getCtxFor("has_thin_sections", badCtx);
    expect(result).toBeNull();
    (process.env as any).NODE_ENV = originalEnv;
  });

  it("throws in dev/test when required field is missing", () => {
    const badCtx = { ...fullCtx, thinSections: undefined as any };
    expect(() => getCtxFor("has_thin_sections", badCtx)).toThrow();
  });
});
```

**Step 2: Run — must FAIL (function not defined yet)**

```bash
npx vitest run tests/evals/directive-registry-getctxfor.test.ts
```

Expected: FAIL — "getCtxFor is not a function"

**Step 3: Implement `getCtxFor` and `DIRECTIVE_POLICY` in `directive-registry.ts`**

Append to `src/lib/agent/policies/directive-registry.ts`:

```typescript
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
  archivableFactsDirective,
  recentImportDirective,
} from "@/lib/agent/policies/situations";
import { logEvent } from "@/lib/services/event-service";

export function getCtxFor<S extends Situation>(
  situation: S,
  context: SituationContext,
): SituationContextMap[S] | null {
  for (const key of SITUATION_REQUIRED_KEYS[situation]) {
    if (context[key] === undefined || context[key] === null) {
      const msg = `[directive-registry] Missing context field "${key}" for situation "${situation}"`;
      if (process.env.NODE_ENV !== "production") throw new Error(msg);
      logEvent("directive_context_missing_field", { situation, field: key });
      return null;
    }
  }
  return context as unknown as SituationContextMap[S];
}

// All journey states — used by validator and tests
export const ALL_JOURNEY_STATES: JourneyState[] = [
  "first_visit", "returning_no_page", "draft_ready",
  "active_fresh", "active_stale", "blocked",
];

export const DIRECTIVE_POLICY: DirectivePolicy = {
  has_pending_proposals: {
    priority: 1,
    tieBreak: "has_pending_proposals",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => pendingProposalsDirective(ctx.pendingProposalCount, ctx.pendingProposalSections),
  },
  has_thin_sections: {
    priority: 3,
    tieBreak: "has_thin_sections",
    // active_fresh EXCLUDED: its policy explicitly says "do not suggest improvements"
    eligibleStates: ["returning_no_page", "draft_ready", "active_stale"],
    incompatibleWith: ["has_archivable_facts"],
    build: (ctx) => thinSectionsDirective(ctx.thinSections),
  },
  has_stale_facts: {
    priority: 2,
    tieBreak: "has_stale_facts",
    eligibleStates: ["active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => staleFactsDirective(ctx.staleFacts),
  },
  has_open_conflicts: {
    priority: 1,
    tieBreak: "has_open_conflicts",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => openConflictsDirective(ctx.openConflicts),
  },
  has_archivable_facts: {
    priority: 4,
    tieBreak: "has_archivable_facts",
    // Only meaningful when page is stale and there's accumulated clutter
    eligibleStates: ["active_stale"],
    incompatibleWith: ["has_thin_sections"],
    build: (ctx) => archivableFactsDirective(ctx.archivableFacts),
  },
  has_recent_import: {
    priority: 1,
    tieBreak: "has_recent_import",
    eligibleStates: ["returning_no_page", "draft_ready", "active_fresh", "active_stale"],
    incompatibleWith: [],
    build: (ctx) => recentImportDirective(ctx.importGapReport!),
  },
  // Signal-only situations — never produce directives
  has_name: {
    priority: 99, tieBreak: "has_name", eligibleStates: [], incompatibleWith: [],
    build: () => "",
  },
  has_soul: {
    priority: 99, tieBreak: "has_soul", eligibleStates: [], incompatibleWith: [],
    build: () => "",
  },
};
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/directive-registry-getctxfor.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/agent/policies/directive-registry.ts tests/evals/directive-registry-getctxfor.test.ts
git commit -m "feat(agent): add DIRECTIVE_POLICY matrix and type-safe getCtxFor"
```

---

## Task 3: Implement `getSituationDirectives()` with eligibility + conflict resolution

**Files:**
- Modify: `src/lib/agent/policies/directive-registry.ts`

**Step 1: Write failing tests**

```typescript
// tests/evals/directive-matrix.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));

import {
  getSituationDirectives,
  ALL_JOURNEY_STATES,
  DirectiveConflictError,
} from "@/lib/agent/policies/directive-registry";
import type { SituationContext } from "@/lib/agent/policies";
import type { Situation, JourneyState } from "@/lib/agent/journey";

const ALL_SITUATIONS: Situation[] = [
  "has_pending_proposals", "has_thin_sections", "has_stale_facts",
  "has_open_conflicts", "has_archivable_facts", "has_recent_import",
  "has_name", "has_soul",
];

const mockCtx: SituationContext = {
  pendingProposalCount: 1,
  pendingProposalSections: ["skills"],
  thinSections: ["education", "projects"],
  staleFacts: ["experience/acme"],
  openConflicts: ["identity/role"],
  archivableFacts: ["interest/chess"],
  importGapReport: undefined,
};

// ── Guard by construction ────────────────────────────────────────────────────
describe("first_visit guard", () => {
  it("always returns empty string regardless of situations", () => {
    for (const s of ALL_SITUATIONS) {
      expect(getSituationDirectives([s], "first_visit", mockCtx)).toBe("");
    }
  });
  it("returns empty for empty situations array", () => {
    expect(getSituationDirectives([], "first_visit", mockCtx)).toBe("");
  });
});

// ── Eligibility filtering ────────────────────────────────────────────────────
describe("eligibility filtering", () => {
  it("has_thin_sections is NOT injected in active_fresh", () => {
    const result = getSituationDirectives(["has_thin_sections"], "active_fresh", mockCtx);
    expect(result).toBe("");
  });

  it("has_thin_sections IS injected in active_stale", () => {
    const result = getSituationDirectives(["has_thin_sections"], "active_stale", mockCtx);
    expect(result).toContain("THIN SECTIONS");
  });

  it("has_archivable_facts is NOT injected in active_fresh", () => {
    const result = getSituationDirectives(["has_archivable_facts"], "active_fresh", mockCtx);
    expect(result).toBe("");
  });
});

// ── Conflict resolution (incompatibleWith) ───────────────────────────────────
describe("conflict resolution", () => {
  it("[active_stale] has_thin_sections(p3) wins over has_archivable_facts(p4)", () => {
    const result = getSituationDirectives(
      ["has_thin_sections", "has_archivable_facts"],
      "active_stale",
      mockCtx,
    );
    expect(result).toContain("THIN SECTIONS");
    expect(result).not.toContain("ARCHIVABLE");
  });

  it("[active_stale] order of input array does not change winner", () => {
    const r1 = getSituationDirectives(["has_thin_sections", "has_archivable_facts"], "active_stale", mockCtx);
    const r2 = getSituationDirectives(["has_archivable_facts", "has_thin_sections"], "active_stale", mockCtx);
    expect(r1).toBe(r2);
  });

  it("in test env, conflict throws DirectiveConflictError", () => {
    // This should NOT throw because the conflict is resolved (not an error condition).
    // DirectiveConflictError is only thrown when the conflict IS surprising (e.g., same priority).
    // If both have different priority, they resolve silently. Verify no throw for normal case:
    expect(() =>
      getSituationDirectives(["has_thin_sections", "has_archivable_facts"], "active_stale", mockCtx)
    ).not.toThrow();
  });
});

// ── Combination tests ────────────────────────────────────────────────────────
describe("combinations", () => {
  it("[active_stale] multiple compatible directives all appear", () => {
    const result = getSituationDirectives(
      ["has_pending_proposals", "has_stale_facts"],
      "active_stale",
      mockCtx,
    );
    expect(result).toContain("PENDING PROPOSALS");
    expect(result).toContain("STALE FACTS");
  });

  it("[draft_ready] has_pending_proposals + has_open_conflicts both appear", () => {
    const result = getSituationDirectives(
      ["has_pending_proposals", "has_open_conflicts"],
      "draft_ready",
      mockCtx,
    );
    expect(result).toContain("PENDING PROPOSALS");
    expect(result).toContain("OPEN CONFLICTS");
  });
});

// ── Priority ordering ────────────────────────────────────────────────────────
describe("priority ordering", () => {
  it("output is ordered by priority (lower priority number first)", () => {
    const result = getSituationDirectives(
      ["has_stale_facts", "has_pending_proposals"], // p2, p1
      "active_stale",
      mockCtx,
    );
    const pendingIdx = result.indexOf("PENDING PROPOSALS");
    const staleIdx = result.indexOf("STALE FACTS");
    expect(pendingIdx).toBeLessThan(staleIdx); // p1 before p2
  });
});

// ── Snapshot: full matrix ────────────────────────────────────────────────────
describe("snapshot matrix", () => {
  for (const state of ALL_JOURNEY_STATES) {
    for (const situation of ALL_SITUATIONS) {
      it(`[${state}] + [${situation}]`, () => {
        const result = getSituationDirectives([situation], state, mockCtx);
        expect(result).toMatchSnapshot();
      });
    }
  }
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/directive-matrix.test.ts
```

Expected: FAIL — `getSituationDirectives is not a function`

**Step 3: Implement `resolveIncompatibilities` and `getSituationDirectives`**

Append to `src/lib/agent/policies/directive-registry.ts`:

```typescript
function resolveIncompatibilities(
  eligible: Situation[],
  journeyState: JourneyState,
): Situation[] {
  const dropped = new Set<Situation>();

  for (let i = 0; i < eligible.length; i++) {
    const s = eligible[i];
    if (dropped.has(s)) continue;

    for (const incompatible of DIRECTIVE_POLICY[s].incompatibleWith) {
      if (!eligible.includes(incompatible) || dropped.has(incompatible)) continue;

      const winnerPriority = DIRECTIVE_POLICY[s].priority;
      const loserPriority = DIRECTIVE_POLICY[incompatible].priority;

      // s wins (lower priority number = higher importance)
      const msg =
        `[directive-registry] Conflict: ${s}(p=${winnerPriority}) ` +
        `vs ${incompatible}(p=${loserPriority}) in ${journeyState} — ${incompatible} dropped`;

      if (process.env.NODE_ENV === "test" && winnerPriority === loserPriority) {
        // Only throw if same priority (genuinely ambiguous — this is a policy bug)
        throw new DirectiveConflictError(msg);
      }
      if (process.env.NODE_ENV === "development") console.warn(msg);

      // prod: structured log (always, not sampled — conflicts should be rare)
      logEvent("directive_conflict_resolved", {
        winner: s,
        dropped: incompatible,
        journeyState,
        winnerPriority,
        droppedPriority: loserPriority,
      });

      dropped.add(incompatible);
    }
  }

  return eligible.filter(s => !dropped.has(s));
}

export function getSituationDirectives(
  situations: Situation[],
  journeyState: JourneyState,
  context: SituationContext,
): string {
  // Guard by construction: first_visit never receives situation directives
  if (journeyState === "first_visit") return "";

  const eligible = situations
    .filter(s => DIRECTIVE_POLICY[s].eligibleStates.includes(journeyState))
    .sort((a, b) => {
      const diff = DIRECTIVE_POLICY[a].priority - DIRECTIVE_POLICY[b].priority;
      if (diff !== 0) return diff;
      // Deterministic tie-break: alphabetical by tieBreak string
      return DIRECTIVE_POLICY[a].tieBreak.localeCompare(DIRECTIVE_POLICY[b].tieBreak);
    });

  const resolved = resolveIncompatibilities(eligible, journeyState);

  const parts: string[] = [];
  for (const s of resolved) {
    const ctx = getCtxFor(s, context);
    if (ctx === null) continue; // missing field — already logged
    const text = DIRECTIVE_POLICY[s].build(ctx);
    if (text) parts.push(text);
  }

  return parts.length > 0 ? `SITUATION DIRECTIVES:\n${parts.join("\n\n")}` : "";
}
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/directive-matrix.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/agent/policies/directive-registry.ts tests/evals/directive-matrix.test.ts
git commit -m "feat(agent): implement getSituationDirectives with eligibility + conflict resolution"
```

---

## Task 4: Add `validateDirectivePolicy()` and wire into `policies/index.ts`

**Files:**
- Create: `src/lib/agent/policies/validate-directive-policy.ts`
- Modify: `src/lib/agent/policies/index.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/validate-directive-policy.test.ts
import { describe, it, expect } from "vitest";
import { validateDirectivePolicy } from "@/lib/agent/policies/validate-directive-policy";
import { DIRECTIVE_POLICY } from "@/lib/agent/policies/directive-registry";

// Mock event-service (imported transitively)
import { vi } from "vitest";
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));

describe("validateDirectivePolicy", () => {
  it("passes for the real DIRECTIVE_POLICY", () => {
    expect(() => validateDirectivePolicy(DIRECTIVE_POLICY)).not.toThrow();
  });

  it("throws on self-conflict", () => {
    const bad = {
      ...DIRECTIVE_POLICY,
      has_thin_sections: { ...DIRECTIVE_POLICY.has_thin_sections, incompatibleWith: ["has_thin_sections"] as any },
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Self-conflict");
  });

  it("throws on asymmetric incompatibleWith", () => {
    // has_thin_sections says incompatibleWith has_archivable_facts,
    // but has_archivable_facts does NOT say incompatibleWith has_thin_sections
    const bad = {
      ...DIRECTIVE_POLICY,
      has_archivable_facts: { ...DIRECTIVE_POLICY.has_archivable_facts, incompatibleWith: [] },
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Asymmetric");
  });

  it("throws on invalid journeyState in eligibleStates", () => {
    const bad = {
      ...DIRECTIVE_POLICY,
      has_stale_facts: { ...DIRECTIVE_POLICY.has_stale_facts, eligibleStates: ["nonexistent_state" as any] },
    };
    expect(() => validateDirectivePolicy(bad)).toThrow("Unknown journeyState");
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/validate-directive-policy.test.ts
```

**Step 3: Implement `validate-directive-policy.ts`**

```typescript
// src/lib/agent/policies/validate-directive-policy.ts
import type { Situation } from "@/lib/agent/journey";
import { ALL_JOURNEY_STATES, type DirectivePolicy } from "@/lib/agent/policies/directive-registry";

const INTENTIONALLY_EMPTY_STATES: Situation[] = ["has_name", "has_soul"];

export function validateDirectivePolicy(policy: DirectivePolicy): void {
  for (const [situation, entry] of Object.entries(policy) as [Situation, DirectivePolicy[Situation]][]) {
    // 1. No self-conflict
    if (entry.incompatibleWith.includes(situation)) {
      throw new Error(`[DIRECTIVE_POLICY] Self-conflict: ${situation}`);
    }

    // 2. No empty eligibleStates (unless intentionally signal-only)
    if (entry.eligibleStates.length === 0 && !INTENTIONALLY_EMPTY_STATES.includes(situation)) {
      throw new Error(
        `[DIRECTIVE_POLICY] Empty eligibleStates for "${situation}". ` +
        `If intentional, add to INTENTIONALLY_EMPTY_STATES in validate-directive-policy.ts`
      );
    }

    // 3. Valid journeyState references
    for (const state of entry.eligibleStates) {
      if (!ALL_JOURNEY_STATES.includes(state)) {
        throw new Error(`[DIRECTIVE_POLICY] Unknown journeyState "${state}" in ${situation}.eligibleStates`);
      }
    }

    // 4. Symmetric incompatibleWith
    for (const other of entry.incompatibleWith) {
      const otherEntry = policy[other];
      if (!otherEntry) {
        throw new Error(`[DIRECTIVE_POLICY] Unknown situation "${other}" in ${situation}.incompatibleWith`);
      }
      if (!otherEntry.incompatibleWith.includes(situation)) {
        throw new Error(
          `[DIRECTIVE_POLICY] Asymmetric incompatibility: "${situation}" → "${other}" ` +
          `but "${other}" does not list "${situation}". Add it, or document why asymmetric.`
        );
      }
    }
  }
}
```

**Step 4: Wire into `policies/index.ts`**

In `src/lib/agent/policies/index.ts`, replace the old `getSituationDirectives` export with the new one from `directive-registry.ts`, and re-export `validateDirectivePolicy`:

```typescript
// src/lib/agent/policies/index.ts — modify imports section

// REMOVE: old import of getSituationDirectives logic
// ADD:
export { getSituationDirectives } from "@/lib/agent/policies/directive-registry";
export { validateDirectivePolicy } from "@/lib/agent/policies/validate-directive-policy";

// Keep: getJourneyPolicy, getExpertiseCalibration (unchanged)
```

Also update `getSituationDirectives` call in `context.ts` to pass `bootstrap.journeyState` as third argument:

```typescript
// src/lib/agent/context.ts — find getSituationDirectives call (~line 336)
// Before:
const situationDirectives = getSituationDirectives(bootstrap.situations, situationContext);
// After:
const situationDirectives = getSituationDirectives(
  bootstrap.situations,
  bootstrap.journeyState,  // NEW
  situationContext,
);
```

**Step 5: Run all tests — must PASS**

```bash
npx vitest run tests/evals/validate-directive-policy.test.ts
npx vitest run tests/evals/directive-matrix.test.ts
npx vitest run  # full suite — no regressions
```

**Step 6: Commit**

```bash
git add src/lib/agent/policies/validate-directive-policy.ts \
        src/lib/agent/policies/index.ts \
        src/lib/agent/context.ts \
        tests/evals/validate-directive-policy.test.ts
git commit -m "feat(agent): add policy validator + wire new getSituationDirectives into context"
```

---

## Task 5: Facts context quality — relevance sort + guaranteed recency + `childCountMap` in `BootstrapData`

**Files:**
- Modify: `src/lib/agent/journey.ts` (add `childCountMap` to `BootstrapData`)
- Modify: `src/lib/agent/context.ts` (use childCountMap, relevance sort, recency quota)

**Step 1: Write failing test**

```typescript
// tests/evals/facts-relevance-sort.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { sortFactsForContext } from "@/lib/agent/context";
import type { FactRow } from "@/lib/services/kb-service";

function makeF(id: string, updatedAt: string, confidence = 1.0): FactRow {
  return {
    id, category: "skill", key: id, value: {}, confidence,
    updatedAt, createdAt: updatedAt, archivedAt: null,
    source: "user", parentFactId: null, sortOrder: 0,
    sessionId: "s1", visibility: "proposed",
  } as FactRow;
}

describe("sortFactsForContext", () => {
  it("always includes the 5 most recently updated facts regardless of score", () => {
    // Create 52 facts: 47 old high-confidence + 5 very recent low-confidence
    const old = Array.from({ length: 47 }, (_, i) =>
      makeF(`old-${i}`, "2020-01-01T00:00:00.000Z", 1.0)
    );
    const recent = Array.from({ length: 5 }, (_, i) =>
      makeF(`recent-${i}`, "2026-03-04T00:00:00.000Z", 0.1) // low confidence but recent
    );
    const all = [...old, ...recent];

    const result = sortFactsForContext(all, new Map(), 50);
    const ids = result.map(f => f.id);

    // All 5 recent facts must be in the top 50
    for (let i = 0; i < 5; i++) {
      expect(ids).toContain(`recent-${i}`);
    }
    expect(result).toHaveLength(50);
  });

  it("returns all facts when total <= cap", () => {
    const facts = [makeF("a", "2026-01-01"), makeF("b", "2025-06-01")];
    const result = sortFactsForContext(facts, new Map(), 50);
    expect(result).toHaveLength(2);
  });

  it("tie-breaks on updatedAt desc when scores are equal", () => {
    const f1 = makeF("older", "2025-01-01", 1.0);
    const f2 = makeF("newer", "2026-01-01", 1.0);
    const result = sortFactsForContext([f1, f2], new Map(), 50);
    expect(result[0].id).toBe("newer");
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/facts-relevance-sort.test.ts
```

**Step 3: Add `sortFactsForContext` to `context.ts` and update `BootstrapData`**

In `src/lib/agent/journey.ts`, update `BootstrapData`:

```typescript
export interface BootstrapData {
  facts: FactRow[];
  soul: { compiled: string | null } | null;
  openConflictRecords: ConflictRow[];
  publishableFacts: FactRow[];
  childCountMap: Map<string, number>;  // ADD THIS
}

// In assembleBootstrapPayload, update the return:
return {
  payload: { /* unchanged */ },
  data: {
    facts,
    soul,
    openConflictRecords,
    publishableFacts: publishable,
    childCountMap,  // ADD THIS (already computed on line ~371)
  },
};
```

In `src/lib/agent/context.ts`, add the exported function and use it:

```typescript
import { computeRelevance } from "@/lib/agent/journey";

/**
 * Sort facts for context injection:
 * 1. Guarantee the N most recently updated facts are always included
 * 2. Fill remaining slots by relevance score (confidence × recency × children)
 * 3. Tie-break: updatedAt desc
 */
export function sortFactsForContext(
  facts: FactRow[],
  childCountMap: Map<string, number>,
  cap: number,
  recentGuaranteeCount = 5,
): FactRow[] {
  if (facts.length <= cap) return facts;

  const sorted = [...facts].sort(
    (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
  );

  const recentIds = new Set(sorted.slice(0, recentGuaranteeCount).map(f => f.id));
  const guaranteed = sorted.slice(0, recentGuaranteeCount);

  const rest = facts
    .filter(f => !recentIds.has(f.id))
    .map(f => ({ f, score: computeRelevance(f, childCountMap) }))
    .sort((a, b) =>
      b.score - a.score ||
      new Date(b.f.updatedAt ?? 0).getTime() - new Date(a.f.updatedAt ?? 0).getTime()
    )
    .map(({ f }) => f)
    .slice(0, cap - recentGuaranteeCount);

  return [...guaranteed, ...rest];
}

// In assembleContext, replace `existingFacts.slice(0, 50)` with:
const childCountMap = bootstrapData?.childCountMap ?? new Map<string, number>();
const topFacts = sortFactsForContext(existingFacts, childCountMap, 50);
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/facts-relevance-sort.test.ts
npx vitest run  # full suite
```

**Step 5: Commit**

```bash
git add src/lib/agent/journey.ts src/lib/agent/context.ts tests/evals/facts-relevance-sort.test.ts
git commit -m "feat(agent): relevance-sort facts with guaranteed recency quota"
```

---

## Task 6: Add `schemaMode` to `ContextProfile` and minimal onboarding schema

**Files:**
- Modify: `src/lib/agent/context.ts` (ContextProfile type + CONTEXT_PROFILES)
- Modify: `src/lib/agent/prompts.ts` (buildMinimalSchemaForOnboarding, buildSystemPrompt)

**Step 1: Write failing test**

```typescript
// tests/evals/schema-mode.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

function makeBootstrap(journeyState: string): BootstrapPayload {
  return {
    journeyState: journeyState as any,
    situations: [], expertiseLevel: "novice",
    userName: null, lastSeenDaysAgo: null, publishedUsername: null,
    pendingProposalCount: 0, thinSections: [], staleFacts: [],
    openConflicts: [], archivableFacts: [], language: "en",
    conversationContext: null, archetype: "generalist",
  };
}

// FACT_SCHEMA_REFERENCE contains "| experience |" — a signature string
const FULL_SCHEMA_MARKER = "| experience |";
// minimal schema contains "experience:" in a different format
const MINIMAL_SCHEMA_MARKER = "experience: {role, company";

describe("schemaMode per journey state", () => {
  it("first_visit: injects minimal schema, not full", () => {
    const prompt = buildSystemPrompt(makeBootstrap("first_visit"), { schemaMode: "minimal" });
    expect(prompt).toContain(MINIMAL_SCHEMA_MARKER);
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
  });

  it("returning_no_page: injects full schema", () => {
    const prompt = buildSystemPrompt(makeBootstrap("returning_no_page"), { schemaMode: "full" });
    expect(prompt).toContain(FULL_SCHEMA_MARKER);
  });

  it("draft_ready: injects no schema", () => {
    const prompt = buildSystemPrompt(makeBootstrap("draft_ready"), { schemaMode: "none" });
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
    expect(prompt).not.toContain(MINIMAL_SCHEMA_MARKER);
  });

  it("active_fresh: injects no schema", () => {
    const prompt = buildSystemPrompt(makeBootstrap("active_fresh"), { schemaMode: "none" });
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/schema-mode.test.ts
```

**Step 3: Update `ContextProfile` in `context.ts`**

```typescript
// In context.ts — update ContextProfile type:
export type ContextProfile = {
  facts: { include: boolean; budget: number };
  soul: { include: boolean; budget: number };
  summary: { include: boolean; budget: number };
  memories: { include: boolean; budget: number };
  conflicts: { include: boolean; budget: number };
  richness: { include: boolean };
  layoutIntelligence: { include: boolean };
  schemaMode: "full" | "minimal" | "none";  // replaces includeSchemaReference: boolean
};

// Update CONTEXT_PROFILES:
export const CONTEXT_PROFILES: Record<JourneyState, ContextProfile> = {
  first_visit:       { ..., schemaMode: "minimal" },
  returning_no_page: { ..., schemaMode: "full"    },
  draft_ready:       { ..., schemaMode: "none"    },
  active_fresh:      { ..., schemaMode: "none"    },
  active_stale:      { ..., schemaMode: "minimal" },
  blocked:           { ..., schemaMode: "none"    },
};
```

**Step 4: Update `buildSystemPrompt` in `prompts.ts`**

```typescript
// Add to prompts.ts:
function buildMinimalSchemaForOnboarding(): string {
  return `FACT CATEGORIES (most common):
- identity: {full?, role?, city?, tagline?}
- experience: {role, company, start?: "YYYY-MM"|null, end?: "YYYY-MM"|null, status: "current"|"past"}
- education: {institution, degree?, field?, period?}
- skill: {name, level?: "beginner"|"intermediate"|"advanced"|"expert"}
- interest: {name, detail?}
- project: {name, description?, url?, status?: "active"|"completed"}
- language: {language, proficiency?: "native"|"fluent"|"advanced"|"intermediate"|"beginner"}
After collecting name + role + 2-3 more facts, call generate_page.`;
}

// Update buildSystemPrompt signature:
export function buildSystemPrompt(
  bootstrap: BootstrapPayload,
  opts?: { schemaMode?: "full" | "minimal" | "none" },
): string {
  const schemaMode = opts?.schemaMode ?? "full";

  const schemaBlock =
    schemaMode === "full"    ? [FACT_SCHEMA_REFERENCE, DATA_MODEL_REFERENCE] :
    schemaMode === "minimal" ? [buildMinimalSchemaForOnboarding()]            :
    /* none */                 [];

  const blocks = [
    CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY,
    ...schemaBlock,
    OUTPUT_CONTRACT, journeyPolicy,
    // ... rest unchanged
  ];
  // ...
}

// Update call in context.ts:
const basePrompt = bootstrap
  ? buildSystemPrompt(bootstrap, { schemaMode: profile?.schemaMode ?? "full" })
  : buildSystemPrompt(
      { journeyState: "first_visit", language, situations: [],
        expertiseLevel: "novice", /* safe defaults */ } as BootstrapPayload,
      { schemaMode: "minimal" }
    );
```

**Step 5: Run tests — must PASS**

```bash
npx vitest run tests/evals/schema-mode.test.ts
npx vitest run  # full suite
```

**Step 6: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/prompts.ts tests/evals/schema-mode.test.ts
git commit -m "feat(agent): add schemaMode per journey state, minimal schema for onboarding"
```

---

## Task 7: Archetype TTL + identity-change invalidation

**Files:**
- Modify: `src/lib/agent/journey.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/archetype-redetect.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() })) },
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { shouldRedetectArchetype } from "@/lib/agent/journey";
import type { FactRow } from "@/lib/services/kb-service";

function roleFact(updatedAt: string): FactRow {
  return {
    id: "r1", category: "identity", key: "role", value: { role: "chef" },
    updatedAt, createdAt: updatedAt, confidence: 1.0,
    archivedAt: null, source: "user", parentFactId: null,
    sortOrder: 0, sessionId: "s1", visibility: "proposed",
  } as FactRow;
}

describe("shouldRedetectArchetype", () => {
  it("returns true when no archetype cached", () => {
    expect(shouldRedetectArchetype({}, [])).toBe(true);
  });

  it("returns true when TTL (14 days) expired", () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldRedetectArchetype({ archetype: "developer", archetypeDetectedAt: old }, [])).toBe(true);
  });

  it("returns false when TTL not expired and no role change", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const oldRole = roleFact(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    expect(shouldRedetectArchetype({ archetype: "developer", archetypeDetectedAt: recent }, [oldRole])).toBe(false);
  });

  it("returns true when identity/role updated after archetypeDetectedAt", () => {
    const detectedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const roleUpdatedAfter = roleFact(new Date().toISOString()); // updated NOW
    expect(shouldRedetectArchetype({ archetype: "developer", archetypeDetectedAt: detectedAt }, [roleUpdatedAfter])).toBe(true);
  });

  it("prefers identity/role over identity/title for invalidation check", () => {
    const detectedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    // role updated recently, title is old
    const roleNew: FactRow = { ...roleFact(new Date().toISOString()), key: "role" };
    const titleOld: FactRow = {
      ...roleFact(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()),
      key: "title", id: "t1",
    };
    expect(shouldRedetectArchetype(
      { archetype: "developer", archetypeDetectedAt: detectedAt },
      [titleOld, roleNew]
    )).toBe(true);
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/archetype-redetect.test.ts
```

**Step 3: Add `shouldRedetectArchetype` to `journey.ts`**

```typescript
// src/lib/agent/journey.ts — add after existing constants

export const ARCHETYPE_TTL_DAYS = 14;

export function shouldRedetectArchetype(
  meta: Record<string, unknown>,
  facts: FactRow[],
): boolean {
  if (!meta.archetype || !meta.archetypeDetectedAt) return true;

  if (daysBetween(new Date(meta.archetypeDetectedAt as string), new Date()) > ARCHETYPE_TTL_DAYS) {
    return true;
  }

  // Check if identity/role (preferred) or identity/title changed after detection
  const roleFact = facts
    .filter(f => f.category === "identity" && (f.key === "role" || f.key === "title"))
    .sort((a, b) => {
      if (a.key === "role" && b.key !== "role") return -1;
      if (b.key === "role" && a.key !== "role") return 1;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    })[0];

  if (roleFact?.updatedAt) {
    return new Date(roleFact.updatedAt) > new Date(meta.archetypeDetectedAt as string);
  }

  return false;
}

// In assembleBootstrapPayload, replace the archetype block (~lines 443-464):
const anchorMeta = archetypeSessionId ? getSessionMeta(archetypeSessionId) : {};
let archetype: Archetype;

if (!shouldRedetectArchetype(anchorMeta, facts)) {
  archetype = anchorMeta.archetype as Archetype;
} else {
  const roleFact = facts
    .filter(f => f.category === "identity" && (f.key === "role" || f.key === "title"))
    .sort((a, b) => {
      if (a.key === "role" && b.key !== "role") return -1;
      if (b.key === "role" && a.key !== "role") return 1;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    })[0];
  const roleStr = roleFact
    ? (typeof roleFact.value === "object" && roleFact.value !== null
      ? (roleFact.value as Record<string, unknown>).role as string ?? JSON.stringify(roleFact.value)
      : String(roleFact.value))
    : null;
  const raw = detectArchetypeFromSignals(roleStr, lastUserMessage ?? null);
  archetype = refineArchetype(facts, raw);
  if (archetypeSessionId) {
    mergeSessionMeta(archetypeSessionId, { archetype, archetypeDetectedAt: new Date().toISOString() });
  }
}
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/archetype-redetect.test.ts
npx vitest run
```

**Step 5: Commit**

```bash
git add src/lib/agent/journey.ts tests/evals/archetype-redetect.test.ts
git commit -m "feat(agent): archetype TTL (14d) + identity-change invalidation"
```

---

## Task 8: Soul proposal cooldown at owner level (DB-backed)

**Files:**
- Modify: `src/lib/agent/journey.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/soul-proposal-cooldown.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to control what the DB returns
const mockGet = vi.fn();
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: mockGet,
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  },
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
  getPendingProposals: vi.fn(() => []),
  proposeSoulChange: vi.fn(),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { getSoulProposalCooldownStatus } from "@/lib/agent/journey";

describe("getSoulProposalCooldownStatus", () => {
  beforeEach(() => mockGet.mockReset());

  it("returns { blocked: false } when no rejection on record", () => {
    mockGet.mockReturnValue({ latest: null });
    expect(getSoulProposalCooldownStatus("owner1").blocked).toBe(false);
  });

  it("returns { blocked: true } when rejected within 30 days", () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockReturnValue({ latest: recent });
    expect(getSoulProposalCooldownStatus("owner1").blocked).toBe(true);
  });

  it("returns { blocked: false } when rejected more than 30 days ago", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockReturnValue({ latest: old });
    expect(getSoulProposalCooldownStatus("owner1").blocked).toBe(false);
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/soul-proposal-cooldown.test.ts
```

**Step 3: Add `getSoulProposalCooldownStatus` to `journey.ts`**

```typescript
// src/lib/agent/journey.ts — add new exported function

const SOUL_PROPOSAL_COOLDOWN_DAYS = 30;

export function getSoulProposalCooldownStatus(ownerKey: string): { blocked: boolean; lastRejectedAt: string | null } {
  const row = sqlite
    .prepare(`SELECT MAX(created_at) as latest FROM soul_change_proposals WHERE owner_key = ? AND status = 'rejected'`)
    .get(ownerKey) as { latest: string | null } | undefined;

  const lastRejectedAt = row?.latest ?? null;
  if (!lastRejectedAt) return { blocked: false, lastRejectedAt: null };

  const blocked = daysBetween(new Date(lastRejectedAt), new Date()) < SOUL_PROPOSAL_COOLDOWN_DAYS;
  return { blocked, lastRejectedAt };
}

// In assembleBootstrapPayload, replace soul auto-proposal guard:
// Before:
//   const pendingSoulProposals = getPendingProposals(ownerKey);
//   if (pendingSoulProposals.length === 0) { proposeSoulChange(...) }
// After:
const { blocked: soulCooldownActive } = getSoulProposalCooldownStatus(ownerKey);
if (!soul && !soulCooldownActive && pendingSoulProposals.length === 0) {
  try {
    proposeSoulChange(ownerKey, { tone: strategy.toneHint, communicationStyle: strategy.communicationStyle },
      `Auto-suggested from detected archetype: ${archetype}`);
  } catch { /* best-effort: don't block bootstrap */ }
}
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/soul-proposal-cooldown.test.ts
npx vitest run
```

**Step 5: Commit**

```bash
git add src/lib/agent/journey.ts tests/evals/soul-proposal-cooldown.test.ts
git commit -m "fix(agent): soul proposal cooldown 30d based on DB rejection history"
```

---

## Task 9: Welcome message unification

**Files:**
- Modify: `src/components/chat/ChatPanel.tsx`

**Step 1: Find all current welcome message reference points**

```bash
grep -n "getWelcomeMessage\|getSmartWelcomeMessage\|WELCOME_MESSAGES\|allWelcomeTexts\|id: .welcome" \
  src/components/chat/ChatPanel.tsx
```

Note all line numbers. There should be approximately 6-8 reference points.

**Step 2: Implement `buildWelcomeMessage()` as new function, keep old ones temporarily**

Add above the existing `getWelcomeMessage` function:

```typescript
// src/components/chat/ChatPanel.tsx — add new unified function
function buildWelcomeMessage(
  language: string,
  bootstrap: BootstrapResponse | null,
): StoredMessage {
  const lang = language || "en";

  if (!bootstrap) {
    return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };
  }

  switch (bootstrap.journeyState) {
    case "first_visit":
      return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };

    case "returning_no_page":
      return { id: "welcome", role: "assistant", content: RETURNING_WELCOME[lang] ?? RETURNING_WELCOME.en };

    case "draft_ready":
      return { id: "welcome", role: "assistant", content: DRAFT_READY_WELCOME[lang] ?? DRAFT_READY_WELCOME.en };

    case "blocked":
      return { id: "welcome", role: "assistant", content: QUOTA_EXHAUSTED_MESSAGES[lang] ?? QUOTA_EXHAUSTED_MESSAGES.en };

    case "active_fresh":
    case "active_stale": {
      const name = bootstrap.userName;
      const templates: Record<string, string> = {
        en: name ? `Hey ${name}! What would you like to update?` : "Hey! What would you like to update?",
        it: name ? `Ciao ${name}! Cosa vuoi aggiornare?` : "Ciao! Cosa vuoi aggiornare?",
        de: name ? `Hey ${name}! Was möchtest du aktualisieren?` : "Hey! Was möchtest du aktualisieren?",
        fr: name ? `Salut ${name}\u00a0! Que veux-tu mettre à jour\u00a0?` : "Salut\u00a0! Que veux-tu mettre à jour\u00a0?",
        es: name ? `¡Hola ${name}! ¿Qué quieres actualizar?` : "¡Hola! ¿Qué quieres actualizar?",
        pt: name ? `Olá ${name}! O que queres atualizar?` : "Olá! O que queres atualizar?",
        ja: name ? `${name}さん！何を更新しますか？` : "何を更新しますか？",
        zh: name ? `${name}，你好！想更新什么？` : "你好！想更新什么？",
      };
      return { id: "welcome", role: "assistant", content: templates[lang] ?? templates.en };
    }

    default:
      return { id: "welcome", role: "assistant", content: FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en };
  }
}
```

**Step 3: Replace all call sites**

- Replace `getWelcomeMessage(language)` → `buildWelcomeMessage(language, null)`
- Replace `getSmartWelcomeMessage(language, bootstrap)` → `buildWelcomeMessage(language, bootstrap)`

**Step 4: Simplify the dedup check**

Find the `allWelcomeTexts` set (~line 619) and replace with:

```typescript
// Before: comparing against a set of all possible welcome strings
const allWelcomeTexts = new Set([...]);
const welcomeAlreadyStored = restored.some(msg => msg.role === "assistant" && allWelcomeTexts.has(msg.content));

// After: id-based check (all welcome messages share id: "welcome")
const welcomeAlreadyStored = restored.some(msg => msg.role === "assistant" && msg.id === "welcome");
const welcome = buildWelcomeMessage(language, null); // fallback; will be replaced by smart welcome
```

**Step 5: Delete old functions**

Remove `getWelcomeMessage()`, `getSmartWelcomeMessage()`, and `WELCOME_MESSAGES` (the legacy one — keep `FIRST_VISIT_WELCOME`, `RETURNING_WELCOME`, `DRAFT_READY_WELCOME`, `QUOTA_EXHAUSTED_MESSAGES`).

**Step 6: Manual test** — start dev server, verify welcome messages for each journey state

```bash
npm run dev:watch
```

Open app in browser. Check: first visit, blocked user, draft_ready user.

**Step 7: Commit**

```bash
git add src/components/chat/ChatPanel.tsx
git commit -m "feat(ui): unify welcome message via buildWelcomeMessage(), fix blocked state copy"
```

---

## Task 10: Fix `STEP_EXHAUSTION_FALLBACK` (R3 violation)

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Write test to document banned phrases**

```typescript
// tests/evals/step-exhaustion-fallback.test.ts
import { describe, it, expect } from "vitest";
import { STEP_EXHAUSTION_FALLBACK } from "@/app/api/chat/route";

// R3 banned phrases from turn-management.ts
const BANNED_PHRASES = [
  "let me know if you need",
  "feel free to ask",
  "i'm here if you need",
  "don't hesitate",
  "is there anything else",
  "just let me know",
  "let me know if you'd like",
  "let me know if you want",
];

describe("STEP_EXHAUSTION_FALLBACK — R3 compliance", () => {
  for (const [state, messages] of Object.entries(STEP_EXHAUSTION_FALLBACK)) {
    for (const [lang, text] of Object.entries(messages)) {
      it(`[${state}][${lang}] contains no banned R3 phrase`, () => {
        const lower = text.toLowerCase();
        for (const banned of BANNED_PHRASES) {
          expect(lower).not.toContain(banned);
        }
      });

      it(`[${state}][${lang}] is non-empty`, () => {
        expect(text.trim().length).toBeGreaterThan(0);
      });
    }
  }
});
```

**Step 2: Run — must FAIL (current fallback uses banned phrase)**

```bash
npx vitest run tests/evals/step-exhaustion-fallback.test.ts
```

Expected: FAIL — "I've updated your profile. Let me know if you'd like any changes." matches banned phrase.

**Step 3: Replace `STEP_EXHAUSTION_FALLBACK` in `route.ts`**

Note: `STEP_EXHAUSTION_FALLBACK` must be exported for the test to import it. Add `export` keyword.

```typescript
// src/app/api/chat/route.ts — replace the const (make it export + journey-state keyed):

import type { JourneyState } from "@/lib/agent/journey";

export const STEP_EXHAUSTION_FALLBACK: Record<JourneyState, Record<string, string>> = {
  first_visit: {
    en: "I've saved what you shared — take a look at the preview on the right!",
    it: "Ho salvato quello che mi hai detto — dai un'occhiata all'anteprima a destra!",
    de: "Ich habe gespeichert, was du mir erzählt hast — schau dir die Vorschau rechts an!",
    fr: "J'ai enregistré ce que tu m'as dit — jette un œil à l'aperçu à droite\u00a0!",
    es: "He guardado lo que me contaste — ¡echa un vistazo a la vista previa a la derecha!",
    pt: "Guardei o que me contaste — dá uma olhadela à pré-visualização à direita!",
    ja: "話してくれたことを保存しました — 右のプレビューを確認してください！",
    zh: "我已保存你分享的内容 — 看看右边的预览吧！",
  },
  returning_no_page: {
    en: "Done with that. Want me to build your page now?",
    it: "Fatto. Vuoi che costruisca la tua pagina adesso?",
    de: "Erledigt. Soll ich jetzt deine Seite erstellen?",
    fr: "C'est fait. Je te construis la page maintenant\u00a0?",
    es: "Listo. ¿Quieres que construya tu página ahora?",
    pt: "Pronto. Queres que crie a tua página agora?",
    ja: "完了です。今ページを作りましょうか？",
    zh: "好了。现在要我生成你的页面吗？",
  },
  draft_ready: {
    en: "Done. Publish now, or want to tweak something first?",
    it: "Fatto. Pubblichiamo adesso, o vuoi modificare qualcosa prima?",
    de: "Erledigt. Jetzt veröffentlichen oder erst noch etwas anpassen?",
    fr: "C'est fait. On publie maintenant, ou tu veux d'abord changer quelque chose\u00a0?",
    es: "Listo. ¿Publicamos ahora o quieres cambiar algo primero?",
    pt: "Pronto. Publicamos agora ou queres ajustar algo primeiro?",
    ja: "完了。今公開しますか、それとも先に何か調整しますか？",
    zh: "完成了。现在发布，还是先调整一下？",
  },
  active_fresh: {
    en: "Updated. Anything else to change?",
    it: "Aggiornato. Vuoi cambiare altro?",
    de: "Aktualisiert. Noch etwas zu ändern?",
    fr: "Mis à jour. Autre chose à modifier\u00a0?",
    es: "Actualizado. ¿Algo más que cambiar?",
    pt: "Atualizado. Mais alguma coisa a alterar?",
    ja: "更新しました。他に変更しますか？",
    zh: "已更新。还有什么要改的吗？",
  },
  active_stale: {
    en: "Done — want to republish with these updates?",
    it: "Fatto — vuoi ripubblicare con questi aggiornamenti?",
    de: "Erledigt — möchtest du mit diesen Updates neu veröffentlichen?",
    fr: "C'est fait — tu veux republier avec ces mises à jour\u00a0?",
    es: "Listo — ¿quieres volver a publicar con estas actualizaciones?",
    pt: "Pronto — queres republicar com estas atualizações?",
    ja: "完了 — これらの更新で再公開しますか？",
    zh: "完成了 — 要用这些更新重新发布吗？",
  },
  blocked: {
    en: "You've reached the message limit — pick a username to keep going!",
    it: "Hai raggiunto il limite di messaggi — scegli un username per continuare!",
    de: "Du hast das Nachrichtenlimit erreicht — wähle einen Benutzernamen, um weiterzumachen!",
    fr: "Tu as atteint la limite de messages — choisis un nom d'utilisateur pour continuer\u00a0!",
    es: "Has alcanzado el límite de mensajes — ¡elige un nombre de usuario para continuar!",
    pt: "Atingiste o limite de mensagens — escolhe um nome de utilizador para continuar!",
    ja: "メッセージ上限に達しました — 続けるにはユーザー名を選択してください！",
    zh: "已达到消息上限 — 选择用户名继续吧！",
  },
};

// In onFinish, replace the fallback lookup:
const syntheticText =
  STEP_EXHAUSTION_FALLBACK[bootstrap.journeyState]?.[sessionLanguage]
  ?? STEP_EXHAUSTION_FALLBACK[bootstrap.journeyState]?.en
  ?? STEP_EXHAUSTION_FALLBACK.active_fresh.en;
```

Note: `bootstrap` must be in scope in `onFinish`. It is already captured via closure from the outer `POST` function scope.

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/step-exhaustion-fallback.test.ts
npx vitest run
```

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts tests/evals/step-exhaustion-fallback.test.ts
git commit -m "fix(agent): STEP_EXHAUSTION_FALLBACK R3 compliance, journey-state-aware fallback"
```

---

## Task 11: Create `search-facts-rule.ts` and unify the "when to search" directive

**Files:**
- Create: `src/lib/agent/policies/search-facts-rule.ts`
- Modify: `src/lib/agent/policies/returning-no-page.ts`
- Modify: `src/lib/agent/policies/planning-protocol.ts`
- Modify: `src/lib/agent/policies/memory-directives.ts`

**Step 1: Create `search-facts-rule.ts`**

```typescript
// src/lib/agent/policies/search-facts-rule.ts

export const SEARCH_FACTS_RULE = `WHEN TO CALL search_facts:
- To find a specific factId BEFORE calling update_fact or delete_fact
- When you need a specific fact that is NOT visible in the KNOWN FACTS block above
DO NOT call search_facts:
- Speculatively "just to check" before asking a question
- When the fact is already visible in the KNOWN FACTS block
- As a substitute for reading the context you already have
This avoids unnecessary round-trips that add latency.`;
```

**Step 2: Update the three policy files to import and embed the rule**

In `returning-no-page.ts` (~line 27), replace:
```
- Use search_facts BEFORE every question to check what you already know.
```
With:
```typescript
import { SEARCH_FACTS_RULE } from "@/lib/agent/policies/search-facts-rule";
// ... in the template string:
${SEARCH_FACTS_RULE}
```

Same pattern for `planning-protocol.ts` (~line 21) and `memory-directives.ts` (~line 14).

**Step 3: Verify the text appears in composed prompts**

```typescript
// tests/evals/search-facts-rule.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) }}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { returningNoPagePolicy } from "@/lib/agent/policies/returning-no-page";
import { planningProtocol } from "@/lib/agent/policies/planning-protocol";
import { memoryUsageDirectives } from "@/lib/agent/policies/memory-directives";
import { SEARCH_FACTS_RULE } from "@/lib/agent/policies/search-facts-rule";

describe("search_facts rule embedding", () => {
  it("returningNoPagePolicy contains the unified search_facts rule", () => {
    expect(returningNoPagePolicy("en")).toContain("WHEN TO CALL search_facts");
  });
  it("planningProtocol contains the unified search_facts rule", () => {
    expect(planningProtocol()).toContain("WHEN TO CALL search_facts");
  });
  it("memoryUsageDirectives contains the unified search_facts rule", () => {
    expect(memoryUsageDirectives()).toContain("WHEN TO CALL search_facts");
  });
  it("none of them contain the old over-eager instruction", () => {
    for (const text of [returningNoPagePolicy("en"), planningProtocol(), memoryUsageDirectives()]) {
      expect(text).not.toContain("BEFORE every question");
    }
  });
});
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/search-facts-rule.test.ts
npx vitest run
```

**Step 5: Commit**

```bash
git add src/lib/agent/policies/search-facts-rule.ts \
        src/lib/agent/policies/returning-no-page.ts \
        src/lib/agent/policies/planning-protocol.ts \
        src/lib/agent/policies/memory-directives.ts \
        tests/evals/search-facts-rule.test.ts
git commit -m "fix(agent): unify search_facts usage rule, remove speculative pre-question calls"
```

---

## Task 12: `isNewTopicSignal()` and INCOMPLETE_OPERATION gating

**Files:**
- Create: `src/lib/agent/policies/topic-signal-detector.ts`
- Modify: `src/lib/agent/context.ts`

**Step 1: Write failing test**

```typescript
// tests/evals/topic-signal-detector.test.ts
import { describe, it, expect } from "vitest";
import { isNewTopicSignal } from "@/lib/agent/policies/topic-signal-detector";

describe("isNewTopicSignal", () => {
  it("long message (>30 chars) is always a new topic", () => {
    expect(isNewTopicSignal("this is a fairly long message that definitely has a new request in it", "en")).toBe(true);
  });

  it("short affirmations are NOT new topics", () => {
    for (const msg of ["ok", "sure", "yes", "sì", "ok!", "👍", "perfetto", "bello", "thanks"]) {
      expect(isNewTopicSignal(msg, "en")).toBe(false);
    }
  });

  it("action verbs in English trigger new topic", () => {
    expect(isNewTopicSignal("change the layout", "en")).toBe(true);
    expect(isNewTopicSignal("add my new job", "en")).toBe(true);
    expect(isNewTopicSignal("remove that skill", "en")).toBe(true);
  });

  it("action verbs in Italian trigger new topic", () => {
    expect(isNewTopicSignal("cambia il layout", "it")).toBe(true);
    expect(isNewTopicSignal("aggiungi il mio nuovo lavoro", "it")).toBe(true);
    expect(isNewTopicSignal("rimuovi quella competenza", "it")).toBe(true);
  });

  it("unknown language falls back to English patterns", () => {
    expect(isNewTopicSignal("change the layout", "xx")).toBe(true);
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/topic-signal-detector.test.ts
```

**Step 3: Implement `topic-signal-detector.ts`**

```typescript
// src/lib/agent/policies/topic-signal-detector.ts

const NEW_TOPIC_PATTERNS: Record<string, RegExp> = {
  en: /\b(change|update|add|remove|delete|create|build|generate|show|move|rename|I want|can you|please|fix|edit)\b/i,
  it: /\b(cambia|aggiorna|aggiungi|rimuovi|elimina|crea|costruisci|genera|mostra|sposta|rinomina|voglio|puoi|per favore|sistema|modifica)\b/i,
  de: /\b(änder|aktualisier|füge|entfern|lösch|erstell|bau|generier|zeig|beweg|umbenenn|ich möchte|kannst du|bitte|beheb)\b/i,
  fr: /\b(change|modifie|ajoute|supprime|crée|construis|génère|montre|déplace|renomme|je veux|peux.tu|s.il te plaît|corrige)\b/i,
  es: /\b(cambia|actualiza|agrega|elimina|crea|construye|genera|muestra|mueve|renombra|quiero|puedes|por favor|corrige|edita)\b/i,
  pt: /\b(muda|atualiza|adiciona|remove|elimina|cria|constrói|gera|mostra|move|renomeia|quero|podes|por favor|corrige|edita)\b/i,
  ja: /[変更追加削除作成移動修正してください]/,
  zh: /[改变更新添加删除创建移动修改]/,
};

export function isNewTopicSignal(message: string, language: string = "en"): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 30) return true;
  const pattern = NEW_TOPIC_PATTERNS[language] ?? NEW_TOPIC_PATTERNS.en;
  return pattern.test(trimmed);
}
```

**Step 4: Update `context.ts` — gate INCOMPLETE_OPERATION injection**

```typescript
// src/lib/agent/context.ts — in the pending ops injection block (~line 330)
import { isNewTopicSignal } from "@/lib/agent/policies/topic-signal-detector";

// Replace the existing pending ops injection:
if (anchorSessionId) {
  try {
    const meta = getSessionMeta(anchorSessionId);
    const pending = meta.pendingOperations as { timestamp: string; journal: unknown[]; finishReason: string } | undefined;
    if (pending?.timestamp) {
      const age = Date.now() - new Date(pending.timestamp).getTime();
      if (age < PENDING_OPS_TTL_MS && pending.journal?.length > 0) {
        // Gate: if user sent a new request, clear pending ops — don't resume
        const isNewRequest = latestUserMessage
          ? isNewTopicSignal(latestUserMessage, language)
          : false;

        if (isNewRequest) {
          mergeSessionMeta(anchorSessionId, { pendingOperations: null });
        } else {
          const summaries = (pending.journal as Array<{ toolName: string; summary?: string; success: boolean }>)
            .map(j => `- ${j.toolName}: ${j.summary ?? (j.success ? "ok" : "failed")}`)
            .join("\n");
          contextParts.push(
            `\n\n---\n\nINCOMPLETE_OPERATION (previous turn hit step limit):\n${summaries}\nResume where you left off — do NOT repeat completed steps.`,
          );
        }
      } else if (age >= PENDING_OPS_TTL_MS) {
        mergeSessionMeta(anchorSessionId, { pendingOperations: undefined });
      }
    }
  } catch { /* best-effort */ }
}
```

**Step 5: Run tests — must PASS**

```bash
npx vitest run tests/evals/topic-signal-detector.test.ts
npx vitest run
```

**Step 6: Commit**

```bash
git add src/lib/agent/policies/topic-signal-detector.ts \
        src/lib/agent/context.ts \
        tests/evals/topic-signal-detector.test.ts
git commit -m "fix(agent): gate INCOMPLETE_OPERATION resume on new-topic detection"
```

---

## Task 13: Update quota CTA and memory GOLDEN RULE

**Files:**
- Modify: `src/lib/agent/context.ts` (quota CTA text)
- Modify: `src/lib/agent/policies/memory-directives.ts` (GOLDEN RULE)

**Step 1: Update quota warning block in `context.ts`**

Find the quota warning injection (~line 372) and replace the text:

```typescript
contextParts.push(`\n\n---\n\nMESSAGE QUOTA (anonymous user):
Remaining messages: ${quotaInfo.remaining}/${quotaInfo.limit}.

This applies to anonymous users only — authenticated users have their own quota managed by the UI.

Wait for a NATURAL PAUSE before mentioning registration. Natural pauses:
- User just responded with a short affirmation ("great", "ok", "perfetto", "bello", "thanks", "👍")
- You just completed an action (page generated, fact saved, style changed)
- User's reply is short and contains no new request or open question

When the moment is right, weave in ONE casual sentence — max:
"By the way — you're almost out of messages. Want to grab a username to keep going?"
Suggest a username based on their name if known (e.g. "marco-rossi" for Marco Rossi).
Do NOT add this if you're mid-explanation or mid-topic.`);
```

**Step 2: Update GOLDEN RULE in `memory-directives.ts`**

Find the GOLDEN RULE text and replace:

```typescript
// In memoryUsageDirectives():
// Find: "GOLDEN RULE: At the end of every significant session..."
// Replace with:

`GOLDEN RULE: Before ending a conversation, ask yourself: did I learn something NEW
about HOW this person prefers to interact — not just facts about them?
If yes: call save_memory once with a behavioral observation.
"Significant" = you noticed a pattern, preference, or communication style that would
change how you interact next time.
NOT significant (skip save_memory): routine fact saves, standard page generation, normal publishing.

Good meta-memories:
  "User prefers concrete options over open questions"
  "User downplays achievements — needs gentle encouragement to claim credit"
  "User writes in short bursts — mirror with short responses"
  "User always wants to see mobile view first"
Bad (don't save — these are facts, not behavioral patterns):
  "User's name is Marco" → save as fact
  "User has 3 projects" → already in facts`
```

**Step 3: Run full test suite**

```bash
npx vitest run
```

**Step 4: Commit**

```bash
git add src/lib/agent/context.ts src/lib/agent/policies/memory-directives.ts
git commit -m "fix(agent): quota CTA timing policy, memory GOLDEN RULE clarification"
```

---

## Task 14: Rewrite `CORE_CHARTER` and update `OUTPUT_CONTRACT`

**Files:**
- Modify: `src/lib/agent/prompts.ts`

**Step 1: Write test capturing the key invariants**

```typescript
// tests/evals/core-charter-invariants.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) }}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

const base: BootstrapPayload = {
  journeyState: "first_visit", situations: [], expertiseLevel: "novice",
  userName: null, lastSeenDaysAgo: null, publishedUsername: null,
  pendingProposalCount: 0, thinSections: [], staleFacts: [],
  openConflicts: [], archivableFacts: [], language: "en",
  conversationContext: null, archetype: "generalist",
};

describe("CORE_CHARTER invariants", () => {
  it("contains register guidance (tu/du)", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('"tu"');
    expect(p).toContain('"du"');
  });

  it("contains opening bans list", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("OPENING BANS");
    expect(p).toContain("Certamente");
    expect(p).toContain("Of course");
  });

  it("contains emoji policy", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("EMOJI POLICY");
    expect(p).toContain("user uses them first");
  });

  it("contains language switching instruction", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("switch seamlessly");
  });

  it("contains user preference override for register", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("User explicit preference");
    expect(p).toContain("overrides");
  });

  it("OUTPUT_CONTRACT contains PATTERN VARIATION block", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("PATTERN VARIATION");
    expect(p).toContain("consecutive");
  });
});
```

**Step 2: Run — must FAIL**

```bash
npx vitest run tests/evals/core-charter-invariants.test.ts
```

**Step 3: Replace `CORE_CHARTER` and update `OUTPUT_CONTRACT` in `prompts.ts`**

```typescript
// src/lib/agent/prompts.ts — replace CORE_CHARTER constant:

const CORE_CHARTER = `You are the OpenSelf agent — a warm, direct AI that helps people build their personal web page through natural conversation.

YOUR JOB:
- Have a genuine conversation to learn about the person
- Extract structured facts silently via tools — never announce what you're saving
- Build and refine their page from those facts
- Never fabricate — only use what the user explicitly tells you

PERSONALITY:
- Warm and direct, like a knowledgeable friend — not a customer service bot
- Concise: say it in one sentence when one sentence is enough
- Curious and encouraging — but drop a topic if the user seems uninterested
- Light humor is welcome when the user opens the door; never force it

REGISTER:
- Always informal. Use "tu" (not "lei") in Italian. "tu" in French/Spanish. "du" in German.
- Natural contractions and colloquial phrasing: "che ne dici?" not "cosa ne pensa?"
- EXCEPTION: If the user explicitly writes formally or asks for formal register,
  match their preference. User explicit preference overrides all register defaults.

OPENING BANS — never start a reply with:
- "Certamente!", "Certo!", "Assolutamente!", "Ottimo!", "Perfetto!", "Fantastico!", "Capito!"
- "Of course!", "Absolutely!", "Great!", "Certainly!", "Sure thing!", "Noted!"
- "I understand", "I see", "That's great", "That's wonderful", "That makes sense"
- Any filler that only echoes back what the user said without adding content
Instead: start directly with the action, question, or key information.

EMOJI POLICY:
- Use emojis ONLY if the user uses them first
- Maximum 1 per message, never at the start of a sentence
- Zero emojis in page-generation, publishing, or error contexts

LANGUAGE HANDLING:
- Detect the language of each user message
- If it differs from session language: switch seamlessly — do NOT mention the switch, just follow the user
- Always generate page content in the language specified in the generate_page call
- Never mix languages in a single response

RESPONSE LENGTH:
- 1–2 sentences: confirmations, short answers, topic transitions
- 3–5 sentences max: explanations, presenting options
- Longer: ONLY when generating or explaining the page for the first time
- Never write a paragraph when the user expects a one-liner`;
```

Append to `OUTPUT_CONTRACT`:

```typescript
const OUTPUT_CONTRACT = `Output rules:
...existing content...

PATTERN VARIATION:
- Avoid using the same acknowledgment in consecutive turns.
  If you opened with "Fatto!" last turn, use "Aggiornato." or skip to the next question directly.
- Do NOT always close with a question — sometimes state → done, let the user drive.
- Avoid opening 3 consecutive turns with a statement. Mix in questions.
- Never start two consecutive messages with the same word.`;
```

**Step 4: Run tests — must PASS**

```bash
npx vitest run tests/evals/core-charter-invariants.test.ts
npx vitest run
```

**Step 5: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/core-charter-invariants.test.ts
git commit -m "feat(agent): rewrite CORE_CHARTER with register, opening bans, emoji policy, language switching"
```

---

## Task 15: Dead code removal — Phase 1 (migrate types from `promptAssembler.ts`)

**Files:**
- Modify: `src/lib/agent/prompts.ts` (add type definitions)
- Modify: all files that import from `promptAssembler.ts`
- Delete: `src/lib/agent/promptAssembler.ts`

**Step 1: Find all imports from `promptAssembler.ts`**

```bash
grep -rn "promptAssembler" src/ --include="*.ts" --include="*.tsx"
```

Expected output: `prompts.ts:1` and possibly 1-2 other files.

**Step 2: Move type definitions to `prompts.ts`**

The types `PromptMode`, `PromptContext`, `AssembledPrompt`, `PromptBlock` currently in `promptAssembler.ts` — move them to the top of `prompts.ts`:

```typescript
// src/lib/agent/prompts.ts — add at top (before existing content):

export type PromptMode = "onboarding" | "steady_state" | "heartbeat";

export type PromptBlock = {
  id: string;
  version: number;
  content: string;
};

export type PromptContext = {
  mode: PromptMode;
  agentIdentity: string;
  safetyPolicy: string;
  toolPolicy: string;
  outputContract: string;
  retrievedFacts: string;
  historySummary: string;
  pageConfigContext: string;
  connectorContext: string;
};

export type AssembledPrompt = {
  text: string;
  blocks: Array<{ id: string; version: number }>;
};
```

Remove the import from `promptAssembler.ts` in `prompts.ts:1`.

**Step 3: Update any other files importing from `promptAssembler.ts`**

For each file found in Step 1, change:
```typescript
import type { PromptMode } from "@/lib/agent/promptAssembler";
```
to:
```typescript
import type { PromptMode } from "@/lib/agent/prompts";
```

**Step 4: Delete `promptAssembler.ts`**

```bash
rm src/lib/agent/promptAssembler.ts
```

**Step 5: Verify — zero references remain**

```bash
grep -rn "promptAssembler" src/ --include="*.ts" --include="*.tsx"
# Expected: no output
```

**Step 6: Run full test suite**

```bash
npx vitest run
```

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor(agent): migrate types from promptAssembler.ts, delete dead file"
```

---

## Task 16: Dead code removal — Phase 2 (remove `onboardingPolicy`, `steadyStatePolicy`, close `!bootstrap` fallback)

**Files:**
- Modify: `src/lib/agent/prompts.ts`
- Modify: `src/lib/agent/context.ts`

**Step 1: Verify `getSystemPromptText` callers**

```bash
grep -rn "getSystemPromptText\|onboardingPolicy\|steadyStatePolicy" src/ --include="*.ts" --include="*.tsx"
```

Expected: only `prompts.ts` itself and `context.ts:255`.

**Step 2: Update `context.ts` — close the `!bootstrap` fallback**

```typescript
// src/lib/agent/context.ts (~line 251)
// Before:
const basePrompt = bootstrap
  ? buildSystemPrompt(bootstrap, { schemaMode: profile?.schemaMode ?? "full" })
  : getSystemPromptText(mode, language);

// After (close the fallback — bootstrap is always present in the normal path):
const basePrompt = bootstrap
  ? buildSystemPrompt(bootstrap, { schemaMode: profile?.schemaMode ?? "full" })
  : buildSystemPrompt(
      {
        journeyState: "first_visit",
        language,
        situations: [],
        expertiseLevel: "novice",
        userName: null,
        lastSeenDaysAgo: null,
        publishedUsername: null,
        pendingProposalCount: 0,
        thinSections: [],
        staleFacts: [],
        openConflicts: [],
        archivableFacts: [],
        conversationContext: null,
        archetype: "generalist",
      } as BootstrapPayload,
      { schemaMode: "minimal" }
    );
```

**Step 3: Remove `getSystemPromptText`, `onboardingPolicy`, `steadyStatePolicy` from `prompts.ts`**

Delete the three functions. Keep `getPromptContent` if it's still used (check first):

```bash
grep -rn "getPromptContent" src/ --include="*.ts"
# If zero results → delete it too
```

**Step 4: Remove unused import of `getSystemPromptText` from `context.ts`**

```typescript
// Remove from import line:
import { getSystemPromptText, buildSystemPrompt } from "@/lib/agent/prompts";
// Becomes:
import { buildSystemPrompt } from "@/lib/agent/prompts";
```

**Step 5: Run full test suite — must PASS with zero regressions**

```bash
npx vitest run
```

**Step 6: Commit**

```bash
git add src/lib/agent/prompts.ts src/lib/agent/context.ts
git commit -m "refactor(agent): remove onboardingPolicy/steadyStatePolicy dead code, close !bootstrap fallback"
```

---

## Task 17: Final verification

**Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass + all new tests from Tasks 1-16 pass.

**Step 2: Run static policy validator**

```bash
npx tsx -e "
import { validateDirectivePolicy } from './src/lib/agent/policies/validate-directive-policy';
import { DIRECTIVE_POLICY } from './src/lib/agent/policies/directive-registry';
validateDirectivePolicy(DIRECTIVE_POLICY);
console.log('✓ DIRECTIVE_POLICY is valid');
"
```

**Step 3: Verify no dead references**

```bash
grep -rn "getSystemPromptText\|assembleSystemPrompt\|onboardingPolicy\|steadyStatePolicy\|promptAssembler\|WELCOME_MESSAGES\b" \
  src/ --include="*.ts" --include="*.tsx"
# Expected: no output (or only comments/strings, not live code)
```

**Step 4: Build check**

```bash
npx tsc --noEmit
```

Expected: zero type errors.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore(agent): final verification pass, all 17 tasks complete"
```

---

## Summary: Files touched

| File | Change |
|---|---|
| `src/lib/agent/policies/directive-registry.ts` | **NEW** — policy matrix, getCtxFor, getSituationDirectives |
| `src/lib/agent/policies/validate-directive-policy.ts` | **NEW** — static validator |
| `src/lib/agent/policies/search-facts-rule.ts` | **NEW** — unified search_facts rule |
| `src/lib/agent/policies/topic-signal-detector.ts` | **NEW** — INCOMPLETE_OPERATION gate |
| `src/lib/agent/policies/index.ts` | Wire new getSituationDirectives |
| `src/lib/agent/policies/returning-no-page.ts` | search_facts rule, active_stale only |
| `src/lib/agent/policies/planning-protocol.ts` | search_facts rule |
| `src/lib/agent/policies/memory-directives.ts` | search_facts rule, GOLDEN RULE |
| `src/lib/agent/context.ts` | schemaMode, relevance sort, childCountMap, INCOMPLETE_OPERATION gate, quota CTA |
| `src/lib/agent/journey.ts` | childCountMap in BootstrapData, archetype TTL, soul cooldown |
| `src/lib/agent/prompts.ts` | CORE_CHARTER, OUTPUT_CONTRACT, schemaMode, types migration |
| `src/app/api/chat/route.ts` | STEP_EXHAUSTION_FALLBACK |
| `src/components/chat/ChatPanel.tsx` | buildWelcomeMessage unification |
| `src/lib/agent/promptAssembler.ts` | **DELETED** |
| `tests/evals/directive-registry-types.test.ts` | **NEW** |
| `tests/evals/directive-registry-getctxfor.test.ts` | **NEW** |
| `tests/evals/directive-matrix.test.ts` | **NEW** |
| `tests/evals/validate-directive-policy.test.ts` | **NEW** |
| `tests/evals/facts-relevance-sort.test.ts` | **NEW** |
| `tests/evals/schema-mode.test.ts` | **NEW** |
| `tests/evals/archetype-redetect.test.ts` | **NEW** |
| `tests/evals/soul-proposal-cooldown.test.ts` | **NEW** |
| `tests/evals/step-exhaustion-fallback.test.ts` | **NEW** |
| `tests/evals/search-facts-rule.test.ts` | **NEW** |
| `tests/evals/topic-signal-detector.test.ts` | **NEW** |
| `tests/evals/core-charter-invariants.test.ts` | **NEW** |
