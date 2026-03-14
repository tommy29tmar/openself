# Design: Living Portrait with Faceted Identity

**Date:** 2026-03-14
**Status:** Approved
**Challenge:** 2 rounds, 3 independent reviewers (Design Challenger, Technical Validator, UX/Product Challenger)

## Problem

OpenSelf's public page is a traditional scrolling portfolio (19 section types, 4 layout templates). The powerful engine underneath — 4-tier memory, soul profile, 5 connectors, episodic events, autonomous heartbeat — is invisible to visitors. The page looks like static page builder output, not a living identity layer.

## Goal

Redesign the public-facing experience so that the "alive" quality of OpenSelf is immediately visible. Create a unique, differentiated product experience that no competitor offers.

## Confirmed Direction

1. **Unified redesign** — Page restructure + visitor-facing agent insights, together
2. **2-layer model with click-to-expand** — Layer 1 is a compact "portrait" (100svh, no scroll), Layer 2 opens on explicit action
3. **Faceted Identity** — Each tile in Layer 1 is a direct portal to its domain's deep dive
4. **Hybrid agent** — Pre-computed annotations (zero runtime cost) + deferred visitor chat (v2)
5. **Flagship layout** — Coexists with existing "Classic CV" layouts (Monolith, Curator, Architect, Cinematic)
6. **Progressive enhancement** — No unlock gate; richness scales with available data

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│              LIVING PORTRAIT (Layer 1)                │
│   Full viewport · 100svh · No scroll                 │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │  Name + Role (animated entrance)             │   │
│   │  Activity Strip ("Ha ascoltato Tycho · 3h")  │   │
│   │  Bio (2-3 frasi, soul-derived)               │   │
│   │                                              │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│   │  │ Building│ │ Running │ │  Music  │  ...    │   │  ← Facet Tiles
│   │  │ OpenSelf│ │ PB 1:42 │ │ Burial  │        │   │    Auto-flip 5-6s
│   │  └────┬────┘ └────┬────┘ └────┬────┘        │   │    Tap = inline expand
│   │       │            │           │              │   │
│   │  Pulse bar · Social links · Contattami CTA   │   │
│   └──────────────────────────────────────────────┘   │
│                                                      │
│   Tap tile → inline expand (3-4 items in-place)      │
│   "Vedi tutto →" → full facet deep dive              │
└──────────────────────────────────────────────────────┘

                    │ "Vedi tutto →"
                    ▼

┌──────────────────────────────────────────────────────┐
│           FACET DEEP DIVE (Layer 2)                   │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │  ← Portrait              Tommaso Rinaldi     │   │
│   │──────────────────────────────────────────────│   │
│   │  ┌─ Agent Annotation ──────────────────────┐ │   │
│   │  │ "Questo progetto ha unito 10 anni di    │ │   │  ← Pre-computed
│   │  │  esperienza in sistemi distribuiti..."   │ │   │    by heartbeat
│   │  └─────────────────────────────────────────┘ │   │
│   │                                              │   │
│   │  [Full project cards, stats, items...]       │   │  ← Reuses existing
│   │                                              │   │    section components
│   │  ─── Other facets ───                        │   │
│   │  [Running] [Music] [Skills] [Experience]     │   │  ← Cross-nav pills
│   └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## Layer 1 — Living Portrait

### Composition

Full viewport (100svh), overflow hidden. All elements in one screen.

| Element | Description |
|---------|-------------|
| **Name + Role** | Large type, animated entrance (rise + fade). Voice-aware font. |
| **Activity Strip** | Pulsing dot + rotating messages with honest timestamps. "Ha ascoltato Tycho · 3h fa", "Commit su openself · ieri", "Ha corso 6.2km · stamattina". Source: episodic events + last connector sync. Rotates every 8s. |
| **Bio** | 2-3 sentences, derived from soul profile. Style varies by voice (italic for narrative, normal for signal/terminal). |
| **Facet Tiles Grid** | Dynamic grid of identity facets. Only tiles with enough data appear. Auto-flip every 5-6s with 3D CSS transform. |
| **Pulse Bar** | Compressed activity stream at bottom. "committed to openself · 2h ago · ran 6.2km · listening to Tycho" |
| **Social Links** | GitHub, LinkedIn, Email icons. |
| **Contattami CTA** | Contact button (replaces visitor chat in v1). |
| **Mesh Gradient** | Animated blobs (3 circles, blur 80px) that react subtly to tile flips. Colors from Presence System surface. |

