# Vertical Template "Magazine Digitale" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the vertical layout template from a document-style resume into a luxury digital magazine experience with Stripe/Linear aesthetics.

**Architecture:** All visual changes are CSS-first, applied to the shared editorial-360 theme components in `src/themes/editorial-360/components/`. All three themes (minimal, warm, editorial-360) share the same component registry — visual differentiation comes from CSS custom properties only. The VerticalLayout component gets variable spacing logic. A new `.section-label` CSS class replaces 17 inline section headers.

**Tech Stack:** Tailwind CSS, CSS custom properties, React (existing components), IntersectionObserver (existing in EditorialLayout)

**Design doc:** `docs/plans/2026-02-27-vertical-template-magazine-redesign.md`

---

### Task 1: CSS Foundation — New tokens and section-label class

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add `--text-6xl` to typography scale**

In `src/app/globals.css`, after line 164 (`--text-5xl: 3rem;`), add:

```css
  --text-6xl: 3.75rem;  /* 60px */
```

**Step 2: Add new design tokens after line 169 (after `--page-wide-max-width`)**

```css

  /* ─── Magazine Redesign Tokens ─── */

  /* Animations */
  --reveal-distance: 12px;
  --reveal-duration: 600ms;
  --reveal-easing: cubic-bezier(0.16, 1, 0.3, 1);
```

**Step 3: Add `.section-label` class and animation utilities**

At the end of `globals.css`, add:

```css
/* ─── Section Label (OpenSelf signature) ─── */

.section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-weight: 600;
  color: var(--page-fg-secondary);
  margin-bottom: 2rem; /* 32px */
  display: flex;
  align-items: center;
  gap: 0.75rem; /* 12px */
  border: none;
  padding-bottom: 0;
}

.section-label::before {
  content: '';
  width: 3px;
  height: 16px;
  background: var(--page-accent);
  border-radius: 1px;
  flex-shrink: 0;
}

/* ─── Middle Dot Separator ─── */

.entry-dot-separator {
  display: flex;
  justify-content: center;
  padding: 2rem 0; /* my-8 */
}

.entry-dot-separator::after {
  content: '\00B7';
  font-size: 1.125rem; /* text-lg */
  color: var(--page-fg-secondary);
  opacity: 0.3;
}

/* ─── Scroll Reveal (updated timing) ─── */

.theme-reveal {
  opacity: 0;
  transform: translateY(var(--reveal-distance, 12px));
  transition:
    opacity var(--reveal-duration, 600ms) var(--reveal-easing, cubic-bezier(0.16, 1, 0.3, 1)),
    transform var(--reveal-duration, 600ms) var(--reveal-easing, cubic-bezier(0.16, 1, 0.3, 1));
}

.theme-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* ─── Hero Stagger Animation ─── */

@keyframes hero-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes hero-fade-in-simple {
  from { opacity: 0; }
  to { opacity: 1; }
}

.hero-stagger-name {
  opacity: 0;
  animation: hero-fade-in 600ms var(--reveal-easing) 100ms forwards;
}

.hero-stagger-tagline {
  opacity: 0;
  animation: hero-fade-in 600ms var(--reveal-easing) 250ms forwards;
}

.hero-stagger-social {
  opacity: 0;
  animation: hero-fade-in-simple 400ms var(--reveal-easing) 450ms forwards;
}

/* ─── Hover Underline (left-to-right grow) ─── */

.hover-underline-grow {
  position: relative;
  text-decoration: none;
}

.hover-underline-grow::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 1.5px;
  background: var(--page-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 300ms var(--reveal-easing);
}

.hover-underline-grow:hover::after {
  transform: scaleX(1);
}

/* ─── Reduced Motion ─── */

@media (prefers-reduced-motion: reduce) {
  .theme-reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .hero-stagger-name,
  .hero-stagger-tagline,
  .hero-stagger-social {
    opacity: 1;
    animation: none;
  }

  .hover-underline-grow::after {
    transition: none;
  }
}
```

**Step 4: Run existing tests to verify CSS changes don't break anything**

