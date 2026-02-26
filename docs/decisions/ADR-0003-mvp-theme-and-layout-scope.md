# ADR-0003: MVP Theme and Layout Scope

Status: Accepted (Layout scope superseded — see update below)
Date: 2026-02-23
Updated: 2026-02-26
Deciders: OpenSelf engineering

## Context

The page schema (`src/lib/page-config/schema.ts`) defines a `theme` field and a
`style.layout` field that control the visual presentation of personal pages.

Early design exploration considered five themes (`minimal`, `warm`, `bold`, `elegant`,
`hacker`) and three layout modes (`centered`, `split`, `stack`). Implementing all
combinations would mean 15 distinct visual treatments, each requiring dedicated CSS,
component variants, and visual QA.

At the MVP stage, the priority is proving the core loop (conversation -> facts -> page)
rather than breadth of visual customization. Shipping too many under-tested visual
variants risks inconsistent quality and dilutes focus.

## Decision

1. Ship MVP with exactly 2 themes: `minimal` and `warm`.
2. Ship MVP with exactly 1 functional layout: `centered`.
3. The `AVAILABLE_THEMES` constant in `src/lib/page-config/schema.ts` is the single
   source of truth for which themes are accepted at runtime.
4. Schema validation rejects any theme not in `AVAILABLE_THEMES`.
5. The `split` and `stack` layout values remain valid in the schema but fall back to
   `centered` behavior in the renderer and in the page composer's repair logic.
6. `bold`, `elegant`, and `hacker` themes are deferred to Phase 1.

The agent's `set_theme` tool checks against `AVAILABLE_THEMES` before applying a
theme change and returns an error listing valid options if the requested theme is
not available.

## Consequences

Positive:
1. Focused quality: two themes can be thoroughly tested and polished.
2. Smaller CSS surface: fewer visual variants to maintain and debug.
3. Clear extension path: adding a theme means adding an entry to `AVAILABLE_THEMES`
   and the corresponding CSS/component work, with no architectural change needed.
4. Runtime safety: invalid themes are rejected at validation and tool boundaries,
   preventing broken pages.

Negative:
1. Less initial customization for users; pages may feel similar.
2. Users who expect a wider selection at launch may be disappointed.
3. Layout modes declared in schema but not functionally distinct may cause confusion
   if exposed in UI or documentation.

## Alternatives Considered

1. Ship all 5 themes at MVP
   - Rejected: quality risk. Three additional themes would each need dedicated design,
     CSS, and testing. Spreading effort across 5 themes at this stage compromises the
     core loop.

2. Ship 0 themes (single hardcoded look)
   - Rejected: offering at least 2 themes demonstrates the theming system works and
     gives users a meaningful choice, even if minimal.

3. Allow freeform theme strings and generate CSS dynamically via LLM
   - Rejected: non-deterministic output, high latency, and difficult to ensure
     accessibility and consistency. Contradicts the deterministic composition decision
     (ADR-0002).

## Update (2026-02-26): Layout Scope Superseded

The layout portion of this ADR has been superseded by the Layout Template Engine
implementation, which was anticipated from Phase 1b (NEXT-8) and completed ahead of
schedule. The original `style.layout` field (`centered`, `split`, `stack`) is retained
in the schema for backward compatibility but is no longer used for layout resolution.

The new system uses a top-level `layoutTemplate` field with 3 fully functional templates:
- `vertical` — reproduces the original centered layout (default, backward-compatible)
- `sidebar-left` — two-column responsive grid
- `bento-standard` — magazine-style 6-column grid

The theme portion of this ADR (2 themes: minimal, warm) remains in effect. Additional
themes (bold, elegant, hacker) are still deferred to a future phase.

See `docs/ARCHITECTURE.md` Section 6.6.1 for the full layout template engine architecture.
