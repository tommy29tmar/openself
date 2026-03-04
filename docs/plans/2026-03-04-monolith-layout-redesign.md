# Monolith Layout Redesign Implementation Plan — v7

> **Key design decision from v6:** All section redesigns (Tasks 2–5, 8–11) are implemented as named `variant === "monolith"` branches within each component. The existing default rendering is preserved. `MONOLITH_VARIANT_OVERRIDES` in `MonolithLayout.tsx` injects `"monolith"` variant at render time for all relevant section types. Non-monolith layouts (curator, architect, cinematic) are unaffected.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the Monolith layout in line with the reference prototype at `docs/reference/monolith-prototype.png` / `http://localhost:3000/prototype.html`.

**Architecture:**
- All section components live in `src/themes/editorial-360/components/`. Rendered via `PageRenderer` → `SECTION_COMPONENTS` map in `src/components/sections/index.ts`.
- The hero section type maps to `src/themes/editorial-360/components/Hero.tsx` (NOT `src/components/page/HeroSection.tsx`).
- `MonolithLayout` (`src/components/layout-templates/MonolithLayout.tsx`) applies a `MONOLITH_VARIANT_OVERRIDES` map at render time to inject `variant` and clear `widgetId` — this bypasses the `assignSlotsFromFacts` widgetId auto-assignment that would otherwise override `section.variant`. ALL redesigned section types use a named variant `"monolith"` so the default rendering of each component is preserved for curator/architect/cinematic layouts.
- Section suppression for legacy `at-a-glance`/`social`/`contact` sections happens in `PageRenderer.tsx` BEFORE passing sections to both StickyNav and the layout.
- `composeOptimisticPage` accepts an optional `layoutTemplate?: string` parameter. When `layoutTemplate === "monolith"`, the extended branch generates standalone `skills` + `interests` + `languages` sections instead of `at-a-glance`. Non-monolith layouts keep existing `at-a-glance` behavior — no global regression.

**Tech Stack:** React (Next.js App Router), TypeScript, Tailwind + inline styles, Vitest

**Design reference:** `docs/plans/monolith-layout-fixes.md` — read this before every task.

**Dev server:** `npm run dev:watch` (do NOT use `npm run dev`)

**Run tests:** `npx vitest run tests/evals/ --reporter=verbose` (no pipe — pipe swallows exit code)

---

## Task 1: Upgrade CollapsibleList

**Files:**
- Modify: `src/components/page/CollapsibleList.tsx`
- Test: `tests/evals/collapsible-list.test.ts` (create new)

### Step 1: Write the failing test

The test imports a named export `splitItems` from `CollapsibleList.tsx`. This export does not yet exist, so the test will fail before implementation and pass after.

```typescript
// tests/evals/collapsible-list.test.ts
import { describe, it, expect } from "vitest";
import { splitItems } from "@/components/page/CollapsibleList";

describe("CollapsibleList splitItems helper", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("visible = slice(0, visibleCount)", () => {
    const { visible } = splitItems(items, 2);
    expect(visible).toEqual(["a", "b"]);
  });

  it("hidden = slice(visibleCount)", () => {
    const { hidden } = splitItems(items, 2);
    expect(hidden).toEqual(["c", "d", "e"]);
  });

  it("hidden.length = items.length - visibleCount", () => {
    const { hidden } = splitItems(items, 2);
    expect(hidden.length).toBe(3);
  });

  it("no accordion when items.length <= visibleCount", () => {
    const { hidden } = splitItems(["a", "b"], 2);
    expect(hidden.length).toBe(0);
  });

  it("all visible when visibleCount >= items.length", () => {
    const { visible, hidden } = splitItems(["a", "b"], 10);
    expect(visible).toEqual(["a", "b"]);
    expect(hidden).toEqual([]);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx vitest run tests/evals/collapsible-list.test.ts --reporter=verbose
```
Expected: FAIL — `splitItems` is not exported from CollapsibleList yet.

### Step 3: Implement the changes

Replace the full contents of `src/components/page/CollapsibleList.tsx`:

```tsx
"use client";

import React, { useState, useRef, useEffect } from "react";

type CollapsibleListProps = {
  items: React.ReactNode[];
  visibleCount?: number;  // how many items to show before collapse (default: 1)
  moreLabel?: string;     // e.g. "more roles" — count is prepended automatically
};

// Exported utility: pure split logic, testable without React
export function splitItems<T>(items: T[], visibleCount: number): { visible: T[]; hidden: T[] } {
  return {
    visible: items.slice(0, visibleCount),
    hidden: items.slice(visibleCount),
  };
}

export function CollapsibleList({
  items,
  visibleCount = 1,
  moreLabel = "more",
}: CollapsibleListProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, items]);

  const { visible: visibleItems, hidden: hiddenItems } = splitItems(items, visibleCount);

  // Show all if within visibleCount
  if (hiddenItems.length === 0) {
    return <>{visibleItems}</>;
  }

  const hiddenCount = hiddenItems.length;

  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--page-fg2, var(--page-fg-secondary))",
    opacity: 0.6,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px 0",
    letterSpacing: "0.05em",
    transition: "opacity 0.15s",
  };

  return (
    <div>
      {visibleItems}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
        >
          <span>▾</span>
          <span>{hiddenCount} {moreLabel}</span>
        </button>
      )}
      <div
        ref={contentRef}
        style={{
          maxHeight: expanded ? `${contentHeight}px` : "0px",
          overflow: "hidden",
          transition: "max-height 0.4s ease-in-out",
        }}
      >
        {hiddenItems}
      </div>
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{ ...buttonStyle, marginTop: 8 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
        >
          <span>▴</span>
          <span>collapse</span>
        </button>
      )}
    </div>
  );
}
```

### Step 4: Update all callers of CollapsibleList to use new API

The old `summaryLine` prop is removed. Update all files that call `<CollapsibleList summaryLine=...>`:

- `src/themes/editorial-360/components/Experience.tsx` — `summaryLine={...}` → `visibleCount={2} moreLabel="more roles"` (full redesign in Task 2)
- `src/themes/editorial-360/components/Education.tsx` — `visibleCount={2} moreLabel="more degrees"` (redesign in Task 3)
- `src/themes/editorial-360/components/Achievements.tsx` — `visibleCount={3} moreLabel="more"` (redesign in Task 4)
- `src/themes/editorial-360/components/Projects.tsx` — `visibleCount={1} moreLabel="more projects"` (redesign in Task 6)
- `src/themes/editorial-360/components/Reading.tsx` — remove summaryLine (redesign in Task 8)

Search for any remaining callers:
```bash
grep -rn "summaryLine" src/themes/editorial-360/components/
```
Update any additional callers found.

### Step 5: Run tests

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -40
```
Expected: all pass including the new `splitItems` tests.

### Step 6: Commit

```bash
git add src/components/page/CollapsibleList.tsx tests/evals/collapsible-list.test.ts \
        src/themes/editorial-360/components/Experience.tsx \
        src/themes/editorial-360/components/Education.tsx \
        src/themes/editorial-360/components/Achievements.tsx \
        src/themes/editorial-360/components/Projects.tsx \
        src/themes/editorial-360/components/Reading.tsx
git commit -m "refactor(ui): upgrade CollapsibleList with visibleCount + discrete accordion button"
```

---

## Task 2: Experience — add `"monolith"` variant (dot bullet + Role—Company + accordion)

**Files:**
- Modify: `src/themes/editorial-360/components/Experience.tsx`

> **KEY CONSTRAINT:** Do NOT modify the existing default rendering — other layouts (curator, architect, cinematic) use it. Add a new `variant === "monolith"` branch BEFORE the existing default. `MonolithLayout.tsx` will inject this variant at render time via `MONOLITH_VARIANT_OVERRIDES`.

### Step 1: Read the current file

Read `src/themes/editorial-360/components/Experience.tsx` in full. Identify: the compact branch, the default rendering, and the types used.

### Step 2: Add `"monolith"` variant branch

Add the following block BEFORE the existing default rendering (after any compact/other named variant checks). Do NOT remove or modify existing branches:

```tsx
import { CollapsibleList } from "@/components/page/CollapsibleList";

