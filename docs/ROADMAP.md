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
- 340 automated tests (25 test files) — now 617 (33 files) after quality/privacy + UAT hardening

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
- **Validation Gates**: 4 points — composer, set_layout tool, update_page_style, publish pipeline
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

### Quality, Privacy, Themes & Chat Context Hardening (Done)

Cross-cutting hardening pass across data quality, privacy, theming, and publish safety.
8 sub-phases, all complete. 263 new tests (603 total, 31 files).

1. **Fact validation gate** — `validateFactValue()` with per-category rules, placeholder rejection.
   Enforced at `createFact`/`updateFact` (service-level gate).
2. **Composer hardening + privacy** — Global visibility filter at `composeOptimisticPage` entry
   (public+proposed only). `update_page_style` renamed to `update_page_style` (metadata-only).
   Hero: deterministic localized fallback (no "Anonymous"/"Ciao"). `beautifyKey` removal.
   Empty item filtering (no placeholder URLs, no "—" stats). `experience` added to proposal allowlist.
3. **Visibility controls** — Actor-based transition matrix in `setFactVisibility`:
   assistant (proposed/private only), user (full on non-sensitive, private-only on sensitive).
   Agent tool: `set_fact_visibility`. User API: `POST /api/facts/[id]/visibility`.
   Every transition audit-logged via `logEvent`.
4. **Chat context integration** — `assembleContext` wired in `/api/chat/route.ts`, role normalization.
5. **CSS custom property theming** — `--theme-*` tokens in `globals.css` for minimal/warm/editorial-360.
   ThemeProvider in PageRenderer. All 18 section components converted to CSS custom properties.
6. **Shared canonical projection + publish safety** — `projectPublishableConfig()` (single source of
   truth for preview + publish). `filterPublishableFacts()` shared filter. Hash guard (`expectedHash`
   from frontend → publish endpoint). Username mismatch guard (publish mode only). Promote-all:
   proposed→public atomically in SQLite transaction. Preview/stream never serves raw `draft.config`.
7. **Draft sanitization script** — `scripts/sanitize-drafts.ts` (recompose all drafts from facts).
8. **Legacy fact cleanup script** — `scripts/cleanup-facts.ts` (validate and remove invalid facts).

### UAT Hardening — 10 Findings (Done)

First UAT session revealed 10 issues across builder UX, preview rendering, chat flow, fonts, and mobile.
All resolved. 14 new tests (617 total, 33 files).

1. **Builder banner (F1)** — `BuilderBanner` replaces `AuthIndicator` for authenticated users with
   published page. Shows "Live page" / "Share" / "Log out". `getPublishedUsername()` queries by session IDs.
2. **Hero tagline (F2)** — `buildHeroSection()` no longer repeats the name. Priority: explicit tagline →
   role → top interests → empty string. Hero components conditionally render tagline.
3. **Error telemetry (F3)** — `requestId` correlation through chat route → agent tools → log events.
   `X-Request-Id` header on all responses. Retry button in ChatPanel on stream error.
4. **Auth-aware quota UI (F4)** — `ChatPanel` receives `authState`. `LimitReachedUI` branches:
   published page link, publish CTA, OAuth username input, anonymous signup.
   New `POST /api/draft/request-publish` endpoint for chat-initiated publish.
5. **Dual-hash preview (F5)** — Split projection into `projectCanonicalConfig()` (all sections) +
   `publishableFromCanonical()` (completeness filter). Preview shows all; hash guard uses publishable.
6. **Agent prompt (F6)** — Publish suggestion rules + negative rule after page generation.
7. **Username pre-fill (F7)** — `SignupModal` + `PublishBar` sync `initialUsername` via `useEffect`.
8. **Visitor banner (F8)** — `VisitorBanner` on published pages for non-owners: "OpenSelf" + "Log in".
9. **Font (F9)** — editorial-360 heading from "Arial Narrow" to `var(--font-sans), system-ui, sans-serif`.
10. **Mobile sticky tabs (F10)** — `sticky top-0 z-40` on mobile TabsList.

