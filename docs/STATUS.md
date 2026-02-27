# OpenSelf - Project Status

Last updated: 2026-02-27
Snapshot owner: engineering

## 1) Executive Summary

OpenSelf has a working MVP with a hardened core flow:
- Full onboarding loop: chat → fact extraction → page generation → live preview → publish
- Two-row page model: draft and published coexist, editing never breaks the live page
- Server-side publish gate: agent proposes, user confirms via explicit action
- Centralized theme validation: 3 themes (minimal, warm, editorial-360), single source of truth
- Simplified preview state machine: idle + optimistic_ready
- Chat resilience: no reset on mobile tab switch; DB-backed history restore on page refresh
- 846 automated tests passing (60 test files)
- 3-tier memory (summaries + meta-memory), soul profiles, worker process, SSE preview, fact conflicts, trust ledger
- Layout template engine: 3 templates (vertical, sidebar-left, bento-standard), slot-based section assignment, widget registry, lock system, validation gates
- Extended sections: 18 section types (experience, education, languages, activities + all stub types implemented), feature-flagged via `EXTENDED_SECTIONS` env var
- Signup-before-publish: anonymous users must sign up before publishing (multi-user mode)
- Builder banner: authenticated users see "Live page" / "Share" / "Log out" in builder; visitors see "OpenSelf" + "Log in" on published pages
- Dual-hash preview: builder shows all sections (including incomplete), publish hash only covers complete sections
- Hero tagline deduplication: uses role/interests instead of repeating the name
- Auth-aware quota UI: 4 branches (published page link, publish CTA, OAuth username input, anonymous signup)
- Request-publish endpoint: lightweight `/api/draft/request-publish` for chat-initiated publish flow
- Error telemetry: request correlation IDs (`X-Request-Id`) + retry button on chat stream errors
- Mobile sticky tabs: tab bar stays fixed on scroll
- SQLite test stability: removed flaky `database is locked` failures in parallel Vitest runs (per-worker DB isolation + FTS-safe migration runner)
- Privacy-by-architecture: shared canonical projection ensures private facts never enter page config
- Fact validation gate: per-category rules reject invalid/placeholder values at write time
- Visibility controls: actor-based transition matrix with user API and agent tool
- Publish safety: hash guard, promote-all (proposed→public atomically), username mismatch guard
- CSS custom property theming: 3 themes powered by `--theme-*` tokens
- Chat context integration: `assembleContext` wired with role normalization
- Hybrid page compiler: per-section LLM personalizer with cache, state management, and projection bridge
- Drill-down conversation: section richness classifier triggers agent follow-up questions before thin sections
- Conformity checks: heartbeat-driven cross-section style consistency analysis with proposal-based rewrites
- Proposal review system: API + UI for user acceptance/rejection of conformity proposals
- Heartbeat scheduler: auto-enqueues daily/weekly heartbeat jobs per owner timezone with catch-up and recovery
- Layout redesign: hero two-column layout with ContactBar (social, email, languages), At a Glance fused section (stats + grouped skills + interests), CollapsibleList for long sections, D5 intelligent section ordering
- Contact user-controlled: removed from SENSITIVE_CATEGORIES, contact facts follow standard public/proposed/private transitions
- Profile archetype detection: deterministic classification (developer/designer/executive/student/creator/generalist) injected into agent context for layout intelligence
- Vertical magazine redesign: luxury digital magazine aesthetic for vertical layout — unified `.section-label` headers with accent bar, scroll reveal animations, variable vertical rhythm, dot separators, hover-underline-grow links, warm theme WCAG AA contrast fix

Phase 0.2.1 (Hardening) is complete. Phase 0 Gate (dogfooding) passed. Phase 1a (Memory, Soul & Heartbeat) complete. Layout Template Engine (anticipated from Phase 1b) complete. Phase 1b (Extended Sections) complete. Signup-before-publish flow implemented. Quality, Privacy, Themes & Chat Context hardening complete. UAT hardening (10 findings) complete. Phase 1c (Hybrid Page Compiler) complete. Layout Redesign complete. Vertical Magazine Redesign complete.

