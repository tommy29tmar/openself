# Architect Layout Refactoring — Design Document

**Date**: 2026-03-02  
**Status**: Approved  
**Scope**: Architect (bento) layout only — no changes to monolith/cinematic/curator

## Problem Statement

The architect (bento) layout has three structural issues:

1. **Unsound fallbacks**: `assign-slots.ts` and `group-slots.ts` place sections into incompatible slots when no compatible slot has capacity. A `reading` section can end up in a slot that only accepts `skills/interests/social`.

2. **No compact widgets for third-size slots**: The `card-1/2/3` slots are `third`-sized but most section types (reading, education, achievements, music) have no widget that `fitsIn: ["third"]`. Worse, these types aren't even in `card-*` accepts lists — so adding widgets alone wouldn't help.

3. **First-fit assignment with no intelligence**: `assignSlotsFromFacts` iterates candidate slots in template definition order. There's no concept of "bio prefers feature-left" or "stats prefers card-*", leading to suboptimal packing.

## Design

### Step 1: Eliminate unsound fallbacks + new issue type

**Goal**: No section ever lands in a slot that doesn't accept its type.

**Changes**:

#### `assign-slots.ts`
- Remove the "Fallback: any slot with capacity" block (lines 138-149) that ignores `slot.accepts`
- Remove the "Last resort: append without slot assignment" block (lines 152-154)
- When a section has no compatible slot: push it into `result` **without** `slot` field, and collect an `unplaceable_section` issue
- The `unplaceable_section` issue is emitted **here** in `assignSlotsFromFacts`, not in `validateLayoutComposition` — because the assigner is the one that sees unplaced sections
- Issue includes: section id, section type, template id

#### `group-slots.ts`
- Remove the "Last resort: put in first non-hero/footer slot that has any room" block (lines ~62-72) that ignores both `accepts` and `maxSections`
- Keep the overflow logic at lines ~50-60 that **does** check `slot.accepts` — this is sound
- **Do not change** the function signature: it stays `Record<string, Section[]>`. Sections without a valid `slot` field simply don't appear in any slot bucket and are excluded from rendering
- No warning emission here — warnings come from the compose/publish path via `assignSlotsFromFacts`

#### `quality.ts`
- Add `"unplaceable_section"` to `LayoutIssueType` union
- Severity: `"warning"` (non-blocking for publish — the section is simply omitted)

**Invariant**: After this step, every section in a slot bucket is guaranteed to be accepted by that slot's `accepts` list.

### Step 2: Affinity-based ranking with anti-clustering tie-breaker

**Goal**: Sections land in their "best" slot, not just the first available one.

**Changes**:

#### `types.ts` (FullSlotDefinition)
- Add optional field: `affinity?: Partial<Record<ComponentType, number>>` — maps section type → weight (0-100)

#### `registry.ts` (architect template only)
Define affinities:
```
feature-left:  { bio: 90, experience: 80, education: 70, projects: 60 }
feature-right: { skills: 90, interests: 80, stats: 80, achievements: 70, "at-a-glance": 60 }
full-row:      { projects: 90, experience: 80, achievements: 70, reading: 60, music: 60, education: 50 }
card-1:        { stats: 90, contact: 80, languages: 70, social: 60, skills: 50, interests: 50, activities: 40 }
card-2:        { skills: 80, interests: 80, social: 70, languages: 60, activities: 50, stats: 40 }
card-3:        { activities: 80, reading: 70, music: 70, education: 60, achievements: 50 }
```

Other templates (monolith, cinematic, curator): no affinity defined → zero impact, backward compatible.

#### `assign-slots.ts` Phase 3
Replace first-fit iteration with ranked selection:

```
Sort candidateSlots by:
  1. affinity[sectionType] DESC  (higher affinity = better fit)
  2. slotFillRatio ASC           (emptier slots first — anti-clustering)
  3. slot.order ASC              (template order as final tie-breaker)
```

Where `slotFillRatio = usedCapacity / maxSections`.

This prevents card-1 from hoarding all sections: once it has 1 item (ratio = 1.0), card-2 and card-3 (ratio = 0.0) rank higher even at equal affinity.

When no slot defines affinity for the section type, affinity defaults to 0 → falls back to fillRatio + order, which is equivalent to current behavior but spread-aware.

### Step 3: Compact widgets + expanded accepts (atomic with Step 2)

**Goal**: Sections that land in `third`-sized card slots render correctly.

**Important**: Step 2 and Step 3 ship in the **same PR**. Expanding `accepts` without compact widgets (or vice versa) creates broken intermediate states.

#### `registry.ts` — expand card-* accepts
Add to `card-1`, `card-2`, `card-3` accepts: `"reading"`, `"education"`, `"achievements"`, `"music"`

#### `widgets.ts` — 4 new compact widgets
```
reading-compact      → variant: "compact", fitsIn: ["third"], maxItems: 5
education-compact    → variant: "compact", fitsIn: ["third"], maxItems: 3
achievements-compact → variant: "compact", fitsIn: ["third"], maxItems: 3
music-compact        → variant: "compact", fitsIn: ["third"], maxItems: 5
```