Run: `npx vitest run tests/evals/theme-tokens.test.ts`
Expected: PASS (new tokens don't conflict with existing required tokens)

**Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add magazine redesign CSS foundation — tokens, section-label, animations"
```

---

### Task 2: Hero Section Redesign

**Files:**
- Modify: `src/themes/editorial-360/components/Hero.tsx`

**Context:** The hero-split variant (default, lines 74-129) is the one used in vertical layouts. It currently renders a two-column layout with uppercase bold name, tagline right-aligned, and social links as individual uppercase text links. We're redesigning it for the magazine aesthetic.

**Step 1: Rewrite the hero-split default variant**

Replace the entire default return block (lines 73-129) with:

```tsx
    // Default: hero-split — Magazine editorial
    return (
        <header className="py-24 theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.1s' }}>
            <div className="border-b border-[var(--page-border)] pb-10">
                <div className="md:grid md:grid-cols-2 md:gap-8 md:items-end">
                    <div className="min-w-0">
                        <h1
                            className="hero-stagger-name font-[var(--page-font-heading)] font-medium tracking-[-0.03em] leading-[0.95]"
                            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)" }}
                        >
                            {name}
                        </h1>
                    </div>
                    {tagline && (
                        <div className="mt-4 md:mt-0 md:text-right">
                            <p className="hero-stagger-tagline text-[var(--text-xl)] font-light text-[var(--page-fg-secondary)] leading-relaxed max-w-md md:ml-auto">
                                {tagline}
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {/* Contact bar */}
            {(content.socialLinks?.length || content.contactEmail || content.languages?.length) && (
                <div className="hero-stagger-social mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
                    {content.socialLinks && content.socialLinks.length > 0 && (
                        <>
                            {content.socialLinks.map((link, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <span className="text-[var(--page-fg-secondary)] opacity-20 select-none">&middot;</span>}
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover-underline-grow text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors uppercase tracking-[0.05em] text-xs font-medium"
                                    >
                                        {link.platform}
                                    </a>
                                </React.Fragment>
                            ))}
                        </>
                    )}
                    {content.contactEmail && (
                        <>
                            {content.socialLinks?.length ? <span className="text-[var(--page-fg-secondary)] opacity-20 select-none">&middot;</span> : null}
                            <span className="text-[var(--page-fg-secondary)] text-xs tracking-wide">
                                {content.contactEmail}
                            </span>
                        </>
                    )}
                    {content.languages && content.languages.length > 0 && (
                        <>
                            <span className="text-[var(--page-fg-secondary)] opacity-20 select-none">&middot;</span>
                            <span className="text-[var(--page-fg-secondary)] text-xs tracking-wide">
                                {content.languages
                                    .map((l) => `${l.language}${l.proficiency ? ` (${l.proficiency})` : ""}`)
                                    .join(" · ")}
                            </span>
                        </>
                    )}
                </div>
            )}
        </header>
    );
```

**Step 2: Run tests**

Run: `npx vitest run tests/evals/hero-contactbar.test.ts`
Expected: PASS (test validates composer output, not rendering classes)

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Hero.tsx
git commit -m "style: redesign hero-split variant — magazine typography, stagger animation, dot separators"
```

---

### Task 3: Section Headers — Apply `.section-label` to all 17 components

**Files (all in `src/themes/editorial-360/components/`):**
- `Stats.tsx` (line 22)
- `Experience.tsx` (line 37)
- `Education.tsx` (line 30)
- `Bio.tsx` (lines 21, 36)
- `Skills.tsx` (lines 24, 54)
- `Projects.tsx` (lines 31, 81, 113)
- `Interests.tsx` (line 21)
- `Achievements.tsx` (line 29)
- `Reading.tsx`
- `Music.tsx`
- `Languages.tsx`
- `Activities.tsx`
- `Contact.tsx`
- `Custom.tsx`
- `Timeline.tsx`
- `AtAGlance.tsx`

**Step 1: Pattern to find and replace in every file**

Find ALL instances of this pattern (with minor variations):
```tsx
<h2 className="text-xs uppercase tracking-widest text-[var(--page-footer-fg)] font-medium mb-12 border-b border-[var(--page-border)] pb-4">
```

Or this pattern:
```tsx
<h2 className="text-[10px] uppercase tracking-[0.3em] text-[var(--page-footer-fg)] font-semibold mb-8 border-b border-[var(--page-border)] pb-4">
```

Or similar variants. Replace with:
```tsx
<h2 className="section-label">
```

**Important exceptions:**
- `Projects.tsx` line 31 (bento variant) has a different h2 with flex layout + line — replace with `section-label` too
- `Projects.tsx` line 113 (list variant) has a flex h2 with item count — replace with simple `section-label`, drop the count span
- `Bio.tsx` line 20-22 (elegant variant) has a custom h2 with line — replace with `section-label`

**Step 2: Apply changes to each file**

For each file, open it, find the `<h2` section header, and replace its className with `"section-label"`. Remove any `border-b`, `border-[var(--page-border)]`, `pb-4`, `mb-12` classes — these are now handled by the CSS class.

Do this for all 17 files listed above, one by one.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All 822+ tests PASS

**Step 4: Commit**

```bash
git add src/themes/editorial-360/components/
git commit -m "style: replace 17 section headers with unified .section-label (accent bar + no border)"
```

---

### Task 4: Variable Vertical Rhythm in VerticalLayout

**Files:**
- Modify: `src/components/layout-templates/VerticalLayout.tsx`
- Modify: `src/components/page/PageRenderer.tsx`

**Context:** VerticalLayout (22 lines) uses static `gap-8 md:gap-12`. We need variable gaps based on section type. The challenge: `renderSection` receives a `Section` object but VerticalLayout only sees sections grouped by slot — it doesn't directly access section types. We need to pass section metadata through.

**Step 1: Modify PageRenderer to pass section type as data attribute**

In `src/components/page/PageRenderer.tsx`, the `renderSection` function (line 52-58) already wraps each section in `<div data-section={section.type}>`. This is sufficient — VerticalLayout can read `data-section` from children.

However, the VerticalLayout currently calls `sections.map(renderSection)` opaquely. We need a different approach: change VerticalLayout to accept and render sections with type-aware spacing.

**Step 2: Rewrite VerticalLayout with variable spacing**

Replace the entire `src/components/layout-templates/VerticalLayout.tsx` with:

```tsx
import React from "react";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { LayoutComponentProps } from "./types";

/** Section types that get compact (32px) gap after them */
const DENSE_SECTIONS = new Set([
  "stats", "skills", "interests", "languages", "activities", "social",
]);

/** Section types that get medium (48px) gap after them */
const NARRATIVE_SECTIONS = new Set([
  "bio", "experience", "education", "projects", "achievements",
  "reading", "music", "contact", "custom", "timeline",
]);

function getSpacingClass(sectionType: string, isLastBeforeFooter: boolean): string {
  if (sectionType === "hero") return "mb-20"; // 80px after hero
  if (isLastBeforeFooter) return "mb-20";     // 80px before footer
  if (DENSE_SECTIONS.has(sectionType)) return "mb-8";  // 32px
  if (NARRATIVE_SECTIONS.has(sectionType)) return "mb-12"; // 48px
  return "mb-12"; // default
}

export function VerticalLayout({ slots, renderSection, className }: LayoutComponentProps) {
  const template = getLayoutTemplate("vertical");
  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order);

  // Flatten all sections in slot order to detect last-before-footer
  const allSections: { section: any; slotId: string }[] = [];
  for (const slot of sortedSlots) {
    const sections = slots[slot.id];
    if (!sections?.length) continue;
    for (const section of sections) {
      allSections.push({ section, slotId: slot.id });
    }
  }

  // Find the last non-footer section index
  const lastNonFooterIdx = allSections.findLastIndex(
    (s) => s.section.type !== "footer"
  );

  let globalIdx = 0;

  return (
    <div className={`layout-vertical max-w-5xl mx-auto flex flex-col ${className ?? ""}`}>
      {sortedSlots.map((slot) => {
        const sections = slots[slot.id];
        if (!sections?.length) return null;
        return (
          <div key={slot.id} className="slot-wide">
            {sections.map((section) => {
              const currentIdx = globalIdx++;
              const isLastBeforeFooter = currentIdx === lastNonFooterIdx;
              const spacingClass = section.type === "footer"
                ? ""
                : getSpacingClass(section.type, isLastBeforeFooter);

              return (
                <div key={section.id} className={spacingClass}>
                  {renderSection(section)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3: Verify VerticalLayout still gets section objects with `.type`**

Check that `renderSection` receives `Section` objects (it does — PageRenderer.tsx line 36 passes `Section` to `renderSection`, and VerticalLayout calls `sections.map(renderSection)` where sections are `Section[]`). The key insight: VerticalLayout iterates sections BEFORE passing them to renderSection, so it can access `section.type`.

**Step 4: Run tests**

Run: `npx vitest run tests/evals/layout-registry.test.ts tests/evals/layout-quality.test.ts tests/evals/section-order.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/layout-templates/VerticalLayout.tsx
git commit -m "style: add variable vertical rhythm to VerticalLayout (hero/narrative/dense spacing)"
```

---

### Task 5: Stats Section Redesign

**Files:**
- Modify: `src/themes/editorial-360/components/Stats.tsx`

**Step 1: Rewrite the Stats component**

Replace the entire render body (lines 20-47) with:

```tsx
    return (
        <section className="theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <h2 className="section-label">
                {title || "At a Glance"}
            </h2>

            <div className="flex flex-wrap justify-between max-w-xl mx-auto md:mx-0 gap-8">
                {items.map((item, index) => (
                    <div
                        key={index}
                        className="text-center group"
                    >
                        <div className="text-5xl font-light tracking-[-0.02em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors duration-200 font-[var(--page-font-heading)]">
                            {item.value}
                            {item.unit && (
                                <span className="text-lg font-light text-[var(--page-fg-secondary)] ml-1">
                                    {item.unit}
                                </span>
                            )}
                        </div>
                        <div className="text-xs tracking-[0.1em] text-[var(--page-fg-secondary)] mt-2">
                            {item.label.toLowerCase()}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
```

**Key changes:**
- Grid → flex with justify-between, max-w-xl
- Numbers: font-light (300), text-5xl, negative tracking
- Labels: lowercase (not uppercase), wider tracking
- Removed: card borders, padding, rounded corners
- Added: hover color transition on numbers (→ accent)
- Section margin (`mb-12`) now handled by VerticalLayout

**Step 2: Run tests**

Run: `npx vitest run tests/evals/section-completeness-aag.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/Stats.tsx
git commit -m "style: redesign stats — large light numbers, no borders, hover accent"
```

---

### Task 6: Skills Section Redesign

**Files:**
- Modify: `src/themes/editorial-360/components/Skills.tsx`

**Step 1: Rewrite the skills-chips variant (lines 21-48)**

Replace with text-only default and updated chips:

```tsx
    if (variant === "skills-chips") {
        return (
            <section className="theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.25s' }}>
                <h2 className="section-label">
                    {title || "Capabilities"}
                </h2>

                <div className="flex flex-col gap-8">
                    {groups.map((group, i) => (
                        <div key={i}>
                            {groups.length > 1 && (
                                <h3 className="text-xs uppercase tracking-[0.1em] font-medium text-[var(--page-fg-secondary)] mb-3">{group.label || group.name}</h3>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {(group.items || group.skills || []).map((item, j) => {
                                    const name = typeof item === 'string' ? item : item.name;
                                    return (
                                        <span key={j} className="px-3 py-1 rounded-md border border-[var(--page-border)] text-xs font-medium text-[var(--page-fg-secondary)] hover:border-[var(--page-accent)] hover:text-[var(--page-fg)] hover:-translate-y-px transition-all duration-200 cursor-default">
                                            {name}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        );
    }
```

**Step 2: Rewrite the skills-list default variant (lines 51-82)**

Replace with text-only design:

```tsx
    // Default: skills-list — text-only editorial
    return (
        <section className="theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.25s' }}>
            <h2 className="section-label">
                {title || groups[0]?.label || groups[0]?.name || "Expertise"}
            </h2>

            <div className="flex flex-col gap-8">
                {groups.map((group, i) => (
                    <div key={i}>
                        {groups.length > 1 && (
                            <h3 className="text-xs uppercase tracking-[0.1em] font-medium text-[var(--page-fg-secondary)] mb-3">{group.label || group.name}</h3>
                        )}
                        <div className="flex flex-wrap gap-x-6 gap-y-3">
                            {(group.items || group.skills || []).map((item, j) => {
                                const name = typeof item === 'string' ? item : item.name;
                                return (
                                    <span key={j} className="hover-underline-grow text-sm font-medium text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] hover:-translate-y-px transition-all duration-200 cursor-default">
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/themes/editorial-360/components/Skills.tsx
git commit -m "style: redesign skills — text-only default, rounded-md chips, hover underline"
```

---

### Task 7: Experience & Achievements — Entry-based sections

**Files:**
- Modify: `src/themes/editorial-360/components/Experience.tsx`
- Modify: `src/themes/editorial-360/components/Achievements.tsx`

**Step 1: Rewrite Experience entries (lines 41-78)**

Replace the `<div className="space-y-12">` block:

```tsx
            <div>
                <CollapsibleList
                    items={sortedItems.map((item, index) => (
                        <React.Fragment key={index}>
                            <article className="group">
                                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-1">
                                    <h3 className="text-xl font-semibold tracking-[-0.01em] text-[var(--page-fg)] group-hover:text-[var(--page-accent)] transition-colors">
                                        {item.title}
                                    </h3>
                                    <span className="text-sm text-[var(--page-fg-secondary)] mt-1 md:mt-0 shrink-0">
                                        {item.period}
                                    </span>
                                </div>
                                {item.company && (
                                    <div className="text-sm text-[var(--page-fg-secondary)] mt-1">
                                        {item.company}
                                    </div>
                                )}
                                {item.description && (
                                    <p className="text-sm text-[var(--page-fg-secondary)] leading-relaxed max-w-prose mt-2">
                                        {item.description}
                                    </p>
                                )}
                            </article>

                            {index < sortedItems.length - 1 && (
                                <div className="entry-dot-separator" />
                            )}
                        </React.Fragment>
                    ))}
                    summaryLine={summaryLine}
                />
            </div>
```

Also update the section wrapper (line 36): remove `mb-12`, keep `theme-reveal`:
```tsx
        <section className="theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
```

And update the h2 (line 37):
```tsx
            <h2 className="section-label">
                {title || "Experience"}
            </h2>
```

**Step 2: Apply same pattern to Achievements**

Same changes: `section-label` h2, entry-dot-separator between items, text-xl/semibold title, text-sm subtitle/description, remove border separators and mb-12.

**Step 3: Run tests**

Run: `npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/themes/editorial-360/components/Experience.tsx src/themes/editorial-360/components/Achievements.tsx
git commit -m "style: redesign experience & achievements — typographic hierarchy, dot separators"
```

---

### Task 8: Education Section

**Files:**
- Modify: `src/themes/editorial-360/components/Education.tsx`

**Step 1: Rewrite Education entries**

Same pattern as Experience but more compact. Replace the entry rendering:

```tsx
            <article className="group">
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
```

Also: `section-label` h2, `entry-dot-separator`, remove `mb-12` and border separators.

**Step 2: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/themes/editorial-360/components/Education.tsx
git commit -m "style: redesign education — compact entries, dot separators"
```

---

### Task 9: Bio Section Redesign

**Files:**
- Modify: `src/themes/editorial-360/components/Bio.tsx`

**Step 1: Rewrite both variants**

Replace the entire component body:

```tsx
export function Bio({ content, variant = "bio-dropcap" }: SectionProps<BioContent>) {
    const { text = "", title } = content;

    if (variant === "bio-elegant") {
        // Quote variant — typographic quotes
        return (
            <section className="theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.15s' }}>
                <h2 className="section-label">
                    {title || "About"}
                </h2>
                <div className="max-w-2xl">
                    <span className="text-4xl font-serif text-[var(--page-fg-secondary)] opacity-30 leading-none select-none" aria-hidden="true">{"\u201C"}</span>
                    <p className="text-xl font-light leading-loose text-[var(--page-fg-secondary)] -mt-4 ml-4">
                        {text}
                    </p>
                    <span className="text-4xl font-serif text-[var(--page-fg-secondary)] opacity-30 leading-none select-none block text-right -mt-2" aria-hidden="true">{"\u201D"}</span>
                </div>
            </section>
        );
    }

    // Default: bio-dropcap — clean editorial
    return (
        <section className="theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4" style={{ transitionDelay: '0.15s' }}>
            <h2 className="section-label">
                {title || "About"}
            </h2>
            <p className="text-xl font-light leading-loose text-[var(--page-fg-secondary)] max-w-2xl">
                {text}
            </p>
        </section>
    );
}
```

**Key changes:**
- Text: `text-xl`, `font-light`, `leading-loose`, `fg-secondary`
- Max-width: `max-w-2xl` (42rem)
- Quote variant: typographic quotes U+201C/U+201D in serif, opacity 30%
- Removed: corner borders, large mb-32/mb-16 (now handled by VerticalLayout)

**Step 2: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/themes/editorial-360/components/Bio.tsx
git commit -m "style: redesign bio — xl text, leading-loose, fg-secondary, quote variant"
```

---

### Task 10: Footer Redesign

**Files:**
- Modify: `src/themes/editorial-360/components/Footer.tsx`

**Step 1: Rewrite Footer component**

Replace the entire render:

```tsx
export function Footer({ content }: SectionProps<FooterContent>) {
    return (
        <footer className="text-center py-16 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">
            <div className="mx-auto mb-8" style={{ width: '64px', height: '0.5px', background: 'var(--page-fg-secondary)', opacity: 0.15 }} />
            <a
                href="https://openself.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover-underline-grow text-xs tracking-[0.15em] uppercase text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors"
            >
                openself.dev
            </a>
        </footer>
    );
}
```

**Key changes:**
- Removed: `border-t`, copyright, "Built with"
- Added: centered 64px rule (the only border in the entire page)
- Text: just "openself.dev" with hover underline

**Step 2: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/themes/editorial-360/components/Footer.tsx
git commit -m "style: redesign footer — centered rule, 'openself.dev' colophon"
```

---

### Task 11: Remaining Section Components — Interests, Projects

**Files:**
- Modify: `src/themes/editorial-360/components/Interests.tsx`
- Modify: `src/themes/editorial-360/components/Projects.tsx`

**Step 1: Redesign Interests**

Replace with text-only style (same approach as skills):

```tsx
export function Interests({ content }: SectionProps<InterestsContent>) {
    const { items = [], title } = content;

    if (!items.length) return null;

    return (
        <section className="theme-reveal transition-all duration-1000 ease-out opacity-0 translate-y-4">
            <h2 className="section-label">
                {title || "Interests"}
            </h2>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
                {items.map((item, index) => (
                    <span
                        key={index}
                        className="text-sm font-medium text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors cursor-default"
                    >
                        {item.name}
                    </span>
                ))}
            </div>
        </section>
    );
}
```

**Step 2: Update Projects section headers**

For all 3 variants in Projects.tsx, replace the h2 elements with `section-label` class. Keep the project entry structure mostly intact but:
- Replace `h-px w-full bg-[var(--page-border)]` separators with `entry-dot-separator` where applicable
- Remove `mb-16` from section wrappers

**Step 3: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/themes/editorial-360/components/Interests.tsx src/themes/editorial-360/components/Projects.tsx
git commit -m "style: redesign interests (text-only) and projects (section-label headers)"
```

---

### Task 12: Remaining Components — Reading, Music, Languages, Activities, Contact, Custom, AtAGlance, Timeline, Social

**Files (all in `src/themes/editorial-360/components/`):**
- `Reading.tsx`
- `Music.tsx`
- `Languages.tsx`
- `Activities.tsx`
- `Contact.tsx`
- `Custom.tsx`
- `AtAGlance.tsx`
- `Timeline.tsx`
- `Social.tsx`

**Step 1: Apply section-label and separator updates to each**

For each component:
1. Replace the h2 section header className with `"section-label"`
2. Replace any `border-b border-[var(--page-border)] pb-4` patterns
3. Replace `h-px w-full bg-[var(--page-border)]` entry separators with `entry-dot-separator`
4. Remove hardcoded `mb-12`/`mb-16` from section wrappers (VerticalLayout handles spacing)

These are straightforward find-and-replace operations following the same pattern as Tasks 3-11.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/themes/editorial-360/components/
git commit -m "style: apply section-label and dot separators to remaining 9 components"
```

---

### Task 13: Update EditorialLayout scroll reveal

**Files:**
- Modify: `src/themes/editorial-360/Layout.tsx`

**Step 1: Update IntersectionObserver to use new CSS classes**

Replace the observer callback (lines 10-14) to use `revealed` class instead of adding/removing individual Tailwind classes:

```tsx
    useEffect(() => {
        const reveals = document.querySelectorAll('.theme-reveal');
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.08 },
        );
        reveals.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);
```

**Step 2: Remove inline transition classes from all section components**

Since `.theme-reveal` and `.theme-reveal.revealed` are now defined in globals.css, remove the inline Tailwind transition classes from each component's section wrapper. For example, change:

```tsx
// Before:
<section className="mb-12 theme-reveal transition-all duration-700 ease-out opacity-0 translate-y-4">

// After:
<section className="theme-reveal">
```

Apply this to all 17+ section components. The CSS handles opacity, transform, and transition.

**Step 3: Run tests and commit**

Run: `npx vitest run`

```bash
git add src/themes/editorial-360/Layout.tsx src/themes/editorial-360/components/
git commit -m "style: centralize scroll reveal in CSS, remove inline transition classes"
```

---

### Task 14: Warm Theme Contrast Fix

**Files:**
- Modify: `src/app/globals.css` (warm theme section)

**Step 1: Investigate the Carla Mendes visibility issue**

The warm light theme has `--page-fg: #2c2418` on `--page-bg: #faf7f2`. The contrast ratio is ~8.5:1 (WCAG AAA) — this should be fine. The issue may be that the hero's `font-weight: bold` with `text-[var(--page-fg)]` works, but `text-[var(--page-fg-secondary)]: #8b7e6a` on `#faf7f2` has only ~3.5:1 ratio.

To fix: darken `--page-fg-secondary` for warm theme.

**Step 2: Update warm light theme fg-secondary**

In `src/app/globals.css`, line 224:
```css
/* Before: */
--page-fg-secondary: #8b7e6a;

/* After: */
--page-fg-secondary: #6b5e4a;
```

This increases contrast from ~3.5:1 to ~5.5:1 (WCAG AA compliant).

Also check `--page-footer-fg` (line 235): `#b5a998` on `#faf7f2` = ~2.3:1. Update:
```css
/* Before: */
--page-footer-fg: #b5a998;

/* After: */
--page-footer-fg: #9a8d7c;
```

**Step 3: Run tests and commit**

Run: `npx vitest run tests/evals/theme-tokens.test.ts`

```bash
git add src/app/globals.css
git commit -m "fix: improve warm theme contrast ratios for WCAG AA compliance"
```

---

### Task 15: Visual Regression Test — Screenshot all 3 vertical profiles

**Step 1: Start dev server and capture screenshots**

```bash
npm run dev
```

Navigate to each vertical profile and capture full-page screenshots:
- `http://localhost:3001/uat-lena-fischer-batch1` (vertical + minimal)
- `http://localhost:3001/uat-malik-johnson-batch1` (vertical + editorial-360)
- `http://localhost:3001/uat-carla-mendes-batch1` (vertical + warm)

Use the Playwright MCP browser tools to capture these screenshots.

**Step 2: Verify each profile visually**

Check against the design doc:
- [ ] Hero: name is large (~60px), medium weight, negative tracking
- [ ] Hero: social links have middle dot separators, text labels
- [ ] Hero: stagger animation on load
- [ ] Section labels: accent bar visible, no border-bottom
- [ ] Stats: numbers are large and light, labels lowercase
- [ ] Skills: text-only or rounded-md chips, no full-round pills
- [ ] Experience: dot separators between entries, no horizontal rules
- [ ] Bio: xl text in fg-secondary, generous leading
- [ ] Footer: centered rule + "openself.dev"
- [ ] Warm theme (Carla): all text visible
- [ ] Scroll reveal: sections fade in on scroll
- [ ] Variable spacing: hero has more breathing room, dense sections closer together

**Step 3: Fix any visual issues discovered**

Address any problems found during visual review.

**Step 4: Final commit**

```bash
git commit -m "style: complete vertical template magazine redesign"
```

---

## Summary

| Task | What | Files | Estimated changes |
|------|------|-------|-------------------|
| 1 | CSS foundation | globals.css | ~120 lines added |
| 2 | Hero redesign | Hero.tsx | ~60 lines changed |
| 3 | Section headers (all 17) | 17 component files | ~2 lines each |
| 4 | Variable vertical rhythm | VerticalLayout.tsx | ~40 lines rewrite |
| 5 | Stats redesign | Stats.tsx | ~30 lines changed |
| 6 | Skills redesign | Skills.tsx | ~60 lines changed |
| 7 | Experience & Achievements | 2 files | ~40 lines each |
| 8 | Education | Education.tsx | ~30 lines changed |
| 9 | Bio redesign | Bio.tsx | ~25 lines changed |
| 10 | Footer redesign | Footer.tsx | ~10 lines changed |
| 11 | Interests & Projects | 2 files | ~20 lines each |
| 12 | Remaining 9 components | 9 files | ~3 lines each |
| 13 | EditorialLayout reveal | Layout.tsx + 17 components | ~5 lines + cleanup |
| 14 | Warm theme contrast | globals.css | ~4 lines |
| 15 | Visual regression | Screenshots | Verification only |