### Responsive Layout

| Breakpoint | Grid | Max-width | Notes |
|------------|------|-----------|-------|
| Mobile (<640px) | 2 columns | 480px | Primary target |
| Tablet (640-1024px) | 2-3 columns | 640px | |
| Desktop (>1024px) | 3 columns | 720px | Centered, breathing room |

### Progressive Enhancement (No Unlock Gate)

The Portrait is ALWAYS the default layout. Richness scales with available data — no binary threshold, no gate, no locked states.

| Profile Density | Facts | Tiles | Elements Visible |
|----------------|-------|-------|------------------|
| Thin | ~5 | 2 (role + 1 interest) | Name, bio, tiles |
| Medium | 10-15 | 4-5 | + Activity Strip |
| Rich | 15+ facts, 2+ connectors | 6+ | + Activity Strip, Pulse bar, connector data, deep facets |

### Facet Tile Types

Tiles are determined dynamically based on available data. Each tile requires a minimum data threshold to appear.

| Tile | Data Source | Minimum Requirement |
|------|------------|---------------------|
| Building / Projects | Project facts | ≥1 project fact |
| Activity / Running | Strava connector + activity facts | Strava connector OR ≥2 activity facts |
| Music | Spotify connector + music facts | Spotify connector OR ≥2 music facts |
| Reading | Reading facts | ≥1 reading fact |
| Experience | Experience facts | ≥1 experience fact |
| Skills | Skill facts | ≥3 skill facts |
| Education | Education facts | ≥1 education fact |
| Code | GitHub connector | GitHub connector active |
| Interests | Interest/activity facts | ≥2 interest facts |

### Tile Content Pools

Each tile rotates through 3-5 content variants, built from facts + connector data + episodic events. Content is server-rendered at page load (SSR), animations are client-side.

Example for "Running" tile:
```
Variant 1: { label: "Running",    val: "PB 1:42:03 · 847km quest'anno" }
Variant 2: { label: "This week",  val: "68km in 5 sessioni · Passo 4:52/km" }
Variant 3: { label: "Last run",   val: "6.2km stamattina · Ritmo 4:48/km" }
Variant 4: { label: "Goal",       val: "Obiettivo 1000km · Mancano 153km" }
```

### Activity Strip — "Tended, Not Live"

The Activity Strip replaces the prototype's "Now Strip". Critical reframing from the challenge review: the architecture syncs daily, not real-time. The language must be honest.

**Do:** "Ha ascoltato Tycho · 3h fa" / "Commit su openself · ieri" / "Ha corso 6.2km · stamattina"
**Don't:** "Now playing Tycho" / "Currently running" / any real-time claim

Data sources:
- Most recent episodic events (sorted by `created_at` DESC)
- Last connector sync data (from `sync_log`)
- Relative timestamps via `formatDistanceToNow()` or similar

---

## Interaction Model — Inline Expand + Full Facet

Two-level progressive disclosure. Casual visitors get value from inline expand without committing to navigation. Engaged visitors enter full facet deep dives.

### Primary: Inline Expand (tap tile)

Tapping a tile expands it in-place within the portrait, showing 3-4 key items. The other tiles remain visible (pushed down or beside). Another tap or a close button collapses it.

```
Before tap:
┌──────────┐ ┌──────────┐
│ Building │ │ Running  │
│ OpenSelf │ │ PB 1:42  │
└──────────┘ └──────────┘
┌──────────┐ ┌──────────┐
│  Music   │ │ Reading  │
│  Burial  │ │ Pragmatic│
└──────────┘ └──────────┘

After tap on "Building":
┌─────────────────────────┐
│ Building              ✕ │
│─────────────────────────│
│ ▸ OpenSelf              │
│   AI-powered identity   │
│   TS · Next.js · AI SDK │
│─────────────────────────│
│ ▸ Previous Project      │
│   Distributed systems   │
│─────────────────────────│
│ [Vedi tutto →]          │
└─────────────────────────┘
┌──────────┐ ┌──────────┐
│  Music   │ │ Reading  │
│  Burial  │ │ Pragmatic│
└──────────┘ └──────────┘
```

