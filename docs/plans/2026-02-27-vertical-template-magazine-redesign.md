# Vertical Template "Magazine Digitale" Redesign

**Date**: 2026-02-27
**Approach**: Refined evolution — from document to luxury digital magazine
**Reference**: Stripe/Linear aesthetic (surgical cleanliness, micro-animations, sharp typographic contrasts)
**Scope**: Vertical layout template only. No structural/architectural changes.

---

## Problem Statement

The current vertical template renders profiles as formatted resumes. Key issues:

1. **Flat visual hierarchy** — every section gets identical treatment (same padding, same separator, same weight)
2. **Weak hero** — name at 36px doesn't command the page
3. **Zero personality between profiles** — Lena Fischer and Malik Johnson look identical except for text content
4. **Generic skill chips** — standard Bootstrap-style rounded pills
5. **Monotonous spacing** — uniform 48px gap between all sections
6. **Stats section wasted** — the only data-visual moment is undersized at 24px
7. **Border-bottom everywhere** — horizontal rules between every section create a form-like appearance
8. **Critical bug**: Warm theme + vertical has invisible content (contrast issue with Carla Mendes profile)

## Design Principles

- **Less, but better** — every remaining element has a reason
- **Two axes only** — size and weight for variation; color oscillates only between `fg` and `fg-secondary`
- **Animations are time** — they tell the visitor "this content deserves a moment of attention"
- **The OpenSelf signature** — accent bar + middle dot system + typographic discipline

---

## 1. Hero Section

**Current**: Name `text-4xl` (36px) centered, tagline `text-xl`, social icons without labels.

**New**:
- Name: `text-6xl` (60px), font-weight **500** (medium, not bold), `letter-spacing: -0.03em`
- Tagline: `text-xl`, `fg-secondary`, `leading-relaxed`, `max-w-md` (28rem) centered
- Social links: text labels with middle dot separators (`GitHub · LinkedIn · Website`), `text-sm`, `uppercase`, `tracking-wide` (0.05em), `fg-secondary`
- Padding: `py-24` (96px) — up from `py-16` (64px)

**Rationale**: Large + medium-weight + negative tracking = premium. Bold = aggressive, medium = sophisticated. Social labels > naked icons for readability.

## 2. Section Headers

**Current**: `text-[10px]` uppercase, `tracking-[0.3em]`, footer-fg color, `border-bottom`.

**New**:
- Accent bar: `3px × 16px` in `var(--page-accent)`, positioned left of label with 12px gap
- Label: `11px`, `tracking: 0.2em`, `font-weight: 600`, color `fg-secondary`
- Remove `border-bottom` entirely
- `margin-bottom: 32px` (mb-8) between label and content
- Implementation: `::before` pseudo-element — zero extra HTML

```css
.section-label::before {
  content: '';
  width: 3px;
  height: 16px;
  background: var(--page-accent);
  border-radius: 1px;
  margin-right: 12px;
  display: inline-block;
  vertical-align: middle;
}
```

**Rationale**: The accent bar is the OpenSelf visual signature — small, recurring, recognizable. After seeing it 3 times, visitors know they're on OpenSelf.

## 3. Variable Vertical Rhythm

**Current**: Uniform `gap-12` (48px) between all sections.

**New — 3 breathing levels**:

| Section type | Internal padding | Gap after |
|---|---|---|
| **Hero** | `py-24` (96px) | `gap-20` (80px) |
| **Narrative** (bio, experience, education, projects, achievements) | `py-8` (32px) | `gap-12` (48px) |
| **Dense/data** (stats, skills, interests, languages, activities) | `py-6` (24px) | `gap-8` (32px) |
| **Last section before footer** | — | `gap-20` (80px) |
| **Footer** | `py-16` (64px) | — |

**Implementation**: VerticalLayout applies gap based on child `section.type`. No changes to internal components.

**Rationale**: Music is not equal notes — it's the silence between notes that creates rhythm. Large breath after hero says "here's the person". Compact between stats and skills says "these are related data".

## 4. Stats Section

**Current**: Numbers `text-2xl` (24px) bold, labels `text-xs` uppercase.

**New**:
- Numbers: `text-5xl` (48px), font-weight **300** (light), `tracking: -0.02em`
- Labels: `text-xs`, **lowercase** (not UPPERCASE), `tracking: 0.1em`, `fg-secondary`
- No separators between stats — just `justify-between` on `max-w-lg` centered
- Hover: number transitions to `accent` color (200ms) — subtle easter egg