## 2) Implemented Today

### Product Surface

| Area | Status | Notes |
|---|---|---|
| `/` Landing page | Done | CTA to builder |
| `/builder` flow | Done | Language picker + chat/preview split view |
| `/:username` public page | Done | Renders only published `PageConfig` |
| Not found UX | Done | Dedicated username not-found page |
| Publish confirmation UI | Done | Publish bar appears when agent requests publish |
| Signup-before-publish | Done | Anonymous users see signup modal; authenticated users publish directly with redirect |
| Builder banner | Done | Authenticated builder: "Live page" / "Share" / "Log out". Fallback to simple auth indicator when no published page |
| Visitor banner | Done | Published pages show "OpenSelf" + "Log in" for non-owners (logged out and visitors) |
| Mobile sticky tabs | Done | Chat/Preview tab bar stays fixed at top on mobile scroll |

### Chat and Agent

| Capability | Status | Notes |
|---|---|---|
| Streaming AI chat | Done | `useChat` + `/api/chat` |
| Tool-calling agent | Done | 15 tools: Fact CRUD, set_fact_visibility, page generation, update_page_style, request_publish, reorder, theme, set_layout, propose_lock, save_memory, propose_soul_change, resolve_conflict. Structured schema reference in prompt + `experimental_repairToolCall` for automatic recovery from invalid tool arguments |
| Language-aware onboarding prompt | Done | Language propagated to prompt and composer |
| Publish gate enforcement | Done | `request_publish` tool (agent proposes) + `POST /api/publish` (user confirms) + `POST /api/draft/request-publish` (chat-initiated publish) |
| LLM-powered content translation | Done | Composes in factLanguage, translates to target via generateText, cached in translation_cache |
| Translation cache | Done | Hash-based, no explicit invalidation, eliminates repeated LLM calls |
| Steady-state mode switching | Done | Mode auto-detected via fact count + published page check |
| Context assembly + token budgets | Done | 7500-token budget, per-block allocation, post-assembly guard |
| Agent memory (Tier 3 meta-observations) | Done | save_memory tool, dedup, quota (50), cooldown, feedback |
| Soul profiles + proposals | Done | propose_soul_change tool, user review API, 48h TTL |
| Fact conflict detection + resolution | Done | resolve_conflict tool, user API, auto-expire |

### Data and Persistence

| Capability | Status | Notes |
|---|---|---|
| SQLite schema + migrations | Done | Auto-run on DB init, `_migrations` table, transactional |
| Two-row page model | Done | draft + published rows, DB CHECK constraints |
| Facts KB CRUD + taxonomy normalization | Done | Alias mapping and pending categories |
| Visibility policy engine | Done | Actor-based transition matrix (assistant: proposed/private; user: full on non-sensitive; sensitive: private only). Contact category is user-controlled (removed from SENSITIVE_CATEGORIES). API: `POST /api/facts/[id]/visibility`. Agent tool: `set_fact_visibility`. Audit logged. |
| Fact validation gate | Done | Per-category value rules, placeholder rejection, enforced at `createFact`/`updateFact` |
| Event logging | Done | agent_events + trust_ledger (reversible audit trail) |
| Conversation summaries (Tier 2) | Done | CAS-based rolling summaries, compound cursor, medium-tier LLM |
| Owner scoping (OwnerScope) | Done | Multi-session identity, anchor session, per-profile quota |
| Soul profiles storage | Done | Versioned overlays, unique active constraint |
| Fact conflicts storage | Done | Dedicated table, source precedence, 3 resolution paths |
| Trust ledger | Done | Undo payload at write time, transactional CAS reverse |
| Schema versioning | Done | schema_meta table, leader/follower bootstrap mode |
| Chat history rehydration | Done | `ChatPanel` loads `GET /api/messages` on mount before `useChat` initialization |

### Page Engine and UI

