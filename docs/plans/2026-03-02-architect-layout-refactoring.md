# Architect Layout Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the architect (bento) layout's slot assignment to eliminate unsound fallbacks, introduce affinity-based ranking with anti-clustering, and add compact widgets for third-size card slots.

**Architecture:** Three-layer change: (1) remove unsound fallbacks in assign-slots and group-slots, emitting `unplaceable_section` warnings from the assigner, (2) add an affinity map to slot definitions and rank candidate slots by affinity DESC → fillRatio ASC → order ASC, (3) add 4 compact widget definitions + expand card-* accepts + add compact variant branches in 4 theme components. Steps 2+3 ship atomically. A backfill script re-assigns existing architect pages.

**Tech Stack:** TypeScript, Vitest, React (theme components), Drizzle ORM (backfill script)

**Test runner:** `npx vitest run tests/evals/<file>.test.ts`

**Design doc:** `docs/plans/2026-03-02-architect-layout-refactoring-design.md`

---

## Task 1: Add `unplaceable_section` issue type to quality.ts

**Files:**
- Modify: `src/lib/layout/quality.ts:3-4` (LayoutIssueType union)
- Modify: `src/lib/layout/quality.ts:48-52` (SEVERITY_MAP)

**Step 1: Write the failing test**

Add to `tests/evals/assign-slots.test.ts`:

```typescript
it("emits unplaceable_section when section type has no compatible slot", () => {
  const sections = [
    makeSection({ id: "h1", type: "hero" }),
    makeSection({ id: "c1", type: "custom" }), // custom NOT in card-* accepts for architect
    makeSection({ id: "f1", type: "footer" }),
  ];
  // Use a template where custom has no slot (architect card-* don't accept custom,
  // feature-left/right don't accept custom either)
  // We'll use a minimal template to isolate the test
  const tinyTemplate = {
    id: "architect" as const,
    name: "Test",
    description: "Test",
    heroSlot: "hero",
    footerSlot: "footer",
    slots: [
      { id: "hero", size: "wide" as const, required: true, maxSections: 1, accepts: ["hero" as const], order: 0, mobileOrder: 0 },
      { id: "card-1", size: "third" as const, required: false, maxSections: 1, accepts: ["skills" as const], order: 1, mobileOrder: 1 },
      { id: "footer", size: "wide" as const, required: true, maxSections: 1, accepts: ["footer" as const], order: 99, mobileOrder: 99 },
    ],
  };
  const { sections: result, issues } = assignSlotsFromFacts(tinyTemplate, sections);
  // custom section should NOT have a slot
  const custom = result.find(s => s.id === "c1");
  expect(custom).toBeDefined();
  expect(custom!.slot).toBeUndefined();
  // Should have unplaceable_section issue
  const unplaceable = issues.find(i => i.issue === "unplaceable_section");
  expect(unplaceable).toBeDefined();
  expect(unplaceable!.severity).toBe("warning");
  expect(unplaceable!.message).toContain("custom");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: FAIL — `unplaceable_section` is not a valid issue type yet, and the current code places custom in any slot via fallback.

**Step 3: Add unplaceable_section to quality.ts**

In `src/lib/layout/quality.ts`, change the `LayoutIssueType` union:

```typescript
export type LayoutIssueType =
  | "overflow_risk"
  | "too_sparse"
  | "incompatible_widget"
  | "missing_required"
  | "unplaceable_section";
