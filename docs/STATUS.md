# OpenSelf - Project Status

Last updated: 2026-02-26
Snapshot owner: engineering

## 1) Executive Summary

OpenSelf has a working MVP with a hardened core flow:
- Full onboarding loop: chat → fact extraction → page generation → live preview → publish
- Two-row page model: draft and published coexist, editing never breaks the live page
- Server-side publish gate: agent proposes, user confirms via explicit action
- Centralized theme validation: 3 themes (minimal, warm, editorial-360), single source of truth
- Simplified preview state machine: idle + optimistic_ready
- Chat resilience: no reset on mobile tab switch; DB-backed history restore on page refresh
- 314 automated tests passing (22 test files)
- 3-tier memory (summaries + meta-memory), soul profiles, worker process, SSE preview, fact conflicts, trust ledger
- Layout template engine: 3 templates (vertical, sidebar-left, bento-standard), slot-based section assignment, widget registry, lock system, validation gates
- Extended sections: 18 section types (experience, education, languages, activities + all stub types implemented), feature-flagged via `EXTENDED_SECTIONS` env var

Phase 0.2.1 (Hardening) is complete. Phase 0 Gate (dogfooding) passed. Phase 1a (Memory, Soul & Heartbeat) complete. Layout Template Engine (anticipated from Phase 1b) complete. Phase 1b (Extended Sections) complete.

## 2) Implemented Today

### Product Surface

| Area | Status | Notes |
|---|---|---|
| `/` Landing page | Done | CTA to builder |
| `/builder` flow | Done | Language picker + chat/preview split view |
| `/:username` public page | Done | Renders only published `PageConfig` |
| Not found UX | Done | Dedicated username not-found page |
| Publish confirmation UI | Done | Publish bar appears when agent requests publish |

### Chat and Agent

| Capability | Status | Notes |
|---|---|---|
| Streaming AI chat | Done | `useChat` + `/api/chat` |
| Tool-calling agent | Done | Fact CRUD, page generation, request_publish, reorder, theme, set_layout, propose_lock |
| Language-aware onboarding prompt | Done | Language propagated to prompt and composer |
| Publish gate enforcement | Done | `request_publish` tool (agent proposes) + `POST /api/publish` (user confirms) |
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
| Visibility policy engine | Done | Sensitive categories handled |
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
| Optimistic page composition from facts | Done | Deterministic skeleton: 18 section types from facts. Extended sections (experience, education, languages, activities, achievements, stats, reading, music, contact) gated by `EXTENDED_SECTIONS` env var. Hybrid LLM personalizer planned for Phase 1c. |
| Preview API (SSE + fallback polling) | Done | SSE via /api/preview/stream, fallback after 5 errors |
| Theme switch in preview | Done | `minimal`, `warm`, and `editorial-360` + light/dark, centralized validation |
| Layout template engine | Done | 3 templates (vertical, sidebar-left, bento-standard) with slot-based section assignment, widget registry, validation gates. Anticipated from Phase 1b. |
| Public page sections renderer | Done | All 18 section types rendered (hero, bio, skills, projects, timeline, interests, social, footer + experience, education, achievements, stats, reading, music, languages, activities, contact, custom) |
| Mobile tab chat state retention | Done | `TabsContent` uses `forceMount` + `data-[state=inactive]:hidden` to keep `ChatPanel` mounted |

### Safety, Budget, Reliability

| Capability | Status | Notes |
|---|---|---|
| Rate limiting | Done | Per-IP + pacing constraints |
| Usage accounting and budget guardrails | Done | Daily token/cost checks |
| Async worker queue | Done | Standalone worker (tsup build), 9 handlers, atomic claim, health-check |
| Per-profile message quota | Done | Atomic counter (profile_message_usage), 200 limit for auth users |
| Heartbeat engine | Done | Dual-loop (light daily, deep weekly), per-owner budget (DST-safe) |
| Reserved username protection | Done | `draft`, `api`, `builder`, `admin`, `_next` blocked |

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
6. Layout validation gates at 4 points (composer, set_layout tool, update_page_config, publish pipeline)
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

### Phase 1c — Hybrid Page Compiler
1. Per-section LLM personalizer (rewrites content using facts + agent memory)
2. Drill-down conversation pattern (agent deepens topic before section update)
3. Section copy cache (hash-based, per-section)
4. Periodic conformity check (heartbeat job: cross-section style alignment)
5. Personalizer budget tracking

### Phase 1d — Other Phase 1
1. Media upload API and avatar end-to-end support
2. Connector MVP (GitHub)
3. Public page auto-translation for visitors (on-demand + cached)

### Later
1. Auth + CSRF on publish endpoint (currently trusted local env only)
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

- Automated tests: 314 passed / 314 total (Vitest, 22 test files)
- Covered areas:
  1. Fact-to-section composition behavior + role casing + extended builders (32 tests)
  2. PageConfig validation behavior + extended section validators (28 tests)
  3. Rate-limit behavior (6 tests)
  4. Layout and theme validation + set_theme editorial-360 (9 tests)
  5. Publish flow — tool level, service level, edge cases (15 tests, mocked)
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