| Capability | Status | Notes |
|---|---|---|
| Optimistic page composition from facts | Done | Deterministic skeleton: 19 section types from facts (18 original + at-a-glance). Type-safe section builders with proper type guards. Hero: two-column layout with ContactBar (social links, email, languages). At a Glance: fused stats + grouped skills + interests. D5 section ordering when `EXTENDED_SECTIONS=true`. CollapsibleList for experience, projects, achievements, education. Extended sections gated by `EXTENDED_SECTIONS` env var. |
| Hybrid LLM personalizer | Done | Per-section LLM rewrite (facts + soul + memory → personalized copy). Three-layer data model: `section_copy_cache` (pure LLM cache), `section_copy_state` (active approved copy), `section_copy_proposals` (heartbeat proposals). `mergeActiveSectionCopy()` projection bridge. Fire-and-forget in `generate_page` (steady_state only). Hash guard (factsHash + soulHash) for staleness. |
| Drill-down conversation | Done | `classifySectionRichness()` detects thin sections (< threshold items). Agent context includes section richness block + drill-down instructions. Agent asks follow-up questions before updating thin sections. |
| Conformity checks | Done | `analyzeConformity()` + `generateRewrite()` two-phase LLM. Runs in deep heartbeat. Max 3 issues per check. Creates proposals for user review. |
| Proposal review system | Done | `createProposal` / `acceptProposal` / `rejectProposal` / `markStaleProposals`. API: `GET /api/proposals`, `POST accept/reject/accept-all`. ProposalBanner UI in builder. |
| Preview API (SSE + fallback polling) | Done | SSE via /api/preview/stream, fallback after 5 errors. Dual-hash: `projectCanonicalConfig()` for display (all sections), `publishableFromCanonical()` for hash guard. Never serves raw `draft.config` |
| Theme switch in preview | Done | `minimal`, `warm`, and `editorial-360` + light/dark, CSS custom property tokens (`--theme-*`), centralized validation |
| Shared canonical projection | Done | Three-layer projection: `projectCanonicalConfig()` (all sections), `publishableFromCanonical()` (completeness filter), `projectPublishableConfig()` (wrapper). `filterPublishableFacts()` shared privacy filter. |
| Publish pipeline safety | Done | Hash guard (expectedHash from frontend), promote-all (proposed→public atomically), username mismatch guard (publish mode only) |
| Section completeness filter | Done | `filterCompleteSections()` in renderer for published pages. Hero/footer always pass. |
| Layout template engine | Done | 3 templates (vertical, sidebar-left, bento-standard) with slot-based section assignment, widget registry, validation gates. Anticipated from Phase 1b. |
| Public page sections renderer | Done | All 19 section types rendered (hero, bio, skills, projects, timeline, interests, social, footer + experience, education, achievements, stats, reading, music, languages, activities, contact, custom, at-a-glance) |
| Mobile tab chat state retention | Done | `TabsContent` uses `forceMount` + `data-[state=inactive]:hidden` to keep `ChatPanel` mounted |

### Safety, Budget, Reliability

| Capability | Status | Notes |
|---|---|---|
| Rate limiting | Done | Per-IP + pacing constraints |
| Usage accounting and budget guardrails | Done | Daily token/cost checks |
| Async worker queue | Done | Standalone worker (tsup build), 9 handlers, atomic claim, health-check, heartbeat scheduler |
| Per-profile message quota | Done | Atomic counter (profile_message_usage), 200 limit for auth users |
| Heartbeat engine | Done | Dual-loop (light daily, deep weekly), per-owner budget (DST-safe) |
| Heartbeat scheduler | Done | Auto-enqueues heartbeat jobs for active owners every 15 min. Light: daily at 3 AM owner tz (catch-up). Deep: Sunday 3 AM (catch-up) + Monday recovery. Anti-overlap lock. ISO-week DST-safe. |
| SQLite test stability hardening | Done | Parallel Vitest workers use isolated DB files (`openself.test-worker-<id>.db`). Migration runner applies `CREATE VIRTUAL TABLE` migrations outside explicit transactions to avoid fresh-DB failures. |
| Reserved username protection | Done | `draft`, `api`, `builder`, `admin`, `_next`, `login`, `signup` blocked. Two-layer validation: `validateUsernameFormat()` (pure) + `validateUsernameAvailability()` (server, DB check) |
| Publish auth gate (multi-user) | Done | Anonymous blocked (403), username enforced from auth context, atomic claim+publish |

