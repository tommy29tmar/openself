# Design DNA Full Redesign

**Date:** 2026-03-03
**Status:** Approved
**Approach:** Big Bang — single sprint, no intermediate releases

---

## Context

OpenSelf has a complete Design DNA document (`docs/design-dna.md`) and a working HTML prototype (`prototype-openself-all.html`) that fully implements it. The codebase is functional but not aligned with this vision. The app is not live. All existing pages and legacy theme data can be deleted.

This plan covers the complete implementation of the Design DNA across the entire product: Presence System, Monolith layout, Builder UX, Sources/Connectors layer, and clean cut of all legacy code.

---

## Section 1: Presence System (Foundation)

### What Gets Removed (Clean Cut)

- `theme: "minimal" | "warm" | "editorial-360"` — removed from PageConfig schema, API, agent tools, prompts, CSS
- `style.colorScheme: "light" | "dark"` — removed
- `style.fontFamily` — removed
- All legacy theme CSS classes
- All existing page rows in DB (app not live — `DELETE FROM page`)

### New PageConfig Fields

```ts
surface: string   // "canvas" | "clay" | "archive" | future values
voice:   string   // "signal" | "narrative" | "terminal" | future values
light:   string   // "day" | "night"
```

Validated at runtime against the Presence registry (not a strict TS union — enables future extensibility without schema changes).

### Presence Registry

Follows the same pattern as the connector registry and layout registry already in the codebase.

```
src/lib/presence/
  registry.ts        — SurfaceDefinition, VoiceDefinition types + register/get/list functions
  surfaces.ts        — Canvas, Clay, Archive definitions
  voices.ts          — Signal, Narrative, Terminal definitions
  combos.ts          — 6 Signature Combinations (hardcoded, exported as SIGNATURE_COMBOS)
  prompt-builder.ts  — buildPresenceReference() for agent prompts
```

**SurfaceDefinition:**
```ts
type SurfaceDefinition = {
  id: string
  displayName: string
  description: string      // used in agent prompts
  cssClass: string         // e.g. "surface-canvas"
  readingMax: number       // 660 | 680 | 700
  sectionLabelOpacity: number
}
```

**VoiceDefinition:**
```ts
type VoiceDefinition = {
  id: string
  displayName: string
  headingFont: string
  bodyFont: string
  cssClass: string
  description: string      // used in agent prompts
}
```

**Signature Combinations:**
```ts
export const SIGNATURE_COMBOS = [
  { surface: "canvas",  voice: "signal",    light: "day",   name: "Default Professional", for: "Most users. Maximum clarity." },
  { surface: "canvas",  voice: "terminal",  light: "night", name: "The Developer",        for: "Engineers, open-source contributors." },
  { surface: "clay",    voice: "narrative", light: "day",   name: "Artisan Editorial",    for: "Designers, writers, architects." },
  { surface: "clay",    voice: "signal",    light: "night", name: "Warm Modern",          for: "Startup designers, product managers." },
  { surface: "archive", voice: "narrative", light: "day",   name: "Luxury Magazine",      for: "The full OpenSelf statement." },
  { surface: "archive", voice: "narrative", light: "night", name: "Noir Editorial",       for: "Photographers, filmmakers, artists." },
] as const;
```

Adding a new surface = 1 CSS block + 1 entry in `surfaces.ts`. Schema validation, agent prompt, and Presence panel UI all update automatically.

### CSS Architecture

`globals.css` rewritten from scratch. Three composable class axes on `.os-page`:

```html
<div class="os-page surface-canvas voice-signal light-day">
```

**Rules (enforced structurally):**
- `surface-*` classes write ONLY `--page-*` tokens (bg, fg, accent, grain, edge, reading-max, card-bg, etc.)
- `voice-*` classes write ONLY `--h-font` and `--b-font`
- `light-night` overrides ONLY the color tokens of the active surface (per-surface night palette)