The portrait scrolls to accommodate the expanded tile. `overflow: hidden` is temporarily removed from the page container.

### Secondary: Full Facet Deep Dive

"Vedi tutto →" or a direct link triggers the full transition:

1. Portrait fades out (opacity 0, scale 0.97, 400ms)
2. Facet view fades in (opacity 1, staggered section animation, 500ms)
3. URL updates via shallow routing: `/username` → `/username?facet=projects`
4. Browser back returns to portrait (popstate handler)

### Back to Portrait

1. Click "← Portrait" or browser back
2. Facet view fades out (400ms)
3. Portrait fades in (600ms)
4. URL returns to `/username`

---

## Layer 2 — Facet Deep Dive

Each facet is a focused view of one identity domain.

### Structure

1. **Header** — Back button ("← Portrait") + person name + facet type label
2. **Agent Annotation** (optional) — Pre-computed insight block. Collapsible if long. One per facet.
3. **Content** — Full data for this facet. Reuses existing section components where possible:
   - Projects facet → `Projects.tsx` component
   - Experience facet → `Experience.tsx` component
   - Music facet → `Music.tsx` component
   - Running/Activity facet → `Activities.tsx` + stats grid
   - etc.
4. **Cross-navigation** — Pill/tab bar at bottom listing other available facets. Tap = transition to that facet (no return to portrait needed).
5. **Contattami CTA** — Contact button (email, form, or social link)

### Cross-Navigation

```
[← Portrait]  [Projects]  [Running]  [Music]  [Skills]

Active facet is highlighted. Tapping another facet transitions directly (facet-to-facet, without portrait intermediate).
```

### Facet-to-Section Component Mapping

| Facet | Primary Component | Fallback |
|-------|------------------|----------|
| projects | Projects.tsx | projects-list variant |
| experience | Experience.tsx | default variant |
| education | Education.tsx | default variant |
| skills | Skills.tsx | skills-chips variant |
| music | Music.tsx | default variant |
| reading | Reading.tsx | default variant |
| activity | Activities.tsx + custom stats grid | default variant |
| code | Custom GitHub component | projects-list with GH data |
| interests | Interests.tsx | default variant |

---

## Agent Annotations (v1)

### Architecture

Pre-computed by the deep heartbeat worker. Zero runtime cost for visitors.

- **Generation cadence**: Weekly (in deep heartbeat), or on significant fact changes (facts_hash mismatch)
- **Scope**: Only active facets for this profile (~5-8 facet types, not all 19 section types)
- **Language**: Generated in owner's language only. Translated on-read via existing translation pipeline.
- **Context**: Soul profile + all public facts for that facet type. Cross-domain synthesis uses the soul profile's whole-person perspective.
- **Quality prompt**: "Given these facts about this person's [domain] and their personality profile, write a 2-3 sentence insight that helps a visitor understand what makes this person unique in this area. Be specific and authentic, not generic. Match the owner's voice."

### Portrait-Level Annotation

In addition to per-facet annotations, one portrait-level annotation is generated. This provides the "whole person" narrative that prevents facet fragmentation.

Displayed in the bio area or as a subtle tagline: "Ingegnere che corre maratone e costruisce identity layer — la disciplina atletica si riflette nell'approccio ai sistemi distribuiti."

### Data Model

```sql
CREATE TABLE visitor_annotations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner_key TEXT NOT NULL,
  facet_type TEXT NOT NULL,       -- 'portrait' | 'projects' | 'activity' | 'music' | etc.
  content TEXT NOT NULL,           -- The annotation text
  language TEXT NOT NULL,          -- Owner's language (e.g., 'it')
  facts_hash TEXT NOT NULL,        -- SHA-256 of relevant facts for cache invalidation
  soul_hash TEXT,                  -- SHA-256 of soul profile snapshot
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_key, facet_type)
);

CREATE INDEX idx_visitor_annotations_owner ON visitor_annotations(owner_key);
```

Note: one row per facet per owner (not per language). Translation happens on-read.

### Worker Job

New job type: `generate_visitor_annotations`, added to deep heartbeat handler.