### Media

| Capability | Status | Notes |
|---|---|---|
| Media retrieval route | Done | `/api/media/[id]` returns stored blobs |
| Avatar upload service function | Done (service layer) | No public upload API endpoint yet |

## 3) What Is Not Done Yet

### Phase 1a — Agent Memory & Heartbeat ✅

All items complete. See Section 2 for implementation details.

### Layout Template Engine (Anticipated from Phase 1b) ✅

Layout template engine anticipated and completed ahead of Phase 1b. Includes:
1. 3 layout templates: vertical, sidebar-left, bento-standard
2. Slot-based section assignment with capacity constraints
3. Widget registry (20+ widgets with slot compatibility)
4. Renderer decoupling: ThemeLayout = visual wrapper, LayoutComponent = grid structure
5. Granular section lock system (position/widget/content, user locks vs agent proposals)
6. Layout validation gates at 4 points (composer, set_layout tool, update_page_style, publish pipeline)
7. Settings UI with template picker
8. Agent tools: `set_layout`, `propose_lock`
9. 62+ new layout-specific tests

**Deferred follow-up (Layout Phase 5):**
- Heartbeat + memory integration for layout is **not** part of the current done scope.
- It starts only **after Phase 1 closure**.
- Planned scope: lock-safe heartbeat mutations, memory-backed layout preferences,
  proposal-first behavior on locked sections, heartbeat-side layout validation.
- Detailed design: `docs/ARCHITECTURE.md` §6.6.2.

### Phase 1b — Extended Sections ✅

All items complete. Includes:
1. 4 new `ComponentType` values: `experience`, `education`, `languages`, `activities` (total: 18 types)
2. 10 content type definitions with typed schemas and lenient validators
3. 10 React components in editorial-360 theme (Experience, Education, Achievements, Stats, Reading, Music, Languages, Activities with compact variant, Contact, Custom)
4. 5 new widgets (experience-timeline, education-cards, languages-list, activities-list, activities-compact) + layout registry accepts updated
5. 9 builder functions in page-composer with L10N for 8 languages
6. Feature flag: `EXTENDED_SECTIONS=true` env var (default OFF, canary rollout)
7. Taxonomy migration (0017): 6 new categories + aliases, hobby/hobbies remapped interest→activity
8. Contact visibility filter: only public/proposed facts compose into contact section
9. Timeline deprecated when flag ON (experience + education generated instead)
10. Agent tools updated with new category guidance + set_theme drift fixed
11. 46 new tests (314 total)

**Remaining from original Phase 1b scope:**
- Bold/elegant/hacker themes (deferred to NEXT-7)

### Quality, Privacy, Themes & Chat Context Hardening ✅

All items complete. 8 sub-phases:
1. **Fact validation gate** — per-category `validateFactValue()` rules, placeholder rejection, enforced at `createFact`/`updateFact`
2. **Composer hardening** — global visibility filter at composer entry, `update_page_config` renamed to `update_page_style` (metadata-only), hero deterministic fallback (no "Anonymous"), `beautifyKey` removal, empty item filtering
3. **Visibility controls** — actor-based transition matrix (`setFactVisibility`), agent tool `set_fact_visibility` (proposed/private only), user API `POST /api/facts/[id]/visibility`, audit logging
4. **Chat context integration** — `assembleContext` wired in chat route, role normalization whitelist
5. **CSS custom property theming** — `--theme-*` tokens for all 3 themes in `globals.css`, `ThemeProvider` in PageRenderer, all 18 section components converted
6. **Shared canonical projection** — `projectPublishableConfig()` as single source of truth for preview+publish, `filterPublishableFacts()`, hash guard (`expectedHash`), username mismatch guard, promote-all (proposed→public atomically)
7. **Draft sanitization** — `scripts/sanitize-drafts.ts` (recompose all drafts from facts, idempotent)
8. **Legacy fact cleanup** — `scripts/cleanup-facts.ts` (validate all facts, remove invalid entries)
- 263 new tests (603 total, 31 files)