**DNA tokens on `:root`:**
```css
--os-dna-ease: cubic-bezier(0.16, 1, 0.32, 1);
--os-dna-reveal-distance: 12px;
--os-dna-signature-opacity: 0.4;
```

**Surface token set (per surface):**
```css
--page-bg, --page-fg, --page-fg-secondary, --page-accent, --page-accent-fg,
--page-border, --page-muted, --page-card-bg, --page-card-border, --page-card-hover,
--page-grain, --page-edge, --reading-max, --section-label-opacity
```

**Surface values:**

| Token | Canvas Day | Clay Day | Archive Day |
|---|---|---|---|
| `--page-bg` | `#fafaf9` | `#f5ede0` | `#ffffff` |
| `--page-fg` | `#141412` | `#2a1e12` | `#080808` |
| `--page-accent` | `#141412` | `#b05a2f` | `#1b2b6b` |
| `--page-grain` | `0` | `0.025` | `0.028` |
| `--page-edge` | `0` | `0.14` | `0.18` |
| `--reading-max` | `660px` | `680px` | `700px` |

Night overrides per surface (Clay Night, Archive Night differ from Canvas Night — no generic dark mode).

### Font Loading

`next/font` updated:
- **Add**: Cormorant Garamond (Narrative heading), Lato (Narrative body), JetBrains Mono (Terminal heading + body)
- **Keep**: Plus Jakarta Sans (Signal heading), Figtree (Signal body)
- **Remove**: Inter and any other fonts not used by the three Voices

### API + Agent

- `POST /api/draft/style`: accepts `surface`, `voice`, `light` — old fields (`theme`, `colorScheme`, `fontFamily`) removed
- `update_page_style` agent tool: body updated with new parameters
- `buildPresenceReference()` generates the Presence block in `DATA_MODEL_REFERENCE` dynamically from the registry — always accurate, never stale
- Migration `0019_presence_system.sql`

---

## Section 2: The Monolith DNA

### Lane System

Three explicit spatial zones. Each section declares its lane — the layout container does not decide:

```ts
type Lane = "hero" | "reading" | "bleed"
```

Lane widths:
```
hero    → 100% (edge-to-edge)
reading → max-width: var(--reading-max)             // 660–700px by surface
bleed   → max-width: calc(var(--reading-max) * 1.35) // ~890–945px
```

Section → Lane mapping (in `MonolithLayout.tsx`):
```
hero                                          → hero
bio, experience, education, custom,
achievements                                  → reading (narrative)
projects, reading-section, music              → bleed
skills, stats, languages, interests,
contact, social, activities                   → reading (dense)
footer                                        → hero (full-width)
```

### DNA Laws in MonolithLayout

**L1 (Accent Bar):** Already in `globals.css`. `.section-label::before` — 3px × 16px in `--page-accent`.

**L2 (Breath — variable spacing):**
```
after hero     → 80px  (mb-20)
after narrative sections → 48px (mb-12)
after dense sections    → 32px (mb-8)
```

**L3 (Curve):** All transitions in `globals.css` use `var(--os-dna-ease)`. No `ease`, no `ease-in-out`.

**L4 (Birth — scroll reveal):** `theme-reveal` + IntersectionObserver applied to every section wrapper. In `previewMode` → `preview-mode` class forces `opacity: 1` on all reveals.

**L5 (Thread):** `.hover-underline-grow` on all interactive links — already implemented, extended to nav links.

**L6 (Signature):** `openself.dev` in footer, `opacity: var(--os-dna-signature-opacity, 0.4)`.

### Ambient Markers (Desktop Only)

Sticky structural watermark in the right margin:
```css
.os-ambient {
  position: sticky;
  top: 80px;
  writing-mode: vertical-rl;
  font-family: var(--h-font);
  font-size: 72px;
  font-weight: 700;
  color: var(--page-fg);
  opacity: 0.04;
  user-select: none;
  pointer-events: none;
}
```

Text: current section name, updated via IntersectionObserver (not scroll events).
Hidden on mobile and in `previewMode`.