// Add this const near the top or inside the component:
const dotStyle: React.CSSProperties = {
  width: 8, height: 8, borderRadius: "50%",
  background: "var(--page-accent)", opacity: 0.5,
  marginTop: 7, flexShrink: 0,
};

// Inside Experience function, add before the existing default return:
if (variant === "monolith") {
  const sortedItems = [...items].sort((a, b) => {
    if (a.current && !b.current) return -1;
    if (!a.current && b.current) return 1;
    return 0;
  });
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Experience"}</h2>
      <CollapsibleList
        visibleCount={2}
        moreLabel="more roles"
        items={sortedItems.map((item, index) => (
          <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
            <div style={dotStyle} />
            <article style={{ flex: 1 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                {item.title}{item.company ? ` — ${item.company}` : ""}
              </h3>
              {item.period && (
                <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>
                  {item.period}
                </div>
              )}
              {item.description && (
                <p style={{ fontSize: 14, color: "var(--page-fg-secondary)", lineHeight: 1.6, marginTop: 8, maxWidth: "60ch" }}>
                  {item.description}
                </p>
              )}
            </article>
          </div>
        ))}
      />
    </section>
  );
}
// ... existing default rendering continues unchanged below
```

> **Note:** `MONOLITH_VARIANT_OVERRIDES` is created in Task 6 Step 3 with all overrides pre-registered — no change needed here.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Experience.tsx \
        src/components/layout-templates/MonolithLayout.tsx
git commit -m "feat(ui): add Experience monolith variant — dot bullet, Role—Company, 2-visible accordion"
```

---

## Task 3: Education — add `"monolith"` variant (dot bullet + Degree—Institution + accordion)

**Files:**
- Modify: `src/themes/editorial-360/components/Education.tsx`

> **KEY CONSTRAINT:** Same pattern as Task 2 — add `variant === "monolith"` branch, do NOT replace the default.

### Step 1: Read current file

Read `src/themes/editorial-360/components/Education.tsx`. Note existing variants and actual field names (may be `degree`, `field`, `institution`, `period`).

### Step 2: Add `"monolith"` variant branch

Add before the existing default rendering. Format: `"Degree — Institution"`. 2 visible, `moreLabel="more degrees"`.

```tsx
if (variant === "monolith") {
  const dotStyle: React.CSSProperties = {
    width: 8, height: 8, borderRadius: "50%",
    background: "var(--page-accent)", opacity: 0.5,
    marginTop: 7, flexShrink: 0,
  };
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Education"}</h2>
      <CollapsibleList
        visibleCount={2}
        moreLabel="more degrees"
        items={items.map((item, index) => {
          const primary = item.degree ?? item.field ?? "";
          const secondary = item.institution ?? "";
          const heading = primary && secondary ? `${primary} — ${secondary}` : primary || secondary;
          return (
            <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
              <div style={dotStyle} />
              <article style={{ flex: 1 }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                  {heading}
                </h3>
                {item.period && (
                  <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>{item.period}</div>
                )}
                {item.description && (
                  <p style={{ fontSize: 14, color: "var(--page-fg-secondary)", lineHeight: 1.6, marginTop: 8, maxWidth: "60ch" }}>
                    {item.description}
                  </p>
                )}
              </article>
            </div>
          );
        })}
      />
    </section>
  );
}
// ... existing default continues unchanged ...
```

> **Note:** `MONOLITH_VARIANT_OVERRIDES` is created in Task 6 Step 3 with all overrides pre-registered — no change needed here.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Education.tsx \
        src/components/layout-templates/MonolithLayout.tsx
git commit -m "feat(ui): add Education monolith variant — dot bullet, Degree—Institution, 2-visible accordion"
```

---

## Task 4: Achievements — add `"monolith"` variant (dot bullet + date/issuer meta + accordion)

**Files:**
- Modify: `src/themes/editorial-360/components/Achievements.tsx`

> **KEY CONSTRAINT:** Same pattern as Task 2 — add `variant === "monolith"` branch, do NOT replace the default. Field names: `title`, `date?`, `issuer?`, `description?` (NOT `year` or `context`).

### Step 1: Read current file, note field names and any variants

### Step 2: Add `"monolith"` variant branch

Add before existing default rendering:

```tsx
if (variant === "monolith") {
  const dotStyle: React.CSSProperties = {
    width: 8, height: 8, borderRadius: "50%",
    background: "var(--page-accent)", opacity: 0.5,
    marginTop: 7, flexShrink: 0,
  };
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Achievements"}</h2>
      <CollapsibleList
        visibleCount={3}
        moreLabel="more"
        items={items.map((item, index) => (
          <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
            <div style={dotStyle} />
            <article style={{ flex: 1 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                {item.title}
              </h3>
              {(item.date || item.issuer) && (
                <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>
                  {[item.date, item.issuer].filter(Boolean).join(" · ")}
                </div>
              )}
              {item.description && (
                <p style={{ fontSize: 14, color: "var(--page-fg-secondary)", lineHeight: 1.6, marginTop: 8, maxWidth: "60ch" }}>
                  {item.description}
                </p>
              )}
            </article>
          </div>
        ))}
      />
    </section>
  );
}
// ... existing default continues unchanged ...
```

> **Note:** `MONOLITH_VARIANT_OVERRIDES` is created in Task 6 Step 3 with all overrides pre-registered — no change needed here.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Achievements.tsx \
        src/components/layout-templates/MonolithLayout.tsx
git commit -m "feat(ui): add Achievements monolith variant — dot bullet, date/issuer meta, 3-visible accordion"
```

---

## Task 5: Timeline — add `"monolith"` variant (dot bullet + Title—Subtitle + accordion)

**Files:**
- Modify: `src/themes/editorial-360/components/Timeline.tsx`

> **KEY CONSTRAINT:** Same pattern as Task 2 — add `variant === "monolith"` branch, do NOT replace the default.

### Step 1: Read current file, note any existing variants

Fields: `title`, `subtitle`, `date`, `description`. Format: `"Title — Subtitle"`. Dot bullet. 2 visible, `moreLabel="more"`.

### Step 2: Add `"monolith"` variant branch

Add before existing default rendering:

```tsx
if (variant === "monolith") {
  const dotStyle: React.CSSProperties = {
    width: 8, height: 8, borderRadius: "50%",
    background: "var(--page-accent)", opacity: 0.5,
    marginTop: 7, flexShrink: 0,
  };
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Timeline"}</h2>
      <CollapsibleList
        visibleCount={2}
        moreLabel="more"
        items={items.map((item, index) => (
          <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
            <div style={dotStyle} />
            <article style={{ flex: 1 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.25, margin: 0 }}>
                {item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
              </h3>
              {item.date && (
                <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 4 }}>{item.date}</div>
              )}
              {item.description && (
                <p style={{ fontSize: 14, color: "var(--page-fg-secondary)", lineHeight: 1.6, marginTop: 8, maxWidth: "60ch" }}>
                  {item.description}
                </p>
              )}
            </article>
          </div>
        ))}
      />
    </section>
  );
}
// ... existing default continues unchanged ...
```

> **Note:** `MONOLITH_VARIANT_OVERRIDES` is created in Task 6 Step 3 with all overrides pre-registered — no change needed here.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Timeline.tsx \
        src/components/layout-templates/MonolithLayout.tsx
git commit -m "feat(ui): add Timeline monolith variant — dot bullet, Title—Subtitle, 2-visible accordion"
```

---

## Task 6: Projects — add projects-grid variant (2-col responsive card grid)

**Files:**
- Modify: `src/themes/editorial-360/components/Projects.tsx`
- Modify: `src/components/layout-templates/MonolithLayout.tsx` (add variant override map)

### Step 1: Read current Projects.tsx

Read `src/themes/editorial-360/components/Projects.tsx`. Note `ProjectItem` type definition (has `title`, `description`, `url`, `tags`) and all existing variants.

### Step 2: Add projects-grid variant to Projects.tsx

Add `"use client"` if not present. **DO NOT remove existing variants.** Add state and ProjectCard helper, then a new `projects-grid` branch:

```tsx
"use client";
import React, { useState } from "react";
// ... existing imports ...

// Define ProjectCard helper before the main component
function ProjectCard({ item }: { item: ProjectItem }) {
  return (
    <div style={{
      background: "var(--page-card-bg, var(--page-muted))",
      border: "1px solid var(--page-border)",
      borderRadius: 10,
      padding: 20,
    }}>
      <h3 style={{ fontWeight: 600, fontSize: 16, color: "var(--page-fg)", margin: "0 0 8px" }}>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer"
             style={{ color: "inherit", textDecoration: "none" }}>
            {item.title}
          </a>
        ) : item.title}
      </h3>
      {item.description && (
        <p style={{ fontSize: 13, color: "var(--page-fg-secondary)", lineHeight: 1.6, margin: 0 }}>
          {item.description}
        </p>
      )}
      {item.tags && item.tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {item.tags.map((tag, i) => (
            <span key={i} style={{
              fontSize: 11, color: "var(--page-accent)",
              background: "var(--page-muted)", padding: "3px 9px",
              borderRadius: 10, border: "1px solid var(--page-border)",
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Inside the main Projects component:
export function Projects({ content, variant }: SectionProps<ProjectsContent>) {
  const { items = [], title } = content;
  // useState at top level (React hooks rule)
  const [gridExpanded, setGridExpanded] = useState(false);
  if (!items.length) return null;

  if (variant === "projects-grid") {
    const VISIBLE = 4;
    const visibleItems = items.slice(0, VISIBLE);
    const hiddenItems = items.slice(VISIBLE);

    return (
      <section className="theme-reveal">
        <h2 className="section-label">{title || "Projects"}</h2>
        {/* Explicit 2-col grid: always 2 cols on sm+, 1 col on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleItems.map((item, i) => <ProjectCard key={i} item={item} />)}
          {gridExpanded && hiddenItems.map((item, i) => <ProjectCard key={`h${i}`} item={item} />)}
        </div>
        {hiddenItems.length > 0 && (
          <button
            type="button"
            onClick={() => setGridExpanded(!gridExpanded)}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12,
              color: "var(--page-fg-secondary)", opacity: 0.6, background: "none",
              border: "none", cursor: "pointer", padding: "8px 0", marginTop: 8,
              letterSpacing: "0.05em",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
          >
            <span>{gridExpanded ? "▴" : "▾"}</span>
            <span>{gridExpanded ? "collapse" : `${hiddenItems.length} more projects`}</span>
          </button>
        )}
      </section>
    );
  }

  // ... existing variant branches (bento, minimal, list, etc.) unchanged ...
}
```

**Note on responsive grid:** Using Tailwind `grid-cols-1 sm:grid-cols-2` guarantees exactly 2 columns at ≥640px viewport, regardless of container width. This avoids the `auto-fill minmax` behavior that can produce 3+ columns in wide bleed-lane containers.

### Step 3: Add complete variant override map in MonolithLayout.tsx

In `MonolithLayout.tsx`, add a variant override map covering ALL section types that will be redesigned in Tasks 2–5 and 7–11. This is the central registry. Tasks 2–5 and 7–11 each add their `"monolith"` entry here — but the full map is established now so subsequent tasks just update it.

> **WHY:** All section type components (Experience, Education, etc.) have their new design isolated in a named `"monolith"` variant. Non-monolith layouts keep using the existing default variant — no regression.

Add after imports:

```tsx
// Variant overrides applied at render time for Monolith layout.
// Bypasses widgetId auto-assignment from assignSlotsFromFacts.
// Each entry maps section.type → the variant name to inject.
const MONOLITH_VARIANT_OVERRIDES: Partial<Record<string, string>> = {
  // Named variants (added in Tasks 2–5, 7–11):
  experience: "monolith",
  education: "monolith",
  achievements: "monolith",
  timeline: "monolith",
  reading: "monolith",
  music: "monolith",
  activities: "monolith",
  interests: "monolith",
  languages: "monolith",
  // Explicitly named variants:
  projects: "projects-grid",
  skills: "skills-accent-pills",
};

function applyMonolithOverride(section: Section): Section {
  const variant = MONOLITH_VARIANT_OVERRIDES[section.type];
  if (!variant) return section;
  return { ...section, variant, widgetId: undefined };
}
```

In the render loop, replace `{renderSection(section)}` with:

```tsx
{renderSection(applyMonolithOverride(section))}
```

### Step 4: Ensure ProjectItem type includes `tags?`

When reading `Projects.tsx` in Step 1, check if `ProjectItem` already has `tags?`. If not, add it:

```typescript
type ProjectItem = {
  title: string;
  description?: string;
  url?: string;
  tags?: string[];
  // ... preserve any existing fields like year?, role? ...
};
```

The `tags` field is optional — existing projects without tags just won't show the tag row.

### Step 5: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Projects.tsx \
        src/components/layout-templates/MonolithLayout.tsx
git commit -m "feat(ui): add projects-grid variant + MonolithLayout variant override system (all section types)"
```

---

## Task 7: Skills — add skills-accent-pills variant

**Files:**
- Modify: `src/themes/editorial-360/components/Skills.tsx`

(MonolithLayout already registers `skills: "skills-accent-pills"` in `MONOLITH_VARIANT_OVERRIDES` from Task 6.)

### Step 1: Read current Skills.tsx

Note field structure and all existing variants.

### Step 2: Add skills-accent-pills variant — preserve all others

```tsx
if (variant === "skills-accent-pills") {
  // Flatten all groups into one skill list
  const allSkills: string[] = (groups ?? []).flatMap((g) => {
    const raw = g.items ?? g.skills ?? [];
    return raw.map((item: string | { name: string }) =>
      typeof item === "string" ? item : item.name
    );
  });

  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Skills"}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {allSkills.map((name, i) => (
          <span key={i} style={{
            fontSize: 12, fontWeight: 500,
            padding: "6px 14px", borderRadius: 20,
            border: i < 2 ? "1px solid var(--page-accent)" : "1px solid var(--page-border)",
            background: i < 2 ? "var(--page-accent)" : "var(--page-muted)",
            color: i < 2 ? "var(--page-accent-fg)" : "var(--page-fg)",
          }}>
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
```

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -40
git add src/themes/editorial-360/components/Skills.tsx
git commit -m "feat(ui): add skills-accent-pills variant — flat pill list, first 2 accent"
```

---

## Task 8: Reading — add `"monolith"` variant (vertical list + 3-visible accordion)

**Files:**
- Modify: `src/themes/editorial-360/components/Reading.tsx`

> **KEY CONSTRAINT:** Add `variant === "monolith"` branch, do NOT replace the default. Fields: `title`, `author?`, `url?`, `note?`.

### Step 1: Read current file

Note compact variant code and actual field names.

### Step 2: Add `"monolith"` variant branch

Add before existing default rendering:

```tsx
if (variant === "monolith") {
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Reading"}</h2>
      <CollapsibleList
        visibleCount={3}
        moreLabel="more books"
        items={items.map((item, index) => (
          <div key={index} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.3 }}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                   style={{ color: "inherit", textDecoration: "none" }}>
                  {item.title}
                </a>
              ) : item.title}
            </div>
            {item.author && (
              <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 2 }}>{item.author}</div>
            )}
            {item.note && (
              <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 6, lineHeight: 1.5, opacity: 0.8 }}>
                {item.note}
              </div>
            )}
          </div>
        ))}
      />
    </section>
  );
}
// ... existing default continues unchanged ...
```

`MONOLITH_VARIANT_OVERRIDES` already has `reading: "monolith"` from Task 6.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Reading.tsx
git commit -m "feat(ui): add Reading monolith variant — vertical list, 3-visible accordion"
```

---

## Task 9: Music — add `"monolith"` variant (same as Reading)

**Files:**
- Modify: `src/themes/editorial-360/components/Music.tsx`

> **KEY CONSTRAINT:** Add `variant === "monolith"` branch, do NOT replace the default.

### Step 1: Read current file, note variants and field names

Fields may differ from Reading — common ones: `title`, `artist?`, `album?`, `note?`, `url?`.

### Step 2: Add `"monolith"` variant branch

Same structure as Task 8 but adapted for Music fields. Use `artist` instead of `author`. `moreLabel="more tracks"`.

```tsx
if (variant === "monolith") {
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Music"}</h2>
      <CollapsibleList
        visibleCount={3}
        moreLabel="more tracks"
        items={items.map((item, index) => (
          <div key={index} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--page-fg)", lineHeight: 1.3 }}>
              {item.title ?? item.name}
            </div>
            {item.artist && (
              <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 2 }}>{item.artist}</div>
            )}
            {item.note && (
              <div style={{ fontSize: 13, color: "var(--page-fg-secondary)", marginTop: 6, lineHeight: 1.5, opacity: 0.8 }}>
                {item.note}
              </div>
            )}
          </div>
        ))}
      />
    </section>
  );
}
// ... existing default continues unchanged ...
```

`MONOLITH_VARIANT_OVERRIDES` already has `music: "monolith"` from Task 6.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Music.tsx
git commit -m "feat(ui): add Music monolith variant — vertical list, 3-visible accordion"
```

---

## Task 10: Activities + Interests — add `"monolith"` variant (pills + 6-visible accordion)

**Files:**
- Modify: `src/themes/editorial-360/components/Activities.tsx`
- Modify: `src/themes/editorial-360/components/Interests.tsx`

> **KEY CONSTRAINT:** Add `variant === "monolith"` branch, do NOT replace the default.

### Step 1: Read both files, note existing variants

### Step 2: Add `"monolith"` variant to Activities.tsx

```tsx
if (variant === "monolith") {
  const pillStyle: React.CSSProperties = {
    fontSize: 12, padding: "6px 14px", borderRadius: 20,
    border: "1px solid var(--page-border)",
    background: "var(--page-muted)", color: "var(--page-fg)", cursor: "default",
  };
  const VISIBLE = 6;
  const visible = items.slice(0, VISIBLE);
  const hidden = items.slice(VISIBLE);
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Activities"}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {visible.map((item, i) => (
          <span key={i} style={pillStyle}
            title={[item.activityType, item.frequency, item.description].filter(Boolean).join(" · ")}>
            {item.name}
          </span>
        ))}
        {expanded && hidden.map((item, i) => (
          <span key={`h${i}`} style={pillStyle}
            title={[item.activityType, item.frequency, item.description].filter(Boolean).join(" · ")}>
            {item.name}
          </span>
        ))}
      </div>
      {hidden.length > 0 && (
        <button type="button" onClick={() => setExpanded(!expanded)}
          style={{ display:"flex", alignItems:"center", gap:6, fontSize:12,
                   color:"var(--page-fg-secondary)", opacity:0.6, background:"none",
                   border:"none", cursor:"pointer", padding:"8px 0", marginTop:8,
                   letterSpacing:"0.05em" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
        >
          <span>{expanded ? "▴" : "▾"}</span>
          <span>{expanded ? "collapse" : `${hidden.length} more`}</span>
        </button>
      )}
    </section>
  );
}
// ... existing default continues unchanged ...
```

Note: `expanded`/`setExpanded` state must be declared at the top of the component (React rules), before any conditional returns. If the component doesn't already have state, add `const [expanded, setExpanded] = useState(false)` near the top of the function body.

### Step 3: Add `"monolith"` variant to Interests.tsx

Same structure as Activities. Fields: `name`, `description?`. `moreLabel="more"`.

`MONOLITH_VARIANT_OVERRIDES` already has `activities: "monolith"` and `interests: "monolith"` from Task 6.

### Step 4: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Activities.tsx \
        src/themes/editorial-360/components/Interests.tsx
git commit -m "feat(ui): add Activities + Interests monolith variant — pills, 6-visible accordion"
```

---

## Task 11: Languages — add `"monolith"` variant (pill pairs)

**Files:**
- Modify: `src/themes/editorial-360/components/Languages.tsx`

> **KEY CONSTRAINT:** Add `variant === "monolith"` branch, do NOT replace the default.

### Step 1: Read current file

### Step 2: Add `"monolith"` variant branch

```tsx
if (variant === "monolith") {
  return (
    <section className="theme-reveal">
      <h2 className="section-label">{title || "Languages"}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((item, i) => (
          <span key={i} style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 20,
            border: "1px solid var(--page-border)",
            background: "var(--page-muted)", color: "var(--page-fg)",
          }}>
            {item.language}{item.proficiency ? ` · ${item.proficiency}` : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
// ... existing default continues unchanged ...
```

`MONOLITH_VARIANT_OVERRIDES` already has `languages: "monolith"` from Task 6.

### Step 3: Run tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose
git add src/themes/editorial-360/components/Languages.tsx
git commit -m "feat(ui): add Languages monolith variant — pill pairs with proficiency level"
```

---

## Task 12: Hero — chip pills + contact row

**Files:**
- Modify: `src/themes/editorial-360/components/Hero.tsx`

> **IMPORTANT:** This is `src/themes/editorial-360/components/Hero.tsx` — the component registered in SECTION_COMPONENTS. NOT `src/components/page/HeroSection.tsx`.

### Step 1: Read the current file

Read `src/themes/editorial-360/components/Hero.tsx`. It has:
- `hero-split` (default) — 80px avatar left-aligned, contact bar below
- `hero-centered` — centered layout (unchanged)
- `hero-glass` — glass card (unchanged)

### Step 2: Update HeroContent local type (top of Hero.tsx)

Add new optional fields:

```typescript
type HeroContent = {
  name: string;
  tagline: string;
  avatarUrl?: string;
  socialLinks?: { platform: string; url: string; label?: string }[];
  contactEmail?: string;
  languages?: { language: string; proficiency?: string; canonicalProficiency?: string }[];
  location?: string;
  availability?: string;
  yearsExp?: number;
};
```

### Step 3: Add helper components BEFORE the Hero function

```tsx
// Canonical high-proficiency tokens (language-independent).
// page-composer.ts stores canonicalProficiency = raw fact value (pre-localization).
// We filter on canonical tokens only — safe across all locales.
const HIGH_PROFICIENCY_CANONICAL = new Set([
  "native", "bilingual", "fluent", "near-native", "proficient", "c1", "c2",
]);

function isHighProficiency(l: { proficiency?: string; canonicalProficiency?: string }): boolean {
  // Use canonicalProficiency if present (pre-localization, already normalized)
  if (l.canonicalProficiency) {
    return HIGH_PROFICIENCY_CANONICAL.has(l.canonicalProficiency.toLowerCase().trim());
  }
  // Fallback: normalize proficiency through alias map.
  // Handles: (a) old configs without canonicalProficiency, (b) translated pages
  //   where canonicalProficiency was overwritten by the translation pipeline.
  const prof = (l.proficiency ?? "").toLowerCase().trim();
  const normalized = PROFICIENCY_ALIAS[prof] ?? prof;
  return HIGH_PROFICIENCY_CANONICAL.has(normalized);
}

function HeroChips({ content }: { content: HeroContent }) {
  const chips: string[] = [];

  if (content.location) chips.push(content.location);
  if (content.availability) chips.push(content.availability);
  if (content.yearsExp && content.yearsExp > 0) chips.push(`${content.yearsExp} yrs exp.`);

  // Languages: only show if proficiency is high (native or fluent).
  // Works with both old configs (no canonicalProficiency) and translated pages.
  const langs = (content.languages ?? [])
    .filter(l => (l.proficiency || l.canonicalProficiency) && isHighProficiency(l))
    .slice(0, 2)
    .map(l => l.language);
  if (langs.length > 0) chips.push(langs.join(" · "));

  if (chips.length === 0) return null;

  const chipStyle: React.CSSProperties = {
    fontSize: 12, color: "var(--page-fg-secondary)",
    background: "var(--page-muted)", padding: "5px 12px",
    borderRadius: 20, border: "1px solid var(--page-border)",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
      {chips.map((chip, i) => <span key={i} style={chipStyle}>{chip}</span>)}
    </div>
  );
}

function HeroContact({ content }: { content: HeroContent }) {
  const hasEmail = !!content.contactEmail;
  const socialLinks = (content.socialLinks ?? []).filter(l => l.url);
  if (!hasEmail && socialLinks.length === 0) return null;

  const linkStyle: React.CSSProperties = {
    fontSize: 12, color: "var(--page-fg-secondary)", opacity: 0.7,
    textDecoration: "none", fontWeight: 600, letterSpacing: "0.03em",
    transition: "opacity 0.15s",
  };

  const ICONS: Record<string, string> = {
    github: "GH", linkedin: "in", twitter: "𝕏", x: "𝕏",
    website: "↗", instagram: "IG",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
      {hasEmail && (
        <a href={`mailto:${content.contactEmail}`} style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
        >
          {content.contactEmail}
        </a>
      )}
      {socialLinks.map((link, i) => {
        const label = ICONS[link.platform?.toLowerCase()] ?? link.platform?.slice(0, 2).toUpperCase() ?? "↗";
        return (
          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
             aria-label={link.label ?? link.platform} style={linkStyle}
             onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
             onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
```

### Step 4: Replace only the hero-split default block

Keep `hero-centered` and `hero-glass` unchanged. Replace only the default return (after all variant checks):

```tsx
// Default: hero-split — left-aligned, avatar row, chip pills, contact row
return (
  <header className="py-24 theme-reveal">
    <div style={{ borderBottom: "1px solid var(--page-border)", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {renderAvatar("w-20 h-20", "text-2xl")}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            className="hero-stagger-name font-[var(--h-font)] font-medium tracking-[-0.03em] leading-[0.95]"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)" }}
          >
            {name}
          </h1>
          {tagline && (
            <p className="hero-stagger-tagline"
               style={{ fontSize: 17, fontWeight: 300, color: "var(--page-fg-secondary)", lineHeight: 1.5, maxWidth: "50ch", marginTop: 12 }}>
              {tagline}
            </p>
          )}
        </div>
      </div>
      <HeroChips content={content} />
      <HeroContact content={content} />
    </div>
  </header>
);
```

### Step 5: Run tests

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -40
```

### Step 6: Update buildHeroSection in page-composer.ts to store canonicalProficiency

In `src/lib/services/page-composer.ts`, find `buildHeroSection`. Locate where language facts are mapped into hero content (around where `localizeProficiency` is called). Add `canonicalProficiency` via a normalization map that resolves common localized aliases → canonical English tokens:

```typescript
// Normalize raw proficiency value (which may be in user's language) to canonical English token
const PROFICIENCY_ALIAS: Record<string, string> = {
  // Italian
  "madrelingua": "native",
  // German
  "muttersprachler": "native",
  "muttersprachlerin": "native",
  "fließend": "fluent",
  "fliessend": "fluent",
  // French
  "natif": "native",
  "native": "native",
  "courant": "fluent",
  "couramment": "fluent",
  // Spanish/Portuguese
  "nativo": "native",
  "nativa": "native",
  "fluente": "fluent",
  // English/other common
  "bilingual": "bilingual",
  "bilingue": "bilingual",
  "near-native": "native",
  "proficient": "fluent",
};
function normalizeCanonicalProficiency(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return PROFICIENCY_ALIAS[lower] ?? lower;
}

// Before (v3):
const item: { language: string; proficiency?: string } = { language: lang };
if (prof) item.proficiency = localizeProficiency(prof, language);

// After (v5) — add canonicalProficiency for locale-safe chip filtering:
const item: { language: string; proficiency?: string; canonicalProficiency?: string } = { language: lang };
if (prof) {
  item.canonicalProficiency = normalizeCanonicalProficiency(prof);  // normalized canonical
  item.proficiency = localizeProficiency(prof, language);            // localized display value
}
```

Update `Hero.tsx` `HIGH_PROFICIENCY_CANONICAL` set to match the normalized canonical tokens used:

```typescript
const HIGH_PROFICIENCY_CANONICAL = new Set(["native", "bilingual", "fluent", "c1", "c2"]);
```

(Remove `"near-native"` and `"proficient"` since `normalizeCanonicalProficiency` already maps them to `"native"` / `"fluent"`.)

This ensures `Hero.tsx` can filter correctly regardless of UI language or raw fact wording.

### Step 7: Commit

```bash
git add src/themes/editorial-360/components/Hero.tsx src/lib/services/page-composer.ts
git commit -m "feat(ui): redesign Hero hero-split variant — chip pills + contact row with social icons"
```

---

## Task 13: page-composer.ts — add monolith-specific section generation

**Files:**
- Modify: `src/lib/services/page-composer.ts`
- Modify: `tests/evals/composer-sort-order.test.ts`
- Modify: `tests/evals/at-a-glance-composer.test.ts`
- Modify: `tests/evals/section-order.test.ts`
- Modify: `tests/evals/fact-extraction.test.ts`
- Modify: `tests/evals/section-headers-l10n.test.ts`

> **IMPORTANT:** The change is gated by `resolvedTemplate === "monolith"` (NOT raw `layoutTemplate`). `resolvedTemplate = layoutTemplate ?? "monolith"` already exists. Non-monolith layouts continue to generate `at-a-glance` in the extended branch — no global regression.

### Step 1: Verify existing signature (no change needed)

`composeOptimisticPage` **already has** `layoutTemplate?: LayoutTemplateId` as its 4th parameter, and `const resolvedTemplate = layoutTemplate ?? "monolith"` already exists inside the function. **Do NOT add the parameter again — it would break the build.**

Confirm:
```bash
grep -n "composeOptimisticPage\|resolvedTemplate\|layoutTemplate" src/lib/services/page-composer.ts | head -20
```

You should see the existing signature. The only changes needed are:
1. Move `const resolvedTemplate = layoutTemplate ?? "monolith"` to BEFORE the `if (extended)` check — it may currently appear later (near slot assignment). Check its exact position in the grep output. If it's after `if (extended)`, you must move it up.
2. Gate the at-a-glance vs skills/interests/languages switch on `resolvedTemplate` in the extended branch.

The move ensures `resolvedTemplate` is in scope when the extended branch runs:

```typescript
// MOVE to immediately after params are declared, BEFORE `if (extended)`:
const resolvedTemplate = layoutTemplate ?? "monolith";

// ... then later in the extended branch:
if (extended) {
  // ... buildExperienceSection, etc. ...
  if (resolvedTemplate === "monolith") { ... } else { ... }
}
```

If `resolvedTemplate` is already declared before `if (extended)`, no move is needed.

### Step 2: Write failing tests

In `tests/evals/composer-sort-order.test.ts`, add tests that currently fail (because the gating logic does not exist yet in the extended branch):

```typescript
it("monolith layout generates skills section (not at-a-glance)", () => {
  const facts: FactRow[] = [
    makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
    makeFact({ category: "skill", key: "react", value: { name: "React" }, sortOrder: 0 }),
  ];
  const page = composeOptimisticPage(facts, "test", "en", "monolith");
  expect(page.sections.find(s => s.type === "at-a-glance")).toBeUndefined();
  expect(page.sections.find(s => s.type === "skills")).toBeDefined();
});

it("non-monolith layouts keep at-a-glance", () => {
  const facts: FactRow[] = [
    makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
    makeFact({ category: "skill", key: "react", value: { name: "React" }, sortOrder: 0 }),
  ];
  // Use canonical LayoutTemplateId — "curator" is the canonical ID for sidebar-based layouts
  const page = composeOptimisticPage(facts, "test", "en", "curator");
  expect(page.sections.find(s => s.type === "at-a-glance")).toBeDefined();
});
```

```bash
npx vitest run tests/evals/composer-sort-order.test.ts --reporter=verbose
```
Expected: new tests FAIL.

### Step 3: Update page-composer.ts extended branch

In the `extended` branch of `composeOptimisticPage`, gate the replacement using **`resolvedTemplate`** (NOT raw `layoutTemplate`). Using `resolvedTemplate` ensures callers that omit `layoutTemplate` still get monolith behavior by default:

```typescript
// resolvedTemplate = layoutTemplate ?? "monolith" — already computed earlier in the function
if (resolvedTemplate === "monolith") {
  // Monolith layout: standalone sections for better readability
  const skills = buildSkillsSection(grouped.get("skill") ?? [], language);
  if (skills) sections.push(skills);

  const interests = buildInterestsSection(interestFacts, language);
  if (interests) sections.push(interests);

  const langs = buildLanguagesSection(grouped.get("language") ?? [], language);
  if (langs) sections.push(langs);
} else {
  // Other layouts: keep existing at-a-glance summary card
  const atAGlance = buildAtAGlanceSection(
    grouped.get("skill") ?? [],
    grouped.get("stat") ?? [],
    interestFacts,
    language,
  );
  if (atAGlance) sections.push(atAGlance);
}
```

`buildLanguagesSection` **already exists** at approximately line 1113 of `page-composer.ts`. Confirm with:
```bash
grep -n "buildLanguagesSection" src/lib/services/page-composer.ts
```

If it exists, just call it (the code above already does this). If for some reason it does not exist, create it using `getL10n` (NOT `getUiL10n` — use the same composer L10N system):

```typescript
function buildLanguagesSection(languageFacts: FactRow[], language: string): Section | null {
  if (languageFacts.length === 0) return null;
  const items = sortFacts(languageFacts).map(f => {
    const v = val(f);
    const lang = str(v.language) ?? str(v.name);
    if (!lang) return null;
    const item: { language: string; proficiency?: string } = { language: lang };
    const prof = str(v.proficiency) ?? str(v.level);
    if (prof) item.proficiency = prof;
    return item;
  }).filter((i): i is NonNullable<typeof i> => i !== null);
  if (items.length === 0) return null;

  // Use getL10n (same as other section builders) — add languagesLabel if missing
  const l10n = getL10n(language);
  return {
    id: "languages-1",
    type: "languages",
    content: {
      items,
      title: (l10n as Record<string, string>).languagesLabel ?? "Languages",
    } as unknown as Record<string, unknown>,
  };
}
```

If `getL10n` doesn't have `languagesLabel`, add it to the `getL10n` function/object (NOT to `ui-strings.ts`) for all 8 languages.

### Step 3b: Audit non-test call sites of composeOptimisticPage

Find all production call sites:
```bash
grep -rn "composeOptimisticPage" src/ --include="*.ts" --include="*.tsx"
```

For each call site that does NOT pass `layoutTemplate`, verify what layout the page actually uses. If a call site recomposes an existing draft that has a `layout` field (e.g., `"curator"` or `"architect"`), it should pass that layout to preserve at-a-glance behavior:

```typescript
// Example fix — adapt to actual code at the call site:
const layout = draft?.layout ?? page?.layout ?? "monolith";
const composed = composeOptimisticPage(facts, userId, language, layout as LayoutTemplateId);
```

If a call site is for the initial/default composition where monolith is correct, no change needed (the default `layoutTemplate ?? "monolith"` handles it).

### Step 4: Find ALL affected test files with grep sweep

Before editing, discover every test that asserts `at-a-glance`, `languages`, or `contact` in extended-mode context (all three can be affected by the monolith/non-monolith branching):

```bash
grep -rn "at-a-glance\|\"languages\"\|\"contact\"" tests/evals/ --include="*.test.ts"
```

Every file that appears **must** be updated. Known affected files (verify and add any others found):

**`tests/evals/composer-sort-order.test.ts`:**
- Fix existing skills/at-a-glance assertions to use `composeOptimisticPage(..., "monolith")`
- Keep the new tests from Step 2

**`tests/evals/at-a-glance-composer.test.ts`:**
- Read the file first. If tests call `composeOptimisticPage` without a layout, add `"curator"` as layoutTemplate (canonical non-monolith ID, preserving at-a-glance behavior) so existing tests still pass
- Add a new test: `composeOptimisticPage(facts, userId, lang, "monolith")` should NOT produce `at-a-glance`

**`tests/evals/section-order.test.ts`:**
- Find at-a-glance assertions around line 41. If they call without layoutTemplate, add `"curator"` (non-monolith canonical ID) to preserve existing behavior.

**`tests/evals/fact-extraction.test.ts`:**
- Find at-a-glance assertion around line 307. Same fix: pass `"curator"` as non-monolith layout.

**`tests/evals/section-headers-l10n.test.ts`:**
- Find at-a-glance label assertion around line 42. Same fix: pass `"curator"` as non-monolith layout.

**`tests/evals/uat-round5.test.ts`:**
- Known to have at-a-glance assertions (~line 147). Read the file. For each `composeOptimisticPage` call that validates at-a-glance behavior, add `"curator"` to preserve non-monolith semantics. For any call that should test monolith, use `"monolith"` and update the at-a-glance assertion accordingly.

**IMPORTANT:** Never use `"sidebar-left"` — it is a layout alias, not a canonical `LayoutTemplateId`. The canonical non-monolith IDs are: `"cinematic"`, `"curator"`, `"architect"`. Use `"curator"` for sidebar-style tests.

### Step 5: Run tests

```bash
npx vitest run tests/evals/ --reporter=verbose
```

(Run without pipe to get correct exit code.) Expected: all pass.

### Step 6: Commit

```bash
# Stage all modified test files found in Step 4, plus the composer
git add src/lib/services/page-composer.ts
git add $(grep -rl "at-a-glance\|\"languages\"\|\"contact\"" tests/evals/ --include="*.test.ts")
git commit -m "feat(composer): add monolith-specific skills+interests+languages sections (gated by layout)"
```

---

## Task 14: Section suppression + padding + StickyNav fix

**Files:**
- Modify: `src/components/page/PageRenderer.tsx`
- Modify: `src/components/layout-templates/MonolithLayout.tsx`
- Modify: `tests/evals/monolith-layout.test.ts`

### Step 1: Filter hidden sections in PageRenderer.tsx

Read `PageRenderer.tsx` first. In the section computation (around line 25), after `filterCompleteSections`:

```tsx
const MONOLITH_HIDDEN = new Set(["social", "contact", "at-a-glance"]);
const displaySections = template.id === "monolith"
  ? sections.filter(s => !MONOLITH_HIDDEN.has(s.type))
  : sections;
const slots = groupSectionsBySlot(displaySections, template);
```

Also update StickyNav to receive `displaySections` (not raw `sections`):

```tsx
{!previewMode && shouldShowStickyNav(displaySections) && (
  <StickyNav
    sections={displaySections}
    name={...}
    avatarUrl={...}
  />
)}
```

This ensures StickyNav and layout both see the filtered list. Legacy `at-a-glance`/`social`/`contact` sections won't create dead nav anchors.

### Step 2: Update MonolithLayout.tsx — uniform section padding

Keep `MONOLITH_VARIANT_OVERRIDES` + `applyMonolithOverride` from Task 6.

Update section wrapper to use padding instead of margin spacing:

```tsx
<div
  key={section.id}
  className={laneClass}
  style={{
    paddingTop: section.type === "hero" ? undefined : "48px",
    paddingBottom: section.type === "hero" ? undefined : "48px",
    borderBottom: section.type !== "footer" ? "1px solid var(--page-border)" : undefined,
  }}
>
  {renderSection(applyMonolithOverride(section))}
</div>
```

Remove `spacingClass` (the Tailwind margin class) from `className` since padding replaces it. Also remove `getSpacingClass` call. `getLane` remains unchanged.

### Step 3: Update monolith layout tests

In `tests/evals/monolith-layout.test.ts`:
- `getSpacingClass` tests: if the function is removed, delete those tests. If still exported (for backwards compat), keep them and update expected values.
- `getLane` tests remain valid — verify skills section lane is still correct.
- Run tests first to see what breaks, then fix:

```bash
npx vitest run tests/evals/monolith-layout.test.ts --reporter=verbose
```

### Step 4: Run all tests + commit

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -40
git add src/components/page/PageRenderer.tsx \
        src/components/layout-templates/MonolithLayout.tsx \
        tests/evals/monolith-layout.test.ts
git commit -m "feat(layout): filter legacy sections in PageRenderer + uniform 48px section padding"
```

---

## Task 15: Hero content — ensure location/availability/yearsExp fields are populated

**Files:**
- Modify: `src/lib/page-config/content-types.ts` (add new fields to HeroContent)
- Modify: `src/lib/services/page-composer.ts` (populate fields in buildHeroSection)

### Step 1: Investigate

```bash
grep -n "location\|availability\|yearsExp\|statusTag\|contactEmail" \
  src/lib/page-config/content-types.ts \
  src/lib/services/page-composer.ts | head -40
```

### Step 2: If `location`/`availability`/`yearsExp` missing from HeroContent type

Add to `HeroContent` in `src/lib/page-config/content-types.ts`:
```typescript
location?: string;
availability?: string;
yearsExp?: number;
```

### Step 3: Populate in buildHeroSection

In `buildHeroSection` in `page-composer.ts`:

```typescript
// Location
const locationFact = identityFacts.find(f => str(val(f).location) || str(val(f).city));
if (locationFact) {
  const loc = str(val(locationFact).location) ?? str(val(locationFact).city);
  if (loc) content.location = loc;
}

// Availability
const availFact = identityFacts.find(f => str(val(f).availability) || str(val(f).openTo));
if (availFact) {
  const avail = str(val(availFact).availability) ?? str(val(availFact).openTo);
  if (avail) content.availability = avail;
}

// Years of experience — computed from oldest experience fact start year.
// `experienceFacts` comes from grouped.get("experience") — already filtered to experience category.
// Validate: year must be in reasonable range [1950, currentYear]
const currentYear = new Date().getFullYear();

function extractStartYear(f: FactRow): number | null {
  const v = val(f);
  // Check all common date keys used by agent:
  const raw = str(v.startYear) ?? str(v.startDate) ?? str(v.start);
  if (raw) {
    const n = parseInt(raw.slice(0, 4));
    if (!isNaN(n) && n >= 1950 && n <= currentYear) return n;
  }
  // Fallback: period field (e.g. "2015-2020" or "2015-present")
  const period = str(v.period) ?? str(v.date);
  if (period) {
    const n = parseInt(period.slice(0, 4));
    if (!isNaN(n) && n >= 1950 && n <= currentYear) return n;
  }
  return null;
}

const expDates = (experienceFacts ?? [])
  .map(extractStartYear)
  .filter((n): n is number => n !== null);
if (expDates.length > 0) {
  const yearsExp = currentYear - Math.min(...expDates);
  content.yearsExp = Math.max(0, yearsExp);  // clamp to non-negative
}
```

Note: `experienceFacts` may not be in scope inside `buildHeroSection`. If it's not a parameter, pass it from the caller (`composeOptimisticPage`). Check the current signature and adapt.

`extractStartYear` is a local helper function — define it before `buildHeroSection` or inline it inside the function if preferred.

### Step 4: Run tests + visual check

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -40
```

Open a seeded profile in the browser and verify chip pills appear under the hero name.

### Step 5: Commit

```bash
git add src/lib/page-config/content-types.ts src/lib/services/page-composer.ts
git commit -m "feat(composer): populate location, availability, yearsExp in hero content"
```

---

## Task 16: Final visual verification

### Step 1: Open dev server (already running via `npm run dev:watch`)

### Step 2: Visual checklist

Open `http://localhost:3000/prototype.html` and `http://localhost:3000/ava-stone` side by side.

Check each item against `docs/plans/monolith-layout-fixes.md`:
- [ ] Hero: avatar 80px left-aligned, name large, chip pills (location/availability/exp/languages), contact row (email + social icons)
- [ ] Experience: dot bullet, Role—Company on one line, 2 visible, ▾ N more roles accordion
- [ ] Education: same style
- [ ] Projects: responsive 2-col grid, 4 visible, accordion
- [ ] Skills: flat pills, first 2 accent color
- [ ] Reading: vertical list, 3 visible, accordion
- [ ] Music: same as Reading
- [ ] Activities: pills, 6 visible, accordion
- [ ] Interests: same as Activities
- [ ] Languages: pill pairs with proficiency
- [ ] Achievements: dot bullet, 3 visible
- [ ] No at-a-glance, social, contact standalone sections
- [ ] Section labels with accent bar (section-label CSS)
- [ ] Border-bottom between sections
- [ ] Footer: lowercase "openself.dev"

### Step 3: Fix remaining visual issues

For each issue, targeted edit + commit.

### Step 4: Final test run

```bash
npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -40
```
Expected: all pass.

---

## Summary of v7 changes from v6

| Issue (v6) | Severity | Fix in v7 |
|---|---|---|
| `canonicalProficiency` can be translated by pipeline → chips disappear post-translation | High | `isHighProficiency` now has two-path logic: use `canonicalProficiency` if present; fallback to normalizing `proficiency` via `PROFICIENCY_ALIAS`. Translation can't break chips even if it overwrites the field. |
| Old configs without `canonicalProficiency` lose language chips (backward-compat regression) | High | Filter changed from `l.canonicalProficiency && isHighProficiency(l)` to `(l.proficiency \|\| l.canonicalProficiency) && isHighProficiency(l)` — works on any config with or without the new field. |
| Task 13 Step 4 grep too narrow — misses `languages`/`contact` assertions | High | Expanded grep to `"at-a-glance\|\"languages\"\|\"contact\""` in both Step 4 and the Step 6 `git add` command. |
| Tasks 2–5 reference `MONOLITH_VARIANT_OVERRIDES` before it is created in Task 6 | Medium | Removed all "Add to `MONOLITH_VARIANT_OVERRIDES`" instructions from Tasks 2–5. Replaced with a note pointing to Task 6 Step 3 where the complete map is established. |

## Summary of v6 changes from v5

| Issue (v5) | Severity | Fix in v6 |
|---|---|---|
| Tasks 2–5, 8–11 replace default variant, regressing curator/architect/cinematic layouts | High | All redesigns are now isolated in `variant === "monolith"` branches. `MONOLITH_VARIANT_OVERRIDES` maps all 11 section types. Default rendering preserved for non-monolith layouts. |
| Task 13 `resolvedTemplate` may be declared after `if (extended)` (out of scope) | High | Added explicit instruction to move `resolvedTemplate` declaration before `if (extended)` check. |
| No call-site audit for `composeOptimisticPage` non-test callers | Medium | Added Step 3b: grep all src/ call sites, pass `draft?.layout` where available. |
| `ProjectItem` type lacks `tags?` — TypeScript error in `projects-grid` | Medium | Added explicit Step 4 in Task 6: extend `ProjectItem` type to include `tags?: string[]` while preserving existing fields. |

## Summary of v5 changes from v4

| Issue (v4) | Severity | Fix in v5 |
|---|---|---|
| Task 13 gates on raw `layoutTemplate` instead of `resolvedTemplate` | High | Changed to `resolvedTemplate === "monolith"` — handles the default (no-arg) monolith case. |
| Task 13 Step 4 missing `uat-round5.test.ts` (has at-a-glance assertions) | High | Added mandatory grep sweep (`grep -rn "at-a-glance" tests/evals/`) + explicit `uat-round5.test.ts` update. Fixed `vitest run` without pipe. |
| `canonicalProficiency` not normalized — misses localized raw aliases | Medium | Added `normalizeCanonicalProficiency()` with alias map (`madrelingua→native`, `fließend→fluent`, etc.). `HIGH_PROFICIENCY_CANONICAL` simplified to 5 normalized tokens. |
| `yearsExp` misses `period`/`date` keys; no filter note | Medium | Added `extractStartYear()` helper with `period`/`date` fallback. Noted that `experienceFacts` from `grouped.get("experience")` is already category-filtered. |

## Summary of v4 changes from v3

| Issue (v3) | Severity | Fix in v4 |
|---|---|---|
| Tests use invalid alias `"sidebar-left"` (not `LayoutTemplateId`) | High | Changed to canonical `"curator"` throughout tests. |
| Task 13 Step 1 adds parameter that already exists (breaks build) | High | Removed Step 1. `layoutTemplate?: LayoutTemplateId` already exists. Verified `resolvedTemplate = layoutTemplate ?? "monolith"` already present. |
| Content drop if `layoutTemplate` not passed (gate flaw) | High | Confirmed false positive: `resolvedTemplate` already defaults to `"monolith"`. No fix needed. |
| Projects grid can show 3+ columns with `auto-fill minmax` | Medium | Changed to Tailwind `grid-cols-1 sm:grid-cols-2` — explicitly 2 cols at ≥640px breakpoint. |
| Hero language proficiency filter locale-fragile | Medium | Added `canonicalProficiency` + `normalizeCanonicalProficiency()` to hero language items. Hero.tsx filters on normalized canonical tokens only. |
| `yearsExp` misses `start` date key | Medium | Added `str(val(f).start)` fallback alongside `startYear`/`startDate`. |
| Achievements renders nonexistent `year`/`context` fields | Medium | Fixed to use actual fields: `item.date` and `item.issuer`. |

## Summary of v3 changes from v2

| Issue (v2) | Severity | Fix in v3 |
|---|---|---|
| Global at-a-glance removal affects all layouts | High | Gated by `layoutTemplate === "monolith"`. Non-monolith keeps at-a-glance. `layoutTemplate` param already existed in `composeOptimisticPage`. |
| Wrong L10N source for buildLanguagesSection | Medium | Use `getL10n` (composer L10N), not `getUiL10n` (UI strings). `buildLanguagesSection` already exists in composer. |
| Task 1 test always passes (arithmetic) | Medium | Export `splitItems` utility from CollapsibleList; test fails before implementation. |
| Language chip includes languages with no proficiency | Medium | `filter(l => (l.proficiency \|\| l.canonicalProficiency) && isHighProficiency(l))` — require some proficiency field; `isHighProficiency` normalizes both. |
| `yearsExp` computation unsafe | Medium | Validate year range `[1950, currentYear]`, clamp to `Math.max(0, ...)`. |
| Projects grid not mobile-safe | Medium | Tailwind `grid-cols-1 sm:grid-cols-2` — explicit 2-col at ≥640px. |

## Test file summary

| File | Status |
|---|---|
| `tests/evals/collapsible-list.test.ts` | NEW — created in Task 1 |
| `tests/evals/composer-sort-order.test.ts` | UPDATED — monolith layout + at-a-glance for non-monolith |
| `tests/evals/at-a-glance-composer.test.ts` | UPDATED — add layoutTemplate to existing calls, add monolith assertion |
| `tests/evals/section-order.test.ts` | UPDATED — add non-monolith layoutTemplate to existing calls |
| `tests/evals/fact-extraction.test.ts` | UPDATED — same |
| `tests/evals/section-headers-l10n.test.ts` | UPDATED — same |
| `tests/evals/uat-round5.test.ts` | UPDATED — at-a-glance assertions updated to pass "curator" for non-monolith tests |
| `tests/evals/monolith-layout.test.ts` | UPDATED — spacing assertions |
| *Any other files found by `grep -rn "at-a-glance" tests/evals/`* | UPDATED — per grep sweep in Task 13 Step 4 |

## Files to modify

| File | Task |
|---|---|
| `src/components/page/CollapsibleList.tsx` | 1 |
| `src/themes/editorial-360/components/Experience.tsx` | 1, 2 |
| `src/themes/editorial-360/components/Education.tsx` | 1, 3 |
| `src/themes/editorial-360/components/Achievements.tsx` | 1, 4 |
| `src/themes/editorial-360/components/Timeline.tsx` | 5 |
| `src/themes/editorial-360/components/Projects.tsx` | 1, 6 |
| `src/themes/editorial-360/components/Skills.tsx` | 7 |
| `src/themes/editorial-360/components/Reading.tsx` | 1, 8 |
| `src/themes/editorial-360/components/Music.tsx` | 9 |
| `src/themes/editorial-360/components/Activities.tsx` | 10 |
| `src/themes/editorial-360/components/Interests.tsx` | 10 |
| `src/themes/editorial-360/components/Languages.tsx` | 11 |
| `src/themes/editorial-360/components/Hero.tsx` | 12 |
| `src/lib/services/page-composer.ts` | 13, 15 |
| `src/lib/page-config/content-types.ts` | 15 |
| `src/components/page/PageRenderer.tsx` | 14 |
| `src/components/layout-templates/MonolithLayout.tsx` | 6, 14 |
| `tests/evals/collapsible-list.test.ts` | 1 (new) |
| `tests/evals/composer-sort-order.test.ts` | 13 |
| `tests/evals/at-a-glance-composer.test.ts` | 13 |
| `tests/evals/section-order.test.ts` | 13 |
| `tests/evals/fact-extraction.test.ts` | 13 |
| `tests/evals/section-headers-l10n.test.ts` | 13 |
| `tests/evals/uat-round5.test.ts` | 13 |
| `tests/evals/monolith-layout.test.ts` | 14 |