### UAT Hardening (10 Findings) ✅

All items complete. 10 findings from first UAT session, addressing builder UX, preview rendering, chat flow, fonts, and mobile:

1. **F1 Builder banner** — `BuilderBanner` replaces `AuthIndicator` for authenticated users with published page. Shows "Live page" / "Share" / "Log out". `getPublishedUsername()` in page-service queries by session IDs.
2. **F2 Hero tagline deduplication** — `buildHeroSection()` no longer repeats the name. New priority: explicit tagline → role (identity/experience) → top interests → empty string. Hero components conditionally render tagline.
3. **F3 Error telemetry** — `requestId` (crypto.randomUUID) in chat route, passed to `createAgentTools()`, included in all tool error logs. `X-Request-Id` header on all responses. Retry button in ChatPanel on stream error.
4. **F4 Auth-aware quota UI** — `ChatPanel` receives `authState` prop. `LimitReachedUI` has 4 branches: published page link, publish CTA, OAuth username input, anonymous signup form. New `POST /api/draft/request-publish` endpoint.
5. **F5 Dual-hash preview** — Split `projectPublishableConfig()` into `projectCanonicalConfig()` (all sections) + `publishableFromCanonical()` (completeness filter). Preview shows all sections; hash guard uses publishable hash. `previewMode={true}` on PageRenderer skips safety-net re-filter.
6. **F6 Agent prompt** — Added publish suggestion rules + negative rule ("never end with 'let me know'") after page generation.
7. **F7 Username pre-fill** — `SignupModal` and `PublishBar` sync `initialUsername` via `useEffect` (handles late updates from `request_publish`).
8. **F8 Visitor banner** — `VisitorBanner` on published pages for non-owners: "OpenSelf" + "Log in". Shown when `!isOwner && !previewMode`.
9. **F9 Font** — editorial-360 heading font changed from "Arial Narrow" to `var(--font-sans), system-ui, sans-serif` (rounded, still distinct CSS value from minimal).
10. **F10 Mobile sticky tabs** — `sticky top-0 z-40` on TabsList in SplitView.
- Two-layer username validation: `validateUsernameFormat()` (pure, in `usernames.ts`) + `validateUsernameAvailability()` (server, in `username-validation.ts`). Merged `RESERVED_USERNAMES` set includes `login`/`signup`.
- 14 new tests (617 total, 33 files)

### Phase 1c — Hybrid Page Compiler ✅

All items complete. Includes:
1. **Per-section LLM personalizer** — `personalizeSections()` uses `generateObject` with facts + soul + memory context. Output validated against Zod schemas (PERSONALIZABLE_FIELDS per section type, MAX_WORDS limits). Fallback: deterministic skeleton on failure.
2. **Three-layer data model** — `section_copy_cache` (pure LLM output cache, content-addressed), `section_copy_state` (active approved copy, read by projection), `section_copy_proposals` (heartbeat proposals for user review). Migration 0018.
3. **Projection bridge** — `mergeActiveSectionCopy()` applies personalized copy AFTER `projectCanonicalConfig()`. Hash guard: factsHash + soulHash must match for personalized copy to be used; stale → deterministic fallback. Respects ADR-0009 (deterministic base is always truth).
4. **Impact detector** — `detectImpactedSections()` compares current facts hash per section against stored state. Only impacted sections trigger LLM calls.
5. **Fire-and-forget personalization** — `generate_page` tool triggers personalization asynchronously in steady_state mode only. No blocking of page generation.
6. **Drill-down conversation** — `classifySectionRichness()` detects thin sections. Agent context includes richness block + drill-down instructions. Agent asks follow-up questions before updating thin sections.
7. **Section copy cache** — Hash-based (factsHash + soulHash), per-section per-language. TTL cleanup via `cleanupExpiredCache()`.
8. **Conformity analyzer** — Two-phase LLM: `analyzeConformity()` (detect issues) → `generateRewrite()` (produce fix). Max 3 issues per check. 4 issue types: tone_mismatch, contradiction, narrative_incoherence, style_drift.
9. **Proposal service** — Factory pattern with CRUD + guards (STALE_PROPOSAL when state has changed, STATE_CHANGED for hash mismatch). `markStaleProposals()` for cleanup.
10. **Proposal API** — `GET /api/proposals` (pending for owner), `POST /api/proposals/[id]/accept`, `POST /api/proposals/[id]/reject`, `POST /api/proposals/accept-all`.
11. **Proposal UI** — `ProposalBanner` component in builder SplitView. Shows pending count, accept/reject per proposal, accept-all shortcut.
12. **Deep heartbeat integration** — Conformity check → create proposals, `markStaleProposals()`, `cleanupExpiredCache(30)`.
13. **Personalizer budget** — Uses existing `llm_usage_daily` accounting. LLM calls go through standard budget guardrails.
- ADR-0010: Personalization Layer architecture decision
- 173 new tests (790 total, 54 files)

