# OpenSelf - Execution Roadmap

Last updated: 2026-02-27
Planning horizon: rolling (update every sprint/iteration)

## 1) Goal

Move from "hardened MVP" to "dogfooding-ready product":
- core user flow must be robust and tested
- publish safety enforced end-to-end
- visual quality consistent across supported themes
- ready for 10+ testers to use without supervision

## 2) Prioritization Rules

When choosing work, apply this order:
1. Correctness and user trust (publish safety, data integrity)
2. End-to-end completion of existing features over adding new feature breadth
3. Developer velocity (clear contracts, tests, observability)
4. Expansion features (connectors, ecosystem)

## 3) Completed

### Phase 0.2.1 — Hardening (Done)

- **NOW-1**: Layout engine → Done (centered MVP; split/stack fallback to centered, Phase 1)
- **NOW-2**: Publish flow hardening → Done (3-state: draft → approval_pending → published, server-side gate)
- **NOW-3**: Theme alignment → Done (minimal + warm, centralized validation, AVAILABLE_THEMES constant)
- **NOW-4**: Preview state simplification → Done (idle + optimistic_ready, synthesis states removed)
- Auto-migration on DB init (no manual step), `_migrations` table, transactional
- Two-row page model with DB CHECK constraints
- Reserved username protection
- LLM-powered translation with hash-based cache (compose in factLanguage, translate to target)
- Role casing fix: lowercase job titles in bio prose (except German)
- 115 automated tests

### Phase 0 Gate — Dogfooding (Done)

- Deployed to Hetzner + Coolify, domain openself.dev live
- OAuth providers (Google, GitHub, Discord, LinkedIn, Twitter/X, Apple) implemented
- Standalone signup page
- Gate passed 2026-02-25
- Signup-before-publish flow: anonymous users must sign up before publishing (multi-user mode)
- Server-side publish auth gate: 403 for anonymous, username enforcement, atomic claim+publish
- Auth indicator + logout on builder and published page
- 340 automated tests (25 test files)

### Phase 1a — Agent Memory & Heartbeat (Done)

- **NEXT-1**: Agent memory (Tier 2 + Tier 3) → Done
  - Conversation summaries with CAS (race-safe compound cursor)
  - Meta-memory with dedup (SHA-256), quota (50), cooldown (DB-based), feedback (helpful/wrong)
  - Memory-aware context assembly (facts + soul + summaries + memories + conflicts in prompt)
- **NEXT-2**: History summarization in context budget → Done
  - 7500-token total budget with per-block allocation
  - Post-assembly iterative guard (truncate largest block by 20%)
  - Mode auto-detection (onboarding vs steady_state)
- **NEXT-3**: Worker scheduler wiring + Heartbeat → Done
  - Standalone worker process (tsup build, separate service)
  - 9 job handlers, atomic claim, 3-retry backoff
  - Dual-loop heartbeat (light daily, deep weekly)
  - Per-owner budget (DST-safe via Intl.DateTimeFormat)
  - Leader/follower bootstrap (DB_BOOTSTRAP_MODE env)
  - Soul profiles with versioned overlays and proposals
  - Trust ledger with undo_payload + transactional CAS reverse
  - Fact conflicts with source precedence + 3 resolution paths
- **NEXT-4**: SSE preview (replace polling) → Done
  - SSE endpoint /api/preview/stream with adaptive interval
  - Client fallback to polling after 5 errors
- OwnerScope: multi-session identity, anchor session, per-profile quota
- 206 automated tests (133 + 73 new)

### Layout Template Engine (Anticipated from Phase 1b — Done)

Layout template engine was originally planned as NEXT-8 in Phase 1b. It was anticipated
and implemented ahead of schedule as a standalone deliverable.

- **Layout Registry**: 3 templates (vertical, sidebar-left, bento-standard) with slot-based section placement
  - Slot definitions with size, capacity, accepted section types, desktop/mobile ordering
  - `resolveLayoutTemplate()` — no legacy mapping, always defaults to "vertical"
- **Widget Registry**: 20+ widget definitions with section type + slot size compatibility
  - `widgetId` as source of truth for variant resolution (replaces legacy `variant` field)
  - `getBestWidget()` for automatic widget selection based on section type + slot size
- **Renderer Decoupling**: ThemeLayout (visual wrapper only) + LayoutComponent (CSS Grid structure)
  - VerticalLayout reproduces original centered layout pixel-for-pixel
  - SidebarLayout: two-column responsive grid (7/5 split)
  - BentoLayout: magazine-style 6-column grid with varying card sizes
  - Mobile: all grids collapse to single column with `mobileOrder` from registry
