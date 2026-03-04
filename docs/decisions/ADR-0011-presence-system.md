# ADR-0011: Presence System — Replacing theme/colorScheme/fontFamily

**Date:** 2026-03-03
**Status:** Accepted
**Deciders:** Engineering

---

## Context

OpenSelf previously used three independent visual identity fields in `PageConfig`:
- `theme: string` — one of `"minimal"`, `"warm"`, `"editorial-360"`
- `style.colorScheme: "light" | "dark"`
- `style.fontFamily: string`

These three axes were independent and could produce incoherent combinations (e.g., an editorial theme with "dark" colorScheme and a random font). The legacy `ThemeProvider` applied CSS custom properties based only on `config.theme`, with `colorScheme` and `fontFamily` handled separately. There was no concept of curated pairings or designed combinations.

During the Design DNA Full Redesign (2026-03-03), the visual identity model was redesigned from scratch to be:
1. More coherent — combinations are curated, not arbitrary
2. More expressive — three independent axes with clear semantic meaning
3. More builder-friendly — a dedicated PresencePanel UI replaces the buried SettingsPanel

---

## Decision

Replace `theme/colorScheme/fontFamily` with a **3-axis Presence System**:

### Axes

| Axis | Field | Values | Meaning |
|------|-------|---------|---------|
| Surface | `surface` | `canvas` / `clay` / `archive` | The visual canvas/background character |
| Voice | `voice` | `signal` / `narrative` / `terminal` | The typographic personality |
| Light | `light` | `day` / `night` | Light vs dark mode |

### Signature Combos
9 pre-curated combinations (defined in `src/lib/presence/combos.ts`) pair surface × voice × light into named identities:
- **canvas + signal + day** — Clean Signal
- **canvas + narrative + day** — Open Page
- **canvas + terminal + night** — Dev Dark
- **clay + signal + day** — Warm Minimal
- **clay + narrative + day** — Warm Editorial
- **clay + terminal + night** — Amber Terminal
- **archive + signal + night** — Archive Night
- **archive + narrative + night** — Noir Editorial
- **archive + terminal + night** — Monolith

### Implementation

**Schema (`PageConfig`):**
```ts
type PageConfig = {
  surface: "canvas" | "clay" | "archive";
  voice: "signal" | "narrative" | "terminal";
  light: "day" | "night";
  // ... (theme/colorScheme/fontFamily removed)
};
```

**CSS application (`OsPageWrapper`):**
The `OsPageWrapper` component applies classes `.surface-{surface}`, `.voice-{voice}`, `.light-{light}` to `<body>`. CSS custom properties in `globals.css` are keyed by these classes:
```css
body.surface-canvas { --page-bg: #ffffff; --page-fg: #111; }
body.surface-clay { --page-bg: #f5f0e8; --page-fg: #2c2018; }
body.surface-archive { --page-bg: #1a1916; --page-fg: #e8e4de; }
/* etc. */
```

**DB:** Migration `0025_presence_system.sql` adds `surface`, `voice`, `light` columns to the `page` table.

**Prompt:** `src/lib/presence/prompt-builder.ts` injects presence context into agent system prompt.

**UI:** `PresencePanel` (680px right drawer on desktop, inline on mobile Style tab) provides Surface/Voice/Light pickers, SignatureCombos for one-click preset selection, MiniPreview (scale 0.5 live preview), Layout selector, AvatarSection, SourcesPanel.

**Magic Paste:** `src/lib/connectors/magic-paste.ts` — `detectConnectorUrls(text)` scans user messages for GitHub/LinkedIn URLs and injects a `DETECTED SOURCE URLS:` hint into the agent context, enabling smart connector suggestions without user having to navigate to SourcesPanel.

---

## Consequences

### Positive
- Visual identity is coherent by construction — arbitrary incoherent combos are impossible
- 9 signature combos provide opinionated starting points with clear names
- `OsPageWrapper` is a clean single responsibility (applies presence classes to body)
- Builder UX is dramatically simpler: PresencePanel replaces SettingsPanel
- Connector UI is now registry-driven and extensible without code changes to PresencePanel

### Negative
- Breaking change to `PageConfig` schema — migration required for all existing pages
- `cleanup-presence-reset.ts` script needed to backfill existing pages with defaults
- `editorial-360/Layout.tsx` and `themes/index.ts` are deleted — any future theme additions must go through the Presence registry

### Neutral
- `theme` field still present in `PageConfig` for backward compatibility with page renderer during transition
- Legacy `SettingsPanel.tsx` and `ConnectorSection.tsx` fully deleted — not deprecated, removed