### Layout Redesign ✅

All items complete. Includes:
1. **Hero two-column layout** — `clamp(1.8rem, 4vw, 3rem)` font sizing, `md:grid-cols-2` layout, no name truncation
2. **ContactBar in hero** — Social links, contact email (public > proposed priority), and languages absorbed into hero when `EXTENDED_SECTIONS=true`. Standalone social/contact/languages sections suppressed.
3. **Contact user-controlled** — Removed from `SENSITIVE_CATEGORIES`, added to `PROPOSAL_ALLOWLIST`. Contact facts follow standard public/proposed/private transitions.
4. **At a Glance section** — New `at-a-glance` ComponentType fusing stats + grouped skills + interests. `SKILL_DOMAINS` dictionary for deterministic grouping. Replaces standalone skills/stats/interests when extended.
5. **CollapsibleList** — Reusable `"use client"` component for long sections (threshold: 3+). Integrated into experience, projects, achievements, education.
6. **D5 section ordering** — Extended mode: hero → bio → at-a-glance → experience → projects → education → achievements → reading → music → activities → footer. Legacy order preserved when flag off.
7. **Profile archetype detection** — `detectArchetype()` classifies developer/designer/executive/student/creator/generalist from facts. Injected into agent context as layout intelligence.
8. **Personalization integration** — `at-a-glance` registered in `PERSONALIZABLE_FIELDS` and `SECTION_FACT_CATEGORIES`.
9. **Bug fixes** — Proposals API 500 (`this` context loss), skills duplicate heading, social copyright double footer, bio alignment.
10. **8-language localization** — `atAGlanceLabel` added to all 8 language L10N objects.
- 56 new tests (846 total, 60 files)

### Vertical Magazine Redesign ✅

All items complete. Transforms the vertical layout template from document-style resume into a luxury digital magazine experience (Stripe/Linear aesthetics). 15 tasks, 22 files modified, CSS-first approach.

1. **CSS foundation** — New design tokens (`--reveal-distance`, `--reveal-duration`, `--reveal-easing`), `.section-label` class with accent bar `::before`, `.entry-dot-separator`, `.theme-reveal`/`.revealed` scroll animations, hero stagger keyframes, `.hover-underline-grow`, `prefers-reduced-motion` overrides
2. **Hero redesign** — Magazine typography (`clamp(2.5rem, 5vw, 3.75rem)`, `tracking-[-0.03em]`), tagline below name, social links with dot separators and `hover-underline-grow`, stagger animations
3. **Unified section headers** — 20 h2 elements across 17 components replaced with `.section-label` (11px uppercase, `letter-spacing: 0.2em`, accent bar)
4. **Variable vertical rhythm** — VerticalLayout rewritten with section-type-aware spacing: hero 80px, narrative 48px, dense 32px. Uses `findLastIndex` for last-before-footer detection
5. **Component redesigns** — Stats (large light numbers, no borders), Skills (text-only with hover-underline, rounded-md chips variant), Experience/Education/Achievements (typographic hierarchy, dot separators, `max-w-2xl` entries), Bio (xl text, leading-loose, typographic quotes variant), Footer (centered 64px rule, colophon), Interests (text-only), Projects (compact with dot separators)
6. **Scroll reveal** — IntersectionObserver adds `revealed` class (CSS-driven transitions), inline transition classes removed from all components
7. **Warm theme contrast** — `--page-fg-secondary` adjusted from `#8b7e6a` to `#6b5e4a`, `--page-footer-fg` from `#b5a998` to `#9a8d7c` (WCAG AA compliance)
- Design doc: `docs/plans/2026-02-27-vertical-template-magazine-redesign.md`
- Implementation plan: `docs/plans/2026-02-27-vertical-template-magazine-implementation.md`
- No new tests (visual-only changes, 846 existing tests pass)