- **Slot Assignment Engine**: lock-aware, deterministic section-to-slot assignment
  - Type routing: hero → heroSlot, footer → footerSlot (always, regardless of metadata)
  - Auto-repair: changes widget/slot only, never truncates user content
- **Lock System**: granular section locks (position/widget/content)
  - Two paths: agent `propose_lock` (pending proposal) vs user lock via authenticated API
  - Central enforcement via `canMutateSection()` policy
- **Validation Gates**: 4 points — composer, set_layout tool, update_page_config, publish pipeline
  - Severity policy: `missing_required`/`incompatible_widget` = error (blocking); `overflow_risk`/`too_sparse` = warning
  - Publish gate with `toSlotAssignments()` adapter distinguishes 400 (bad config) vs 500 (internal bug)
- **Schema Extensions**: `layoutTemplate` (top-level), `widgetId`, `slot`, `lock`, `lockProposal` on sections
- **Settings UI**: template picker in SettingsPanel; `POST /api/draft/style` accepts `layoutTemplate`
- **Agent Tools**: `set_layout` (change template + re-assign slots), `propose_lock` (pending lock proposal)
- **Normalization**: `normalizeConfigForWrite()` centralizes canonicalization for all write paths
- 62+ new layout-specific tests, 268 total (22 test files)

**Layout Phase 5 (deferred):**
- Heartbeat + memory integration for layout is intentionally postponed.
- **Start trigger:** after Phase 1 is closed and stabilized.
- Scope (high-level): lock-safe heartbeat mutations, preference memories for layout,
  proposal-first flow for locked sections, heartbeat-side validation/observability.
- Reference: `docs/ARCHITECTURE.md` §6.6.2.

### Phase 1b — Extended Sections (Done)

- **NEXT-5**: Education + Experience sections → Done
  - `experience` and `education` section types with typed content schemas
  - Timeline deprecated when `EXTENDED_SECTIONS=true` (progressive, not batch)
  - Content type definitions, validators, composer builders, React components
- **NEXT-6**: Additional section types → Done
  - Implemented: achievements, stats, reading, music, contact, languages, activities (+ custom)
  - 10 new React components in editorial-360 theme
  - 5 new widgets (experience-timeline, education-cards, languages-list, activities-list, activities-compact)
  - Layout registry `accepts` updated across all 3 templates
  - Taxonomy migration (0017): 6 new categories + aliases, hobby/hobbies remapped interest→activity
  - Contact visibility filter (only public/proposed facts), contact added to SENSITIVE_CATEGORIES
  - Feature flag: `EXTENDED_SECTIONS=true` env var (default OFF, canary rollout)
  - Agent tools updated with new category guidance
  - 46 new tests (314 total)

## 4) Now (High Priority)

### Phase 1: Living Agent

Phase 1 builds in dependency order: memory/heartbeat first, then extended sections,
then hybrid page personalization. Each sub-phase builds on the previous.

Phase 1a (memory/heartbeat) and Phase 1b (extended sections) are complete. Phase 1c
(hybrid page compiler) is next.

#### NEXT-7: Additional themes — bold, elegant, hacker

Deliverables:
1. CSS design tokens for each theme (light + dark)
2. Add to `AVAILABLE_THEMES` constant
3. Visual QA for all theme × colorScheme combinations

#### NEXT-8: Distinct layout implementations ✅ (Anticipated — Done)

**Completed ahead of schedule** as part of the Layout Template Engine work.
Superseded by a more comprehensive slot-based template system:
1. ~~Split layout: two-column with sidebar~~ → `sidebar-left` template (grid-cols-12, 7/5 split)
2. ~~Stack layout: full-width sections~~ → `vertical` template (reproduces original layout)
3. ~~CSS rules replace fallback-to-centered behavior~~ → CSS Grid layouts with `--md-order` for desktop reordering
4. ~~Layout-aware component variants~~ → Widget registry with slot-size-aware widget selection
5. **Additional**: `bento-standard` template (magazine-style 6-column grid) — not originally planned

### Phase 1c: Hybrid Page Compiler

Per-section LLM personalization, powered by the agent's accumulated memory.
This phase requires Phase 1a (memory) and Phase 1b (extended sections) to be complete.

#### NEXT-9: Per-section LLM personalizer

Deliverables:
1. LLM personalizer that rewrites section content using facts + agent memory
2. Per-section dispatch: only regenerate sections impacted by recent fact changes
3. Output validated against section content schema before merge
4. Fallback: keep deterministic skeleton content on personalizer failure
5. Personalizer budget tracking (extend `llm_usage_daily` accounting)