Cross-cutting: Two-layer username validation (`validateUsernameFormat` + `validateUsernameAvailability`).
Merged `RESERVED_USERNAMES` includes `login`/`signup`.

## 4) Now (High Priority)

### Phase 1: Living Agent

Phase 1 builds in dependency order: memory/heartbeat first, then extended sections,
then hybrid page personalization. Each sub-phase builds on the previous.

Phase 1a (memory/heartbeat), Phase 1b (extended sections), and Phase 1c (hybrid page compiler) are complete.
Quality/Privacy/Themes hardening complete. UAT hardening (10 findings) complete.
Phase 1d (media/connectors/translation) is next.

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

### Phase 1c: Hybrid Page Compiler (Done)

Per-section LLM personalization, powered by the agent's accumulated memory.
25 commits, 17 new source files, 21 new test files. ADR-0010. Migration 0018 (3 new tables).
173 new tests (790 total, 54 files).

#### NEXT-9: Per-section LLM personalizer ✅ (Done)

Implemented:
1. `personalizeSections()` — LLM `generateObject` rewrites section content using facts + soul + memory
2. `detectImpactedSections()` — per-section hash comparison, only impacted sections trigger LLM calls
3. Output validated against Zod schemas (PERSONALIZABLE_FIELDS per section type, MAX_WORDS limits)
4. Graceful fallback: on personalizer failure, deterministic skeleton content is preserved
5. Budget: uses existing `llm_usage_daily` accounting and `llm_limits` guardrails
6. Three-layer data model: `section_copy_cache` (pure LLM cache), `section_copy_state` (active approved copy), `section_copy_proposals` (heartbeat proposals)
7. `mergeActiveSectionCopy()` projection bridge applies personalized copy after canonical projection (respects ADR-0009)
8. Fire-and-forget: `generate_page` tool triggers personalization asynchronously in `steady_state` mode only
9. `mergePersonalized()` text-only field merge (preserves non-text fields like arrays, objects)

#### NEXT-10: Drill-down conversation pattern ✅ (Done)

Implemented:
1. `classifySectionRichness()` classifies sections as thin/adequate/rich based on fact count thresholds
2. Agent context includes section richness block listing thin sections
3. Drill-down instructions in agent prompt guide follow-up questions before section updates
4. All additional facts stored in KB/memory regardless (useful for future context)

#### NEXT-11: Section copy cache ✅ (Done)

Implemented:
1. Content-addressed cache: `section_copy_cache` table with `(owner_key, section_type, facts_hash, soul_hash, language)` unique key
2. Cache hit → skip LLM call. Cache miss → personalize + store.
3. No explicit invalidation: fact changes → hash changes → old entries unused
4. TTL cleanup: `cleanupExpiredCache(maxAgeDays)` called in deep heartbeat

#### NEXT-12: Periodic conformity check ✅ (Done)

Implemented:
1. Two-phase LLM: `analyzeConformity()` detects cross-section issues → `generateRewrite()` produces fix
2. 4 issue types: `tone_mismatch`, `contradiction`, `narrative_incoherence`, `style_drift`
3. Max 3 issues per check (cost control)
4. Runs in deep heartbeat, not on every page update
5. Creates proposals via `createProposal()` for user review (not auto-applied)
6. Proposal API: `GET /api/proposals`, `POST /api/proposals/[id]/accept`, `POST /api/proposals/[id]/reject`, `POST /api/proposals/accept-all`
7. `ProposalBanner` UI component in builder SplitView
8. `markStaleProposals()` automatically marks proposals as stale when underlying state changes
9. Deep heartbeat also runs `cleanupExpiredCache(30)` for cache hygiene

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
3. Phase 1c complete (hybrid personalizer, drill-down, conformity checks) ✅
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