```
Deep Heartbeat (weekly):
  1. Existing: conformity check
  2. Existing: coherence check
  3. Existing: curate_page
  4. Existing: consolidate_facts
  5. Existing: consolidate_episodes
  6. NEW: generate_visitor_annotations
```

Flow:
1. Get active facet types for this owner (facets with enough data to show a tile)
2. For each facet: compute facts_hash from relevant facts
3. Skip if existing annotation has matching facts_hash + soul_hash (no regeneration needed)
4. Generate annotation via LLM (fast tier, `generateText`)
5. Upsert into `visitor_annotations`
6. Generate portrait-level annotation (uses all facts + soul)

Bounded cost: ~5-8 LLM calls per profile per week (only active facets with changed data).

---

## Presence System Integration

The Living Portrait uses the same 3-axis system. No changes to the Presence System itself.

### Mapping

| Axis | Portrait Element |
|------|-----------------|
| **Surface** | Mesh gradient blob colors, grain opacity, reading max-width, tile border/bg |
| **Voice** | Name font, bio font, tile labels/values, facet content |
| **Light** | Day/night color scheme for all elements |

### Prototype Presets → Presence Combos

| Prototype Variant | Surface | Voice | Light | Signature |
|-------------------|---------|-------|-------|-----------|
| Day | canvas | signal | day | Clean, geometric, maximum clarity |
| Noir | archive | narrative | night | Dark navy, serif italic, grain, luxury |
| Dev | canvas | terminal | night | Monospace, cursor blink after name, green blobs |

### CSS Custom Properties (new)

```css
/* Mesh gradient colors derived from surface */
.surface-canvas  { --blob1: rgba(255,195,90,.4);  --blob2: rgba(255,140,110,.28); --blob3: rgba(170,155,255,.22); }
.surface-clay    { --blob1: rgba(176,90,47,.35);   --blob2: rgba(200,140,60,.25);  --blob3: rgba(140,120,180,.20); }
.surface-archive { --blob1: rgba(70,90,200,.35);   --blob2: rgba(150,70,200,.22);  --blob3: rgba(50,140,180,.18); }

/* Night mode overrides */
.light-night.surface-canvas  { --blob1: rgba(90,200,110,.14);  ... }
.light-night.surface-archive { --blob1: rgba(70,90,200,.35);   ... }

/* Tile styling */
:root {
  --tile-bg: rgba(0,0,0,.03);
  --tile-glow: rgba(0,0,0,.08);
  --tile-border: rgba(0,0,0,.1);
}
.light-night {
  --tile-bg: rgba(255,255,255,.04);
  --tile-glow: rgba(160,180,224,.15);
  --tile-border: rgba(255,255,255,.08);
}
```

---

## Visitor Chat — Deferred to v2

**Not in v1.** Replaced by "Contattami" CTA in both Layer 1 and Layer 2.

### Why Deferred (Challenge Consensus)

1. **SQLite write contention**: WAL serializes writes; concurrent visitor streams + owner chat + worker = `SQLITE_BUSY` errors
2. **Budget drain**: No per-visitor budget isolation; owner pays for stranger interactions without consent
3. **Auth surface**: First unauthenticated write path in the codebase; no visitor identity model
4. **Brand liability**: Digital twin could say incorrect things about the owner; no moderation infrastructure
5. **Zero demand signal**: No evidence visitors want to chat with a profile page

### v2 Prerequisites