### Phase 1d — Other Phase 1
1. Media upload API and avatar end-to-end support
2. Connector MVP (GitHub)
3. Public page auto-translation for visitors (on-demand + cached)

### Later
1. ~~Auth + CSRF on publish endpoint~~ — Done (signup-before-publish + server-side auth gate)
2. Full builder UI persistence across browser reloads (beyond chat history)
3. Community component registry enforcement
4. Additional connector ecosystem
5. Multi-profile / multi-tenant model

## 4) Layout Count (Requested Snapshot)

Page web layout counts at current code state:
- Layout templates: 3 (`vertical`, `sidebar-left`, `bento-standard`) — all fully functional
- Legacy `style.layout` field (`centered`, `split`, `stack`): retained for backward compat but ignored for layout resolution; canonicalized to `"centered"` when `layoutTemplate` is present
- Default without explicit `layoutTemplate`: vertical (renders identically to the original centered layout)

Builder interface layouts (chat experience):
- Desktop split view: 1
- Mobile tab view: 1
- Settings panel: template picker with 3 options

## 5) Test and Quality Snapshot

- Automated tests: 846 passed / 846 total (Vitest, 60 test files)
- Flaky local lock issue fixed: targeted stress run of parallel DB-writing suites (memory/soul/trust-conflicts) passes consistently after fix.
- Covered areas:
  1. Fact-to-section composition behavior + role casing + extended builders (32 tests)
  2. PageConfig validation behavior + extended section validators (28 tests)
  3. Rate-limit behavior (6 tests)
  4. Layout and theme validation + set_theme editorial-360 (9 tests)
  5. Publish flow — tool level, service level, metadata-only update_page_style (15 tests, mocked)
  6. Page service integration — real SQLite in-memory DB (18 tests)
  7. Translation — LLM translation + cache behavior (18 tests)
  8. Owner scope — multi-session anchor, quota, migration bootstrap (12 tests)
  9. Context assembler — mode detection, token budgets, message trimming (19 tests)
  10. Memory service — CRUD, dedup, quota, cooldown, feedback (15 tests)
  11. Soul service — versioning, proposals, review, expire (12 tests)
  12. Trust ledger + conflicts + heartbeat config (15 tests)
  13. Layout registry — template lookup, fallback, no legacy mapping + new type accepts (18 tests)
  14. Layout widgets — widget compatibility, getBestWidget, resolveVariant + new widgets + adapter legacy map (25 tests)
  15. Layout quality — severity policy, error/warning split (9 tests)
  16. Group slots — type routing, slot fallback, capacity limits (9 tests)
  17. Assign slots — assignment, locks, no-truncate, post-assign invariant (8 tests)
  18. Lock policy — canMutateSection for all actor/lock combinations (11 tests)
  19. Publish pipeline layout gate — status mapping, adapter integration (2 tests)
  20. Auth session rotation — endpoint resolution after login rotation (20 tests)
  21. Auth service — user creation, password hashing (3 tests)
  22. KB session isolation — fact CRUD scoping (9 tests)
  23. Publish auth gate — anonymous block, username resolution, atomic claim+publish (6 tests)
  24. Fact validation — per-category rules, placeholder rejection, URL/email validation (37 tests)
  25. Fact visibility — transition matrix, actor enforcement, sensitive categories, audit log (27 tests)
  26. Section completeness — isSectionComplete, filterCompleteSections, publish pipeline integration (61 tests)
  27. Preview privacy — private fact exclusion, sensitive category exclusion, legacy draft override, hash determinism (6 tests)
  28. Publish pipeline — always-recompose, promote-all, hash guard, username mismatch, sensitive exclusion (13 tests)
  29. Theme tokens — CSS custom property validation, ThemeProvider, 3-theme coverage (15 tests)
  30. Fact extraction — hero tagline (role/interests/empty), empty item filtering, beautifyKey removal (24 tests)
  31. Chat context — assembleContext integration, role normalization (8 tests)
  32. Dual-hash preview — canonical vs publishable projection, section filtering, output equivalence (3 tests)
  33. Request-publish endpoint — auth/no-auth, username resolution, reserved/invalid/taken validation (9 tests)
  34. Personalizer schemas — PERSONALIZABLE_FIELDS, MAX_WORDS, Zod validation (13 tests)
  35. Personalization hashing — computeHash, computeSectionFactsHash, SECTION_FACT_CATEGORIES (11 tests)
  36. Section cache service — get/set/cleanup cache, TTL expiry (7 tests)
  37. Section copy state service — CRUD, hash-guarded reads, getAllActiveCopies (10 tests)
  38. Personalization merge — text-only field merge, non-text preservation (8 tests)
  39. Impact detector — per-section hash comparison, selective regeneration (6 tests)
  40. Section personalizer — LLM generateObject, cache hit/miss, fallback on failure (12 tests)
  41. Personalization projection — mergeActiveSectionCopy, hash staleness, fallback (9 tests)
  42. Section richness — classifySectionRichness, thin/adequate thresholds (7 tests)
  43. Preview personalization — personalized copy in preview/stream routes (5 tests)
  44. Conformity analyzer — analyzeConformity, generateRewrite, issue types (10 tests)
  45. Proposal service — CRUD, staleness detection, accept with guards (12 tests)
  46. Proposal API — GET pending, POST accept/reject/accept-all (10 tests)
  47. Heartbeat conformity — deep heartbeat conformity check integration (14 tests)
  48. Personalizer pipeline — full flow integration, stale hash, impact, conformity (4 tests)
  49. Drizzle schema — section_copy tables, indexes (5 tests)
  50. Publish personalization — mergeActiveSectionCopy in publish pipeline (5 tests)
  51. Tool personalization — fire-and-forget in generate_page, mode gating (5 tests)
  52. Context richness — section richness block in assembleContext (3 tests)
  53. Agent tools mode — mode parameter widening, heartbeat compatibility (3 tests)
  54. Personalizer budget — LLM usage accounting integration (2 tests)
  55. Heartbeat scheduler — getActiveOwnerKeys, ISO week, hasRunToday/Week, scheduler tick enqueue/skip/recovery/anti-overlap (32 tests)
  56. At-a-glance composer — skill grouping, section fusion, label hiding (4 tests)
  57. Hero ContactBar — social/email/language injection, section elimination, email priority (5 tests)
  58. Section order — D5 ordering constraint verification (1 test)
  59. Contact visibility — sensitivity removal, proposal allowlist, visibility transitions (8 tests)
  60. At-a-glance completeness — stats/skillGroups/interests validation (5 tests)
- Current gaps in tests:
  1. End-to-end browser integration tests
  2. Connector and worker lifecycle integration

## 6) Definition of Done (Project-Level)

For a feature to move to "Done", all must be true:
1. Code path implemented end-to-end (UI/API/service/data where relevant)
2. Behavior tested (unit/integration/e2e level proportional to risk)
3. Status updated in this file
4. If architecture changed, `docs/ARCHITECTURE.md` updated
5. If an important technical decision was made, a new ADR is added

## 7) Status Update Rules

1. Update this file when implementation reality changes.
2. Keep this file factual and short-lived (current-state truth).
3. Do not use this file for long-term design rationale (use ADRs).
4. Keep sequencing and priorities in `docs/ROADMAP.md`, not here.