### Grain + Edge Lines (Pseudo-elements on `.os-page`)

```css
.os-page::before { /* grain overlay — opacity: var(--page-grain) */ }
.os-page::after  { /* edge lines — border-left/right using var(--page-edge) */ }
```

Canvas: both at 0 (invisible). Clay: grain 0.025, edge 0.14. Archive: grain 0.028, edge 0.18.

### Mobile — Peek-a-boo Hero

```css
@media (max-width: 1023px) {
  .os-hero {
    min-height: 85svh;
    align-items: flex-end;
    padding-bottom: 48px;
  }
}
```

Result: name and tagline visible at bottom of screen. First pixels of next section visible above the fold — scroll invitation without any hint copy.

### Sticky Nav (Published Pages, 8+ Sections)

New component `src/components/page/StickyNav.tsx`:
- Appears after 200px scroll, disappears on scroll-up (fade transition)
- Content: [avatar 28px or initials] · [name] · [section anchor links]
- Auto-generated by PageRenderer when `sections.length >= 8`
- Never shown in `previewMode`
- Z-index coordinated above OwnerBanner and VisitorBanner

---

## Section 3: Builder UX

### Top Bar (Desktop)

```
[openself]  [Draft · Elena ▸]  ————————  [Presence]  [Publish →]
  mono        status pill (clickable)      ghost btn   accent btn
```

- Logo: `openself` in monospace, links to home
- Status pill: `Draft · username` or `Published · username` — clicking goes to live page
- **Presence**: opens the Presence panel. The gear icon is removed permanently.
- **Publish →**: appears only when unpublished changes exist

`BuilderNavBar.tsx` rewritten with this structure. Logout moves into the Presence panel (account section) or is removed from the top bar.

### Presence Panel

Replaces `SettingsPanel.tsx` entirely. Right drawer on desktop, bottom sheet on mobile. Four collapsible sections:

**1. Presence** (open by default)
- Surface: 3 selectable cards (Canvas / Clay / Archive) with description
- Voice: 3 selectable cards (Signal / Narrative / Terminal) with font names
- Light: 2 toggle buttons (Day / Night)
- Signature Combinations: 6 chips at bottom — one click applies surface+voice+light
- Mini live preview: scaled `PageRenderer` updating in real-time as selections change

**2. Layout** (collapsible)
- 4 layout cards: Monolith / Curator / Architect / Cinematic
- Toggle: "Show navigation bar" (only visible if page has 5+ sections)

**3. Photo** (collapsible)
- Shows current avatar or initials monogram
- Click/tap → file picker (upload)
- Hero variant selector: `hero-split` (default) / `hero-centered`
- Remove photo button (if photo present)

**4. Sources** (collapsible)
- Connector list rendered dynamically from the connector registry
- Each card: icon + name + status badge
- GitHub: "Connect" (OAuth) or "Sync Now" / "Disconnect"
- LinkedIn: "Import ZIP" (file upload)
- Future connectors appear automatically when added to registry

### ConnectorCard — Generic Component

`ConnectorSection.tsx` replaced by `SourcesPanel.tsx` + `ConnectorCard.tsx`.

`ConnectorDefinition` extended with UI metadata:
```ts
type ConnectorDefinition = {
  id: string
  displayName: string
  icon: React.ComponentType
  description: string
  authType: "oauth" | "zip_upload"
  connectUrl?: string    // oauth: /api/connectors/{id}/connect
  importUrl?: string     // zip: /api/connectors/{id}/import
  syncUrl?: string       // oauth+sync: /api/connectors/{id}/sync
  disconnectUrl: string  // /api/connectors/{id}/disconnect
}
```

`ConnectorCard` renders based on `authType`:
- `oauth`: Connect button → OAuth redirect. When connected: Sync Now + Disconnect + last sync timestamp.
- `zip_upload`: Import button → file picker. Shows import result (facts written).

Adding a new connector = 1 definition file + API handler. No UI changes.

### Magic Paste (Agent)