**Rationale**: Large + light numbers is the Stripe/Apple signature. Large + bold = aggressive dashboard. Large + light = sophisticated. Lowercase labels feel natural, not corporate.

## 5. Skills

**Current**: `rounded-full` pills with border, `px-3 py-1`, standard hover.

**New default variant (text-only)**:
- No border, no background, no rounded — just text
- Font-weight 500, `fg-secondary`, `gap-x-6 gap-y-3`
- Hover: underline 1.5px in `accent` grows left-to-right (`scaleX 0→1, transform-origin: left`), color transitions to `fg`, `translateY(-1px)`
- Group labels: `text-xs uppercase tracking-wide fg-secondary` (no accent bar)

**Updated chips variant** (for those who prefer pills):
- `rounded-md` (4px) instead of `rounded-full` — Stripe corners, not Bootstrap
- Border `0.5px`, no background
- Hover: border → accent, lift -1px

**Rationale**: Skills are dense information (8-15 words). Pills add visual noise (borders, backgrounds, rounds). Removing them leaves only content.

## 6. Experience & Education

**Current**: Title `text-lg` bold, company below, dates right, `border-bottom` between entries.

**New**:
- Title: `text-xl` (20px), font-weight **600**, `tracking: -0.01em`
- Company: `text-sm`, `fg-secondary`, font-weight 400
- Description: `text-sm`, `fg-secondary`, `leading-relaxed`, `max-w-prose` (65ch)
- Dates: `text-sm`, `fg-secondary`, right-aligned. No "CURRENT" badge — `2022 –` suffices. Abbreviated years for past roles: `2019 – 22`
- Between entries: middle dot `·` centered, `text-lg`, `fg-secondary`, `opacity 0.3`, `my-8` (32px)
- No `border-bottom` between entries

**Education**: Same system, more compact. Institution + degree on two lines, no description.

**Rationale**: The "CURRENT" badge is redundant noise. Abbreviated years are an editorial detail seen in high-end design CVs. Middle dot replaces horizontal rules with something lighter.

## 7. Bio Section

**Current**: `text-lg`, `leading-relaxed`, fg color. Reads like a LinkedIn "About me".

**New default variant**:
- `text-xl` (20px), font-weight 400, `leading-loose` (1.75)
- Color: `fg-secondary` (not primary — softer, more personal)
- `max-w-2xl` (42rem) centered — shorter lines for optimal readability (60-70 chars)
- No borders, no backgrounds

**Updated quote variant**:
- Same text treatment as default
- Opening/closing typographic quotes `"` `"` (U+201C/U+201D) in `text-4xl`, `fg-secondary`, `opacity 0.3`
- Quote marks in serif font (even on sans themes) — a single editorial detail

**Rationale**: Larger text + lighter color = softer, more conversational. It's the Apple product subtitle principle. The bio is where the person speaks — it should feel like a conversation.

## 8. Micro-animations

### 8a. Scroll reveal (sections)

```
opacity: 0, translateY: 12px  →  opacity: 1, translateY: 0
duration: 600ms
easing: cubic-bezier(0.16, 1, 0.3, 1)  /* ease-out-expo */
trigger: IntersectionObserver, threshold 0.1
```

- Hero does NOT animate — already visible on load
- Fires once only — no re-trigger on scroll up
- `prefers-reduced-motion: reduce` → no animation (non-negotiable)

### 8b. Hero entrance stagger

```
t=100ms   Name:     opacity 0→1, translateY 8→0  (600ms)
t=250ms   Tagline:  opacity 0→1, translateY 8→0  (600ms)
t=450ms   Social:   opacity 0→1                   (400ms, no translate)
```

### 8c. Hover states

- **Links/social**: underline 1.5px grows left→right (`scaleX 0→1`), color `fg-secondary` → `fg`, 300ms
- **Cards (projects, entries)**: `translateY(-2px)`, border → `accent` at 0.3 opacity, `shadow: 0 4px 12px rgba(0,0,0,0.06)`, 200ms
- **Stats numbers**: color → `accent`, 200ms (subtle easter egg)
- **Skill text**: underline animata + `translateY(-1px)` + color → `fg`

**Implementation**: Single `useScrollReveal()` hook (~40 lines) + CSS keyframes for hero. Zero external libraries.