```

And add to `SEVERITY_MAP`:

```typescript
const SEVERITY_MAP: Record<LayoutIssueType, IssueSeverity> = {
  missing_required: "error",
  incompatible_widget: "error",
  overflow_risk: "warning",
  too_sparse: "warning",
  unplaceable_section: "warning",
};
```

**Step 4: Continue to Task 2** (the test still fails because assign-slots.ts hasn't changed yet — that's expected, we fix it in Task 2)

---

## Task 2: Remove unsound fallbacks in assign-slots.ts

**Files:**
- Modify: `src/lib/layout/assign-slots.ts:130-155` (remove fallback blocks, add unplaceable emission)
- Test: `tests/evals/assign-slots.test.ts`

**Step 1: Remove fallback blocks and emit unplaceable_section**

In `src/lib/layout/assign-slots.ts`, replace the "Fallback" and "Last resort" blocks (lines 138-154) with unplaceable handling:

Replace this block:
```typescript
    // Fallback: any slot with capacity
    if (!placed) {
      for (const slot of template.slots) {
        if (slot.id === template.heroSlot || slot.id === template.footerSlot) continue;
        if (hasCapacity(slot.id)) {
          const s = { ...section, slot: slot.id };
          const widget = getBestWidget(sectionType, slot.size);
          if (widget && !s.widgetId) s.widgetId = widget.id;
          consumeSlot(slot.id);
          result.push(s);
          placed = true;
          break;
        }
      }
    }

    // Last resort: append without slot assignment
    if (!placed) {
      result.push({ ...section });
    }
```

With:
```typescript
    // No compatible slot found — section is unplaceable
    if (!placed) {
      result.push({ ...section });
      unplaceableIssues.push({
        slotId: "",
        issue: "unplaceable_section" as LayoutIssueType,
        severity: "warning",
        message: `Section '${section.id}' (type '${section.type}') has no compatible slot in template '${template.id}'.`,
        suggestion: "Add this section type to a slot's accepts list, or remove the section.",
      });
    }
```

Also, declare `unplaceableIssues` at the top of the function (after `const result`):
```typescript
  const unplaceableIssues: LayoutValidationIssue[] = [];
```

And merge them into the final issues array (after the validation block, before return):
```typescript
  issues = [...unplaceableIssues, ...issues];