- Proven demand: measure clicks on "Contattami", time-per-facet, facet navigation patterns
- Per-visitor budget isolation (separate from owner's daily/monthly limits)
- Visitor auth model (server-side session tokens, not browser fingerprinting)
- SQLite scaling strategy (or separate write path for visitor messages)
- Owner consent toggle ("Allow visitors to chat with my twin")
- Owner review dashboard (see what the twin said)

---

## Technical Implementation

### New Components (~8)

| Component | Location | Responsibility |
|-----------|----------|---------------|
| `LivingPortrait.tsx` | `src/components/portrait/` | Full-viewport container, mesh gradient, entrance animations |
| `FacetGrid.tsx` | `src/components/portrait/` | Dynamic tile grid layout (2-col mobile, 3-col desktop) |
| `FacetTile.tsx` | `src/components/portrait/` | Individual tile with flip animation, content pool, click handler |
| `FacetInlineExpand.tsx` | `src/components/portrait/` | Expanded tile showing 3-4 items in-place |
| `ActivityStrip.tsx` | `src/components/portrait/` | Rotating status messages with honest timestamps |
| `PulseBar.tsx` | `src/components/portrait/` | Compressed activity stream footer |
| `FacetView.tsx` | `src/components/portrait/` | Layer 2 facet deep dive container |
| `AgentAnnotation.tsx` | `src/components/portrait/` | Pre-computed insight block with collapsible UI |

### New Services (~2)

| Service | Location | Responsibility |
|---------|----------|---------------|
| `visitor-annotation-service.ts` | `src/lib/services/` | CRUD for visitor_annotations (get, upsert, getForOwner, cleanup) |
| `facet-builder.ts` | `src/lib/services/` | Determines active facets, builds tile content pools from facts + episodic events |

### New Worker Handler (~1)

| Handler | Location | Trigger |
|---------|----------|---------|
| `generate-visitor-annotations.ts` | `src/lib/worker/handlers/` | Deep heartbeat (weekly) |

### DB Migration (~1)

One migration: `visitor_annotations` table + index.

### Layout Template

New `living-portrait` value added to `LayoutTemplateId` union in `contracts.ts`. Requires:
- Migration to update CHECK constraint on `page.layout_template` column
- `resolveLayoutAlias()` updated
- `getLayoutComponent()` returns `LivingPortrait` for this template
- Worker follower mode: migration must run before code reads the new value

### Page Route Changes

`src/app/[username]/page.tsx`:
- Check if `layoutTemplate === 'living-portrait'`
- If yes: compute tile data + activity strip from facts + episodic events (SSR), render `LivingPortrait`
- If no: existing `PageRenderer` pipeline
- `?facet=type` query param handled client-side (shallow routing, no server round-trip)

### Translation

- **Tile content**: Small strings, batched into a single translation call per tile set
- **Activity Strip messages**: Template-based with interpolated values; translate templates, not messages
- **Annotations**: Stored in owner language; translated on-read via existing `translatePage()` adapted for single-string translation
- **Facet content**: Uses existing section-level translation (same as current layouts)

### Existing Layout Handling

Monolith, Curator, Architect, Cinematic remain as "Classic" options in the layout picker. They continue to use the existing `PageRenderer` pipeline unchanged. Positioned as static CV alternatives for users who prefer a traditional format.

---

## Accessibility

- **Reduced motion**: All animations disabled via `prefers-reduced-motion: reduce` (tiles show static content, no flip)
- **Keyboard navigation**: Tiles focusable with `tabindex`, Enter/Space to expand, Escape to collapse
- **Screen readers**: Tile content exposed as a list with `aria-label` per tile. Inline expand uses `aria-expanded`. Facet navigation uses `aria-current`.
- **Color contrast**: All text meets WCAG AA against surface backgrounds (verified per presence combo)
- **Touch targets**: All interactive elements ≥44px (iOS HIG)

---

## Open Questions (to resolve during implementation)

1. **Tile ordering**: Should tiles have a fixed order or be agent-sortable based on profile archetype?
2. **Empty portrait**: What does a profile with 0-1 facts look like? Just name + bio + "Start a conversation" CTA?
3. **Avatar placement**: Where does the profile avatar appear in the portrait? In the name area? As a background element?
4. **Desktop composition**: Should the desktop version have a subtly different layout (e.g., name on left, tiles on right) or just scale up the mobile layout?
5. **SEO**: The no-scroll Layer 1 has minimal text content. Does this impact search indexing? Should we include hidden structured data?
6. **Transition animation specifics**: Exact easing curves, durations, and choreography for inline expand and facet transition TBD during prototyping.

---

## Success Metrics

- **Time to first interaction**: Visitor taps a tile within X seconds (target: <10s)
- **Facet exploration rate**: % of visitors who expand at least one tile (target: >40%)
- **Deep dive rate**: % of visitors who enter a full facet view (target: >15%)
- **Contact CTA clicks**: Baseline for future visitor chat demand validation
- **Bounce rate comparison**: Living Portrait vs. Classic layouts
- **Owner adoption**: % of eligible users who choose Living Portrait as their layout