#### Theme components — add compact variant branch
Following the existing `Activities.tsx` pattern (`variant === "compact"`):

**Reading.tsx**: Compact = book title + author only, no rating stars, no description. Truncate at maxItems with "+N more" indicator.

**Education.tsx**: Compact = degree + institution inline, no field/description. Truncate at maxItems.

**Achievements.tsx**: Compact = title + year inline, no description/issuer. Truncate at maxItems.

**Music.tsx**: Compact = artist — title, no link/description. Truncate at maxItems.

All compact variants:
- Smaller headings (`text-lg` vs `text-2xl+`)
- No dot separators between entries
- No description/detail text
- `"+N more"` when items exceed maxItems

### Step 4: Backfill script for existing pages

**Goal**: Pages already published with `layoutTemplate=architect` may have incoherent slot/widget assignments from the old first-fit logic. Re-assign them.

#### `scripts/backfill-architect-slots.ts`
- Query all pages (draft + published) where `layoutTemplate = "architect"`
- For each: run `assignSlotsFromFacts()` with the updated registry
- Modes: `--dry-run` (report changes, don't write) and `--apply` (write to DB)
- Output: per-page diff (section id → old slot/widget → new slot/widget)
- Safety: skip pages with any user locks (`lockedBy: "user"`)

### Step 5: Validation

- Run full test suite
- Regenerate UAT batch profiles with architect layout
- Screenshot before/after comparison

## Files Changed

| File | Step | Change |
|---|---|---|
| `src/lib/layout/assign-slots.ts` | 1, 2 | Remove unsound fallbacks, emit `unplaceable_section`, affinity ranking |
| `src/lib/layout/group-slots.ts` | 1 | Remove unsound "last resort" fallback |
| `src/lib/layout/quality.ts` | 1 | Add `unplaceable_section` issue type |
| `src/lib/layout/types.ts` | 2 | Add `affinity?` field to `FullSlotDefinition` |
| `src/lib/layout/registry.ts` | 2, 3 | Affinity maps for architect slots, expanded card-* accepts |
| `src/lib/layout/widgets.ts` | 3 | 4 new compact widget definitions |
| `src/themes/editorial-360/components/Reading.tsx` | 3 | Add compact variant branch |
| `src/themes/editorial-360/components/Education.tsx` | 3 | Add compact variant branch |
| `src/themes/editorial-360/components/Achievements.tsx` | 3 | Add compact variant branch |
| `src/themes/editorial-360/components/Music.tsx` | 3 | Add compact variant branch |
| `scripts/backfill-architect-slots.ts` | 4 | New one-shot backfill script |
| `tests/evals/assign-slots.test.ts` | 1, 2 | New cases for unplaceable, affinity, anti-clustering |
| `tests/evals/group-slots.test.ts` | 1 | New cases for removed fallbacks |
| `tests/evals/layout-widgets.test.ts` | 3 | New compact widget resolution tests |

## Test Plan

### Step 1 tests
- Section with type not accepted by any slot → `unplaceable_section` warning, section excluded from slot buckets
- Section with type accepted → assigned as before (regression)
- `groupSectionsBySlot` with section having invalid `slot` → excluded from all buckets (no crash)

### Step 2 tests
- Bio on architect → lands in `feature-left` (highest affinity)
- Stats on architect → lands in `card-1` (highest affinity for stats)
- 3 sections all preferring card-1 → spread across card-1/2/3 (anti-clustering)
- Monolith with same sections → order unchanged (no affinity defined, backward compat)
- Locked section → keeps its slot regardless of affinity

### Step 3 tests
- `getBestWidget("reading", "third")` → returns `reading-compact`
- `getBestWidget("reading", "wide")` → returns `reading-list` (unchanged)
- Compact widget render: items > maxItems → shows "+N more"

### Step 4 tests
- Backfill script dry-run on test fixture → correct diff output
- Backfill skips locked sections

## Estimate

| Step | Effort |
|---|---|
| Step 1: Unsound fallbacks | 0.5 day |
| Step 2 + 3: Affinity + compact widgets (atomic PR) | 1 day |
| Step 4: Backfill script | 0.25 day |
| Step 5: Validation + screenshots | 0.25 day |
| **Total** | **2 days** |

## Risks & Mitigations

- **Risk**: Affinity values are hand-tuned, may not be optimal for all content combinations  
  **Mitigation**: Values are data, not code — easy to adjust. Anti-clustering tie-breaker prevents worst-case packing regardless of affinity weights.

- **Risk**: Compact variants lose important information  
  **Mitigation**: "+N more" indicator signals truncation. Full content accessible in other layouts. Card slots are supplementary, not primary.

- **Risk**: Backfill changes published page appearance  
  **Mitigation**: Dry-run mode first. Skip user-locked sections. Changes improve layout quality — they don't remove content.