The agent detects URLs in user messages. If the URL matches a domain registered in the connector registry, the agent responds inline:

> "I see a GitHub link — want me to connect it as a source to import your projects?"

Two inline buttons in the chat bubble: **Connect** · **Skip**. No forced panel opening.

Implementation: URL pattern matching in the chat route, passed to agent context as a detected signal.

### Mobile Builder

`SplitView.tsx` mobile layout replaced:

**Before:** Top TabsList (Chat / Preview) — web-style.

**After:** Bottom tab bar 56px with three tabs:
```
[  Chat  ]  [  Preview  ]  [  Style  ]
```

- **Chat**: full-screen. Voice FAB (56px, `--page-accent` bg) fixed bottom-right inside chat.
- **Preview**: full-screen page. "Edit" button top-right returns to Chat.
- **Style**: Presence panel as full-height bottom sheet.
- **Publish**: NOT a tab. Sticky banner at top of Chat tab when unpublished changes exist, with "Publish →" button.

### Avatar / Profile Photo

- Tap/click on monogram or avatar anywhere in builder preview → file picker
- Same tap-to-upload on published page for logged-in owner (via OwnerBanner context)
- `HeroSection.tsx` supports two variants via `config.heroVariant`:
  - `hero-split` (default): 80px avatar, left-aligned, same row as name
  - `hero-centered`: 120px avatar, centered, name below
- Initials fallback: `--page-accent` background, `--h-font`, uppercase initial, no border, no shadow — intentional by design

---

## Section 4: Clean Cut Summary

### Removed Files
- `src/components/settings/SettingsPanel.tsx`
- `src/components/settings/ConnectorSection.tsx`

### Rewritten Files
- `src/app/globals.css` (from scratch)
- `src/components/layout/BuilderNavBar.tsx`
- `src/components/layout/SplitView.tsx` (mobile section)
- `src/components/layout-templates/MonolithLayout.tsx`
- `src/components/page/HeroSection.tsx` (add variants)

### New Files
```
src/lib/presence/registry.ts
src/lib/presence/surfaces.ts
src/lib/presence/voices.ts
src/lib/presence/combos.ts
src/lib/presence/prompt-builder.ts
src/components/presence/PresencePanel.tsx
src/components/presence/MiniPreview.tsx
src/components/presence/SignatureCombos.tsx
src/components/sources/SourcesPanel.tsx
src/components/sources/ConnectorCard.tsx
src/components/page/StickyNav.tsx
db/migrations/0019_presence_system.sql
```

### Schema Changes
- `PageConfig`: remove `theme`, `style.colorScheme`, `style.fontFamily` — add `surface`, `voice`, `light`
- DB migration: drop old columns, add new columns, `DELETE FROM page`

### Agent Changes
- `prompts.ts`: Presence block generated by `buildPresenceReference()` — dynamic, not static
- `tools.ts`: `update_page_style` parameters updated
- `/api/draft/style`: accepts `surface`, `voice`, `light`

### Tests
- Update all tests referencing `theme`, `colorScheme`, `fontFamily`
- New tests: Presence registry, `buildPresenceReference()`, `ConnectorCard` generic rendering, StickyNav threshold logic

---

## File Map (Result State)

```
src/lib/presence/           ← NEW: Presence System registry
src/lib/connectors/         ← EXTENDED: ConnectorDefinition with UI metadata
src/components/presence/    ← NEW: PresencePanel, MiniPreview, SignatureCombos
src/components/sources/     ← NEW: SourcesPanel, ConnectorCard (generic)
src/components/page/StickyNav.tsx    ← NEW
src/components/layout/BuilderNavBar.tsx   ← REWRITTEN
src/components/layout/SplitView.tsx       ← UPDATED (mobile)
src/components/layout-templates/MonolithLayout.tsx  ← REWRITTEN
src/components/page/HeroSection.tsx       ← UPDATED (variants)
src/app/globals.css                       ← REWRITTEN
db/migrations/0019_presence_system.sql   ← NEW
```