```

Import `LayoutIssueType` from `quality.ts` (already imported as `LayoutValidationIssue`).

**Step 2: Run test to verify Task 1's test passes**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: The `unplaceable_section` test from Task 1 passes. Check existing tests still pass.

**Step 3: Write regression test — compatible sections still assigned**

Add to `tests/evals/assign-slots.test.ts`:

```typescript
it("does not emit unplaceable_section for sections with compatible slots", () => {
  const sections = [
    makeSection({ id: "h1", type: "hero" }),
    makeSection({ id: "b1", type: "bio" }),
    makeSection({ id: "s1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
    makeSection({ id: "f1", type: "footer" }),
  ];
  const { issues } = assignSlotsFromFacts(architect, sections);
  const unplaceable = issues.filter(i => i.issue === "unplaceable_section");
  expect(unplaceable).toHaveLength(0);
});
```

**Step 4: Run full assign-slots test suite**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/layout/quality.ts src/lib/layout/assign-slots.ts tests/evals/assign-slots.test.ts
git commit -m "fix(layout): remove unsound fallbacks, emit unplaceable_section warning"
```

---

## Task 3: Remove unsound fallback in group-slots.ts

**Files:**
- Modify: `src/lib/layout/group-slots.ts:62-72` (remove "last resort" block)
- Test: `tests/evals/group-slots.test.ts`

**Step 1: Write the failing test**

Add to `tests/evals/group-slots.test.ts`:

```typescript
it("does NOT place section in incompatible slot when all compatible slots are full", () => {
  // Create a template where card-1 only accepts skills, maxSections=1
  const tinyTemplate = {
    id: "architect" as const,
    name: "Test",
    description: "Test",
    heroSlot: "hero",
    footerSlot: "footer",
    slots: [
      { id: "hero", size: "wide" as const, required: true, maxSections: 1, accepts: ["hero" as const], order: 0, mobileOrder: 0 },
      { id: "card-1", size: "third" as const, required: false, maxSections: 1, accepts: ["skills" as const], order: 1, mobileOrder: 1 },
      { id: "footer", size: "wide" as const, required: true, maxSections: 1, accepts: ["footer" as const], order: 99, mobileOrder: 99 },
    ],
  };
  const sections = [
    makeSection({ id: "h1", type: "hero" }),
    makeSection({ id: "b1", type: "bio", slot: "card-1" }), // bio not in card-1 accepts
    makeSection({ id: "f1", type: "footer" }),
  ];
  const result = groupSectionsBySlot(sections, tinyTemplate);
  // bio should NOT be in card-1 (incompatible type)
  expect(result["card-1"].map(s => s.id)).not.toContain("b1");
  // bio should not appear in any slot
  const allSections = Object.values(result).flat();
  expect(allSections.map(s => s.id)).not.toContain("b1");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/group-slots.test.ts`
Expected: FAIL — current code puts bio in card-1 via the last-resort fallback.

**Step 3: Remove the unsound last-resort block**

In `src/lib/layout/group-slots.ts`, remove this block (lines ~62-72):

```typescript
    // Last resort: put in first non-hero/footer slot that has any room
    if (!placed) {
      for (const slot of template.slots) {
        if (slot.id === template.heroSlot || slot.id === template.footerSlot) continue;
        const capacity = slot.maxSections ?? Infinity;
        if (result[slot.id].length < capacity) {
          result[slot.id].push(section);
          placed = true;
          break;
        }
      }
    }

    // If still not placed (all slots full), append to last non-footer slot
    if (!placed) {
      const lastSlot = template.slots.filter((s) => s.id !== template.footerSlot).pop();
      if (lastSlot) {
        result[lastSlot.id].push(section);
      }
    }
```

Replace with nothing — if a section is not placed by the sound overflow logic (which checks `slot.accepts`), it simply doesn't appear in any bucket. The function signature stays `Record<string, Section[]>`.

**Step 4: Run full group-slots test suite**

Run: `npx vitest run tests/evals/group-slots.test.ts`
Expected: ALL PASS. The existing "handles invalid slot gracefully" test may need updating — check if it still passes since bio overflows to main via the sound overflow path (main accepts bio).

**Step 5: Commit**

```bash
git add src/lib/layout/group-slots.ts tests/evals/group-slots.test.ts
git commit -m "fix(layout): remove unsound last-resort fallback in groupSectionsBySlot"
```

---

## Task 4: Add affinity field to FullSlotDefinition

**Files:**
- Modify: `src/lib/layout/types.ts:5-13` (FullSlotDefinition)

**Step 1: Add affinity field**

In `src/lib/layout/types.ts`, add `affinity` to `FullSlotDefinition`:

```typescript
export type FullSlotDefinition = {
  id: string;
  size: SlotSize;
  required?: boolean;
  maxSections?: number;
  accepts: ComponentType[];
  order: number;
  mobileOrder: number;
  affinity?: Partial<Record<ComponentType, number>>;
};
```

**Step 2: Verify build compiles**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: ALL PASS (affinity is optional, no breaking change)

**Step 3: Commit**

```bash
git add src/lib/layout/types.ts
git commit -m "feat(layout): add optional affinity field to FullSlotDefinition"
```

---

## Task 5: Add affinity maps to architect template + expand card-* accepts

**Files:**
- Modify: `src/lib/layout/registry.ts` (architect template slots)

**Step 1: Write failing test for affinity-based assignment**

Add to `tests/evals/assign-slots.test.ts`:

```typescript
describe("affinity-based assignment (architect)", () => {
  it("bio lands in feature-left (highest affinity)", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(architect, sections);
    expect(result.find(s => s.id === "b1")?.slot).toBe("feature-left");
  });

  it("stats lands in a card-* slot (highest affinity for stats)", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "st1", type: "stats", content: { items: [{ label: "x", value: "1" }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(architect, sections);
    const statsSlot = result.find(s => s.id === "st1")?.slot;
    expect(statsSlot).toMatch(/^card-/);
  });

  it("spreads 3 card-preferring sections across card-1/2/3 (anti-clustering)", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "st1", type: "stats", content: { items: [{ label: "x", value: "1" }] } }),
      makeSection({ id: "sk1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "la1", type: "languages", content: { items: [{ name: "EN" }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(architect, sections);
    const cardSlots = result
      .filter(s => s.slot?.startsWith("card-"))
      .map(s => s.slot);
    // All 3 should be in different card slots (anti-clustering)
    const unique = new Set(cardSlots);
    expect(unique.size).toBe(3);
  });

  it("monolith assignment is unchanged (no affinity defined)", () => {
    const monolith = getLayoutTemplate("monolith");
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "s1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(monolith, sections);
    // All non-hero/footer go to main
    expect(result.find(s => s.id === "b1")?.slot).toBe("main");
    expect(result.find(s => s.id === "s1")?.slot).toBe("main");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: FAIL — bio doesn't specifically land in feature-left with current first-fit, stats doesn't prefer card-*.

**Step 3: Add affinity maps to architect registry + expand card-* accepts**

In `src/lib/layout/registry.ts`, update the architect template's slot definitions. For each slot, add `affinity` and for card-* slots, expand `accepts` to include `reading`, `education`, `achievements`, `music`:

`feature-left`:
```typescript
affinity: { bio: 90, experience: 80, education: 70, projects: 60 },
```

`feature-right`:
```typescript
affinity: { skills: 90, interests: 80, stats: 80, achievements: 70, "at-a-glance": 60 },
```

`full-row`:
```typescript
affinity: { projects: 90, experience: 80, achievements: 70, reading: 60, music: 60, education: 50 },
```

`card-1`:
```typescript
accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities", "reading", "education", "achievements", "music"],
affinity: { stats: 90, contact: 80, languages: 70, social: 60, skills: 50, interests: 50, activities: 40 },
```

`card-2`:
```typescript
accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities", "reading", "education", "achievements", "music"],
affinity: { skills: 80, interests: 80, social: 70, languages: 60, activities: 50, stats: 40 },
```

`card-3`:
```typescript
accepts: ["skills", "interests", "social", "stats", "contact", "languages", "activities", "reading", "education", "achievements", "music"],
affinity: { activities: 80, reading: 70, music: 70, education: 60, achievements: 50 },
```

**Step 4: Continue to Task 6** (tests still fail — need the ranking logic in assign-slots.ts)

---

## Task 6: Implement affinity-based ranking in assign-slots.ts

**Files:**
- Modify: `src/lib/layout/assign-slots.ts` (Phase 3 candidate selection)

**Step 1: Replace first-fit with ranked selection**

In `src/lib/layout/assign-slots.ts`, replace the Phase 3 loop body. Change the `candidateSlots` iteration from simple `for (const slot of candidateSlots)` to a ranked sort.

Replace this block (within the Phase 3 `for (const section of remaining)` loop):

```typescript
    // Try to find the best slot for this section type
    const candidateSlots = template.slots.filter(
      (slot) =>
        slot.id !== template.heroSlot &&
        slot.id !== template.footerSlot &&
        slot.accepts.includes(sectionType) &&
        hasCapacity(slot.id),
    );

    for (const slot of candidateSlots) {
      const widget = getBestWidget(sectionType, slot.size);
      if (widget) {
        const s = { ...section, slot: slot.id };
        if (!s.widgetId) s.widgetId = widget.id;
        consumeSlot(slot.id);
        result.push(s);
        placed = true;
        break;
      }
    }
```

With:

```typescript
    // Try to find the best slot for this section type
    const candidateSlots = template.slots.filter(
      (slot) =>
        slot.id !== template.heroSlot &&
        slot.id !== template.footerSlot &&
        slot.accepts.includes(sectionType) &&
        hasCapacity(slot.id),
    );

    // Rank candidates: affinity DESC → fillRatio ASC → order ASC
    const ranked = [...candidateSlots].sort((a, b) => {
      const affinityA = a.affinity?.[sectionType] ?? 0;
      const affinityB = b.affinity?.[sectionType] ?? 0;
      if (affinityB !== affinityA) return affinityB - affinityA;

      const maxA = a.maxSections ?? Infinity;
      const maxB = b.maxSections ?? Infinity;
      const ratioA = maxA === Infinity ? 0 : (usedCapacity.get(a.id) ?? 0) / maxA;
      const ratioB = maxB === Infinity ? 0 : (usedCapacity.get(b.id) ?? 0) / maxB;
      if (ratioA !== ratioB) return ratioA - ratioB;

      return a.order - b.order;
    });

    for (const slot of ranked) {
      const widget = getBestWidget(sectionType, slot.size);
      if (widget) {
        const s = { ...section, slot: slot.id };
        if (!s.widgetId) s.widgetId = widget.id;
        consumeSlot(slot.id);
        result.push(s);
        placed = true;
        break;
      }
    }
```

**Step 2: Run affinity tests**

Run: `npx vitest run tests/evals/assign-slots.test.ts`
Expected: ALL PASS including the new affinity tests from Task 5.

**Step 3: Commit**

```bash
git add src/lib/layout/assign-slots.ts src/lib/layout/registry.ts tests/evals/assign-slots.test.ts
git commit -m "feat(layout): affinity-based slot ranking with anti-clustering for architect"
```

---

## Task 7: Add 4 compact widget definitions

**Files:**
- Modify: `src/lib/layout/widgets.ts` (WIDGET_REGISTRY)
- Test: `tests/evals/layout-widgets.test.ts`

**Step 1: Write failing tests**

Add to `tests/evals/layout-widgets.test.ts`:

```typescript
describe("compact widgets for architect card slots", () => {
  it("reading-compact exists and fits third", () => {
    const w = getWidgetById("reading-compact");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("reading");
    expect(w!.variant).toBe("compact");
    expect(w!.fitsIn).toEqual(["third"]);
    expect(w!.maxItems).toBe(5);
  });

  it("education-compact exists and fits third", () => {
    const w = getWidgetById("education-compact");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("education");
    expect(w!.variant).toBe("compact");
    expect(w!.fitsIn).toEqual(["third"]);
    expect(w!.maxItems).toBe(3);
  });

  it("achievements-compact exists and fits third", () => {
    const w = getWidgetById("achievements-compact");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("achievements");
    expect(w!.variant).toBe("compact");
    expect(w!.fitsIn).toEqual(["third"]);
    expect(w!.maxItems).toBe(3);
  });

  it("music-compact exists and fits third", () => {
    const w = getWidgetById("music-compact");
    expect(w).toBeDefined();
    expect(w!.sectionType).toBe("music");
    expect(w!.variant).toBe("compact");
    expect(w!.fitsIn).toEqual(["third"]);
    expect(w!.maxItems).toBe(5);
  });

  it("getBestWidget selects reading-compact for third slot", () => {
    const w = getBestWidget("reading", "third");
    expect(w).toBeDefined();
    expect(w!.id).toBe("reading-compact");
  });

  it("getBestWidget still selects reading-list for wide slot", () => {
    const w = getBestWidget("reading", "wide");
    expect(w).toBeDefined();
    expect(w!.id).toBe("reading-list");
  });

  it("getBestWidget selects education-compact for third slot", () => {
    const w = getBestWidget("education", "third");
    expect(w).toBeDefined();
    expect(w!.id).toBe("education-compact");
  });

  it("getBestWidget selects music-compact for third slot", () => {
    const w = getBestWidget("music", "third");
    expect(w).toBeDefined();
    expect(w!.id).toBe("music-compact");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/layout-widgets.test.ts`
Expected: FAIL — widgets don't exist yet.

**Step 3: Add compact widget definitions**

In `src/lib/layout/widgets.ts`, add after the existing `reading-list` entry:

```typescript
  {
    id: "reading-compact",
    sectionType: "reading",
    variant: "compact",
    fitsIn: ["third"],
    minItems: 1,
    maxItems: 5,
    label: "Reading (compact)",
  },
```

After `education-cards`:
```typescript
  {
    id: "education-compact",
    sectionType: "education",
    variant: "compact",
    fitsIn: ["third"],
    minItems: 1,
    maxItems: 3,
    label: "Education (compact)",
  },
```

After `achievements-list`:
```typescript
  {
    id: "achievements-compact",
    sectionType: "achievements",
    variant: "compact",
    fitsIn: ["third"],
    minItems: 1,
    maxItems: 3,
    label: "Achievements (compact)",
  },
```

After `music-list`:
```typescript
  {
    id: "music-compact",
    sectionType: "music",
    variant: "compact",
    fitsIn: ["third"],
    minItems: 1,
    maxItems: 5,
    label: "Music (compact)",
  },
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/layout-widgets.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/layout/widgets.ts tests/evals/layout-widgets.test.ts
git commit -m "feat(layout): add compact widget definitions for reading, education, achievements, music"
```

---

## Task 8: Add compact variant to Reading.tsx

**Files:**
- Modify: `src/themes/editorial-360/components/Reading.tsx`

**Step 1: Add compact variant branch**

The component currently accepts `{ content }` — change signature to `{ content, variant }` (the `SectionProps` type already supports `variant?: string`).

Replace the component function with:

```typescript
export function Reading({ content, variant }: SectionProps<ReadingContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 5 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Reading"}
            </h2>

            {isCompact ? (
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2">
                            <span className="text-lg font-[var(--page-font-heading)] font-medium text-[var(--page-fg)]">
                                {item.title}
                            </span>
                            {item.author && (
                                <span className="text-sm text-[var(--page-fg-secondary)]">
                                    {item.author}
                                </span>
                            )}
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-12">
                    {items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group">
                                <h3 className="text-2xl md:text-3xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors">
                                    {item.url ? (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:underline underline-offset-4"
                                        >
                                            {item.title}
                                        </a>
                                    ) : (
                                        item.title
                                    )}
                                </h3>
                                {item.author && (
                                    <div className="text-lg font-medium text-[var(--page-fg)] mt-1">
                                        {item.author}
                                    </div>
                                )}
                                {item.rating != null && (
                                    <div className="mt-2">
                                        <StarRating rating={item.rating} />
                                    </div>
                                )}
                                {item.note && (
                                    <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mt-3">
                                        {item.note}
                                    </p>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </section>
    );
}
```

**Step 2: Verify build compiles**

Run: `npx vitest run tests/evals/layout-widgets.test.ts`
Expected: PASS (no new test needed — component rendering is validated visually)

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Reading.tsx
git commit -m "feat(theme): add compact variant to Reading component"
```

---

## Task 9: Add compact variant to Education.tsx

**Files:**
- Modify: `src/themes/editorial-360/components/Education.tsx`

**Step 1: Add compact variant branch**

Change signature to accept `variant`. Add compact branch before the existing CollapsibleList render:

```typescript
export function Education({ content, variant }: SectionProps<EducationContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 3 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    if (isCompact) {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "Education"}
                </h2>
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-semibold text-[var(--page-fg)]">
                                {[item.degree, item.field].filter(Boolean).join(" — ")}
                            </span>
                            <span className="text-sm text-[var(--page-fg-secondary)]">
                                {item.institution}
                            </span>
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            </section>
        );
    }

    const summaryLine = items
        .slice(1)
        .map((item) => item.institution)
        .join(", ");

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Education"}
            </h2>

            <div>
                <CollapsibleList
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group max-w-2xl">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.institution}
                                    </h3>
                                    {item.period && (
                                        <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                            {item.period}
                                        </span>
                                    )}
                                </div>
                                {(item.degree || item.field) && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {[item.degree, item.field].filter(Boolean).join(" — ")}
                                    </div>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                    summaryLine={summaryLine}
                />
            </div>
        </section>
    );
}
```

**Step 2: Commit**

```bash
git add src/themes/editorial-360/components/Education.tsx
git commit -m "feat(theme): add compact variant to Education component"
```

---

## Task 10: Add compact variant to Achievements.tsx

**Files:**
- Modify: `src/themes/editorial-360/components/Achievements.tsx`

**Step 1: Add compact variant branch**

Same pattern as Education. Change signature to accept `variant`:

```typescript
export function Achievements({ content, variant }: SectionProps<AchievementsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 3 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    if (isCompact) {
        return (
            <section className="theme-reveal">
                <h2 className="section-label">
                    {title || "Achievements"}
                </h2>
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-semibold text-[var(--page-fg)]">
                                {item.title}
                            </span>
                            {item.date && (
                                <span className="text-sm text-[var(--page-fg-secondary)]">
                                    {item.date}
                                </span>
                            )}
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            </section>
        );
    }

    const summaryLine = items
        .slice(1)
        .map((item) => item.title)
        .join(", ");

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Achievements"}
            </h2>

            <div>
                <CollapsibleList
                    items={items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group max-w-2xl">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.title}
                                    </h3>
                                    {item.date && (
                                        <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                            {item.date}
                                        </span>
                                    )}
                                </div>
                                {item.issuer && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {item.issuer}
                                    </div>
                                )}
                                {item.description && (
                                    <p className="text-sm text-[var(--page-fg-secondary)] leading-relaxed max-w-prose mt-2">
                                        {item.description}
                                    </p>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                    summaryLine={summaryLine}
                />
            </div>
        </section>
    );
}
```

**Step 2: Commit**

```bash
git add src/themes/editorial-360/components/Achievements.tsx
git commit -m "feat(theme): add compact variant to Achievements component"
```

---

## Task 11: Add compact variant to Music.tsx

**Files:**
- Modify: `src/themes/editorial-360/components/Music.tsx`

**Step 1: Add compact variant branch**

```typescript
export function Music({ content, variant }: SectionProps<MusicContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    const isCompact = variant === "compact";
    const maxItems = isCompact ? 5 : items.length;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - visible.length;

    return (
        <section className="theme-reveal">
            <h2 className="section-label">
                {title || "Music"}
            </h2>

            {isCompact ? (
                <div className="space-y-3">
                    {visible.map((item, index) => (
                        <div key={index} className="flex items-baseline gap-2">
                            {item.artist && (
                                <span className="text-sm text-[var(--page-fg-secondary)]">
                                    {item.artist}
                                </span>
                            )}
                            <span className="text-lg font-[var(--page-font-heading)] font-medium text-[var(--page-fg)]">
                                {item.title}
                            </span>
                        </div>
                    ))}
                    {remaining > 0 && (
                        <div className="text-sm text-[var(--page-fg-secondary)] italic">
                            +{remaining} more
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-12">
                    {items.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group">
                                <h3 className="text-2xl md:text-3xl font-[var(--page-font-heading)] font-medium group-hover:text-[var(--page-accent)] transition-colors">
                                    {item.url ? (
                                        <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:underline underline-offset-4"
                                        >
                                            {item.title}
                                        </a>
                                    ) : (
                                        item.title
                                    )}
                                </h3>
                                {item.artist && (
                                    <div className="text-lg font-medium text-[var(--page-fg)] mt-1">
                                        {item.artist}
                                    </div>
                                )}
                                {item.note && (
                                    <p className="text-[var(--page-fg-secondary)] leading-relaxed max-w-2xl text-lg mt-3">
                                        {item.note}
                                    </p>
                                )}
                            </article>

                            {index < items.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </section>
    );
}
```

**Step 2: Commit**

```bash
git add src/themes/editorial-360/components/Music.tsx
git commit -m "feat(theme): add compact variant to Music component"
```

---

## Task 12: Run full test suite for Tasks 5-11 (atomic validation)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

If any test fails, fix before continuing. These changes (affinity + compact widgets + expanded accepts) must all be valid together.

**Step 2: Squash or keep commits** (developer choice — all changes are atomic in scope)

---

## Task 13: Backfill script for existing architect pages

**Files:**
- Create: `scripts/backfill-architect-slots.ts`

**Step 1: Create the backfill script**

```typescript
#!/usr/bin/env npx tsx
/**
 * One-shot backfill for architect layout pages.
 *
 * Re-runs assignSlotsFromFacts with updated affinity-based registry
 * on all pages with layoutTemplate=architect.
 *
 * Modes:
 *   --dry-run   (default) Show what would change, no DB writes
 *   --apply     Actually update the DB
 *
 * Safety: skips sections with user locks.
 */

import { db, sqlite } from "../src/lib/db/index";
import { page } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { assignSlotsFromFacts } from "../src/lib/layout/assign-slots";
import { getLayoutTemplate } from "../src/lib/layout/registry";
import { normalizeConfigForWrite } from "../src/lib/page-config/normalize";
import type { PageConfig, Section, SectionLock } from "../src/lib/page-config/schema";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";

console.log(`[backfill-architect-slots] Mode: ${mode}\n`);

const allPages = db
  .select({ id: page.id, config: page.config })
  .from(page)
  .all();

let totalPages = 0;
let changedPages = 0;
let skippedLocked = 0;

for (const row of allPages) {
  const config: PageConfig = JSON.parse(row.config as string);
  if (config.layoutTemplate !== "architect") continue;

  totalPages++;

  const template = getLayoutTemplate("architect");

  // Check for user locks — skip entire page if any section has user lock
  const hasUserLock = config.sections.some(
    (s: Section) => s.lock?.lockedBy === "user"
  );
  if (hasUserLock) {
    console.log(`  SKIP ${row.id} — has user-locked sections`);
    skippedLocked++;
    continue;
  }

  // Build locks map
  const locks = new Map<string, SectionLock>();
  for (const s of config.sections) {
    if (s.lock) locks.set(s.id, s.lock);
  }

  // Build draftSlots map (current assignments)
  const draftSlots = new Map<string, string>();
  for (const s of config.sections) {
    if (s.slot) draftSlots.set(s.id, s.slot);
  }

  const { sections: newSections, issues } = assignSlotsFromFacts(
    template,
    config.sections,
    locks,
    undefined,
    draftSlots,
  );

  // Compute diff
  const diffs: string[] = [];
  for (const ns of newSections) {
    const os = config.sections.find((s: Section) => s.id === ns.id);
    if (!os) continue;
    if (os.slot !== ns.slot || os.widgetId !== ns.widgetId) {
      diffs.push(
        `    ${ns.id} (${ns.type}): slot ${os.slot ?? "∅"} → ${ns.slot ?? "∅"}, widget ${os.widgetId ?? "∅"} → ${ns.widgetId ?? "∅"}`
      );
    }
  }

  if (diffs.length === 0) {
    console.log(`  OK ${row.id} — no changes`);
    continue;
  }

  changedPages++;
  console.log(`  CHANGED ${row.id}:`);
  for (const d of diffs) console.log(d);
  if (issues.length > 0) {
    console.log(`    Issues: ${issues.map((i) => i.message).join("; ")}`);
  }

  if (mode === "apply") {
    const updated: PageConfig = { ...config, sections: newSections };
    const normalized = normalizeConfigForWrite(updated);
    db.update(page)
      .set({ config: JSON.stringify(normalized) })
      .where(eq(page.id, row.id))
      .run();
    console.log(`    → Written`);
  }
}

console.log(
  `\nDone. Pages scanned: ${totalPages}, changed: ${changedPages}, skipped (locked): ${skippedLocked}`
);

if (mode === "apply") {
  sqlite.pragma("wal_checkpoint(PASSIVE)");
  console.log("WAL checkpoint done.");
}
```

**Step 2: Test dry-run**

Run: `npx tsx scripts/backfill-architect-slots.ts --dry-run`
Expected: Shows report of pages that would change (may be 0 if no architect pages exist locally).

**Step 3: Commit**

```bash
git add scripts/backfill-architect-slots.ts
git commit -m "feat(scripts): add backfill script for architect slot re-assignment"
```

---

## Task 14: Final validation

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors

**Step 3: Generate UAT screenshots** (manual — regenerate batch profiles with architect layout, compare before/after)

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "fix(layout): address review feedback from validation"
```
