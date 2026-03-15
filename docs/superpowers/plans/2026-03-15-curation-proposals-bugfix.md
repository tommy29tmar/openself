# Curation Proposals Bugfix — Implementation Plan (v3)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 bugs in the deep heartbeat's page curation proposal system that cause destructive accepts and nonsensical proposals.

**Architecture:** LLM outputs only changed fields in `proposedContent` but `acceptProposal()` treats it as full replacement. Fix by adding a merge step at accept time + filtering no-op proposals at creation time.

**Tech Stack:** TypeScript, SQLite/Drizzle, Vercel AI SDK

**Review history:** v3 — 10 total specialist reviews across 2 rounds. Removed phantom patterns, eliminated redundant tasks, fixed `safeJsonParse` gap, expanded ADDITIVE_FIELDS, simplified item-branch handling, fixed test contradictions. Skills JSON fix already implemented (no-op). Task 3 from v1 (conformity merge) handled by Task 1's accept-time merge.

---

## Bugs

| # | Severity | Description | Root Cause |
|---|----------|-------------|-----------|
| 1 | **HIGH** | Accepting a proposal erases unchanged fields (e.g., hero tagline change deletes name/email/location) | `acceptProposal()` does full replacement instead of merge |
| 2 | **MEDIUM** | Proposals created when LLM says "no change needed" (same-value fields pass `Object.keys().length > 0` guard) | No value-level comparison at creation time |

---

## Task 1: Add merge logic to `acceptProposal()`

**Files:**
- Modify: `src/lib/services/proposal-service.ts`
- Test: `tests/evals/proposal-accept-merge.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/evals/proposal-accept-merge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deepMergeProposal } from "@/lib/services/proposal-service";

describe("deepMergeProposal", () => {
  it("should overlay proposed fields onto current without erasing others", () => {
    const current = { name: "Giulia", tagline: "Old tagline", location: "Napoli" };
    const proposed = { tagline: "New tagline" };
    const result = deepMergeProposal(current, proposed);
    expect(result).toEqual({ name: "Giulia", tagline: "New tagline", location: "Napoli" });
  });

  it("should preserve current when proposed is empty", () => {
    const current = { name: "Giulia", location: "Napoli" };
    const result = deepMergeProposal(current, {});
    expect(result).toEqual({ name: "Giulia", location: "Napoli" });
  });

  it("should reject hallucinated keys not in current or ADDITIVE_FIELDS", () => {
    const current = { name: "Giulia", tagline: "Old" };
    const proposed = { tagline: "New", hallucinated_xyz: "Nope" };
    const result = deepMergeProposal(current, proposed);
    expect(result.tagline).toBe("New");
    expect(result).not.toHaveProperty("hallucinated_xyz");
  });

  it("should allow known additive fields even if not in current", () => {
    const current = { name: "Giulia" };
    const proposed = { description: "A new description" };
    const result = deepMergeProposal(current, proposed);
    expect(result.description).toBe("A new description");
  });

  it("should handle null proposed values by keeping current value", () => {
    const current = { name: "Giulia", tagline: "Old" };
    const proposed = { tagline: null };
    const result = deepMergeProposal(current, proposed);
    expect(result.tagline).toBe("Old");
  });

  it("should allow groups and items as additive fields", () => {
    const current = { title: "Skills" };
    const proposed = { groups: [{ title: "New", items: ["A", "B"] }] };
    const result = deepMergeProposal(current, proposed);
    expect(result.groups).toEqual([{ title: "New", items: ["A", "B"] }]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement in proposal-service.ts**

Add `safeJsonParse` helper and `deepMergeProposal`:

```typescript
/** Safe JSON parse — returns null on failure instead of throwing */
function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Known content fields that can be added even if not in current */
const ADDITIVE_FIELDS = new Set([
  "text", "description", "intro", "title", "frequency",
  "groups", "items", "links",
]);

/**
 * Merge proposed delta fields into current content.
 * Only overlays keys that exist in current OR are known additive content fields.
 * Null/undefined values in proposed are ignored (treated as "no change").
 */
export function deepMergeProposal(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };
  for (const [key, val] of Object.entries(proposed)) {
    if (val === null || val === undefined) continue;
    if (key in current || ADDITIVE_FIELDS.has(key)) {
      merged[key] = val;
    }
  }
  return merged;
}
```

Then update `acceptProposal()` — find the section-level upsert where `personalizedContent: proposal.proposedContent` and change to:

```typescript
const currentObj = safeJsonParse(proposal.currentContent);
const proposedObj = safeJsonParse(proposal.proposedContent);
const mergedContent = currentObj && proposedObj
  ? JSON.stringify(deepMergeProposal(currentObj, proposedObj))
  : proposal.proposedContent; // fallback for plain-string content

personalizedContent: mergedContent,
```

Note: Item-level accept path (fact_display_overrides) does NOT need this merge — `filterEditableFields()` already handles it.

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Run full test suite** (existing proposal tests must still pass via string fallback)
- [ ] **Step 6: Commit**: `fix: merge proposal fields on accept instead of full replacement`

---

## Task 2: Filter out no-change proposals at creation time

**Files:**
- Modify: `src/lib/worker/handlers/curate-page.ts`
- Test: `tests/evals/curation-no-change-filter.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/evals/curation-no-change-filter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hasRealChange } from "@/lib/worker/handlers/curate-page";

describe("hasRealChange", () => {
  it("should return false when all proposed values match current", () => {
    expect(hasRealChange({ title: "Formazione" }, { title: "Formazione" })).toBe(false);
  });

  it("should return true when at least one value differs", () => {
    expect(hasRealChange({ title: "Le mie pratiche" }, { title: "Formazione" })).toBe(true);
  });

  it("should return true when proposed adds a new field", () => {
    expect(hasRealChange({ title: "X", description: "New" }, { title: "X" })).toBe(true);
  });

  it("should handle item-level comparison", () => {
    expect(hasRealChange({ frequency: "ogni giorno" }, { name: "Yoga", frequency: "daily" })).toBe(true);
  });

  it("should detect no change for item same values", () => {
    expect(hasRealChange({ name: "Yoga" }, { name: "Yoga", frequency: "daily" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement `hasRealChange()` and add filters**

In `src/lib/worker/handlers/curate-page.ts`, add the exported helper:

```typescript
export function hasRealChange(
  proposedFields: Record<string, unknown>,
  currentContent: Record<string, unknown>,
): boolean {
  return Object.entries(proposedFields).some(([key, val]) =>
    JSON.stringify(val) !== JSON.stringify(currentContent[key])
  );
}
```

Add filter in **section branch** (before `createProposal`):
```typescript
let sectionObj: Record<string, unknown> | null = null;
try { sectionObj = JSON.parse(currentContentStr); } catch {}
if (sectionObj && !hasRealChange(suggestion.fields, sectionObj)) continue;
```

Add filter in **item branch** (before `createProposal`):
```typescript
// fact.value is already parsed (Drizzle mode: "json")
const factObj = fact.value as Record<string, unknown>;
if (factObj && !hasRealChange(suggestion.fields, factObj)) continue;
```

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**: `fix: filter out no-change curation proposals`

---

## Task 3: Final verification

- [ ] **Step 1: Run all tests**: `npx vitest run`
- [ ] **Step 2: TypeScript check**: `npx tsc --noEmit`
- [ ] **Step 3: Verify commits**: `git log --oneline -3`