#### NEXT-10: Drill-down conversation pattern

Deliverables:
1. Agent detects when a topic has insufficient depth for a rich section
2. Agent asks follow-up questions before updating (e.g., "Tell me more about your
   master's — what was the focus? Any highlights?")
3. All additional facts stored in KB/memory regardless (useful for future context)
4. Section update triggers only after sufficient fact density

#### NEXT-11: Section copy cache

Deliverables:
1. Hash-based cache for personalized section content (same pattern as `translation_cache`)
2. Cache key: `SHA-256(section facts + agent memory snapshot) + section_type`
3. Cache hit → skip LLM call. Cache miss → personalize + store.
4. No explicit invalidation: fact changes → hash changes → old entries unused

#### NEXT-12: Periodic conformity check

Deliverables:
1. Heartbeat job reviews full page for cross-section style consistency
2. Checks: tone alignment, narrative coherence, no contradictions between sections
3. If drift detected: queue targeted section regenerations
4. Runs via heartbeat system, not on every page update

### Phase 1d: Other Phase 1 Items

#### NEXT-13: Media upload API and avatar end-to-end support

Deliverables:
1. Upload endpoint with MIME/size validation
2. Store media via existing service
3. Render avatar URL in hero section from stored media id

#### NEXT-14: Connector MVP (start with one connector)

Suggested first connector: GitHub (projects activity into facts)

#### NEXT-15: Public page translation for visitors

Deliverables:
1. Detect visitor language from `Accept-Language` header on `/{username}` route
2. If page language != visitor language, translate on-demand (same LLM pipeline)
3. Serve from `translation_cache` on repeat visits (same hash = instant)
4. Optional: translation banner "This page is originally in {language}. [View original]"
5. Optional: pre-translate top N languages on publish (background job)

Cost risk:
- Each unique (page content x language) pair costs one LLM call (~$0.001)
- 1,000 pages x 7 languages = ~$7.00 one-time (cached after first visit)
- Risk grows if supported languages expand or pages become very long
- Mitigated by: translation_cache (no repeated costs), llm_limits budget guardrails,
  hard cap on supported languages

### Deferred Until Phase 1 Closure

#### Layout Phase 5: Heartbeat + Memory Integration

Start condition:
1. Phase 1b, 1c, and 1d complete
2. Phase 1 stabilization complete

Scope:
1. Lock-safe heartbeat mutations (`canMutateSection` with actor `heartbeat`)
2. Memory-backed layout preferences (Tier 3 preference memories)
3. Proposal-first flow for locked sections (no direct override)
4. Heartbeat-side layout validation and dedicated observability events

Reference:
1. `docs/ARCHITECTURE.md` section 6.6.2

## 5) Later (Lower Priority)

1. ~~Auth + CSRF on publish endpoint~~ — Done (signup-before-publish + server-side auth gate)
2. Session persistence across browser reloads
3. Community component registry enforcement with certified workflow
4. Additional connector ecosystem
5. Advanced theming and design packs
6. Multi-profile / multi-tenant model if product direction requires it

## 6) Milestones

### Milestone A — Phase 0 Gate (Dogfooding)

Required:
1. Phase 0.2.1 complete ✅
2. `next build` passes ✅
3. 10+ testers complete onboarding
4. Critical bugs resolved

Outcome:
- OpenSelf is usable by real people for its core purpose

### Milestone B — Living Agent (Phase 1)

Required:
1. Phase 1a complete (memory, heartbeat, context assembly) ✅
2. Phase 1b complete (education + experience + at least 2 more section types) ✅
3. Phase 1c complete (hybrid personalizer, drill-down, conformity checks)
4. Phase 1d: at least avatar support + one connector

Outcome:
- The agent remembers users across sessions and writes personalized page copy
- Pages from different users are noticeably distinct in tone and narrative
- OpenSelf is credible as a living-page product, not just onboarding demo

## 7) Tracking Process

At each iteration:
1. Pick items from `Now` first
2. Implement + test
3. Update `docs/STATUS.md` and this roadmap
4. Add ADR when significant decisions are made

## 8) Documentation Ownership

1. `docs/ROADMAP.md` is the source of truth for sequencing and priorities.
2. `docs/STATUS.md` is the source of truth for runtime reality.
3. `docs/ARCHITECTURE.md` must stay focused on target architecture and stable contracts.
4. Historical extracted planning content is preserved in `docs/archive/`.