## 9. Separator System

**Current**: `border-bottom 1px` between every section.

**New — 3-level system**:

| Where | Separator | Element |
|---|---|---|
| Between sections | Nothing | White space only (variable gap does the work) |
| Between entries in same section | `·` | Middle dot centered, `opacity 0.3`, `my-8` |
| Inline items (social, skill groups) | `·` | Middle dot inline, `opacity 0.2` |
| Before footer | `───` | Short centered line (64px), `border 0.5px`, `opacity 0.15` — the only border in the entire page |

## 10. Footer

**Current**: `© 2026 · Built with OpenSelf`, `text-xs`, centered, underline link.

**New**:
- Short centered rule: `max-w-[64px]`, `border 0.5px`, `fg-secondary`, `opacity 0.15`, `mb-8`
- Text: `openself.dev`, `text-xs`, `tracking-widest` (0.15em), `fg-secondary`, uppercase
- Hover: `fg` + animated underline
- No copyright, no "Built with" — just the product name as a colophon

---

## Typographic Scale Reference

| Element | Size | Weight | Tracking | Color |
|---|---|---|---|---|
| Hero name | text-6xl (60px) | 500 | -0.03em | fg |
| Hero tagline | text-xl (20px) | 400 | 0 | fg-secondary |
| Hero social labels | text-sm (14px) | 400 | 0.05em | fg-secondary |
| Section label | 11px | 600 | 0.2em | fg-secondary |
| Stats number | text-5xl (48px) | 300 | -0.02em | fg |
| Stats label | text-xs (12px) | 400 | 0.1em | fg-secondary |
| Bio text | text-xl (20px) | 400 | 0 | fg-secondary |
| Bio quote marks | text-4xl (36px) | 400 | 0 | fg-secondary @ 30% |
| Entry title | text-xl (20px) | 600 | -0.01em | fg |
| Entry subtitle | text-sm (14px) | 400 | 0 | fg-secondary |
| Entry date | text-sm (14px) | 400 | 0 | fg-secondary |
| Skill text (default) | text-sm (14px) | 500 | 0 | fg-secondary |
| Skill group label | text-xs (12px) | 500 | 0.1em | fg-secondary |
| Footer | text-xs (12px) | 400 | 0.15em | fg-secondary |

## Theme Scaling

The system is theme-agnostic in structure. Themes change only tokens:

| Token | Minimal | Warm | Editorial-360 |
|---|---|---|---|
| font-heading | system sans | Georgia (serif) | system sans |
| font-body | system sans | system sans | system sans |
| accent (bar, hover) | #111 | #c06834 | #000 |
| radius | 8px | 12px | 0px |
| dot opacity | 0.3 | 0.25 | 0.25 |
| bg | #fff | #faf7f2 | #fff |
| shadow hover | subtle | warm | none (border only) |

## New CSS Tokens

```css
/* Added to globals.css */

/* Hero spacing */
--space-hero-y: 96px;
--space-after-hero: 80px;
--space-before-footer: 80px;

/* Section label */
--section-label-size: 11px;
--section-label-tracking: 0.2em;
--section-label-gap: 32px;
--section-accent-bar-w: 3px;
--section-accent-bar-h: 16px;

/* Animations */
--reveal-distance: 12px;
--reveal-duration: 600ms;
--reveal-easing: cubic-bezier(0.16, 1, 0.3, 1);

/* Separators */
--dot-opacity: 0.3;
--footer-rule-width: 64px;
```

## What Does NOT Change

- HTML structure of components
- Slot system (hero/main/footer)
- Widget registry and variant resolution
- Lock system and canMutateSection
- PageConfig JSON schema
- Publish pipeline and hash guard
- No new React components (only CSS class changes to existing components)
- Sidebar-left and bento-standard templates (untouched)

## Profile Differentiation Strategy

No per-person accent color. Differentiation comes from:
1. **Widget variant diversity** — skills-cloud vs skills-text, projects-card vs projects-list
2. **Theme choice** — 3 distinct palettes (minimal/warm/editorial-360)
3. **Content itself** — a photographer has different skills, stats, and bio than an engineer
4. **Section count and ordering** — active sections vary per profile

## Known Bug to Fix

- **Warm theme contrast**: Carla Mendes (vertical + warm) has invisible content. Likely `fg` color too close to `bg` (#faf7f2). Must verify and fix contrast ratios during implementation.
