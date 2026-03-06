# OpenSelf - Project Status

Last updated: 2026-03-06
Snapshot owner: engineering

## 1) Executive Summary

OpenSelf has a working MVP with a hardened core flow:
- Full onboarding loop: chat → fact extraction → page generation → live preview → publish
- Two-row page model: draft and published coexist, editing never breaks the live page
- Server-side publish gate: agent proposes, user confirms via explicit action
- Presence System: 3-axis visual identity (surface × voice × light) with 9 signature combos, replaces legacy theme/colorScheme/fontFamily
- Simplified preview state machine: idle + optimistic_ready
- Chat resilience: no reset on mobile tab switch; DB-backed history restore on page refresh
- Post-import agent reaction: after LinkedIn import, agent auto-reviews data and asks targeted gap-filling questions
- Design DNA Full Redesign: Presence System (surface × voice × light) sostituisce theme/colorScheme/fontFamily. PresencePanel (680px drawer desktop + inline mobile Style tab), SourcesPanel/ConnectorCard generic registry, Mobile Bottom Tab Bar (3 tab), Magic Paste URL detection. Legacy SettingsPanel/ConnectorSection/EditorialLayout rimossi. 2196 test (189 file)
- Experience facts without dates: agent now creates experience facts immediately even when the user provides no dates (start/end = null). In the very next turn, the agent asks for dates. Previously the agent silently dropped company names due to a date-gate in SAFETY_POLICY.
- STT language hint end-to-end: the UI language selection now flows through the entire server fallback pipeline — `useSttProvider` FormData → Next.js proxy → Python Whisper server — so proper nouns (e.g. "Cassa Depositi e Prestiti") are transcribed using the correct Whisper language model instead of auto-detection.
- Multi-provider tier routing: each model tier (`fast/standard/reasoning`) can use a different provider via `provider:model-id` env var format. Production setup: gemini-2.0-flash (fast) / claude-sonnet-4-6 (standard) / gemini-2.5-pro (reasoning). 2209 tests (189 files).
- UI Overhaul v10: builder and profile page aligned with design prototype. Desktop builder: full-width dark navbar, chat pane `#0d0d0f`, preview pane `#1a1a1e`, single scroll owner. Mobile: tabs CHAT / PREVIEW / PUBLISH (replaced STYLE); chat header shows hero name; preview sticky bar with Presence + Logout. Profile page: hero left-aligned min-height 480px, section separators via `--page-border`. PresencePanel: 320px single column (no live preview column), SignatureCombos first, mobile fullscreen overlay with 180px MiniPreview on top. BuilderNavBar: always-visible 5-branch pill. Dark message bubbles (gold user / glass AI). VoiceOverlay: gradient and chat button removed.
- 2593 automated tests passing (225 test files), zero `tsc --noEmit` errors
- 4-tier memory: Tier 1 facts, Tier 2 summaries (CAS), Tier 3 meta-memories, Tier 4 episodic events (FTS5 + Dream Cycle consolidation). Soul profiles, worker process, SSE preview, fact conflicts, trust ledger
- Memory pipeline fix: facts read-scope unified via `factsReadScope()` helper for PROFILE_ID_CANONICAL. Episodic provenance wired with session_id + source_message_id. Temporal context block injected into agent context. Memory directives updated to cover all 4 tiers
- Layout template engine: 4 templates (The Monolith, Cinematic, The Curator, The Architect), slot-based section assignment, widget registry, lock system, validation gates
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
- UAT Round 3 (8 fixes): scroll-reveal bypass in builder preview, auto-draft for style tools, agent role prompt guidance, language proficiency L10N (8 languages × 5 levels), chat markdown rendering (markdown-it), favicon, dot separator polish, WAL checkpoint on registration
- Sprint 2 — Onboarding Rewrite: composable policy system replacing monolithic onboarding/steady-state prompts, per-journey-state policies (6 states), situation directives (4 situations), expertise calibration (3 levels), `buildSystemPrompt()` composable prompt builder, dynamic welcome messages from bootstrap payload (3 maps × 8 languages)
- Sprint 3 — Returning User Policies + Strategic Memory: 5 stub policies replaced with detailed prompt content (returning-no-page, draft-ready, active-fresh, active-stale, blocked). Memory usage directives (3-tier strategic memory: facts=WHAT, summary=CONTEXT, memories=HOW). Turn management rules (R1-R5: breadth, max 6 exchanges, banned closings, stall recovery, proportional response). Wired into `buildSystemPrompt()`. 142 new tests (1101 total, 70 files)
- Sprint 4 — Reliable Execution: `capable` model tier, provider name fix, structured output for translation (generateObject + Zod), `publish_preflight` + `inspect_page_state` agent tools (17 total), username validation in `request_publish`. 39 new tests (1140 total, 74 files)
- Sprint 5 — Conversation Polish + Eval Matrix: Action-awareness policy (explain-before-act for high-impact tools), undo-awareness policy (graceful reversal with detection keywords EN/IT), enhanced expertise calibration (detailed behavioral instructions per level), cross-provider eval matrix (8 parameterized LLM eval scenarios across providers). 81 new tests (1221 total, 77 files)
- UAT Round 4 (21 findings): auto-recompose after fact mutations, freelance bio detection (FREELANCE_MARKERS + L10N), experience types (employment/freelance/client routing), section header L10N, layout alias resolution, hero proficiency L10N, experience date localization, At-a-Glance L10N, secure cookie flag, profile row on registration, centralized UI L10N (getUiL10n, 45 keys × 8 langs), music dedup, activity type L10N, lowerRole acronym preservation, HMR import fix, proposals error handling, website in hero. 1151 tests pass
- UAT Round 5 (23 findings): bootstrap skipPace, deduplicated chat data prefetch (SplitView), token limit raised (150k→500k, migration 0019), robust error extraction (extractErrorMessage), freelance stripping (stripFreelanceFromRole), Italian passionateAbout fix, gender-neutral L10N templates (no /a or /(e) patterns), activity frequency L10N (7 keys × 8 langs), skill domain label L10N (7 keys × 8 langs), experience period formatting (start–end with localized "Present"), education graceful degradation (optional period), website platform L10N (canonical platform + localized label), experience freelance/company redundancy guard, experience key collision guardrail (getFactByKey), auth detection (userId || username), layout validation error details. 1301 tests pass (92 files)
- Connector MVP (GitHub + LinkedIn ZIP): GitHub OAuth sync (repos, languages, skills, stats), LinkedIn ZIP import (12 CSV mappers), AES-256-GCM credential encryption, batch fact writer, provenance tracking, sync idempotency + rate limiting. 194 new tests (1834 total, 153 files)
- Phase 1d Closing: Connector UI in SettingsPanel (status cards, OAuth connect, file picker, disconnect), avatar upload pipeline (magic bytes + EXIF strip + POST/DELETE API + composer wiring + AvatarSection UI), public page auto-translation (Accept-Language parser, TranslationBanner, bot detection, source_language column, ?lang=original bypass). ~230 new tests (2063 total, 165 files)
- Architect layout refactoring: affinity-based slot ranking with anti-clustering for non-vertical layouts, compact widget variants (reading, education, achievements, music), expanded slot accepts, strict accepts validation, backfill script
- UAT Round 6 (12 findings): Architect layout 400 fix (draftSlots carry-over in 3 call sites), layout name cleanup (user-facing names: The Monolith/Cinematic/The Curator/The Architect, case-insensitive resolveLayoutAlias, legacy alias compat), avatar visibility fix (onAvatarChange callback wiring + profileId in 4 compose paths), agent prompt improvements (contradiction handling, unsupported features, response variety, registration CTA). 14 new tests (2077 total, 168 files)
- Post-import agent reaction: After LinkedIn import, agent auto-reacts with data review + targeted gap-filling questions (interests, description, social). Deterministic gap analyzer, atomic CAS import event flag (pending→processing→consumed), `has_recent_import` situation in Journey Intelligence, `recentImportDirective` policy with prompt hygiene (sanitize + delimiters), DOM event bridge for auto-trigger message (localized, 8 langs), error recovery (revert on failure). 33 new tests (2110 total, 174 files)
- Chat-first pending soul proposals: pending soul change proposals now surface through natural conversation instead of a UI panel. New `has_pending_soul_proposals` situation detected post-Circuit-A in `assembleBootstrapPayload` (captures same-turn auto-created proposals). New `review_soul_proposal` tool for accept/reject. Removed blanket `first_visit` guard from `getSituationDirectives` — eligibility is now per-situation via `eligibleStates`. Prompt injection protection: all user-derived fields (overlay keys, values, reason, id) sanitized via `sanitizeForPrompt` (collapses \\r\\n\\t, strips control chars, caps at maxLen). Overlay keys capped at 5. `getPendingProposals` ordering fixed (FIFO deterministic). 21 new tests (2444 total, 205 files). ADR-0014.
- Episodic Memory (Tier 4): Append-only event ledger (`episodic_events`) with FTS5 full-text search. Three new agent tools: `record_event` (log activities), `recall_episodes` (query by timeframe/keywords with FTS5), `confirm_episodic_pattern` (accept/reject Dream Cycle proposals). Dream Cycle background worker (`consolidate_episodes` job): deterministic threshold detection (≥3 events in 60 days, recency 30 days), fast-tier LLM evaluation, `episodic_pattern_proposals` with 30-day TTL and 90-day rejection cooldown. `has_pending_episodic_patterns` situation (priority 2, all states except first_visit/blocked). `acceptEpisodicProposalAsActivity` atomic transaction: claim proposal + write activity fact + draft recomposition. FTS5 safety via `sanitizeFtsKeywords` (double-quote wrapping). julianday() for timezone-safe expiry. Drizzle schema + partial indexes. Migrations 0027+0028. EXPECTED_SCHEMA_VERSION=28, EXPECTED_HANDLER_COUNT=11. 59 new tests (2503 total, 210 files).
- Execution Safety Hardening (2026-03-06): Action Claim Guard — stream-level transform (`action-claim-guard.ts`) rewrites unbacked completion claims ("Salvato", "Added", "Done") when no corresponding write tool succeeded. `COMPLETION_CLAIM_BACKING_TOOL_NAMES` excludes proposal-only tools (request_publish, propose_soul_change, propose_lock, save_memory). `review_soul_proposal`/`confirm_episodic_pattern` back claims only when accept=true. Leading filler prefix stripping (ok/certo/va bene/sure). `sanitizeUnbackedActionClaim` for message persistence honesty. Step exhaustion fallback reframed from past-tense completion to honest present-continuous language. 76 new tests (2585 total, 222 files).
- Multi-Session Awareness (2026-03-06): ownerKey/readKeys threaded end-to-end through publish pipeline, preview endpoints, worker page jobs (`getPageJobContext` helper), and summary service (`expandSummaryMessageKeys`). Pending operations are conversation-scoped (stored on `messageSessionId`, not profile anchor). `resolveAuthenticatedConnectorScope()` unified connector route auth. Tool call persistence: assistant messages save `toolCalls` array alongside text content. Summary service reads journal from message-level toolCalls (not stale session metadata).
- Heartbeat & Media Auth Hardening (2026-03-06): `getRecentJournalEntries()` now reads canonical assistant-message `toolCalls` instead of `sessions.metadata.journal`, so deep-heartbeat journal pattern detection no longer reuses stale operational state. Deep-heartbeat conformity uses the owner's preferred language (fallback: factLanguage, then `en`) instead of hardcoded English. `/api/media/avatar` now requires real authenticated profile identity in multi-user mode (`userId` or legacy `username`) and no longer falls back to shared `__default__` writes for anonymous sessions.
- Execution Tightening (2026-03-06): Conflict resolution wrapped in SQLite transaction with fact snapshots before mutation. `applyFactReverseOps()` enables full bidirectional undo (restore/recreate/delete). `undo_conflict_resolution` case in trust ledger. Proposal service now requires ownerKey on accept/reject (multi-user isolation). `rejectProposal` returns result object (no silent failures). Immediate execution directives in active-fresh/active-stale/draft-ready policies ("execute tool call THIS turn"). `buildMinimalSchemaForEditing()` for active states (schemaMode "minimal" for draft_ready/active_fresh/active_stale). Trust logging standardized with entityId in object format. Publish pin invalidation: pre-publish journey pins auto-cleared for authenticated users after publishing. Lenient layout validation: `missing_required` errors ignored on set_layout and /api/draft/style. Turn management R6: clarification expiry rule. Async username validation with availability checks in multi-user mode.

Phase 0.2.1 (Hardening) is complete. Phase 0 Gate (dogfooding) passed. Phase 1a (Memory, Soul & Heartbeat) complete. Layout Template Engine (anticipated from Phase 1b) complete. Phase 1b (Extended Sections) complete. Signup-before-publish flow implemented. Quality, Privacy, Themes & Chat Context hardening complete. UAT hardening (10 findings) complete. Phase 1c (Hybrid Page Compiler) complete. Layout Redesign complete. Vertical Magazine Redesign complete. UAT Round 3 hardening (8 findings) complete. Sprint 2 — Onboarding Rewrite complete. Sprint 3 — Returning User Policies complete. Sprint 4 — Reliable Execution complete. Sprint 5 — Conversation Polish + Eval Matrix complete. UAT Round 4 (21 findings) complete. UAT Round 5 (23 findings) complete. Connector MVP (GitHub + LinkedIn ZIP) complete. Phase 1d Closing (connector UI, avatar, public page translation) complete. Architect layout refactoring (affinity-based slot ranking, compact widgets) complete. UAT Round 6 (12 findings) complete. Post-import agent reaction complete. Design DNA Full Redesign (Presence System, PresencePanel, Mobile Bottom Tab Bar, Magic Paste, legacy cleanup) complete. Experience facts without dates + STT language hint end-to-end complete. UI Overhaul v10 (dark builder theme, desktop layout overhaul, mobile CHAT/PREVIEW/PUBLISH tabs, hero left-aligned, section separators, PresencePanel 320px single-column) complete. Episodic Memory Tier 4 (event ledger, FTS5, Dream Cycle, pattern proposals) complete. Execution Safety Hardening (action claim guard, multi-session awareness, conflict undo, proposal scoping, immediate execution) complete. **Phase 1 is fully complete.**

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
| Mobile bottom tab bar | Done | 3-tab bottom nav (Chat / Preview / Publish). Chat tab shows `{heroName}'s page · Draft` header. Preview tab has sticky openself bar with Presence + Logout. Publish tab shows publish UI or "Keep chatting" placeholder. |
| Presence panel | Done | 320px right panel (desktop), single column controls, no live preview column. SignatureCombos first. Mobile: fixed full-screen overlay with 180px MiniPreview on top + controls. |

### Chat and Agent

| Capability | Status | Notes |
|---|---|---|
| Streaming AI chat | Done | `useChat` + `/api/chat`. Assistant messages rendered as markdown via `markdown-it` (bold, lists, links). User messages plain text. |
| Tool-calling agent | Done | 25 tools: Fact CRUD, set_fact_visibility, page generation, update_page_style, request_publish, reorder, theme, set_layout, propose_lock, save_memory, propose_soul_change, resolve_conflict, inspect_page_state, publish_preflight, review_soul_proposal, record_event, recall_episodes, confirm_episodic_pattern, batch_facts, move_section, archive_fact, unarchive_fact, reorder_items. Structured schema reference in prompt + `experimental_repairToolCall` for automatic recovery from invalid tool arguments |
| Language-aware onboarding prompt | Done | Language propagated to prompt and composer. Composable policy system: per-journey-state policies, situation directives, expertise calibration, action awareness, undo awareness via `buildSystemPrompt()` (13 blocks) |
| Publish gate enforcement | Done | `request_publish` tool (agent proposes) + `POST /api/publish` (user confirms) + `POST /api/draft/request-publish` (chat-initiated publish) |
| LLM-powered content translation | Done | Composes in factLanguage, translates to target via generateObject (structured output), cached in translation_cache |
| Translation cache | Done | Hash-based, no explicit invalidation, eliminates repeated LLM calls |
| Steady-state mode switching | Done | Mode auto-detected via fact count + published page check |
| Context assembly + token budgets | Done | 65000-token budget, per-block allocation, post-assembly guard (static blocks shrinkable as last resort), conversation-scoped pending operations |
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
| Episodic memory (Tier 4) | Done | Append-only event ledger, FTS5 full-text search, pattern proposals, Dream Cycle consolidation worker |
| Trust ledger | Done | Undo payload at write time, transactional CAS reverse |
| Schema versioning | Done | schema_meta table, leader/follower bootstrap mode |
| Chat history rehydration | Done | `ChatPanel` loads `GET /api/messages` on mount before `useChat` initialization |
| Dynamic welcome messages | Done | ChatPanel fetches bootstrap payload, selects journey-aware welcome (first_visit/returning/draft_ready/active) with personalized greeting for returning users |

### Page Engine and UI

| Capability | Status | Notes |
|---|---|---|
| Optimistic page composition from facts | Done | Deterministic skeleton: 19 section types from facts (18 original + at-a-glance). Type-safe section builders with proper type guards. Hero: two-column layout with ContactBar (social links, email, languages). At a Glance: fused stats + grouped skills + interests. D5 section ordering when `EXTENDED_SECTIONS=true`. CollapsibleList for experience, projects, achievements, education. Extended sections gated by `EXTENDED_SECTIONS` env var. |
| Hybrid LLM personalizer | Done | Per-section LLM rewrite (facts + soul + memory → personalized copy). Three-layer data model: `section_copy_cache` (pure LLM cache), `section_copy_state` (active approved copy), `section_copy_proposals` (heartbeat proposals). `mergeActiveSectionCopy()` projection bridge. Fire-and-forget in `generate_page` (steady_state only). Hash guard (factsHash + soulHash) for staleness. |
| Drill-down conversation | Done | `classifySectionRichness()` detects thin sections (< threshold items). Agent context includes section richness block + drill-down instructions. Agent asks follow-up questions before updating thin sections. |
| Conformity checks | Done | `analyzeConformity()` + `generateRewrite()` two-phase LLM. Runs in deep heartbeat. Max 3 issues per check. Creates proposals for user review. |
| Proposal review system | Done | `createProposal` / `acceptProposal` / `rejectProposal` / `markStaleProposals`. API: `GET /api/proposals`, `POST accept/reject/accept-all`. ProposalBanner UI in builder. |
| Preview API (SSE + fallback polling) | Done | SSE via /api/preview/stream, fallback after 5 errors. Dual-hash: `projectCanonicalConfig()` for display (all sections), `publishableFromCanonical()` for hash guard. Never serves raw `draft.config` |
| Presence System | Done | 3-axis visual identity: `surface` (canvas/clay/archive) × `voice` (signal/narrative/terminal) × `light` (day/night). 9 signature combos. `src/lib/presence/` registry. CSS custom properties `--surface-*`, `--voice-*`. `OsPageWrapper` applies classes to `<body>`. Migration 0025 adds columns to `page` table. |
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
| Avatar upload (full pipeline) | Done | POST/DELETE `/api/media/avatar`, magic bytes validation, EXIF stripping, composer wiring, AvatarSection UI in PresencePanel |

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

### UAT Hardening Round 3 (8 Findings) ✅

Third E2E UAT as "Marco Bellini" (clean DB, fresh start, 6 messages, publish, signup, return to builder, stress test). 8 real bugs fixed, 5 verified as not-a-bug. No new tests (all fixes verified by existing 846-test suite + manual UAT).

1. **Scroll-reveal bypass (F1, Critical)** — Builder preview sections were invisible (`opacity: 0`) because IntersectionObserver couldn't re-observe new sections added via SSE. Fix: `previewMode` prop disables observer entirely + `.preview-mode .theme-reveal` CSS forces `opacity: 1`. Published page retains full scroll animation.
2. **Auto-draft for style tools (F2, High)** — `set_theme`, `update_page_style`, `set_layout`, `reorder_sections` returned "Page not found" when no draft existed. Fix: shared `ensureDraft()` helper inside `createAgentTools()` auto-composes draft from facts if none exists.
3. **Agent role prompt (F3, High)** — Agent sometimes created experience facts instead of updating identity facts for role changes. Fix: added ROLE/TITLE priority guidance + sequential processing instruction to DATA_MODEL_REFERENCE in prompts.
4. **Language proficiency L10N (F4, Medium)** — Proficiency labels ("fluent", "native") displayed in English regardless of page language. Fix: 5 new L10N keys × 8 languages (40 entries), `PROF_KEYS` lookup map in `buildLanguagesSection()`. `LanguageItem["proficiency"]` type widened to `string`.
5. **Chat markdown rendering (F5, Medium)** — Assistant messages rendered as plain text, losing formatting. Fix: `markdown-it` v14 (CJS-compatible, zero deps). Only assistant messages use `dangerouslySetInnerHTML`; user messages remain plain text. `html: false` (default) prevents XSS.
6. **Favicon (F6, Low)** — No favicon → browser default. Fix: `src/app/icon.svg` (simple circle, auto-discovered by Next.js App Router).
7. **Dot separator polish (F7, Low)** — `.entry-dot-separator::after` opacity bumped from 0.3 → 0.4 for better readability.
8. **WAL checkpoint on registration (F8, Low)** — Registration spans multiple DB writes; process kill before WAL auto-checkpoint could lose auth session. Fix: `sqlite.pragma("wal_checkpoint(PASSIVE)")` after last critical write in both AUTH_V2 and legacy paths.

Verified not-a-bug: M4 (webpack HMR hang), M5 (18 theme-reveal elements — expected conditional variants), L2 ("Colpo d'Occhio" intentional fusion), L4 (_next/static dev noise), M3 (empty assistant response — model behavior).

### NEXT-16 Sprint 2 — Onboarding Rewrite ✅

Composable policy system replacing monolithic prompt functions. All items complete.
67 new tests (959 total, 66 files).

1. **Policy registry** — `src/lib/agent/policies/index.ts` with `getJourneyPolicy()`, `getSituationDirectives()`, `getExpertiseCalibration()`. Maps `JourneyState` → policy function.
2. **First-visit policy** — `first-visit.ts` with 3-phase turn structure (identity → breadth → generate+publish) and 3-step low-signal escalation (guided prompts → fill-in-the-blank → minimal page).
3. **Stub policies** — 5 journey state policies: `returning-no-page`, `draft-ready`, `active-fresh`, `active-stale`, `blocked`. Each with state-specific behavioral guidelines.
4. **Situation directives** — `situations.ts` with 4 generators: pending proposals, thin sections, stale facts (capped at 5), open conflicts. Injected only when situations are active.
5. **`buildSystemPrompt()`** — New composable prompt builder in `prompts.ts`. Composes [charter, safety, tools, schema ref, data model ref, output contract, journey policy, situation directives, expertise calibration]. 3500-token budget for policy+directives. Legacy `getSystemPromptText()` marked `@deprecated`.
6. **Context wiring** — `assembleContext()` uses `buildSystemPrompt(bootstrap)` when bootstrap payload available, falls back to legacy `getSystemPromptText()`.
7. **Dynamic welcome messages** — `ChatPanel` fetches bootstrap on mount, selects from 3 welcome maps (8 languages each): `FIRST_VISIT_WELCOME`, `RETURNING_WELCOME`, `DRAFT_READY_WELCOME`. Active users get personalized "Hey {name}!" greetings.

### NEXT-16 Sprint 3 — Returning User Policies + Strategic Memory ✅

All 5 stub policies replaced with detailed prompt content. Two cross-cutting prompt blocks added. All items complete. 142 new tests (1101 total, 70 files).

1. **returning-no-page policy** — Continuity greeting (name from facts, summarize 2-3 defining facts), fact hygiene (search before asking, never re-ask), fast-path to page (5+ facts = skip to generate+publish).
2. **draft-ready policy** — Review-first approach (lead with preview), single-question opener ("change or publish?"), max 2 edit rounds, immediate publish on "looks good".
3. **active-fresh policy** — Operational quick-update session ("Hey [name], what to update?"), proportional response length, existing username for authenticated users, navigation bar alternative.
4. **active-stale policy** — Warm re-engagement (acknowledge time gap), targeted updates (2-3 areas max, prioritize work > projects > interests), max 6 exchanges rule, stop if user says "nothing changed".
5. **blocked policy** — Exactly 2 parts: explain block + give solution. No questions, no apologies. Specific "come back tomorrow" (never vague).
6. **Memory usage directives** — Fixed block for all prompts. 3-tier strategic memory: Tier 1 (facts = WHAT, search_facts before asking), Tier 2 (summary = CONTEXT, use for continuity), Tier 3 (meta-memories = HOW, save_memory golden rule). Cross-tier discipline.
7. **Turn management rules** — Fixed block for all prompts. R1: no consecutive same-area questions. R2: max 6 fact-gathering exchanges. R3: banned passive closings (6 phrases). R4: stall detection (options → fill-in-blank → generate page). R5: proportional response length.
8. **buildSystemPrompt wiring** — Turn management + memory directives appended as last two blocks after expertise calibration.

### NEXT-16 Sprint 4 — Reliable Execution ✅

All items complete. 39 new tests (1140 total, 74 files).

1. **Capable model tier** — Extended `ModelTier` type with `"capable"` tier in `provider.ts`. `CAPABLE_MODELS` map (Google Gemini 2.5 Pro, OpenAI GPT-4o, Anthropic Claude Sonnet 4.6, Ollama LLaMA 3.3). Env override: `AI_MODEL_CAPABLE`. Generalized `getModelForTier`/`getModelIdForTier` with `tierMap`/`envKey` pattern.
2. **Provider name fix** — `summary-service.ts` used hardcoded `"anthropic"` in `recordUsage()`, now uses `getProviderName()` for correct multi-provider accounting.
3. **Structured output for translation** — `translatePageContent()` migrated from `generateText` + `stripCodeFences` + `JSON.parse` to `generateObject` with Zod schema (`TranslationResultSchema`). Eliminates code fence stripping and JSON parse failures.
4. **`publish_preflight` tool** — Pre-publish gate with structured checks: `gates` (hasDraft, hasAuth, hasUsername), `quality` (incompleteSections, proposedFacts, thinSections, missingContact), `info` (sectionCount, factCount), `summary` (human-readable).
5. **`inspect_page_state` tool** — Structured page introspection: `layout` (template, theme, style), per-section details (id, type, slot, widget, locked, complete, richness), `availableSlots`, `warnings`.
6. **Username validation in `request_publish`** — Belt-and-suspenders guard: validates username format even if agent skips `publish_preflight`. Rejects empty, invalid, or reserved usernames.
7. **TOOL_POLICY update** — Added `publish_preflight` and `inspect_page_state` guidance to agent system prompt for tool discoverability.

### NEXT-16 Sprint 5 — Conversation Polish + Eval Matrix ✅

All items complete. 81 new tests (1221 total, 77 files).

1. **Action-awareness policy** — `actionAwarenessPolicy()` classifies tools as high-impact (set_layout, set_theme, update_page_style, reorder_sections, generate_page in steady_state → explain and confirm) or low-impact (fact CRUD, visibility, memory, soul → execute silently). Modulated by EXPERTISE CALIBRATION block.
2. **Undo-awareness policy** — `undoAwarenessPolicy()` with detection keywords (EN: undo, revert, go back, don't like, change it back, was better before; IT: annulla, torna indietro, non mi piace, com'era prima). 4-step response pattern: IDENTIFY → EXPLAIN → PROPOSE → ACT. Critical rules: never regenerate entire page first, ask specifics for vague complaints. Reversal scope per tool type.
3. **Prompt wiring** — Both policies added to `buildSystemPrompt()` as blocks 12 and 13 (after memory usage directives). Total: 13 blocks without situations, 14 with.
4. **Enhanced expertise calibration** — `getExpertiseCalibration()` expanded with detailed behavioral instructions per level. Novice: explain every action, user-friendly phrasing, invisible tool usage. Familiar: skip simple explanations, explain visual changes. Expert: minimal responses ("Done."), proactive advanced feature suggestions.
5. **Cross-provider eval infrastructure** — Dedicated `vitest.config.cross-provider.ts` (60s timeout, sequential execution). `tests/evals/cross-provider/setup.ts` with provider parameterization via `AI_PROVIDER` env var, auto-detection from API keys, seed facts (14-fact Maria Rossi profile + 1-fact sparse profile), and fuzzy assertion helpers (`assertContainsAtLeast`, `assertNoneOf`, `assertWordCount`).
6. **8 cross-provider eval scenarios** — Real LLM behavioral tests parameterized across providers:
   - `onboarding-flow.eval.ts` — Pipeline-aware (first_visit bootstrap): name extraction, breadth-first topics, page generation proposal, no fabrication, concise responses
   - `translation.eval.ts` — SDK-level: Italian→English bio, proper noun preservation, skill name translation
   - `personalization.eval.ts` — SDK-level: generateObject with Zod schema, word limits, text-only output
   - `layout-change.eval.ts` — Pipeline-aware (active_fresh/familiar bootstrap): layout options explanation, confirmation before change, direct action on explicit instruction
   - `undo-request.eval.ts` — Hardcoded prompt: theme change identification, reversal proposal, vague complaint handling, Italian undo phrases
   - `returning-stale.eval.ts` — Hardcoded prompt: name greeting, no re-asking known info, known fact references, what's-new questions
   - `publish-incomplete.eval.ts` — Hardcoded prompt: preflight issue communication, fix-or-publish choice, error priority
   - `low-signal.eval.ts` — Hardcoded prompt: guided options after low signal, minimal page fallback, no passive closings

### Connector MVP (GitHub + LinkedIn ZIP) ✅

All items complete. Two connectors implemented end-to-end with full test coverage. 16 commits, 194 new tests (1834 total, 153 files).

**Connector infrastructure:**
1. **Sync handler** — `connector-sync-handler.ts` replaced no-op placeholder with `syncFn` dispatch. Fans out by ownerKey, writes `sync_log` entries per connector, handles success/error/partial states.
2. **Registration** — `register-all.ts` side-effect module registers both connectors at import. Worker imports it at startup.
3. **Fact writer** — `batchCreateFacts()` with `actor: "connector"`, sequential writes + single recompose after all facts.
4. **Encryption** — AES-256-GCM via `connector-encryption.ts` for OAuth token storage. Key from `CONNECTOR_ENCRYPTION_KEY` env var.

**GitHub connector:**
1. **API client** — `fetchProfile`, `fetchRepos`, `fetchRepoLanguages` with Bearer auth, Link header pagination, rate-limit warning, `GitHubAuthError` for 401.
2. **Fact mapper** — `mapProfile()` (6 fact types: social, identity, location, company, website, twitter), `mapRepos()` (project per non-fork repo + aggregated skill per language + total repo stat).
3. **Sync orchestration** — `syncGitHub()`: decrypt credentials → fetch → map → batchCreateFacts → record provenance → update syncCursor/lastSync.
4. **OAuth flow** — Subdirectory routing: connector callback at `/api/auth/github/callback/connector` (separate `gh_connector_state` cookie), login callback at `/api/auth/github/callback`. Shared `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
5. **API routes** — `GET /connect` (initiate OAuth), `GET callback/connector` (handle callback + enqueue sync), `POST /sync` (manual trigger).

**LinkedIn ZIP connector:**
1. **Date normalizer** — `normalizeLinkedInDate()` handles 5 LinkedIn date formats (ISO, "Mon YYYY", "DD Mon YYYY", US short M/D/YY, year-only). Rejects placeholders.
2. **CSV parser** — `parseLinkedInCsv()` strips BOM, detects preamble rows, uses `csv-parse/sync` with `relax_column_count`.
3. **Fact mappers** — 12 mapper functions: `mapProfile`, `mapProfileSummary`, `mapPositions`, `mapEducation`, `mapSkills`, `mapLanguages`, `mapCertifications`, `mapCourses`, `mapCompanyFollows`, `mapCauses`, `mapEmailAddresses`, `mapPhoneNumbers`. Positions: chronological sort, single "current" role, key collision handling.
4. **Import orchestration** — `importLinkedInZip()`: open ZIP via `yauzl-promise` → iterate entries → match filenames to mappers → batchCreateFacts. Sensitive files excluded (connections, messages, endorsements, recommendations).
5. **API route** — `POST /api/connectors/linkedin-zip/import` (multipart, 100MB limit, auth-gated).

**Hardening:**
1. **private-contact category** — Forces `private` visibility via `SENSITIVE_CATEGORIES`. Email validation widened for private-contact category.
2. **Date placeholder validation** — Extended to `start`/`end` fields (not just `period`).

### Phase 1d Closing ✅

All 3 remaining Phase 1 items complete. 16 commits, ~230 new tests (2063 total, 165 files).

**Feature 1: Connector UI in SettingsPanel**
1. **ConnectorSection component** — Status fetch from `/api/connectors/status`, per-connector cards (connected/disconnected states), GitHub OAuth connect, LinkedIn ZIP file picker, disconnect via `/api/connectors/{id}/disconnect`.
2. **SettingsPanel wiring** — ConnectorSection mounted as "Integrations" section below Avatar.
3. **OAuth return flow** — Builder detects `?connector=github` URL param, auto-opens settings panel, cleans URL via `replaceState`.
4. **Sync idempotency + rate limiting** — `hasPendingJob()` checks jobs table (409 ALREADY_SYNCING), `isSyncRateLimited()` enforces 60s cooldown (429 RATE_LIMITED), `acquireImportLock()`/`releaseImportLock()` in-memory Set lock for LinkedIn import.
5. **API error contract** — Standardized `{ success: false, code, error, retryable }` via `connectorError()` helper across all 5 connector routes.

**Feature 2: Avatar Upload**
1. **Magic bytes validation + EXIF stripping** — `detectMimeFromMagicBytes()` (JPEG/PNG/GIF/WebP), `stripExifFromJpeg()` (removes APP1 markers), `processAvatarImage()` orchestrator with MIME mismatch check.
2. **POST/DELETE endpoints** — `POST /api/media/avatar` (auth → formData → 2MB size check → MIME whitelist → magic bytes + EXIF strip → upload), `DELETE /api/media/avatar` (auth → remove). Delete-before-insert pattern for partial unique index.
3. **Composer wiring** — `profileId` threaded through `projectCanonicalConfig()` → `composeOptimisticPage()` → `buildHeroSection()` → `getProfileAvatar()`. All new params optional for backward compatibility. Wired into preview, stream, tools, publish pipeline, connector fact writer.
4. **AvatarSection UI** — Client component with 64px circular preview, upload button (file picker → POST FormData), remove button (DELETE), loading/error states.

**Feature 3: Public Page Auto-Translation**
1. **Accept-Language parser** — Q-weight sorting, region-to-base fallback (fr-CA → fr), wildcard filtering, 8 supported languages. Bot detection (Googlebot, Bingbot, etc.) skips translation for SEO.
2. **DB migration 0024** — `source_language TEXT` column on `page` table. Stored at publish time from `factLang`.
3. **Translation cache key hardening** — Composite SHA-256 of content hash + source language + target language + model ID. Fixed model tier bug (`getModelIdForTier("fast")`).
4. **Public page translation logic** — Language precedence: `?lang=` > `os_lang` cookie > `Accept-Language` > page sourceLanguage. Bot detection skips translation. `?lang=original` bypass.
5. **TranslationBanner** — Disclosure banner: "Machine-translated from {language}. View original" with link to `?lang=original`.

**Build fixes:**
- `yauzl-promise` added to `serverExternalPackages` (native `@node-rs/crc32` can't be bundled by webpack).
- LinkedIn mapper type predicate fix for strict TS in `next build`.
- `EXPECTED_SCHEMA_VERSION` bumped to 24.

### Architect Layout Refactoring ✅

Affinity-based slot ranking for non-monolith layouts (curator, architect). Compact widget variants for denser layouts. Part of feat/phase1d-closing branch.

1. **Affinity-based slot ranking** — Each slot definition includes optional `affinity` map (`Record<ComponentType, number>`, 0-1 scale). `rankSlotsForSection()` scores slots by type affinity + anti-clustering penalty.
2. **Anti-clustering** — Diversity penalty for slots already containing sections of the same type.
3. **Compact widget variants** — New compact widgets for reading, education, achievements, and music sections. Fit in `third`-sized slots. Components check `variant === "compact"` for condensed rendering.
4. **Expanded accepts** — Slot `accepts` arrays expanded across all 3 templates.
5. **Strict accepts check** — Explicit slot path validates `accepts` before assignment. Unplaceable sections emit `unplaceable_section` warning instead of silent fallback.
6. **Backfill script** — `scripts/backfill-architect-slots.ts` re-assigns existing drafts.

### UAT Hardening Round 6 (12 Findings) ✅

Sixth E2E UAT session. 5 groups of fixes: layout 400 error, layout naming, avatar visibility, agent prompt quality, and regression tests. 14 new tests (2077 total, 168 files).

1. **Architect layout 400 (Critical)** — Switching to The Architect layout via Settings returned 400 because existing slot assignments were lost. Fix: build `draftSlots` map from existing sections before calling `assignSlotsFromFacts()` in all 3 call sites (draft/style route, `set_layout` tool, `generate_page` tool). Soft-pin phase preserves slots when compatible with the new template.
2. **Avatar not appearing (High)** — Avatar uploaded via Settings didn't appear in any layout. Root cause: missing `profileId` in 4 compose paths (`ensureDraft`, `generate_page`, `draft/style`, `preferences`). Additionally, `SettingsPanel` didn't pass `onAvatarChange` to `AvatarSection`, so no preview refresh triggered after upload. Fix: thread `profileId` through all compose paths + wire callback via `onAvatarChange={() => { void fetchPreview(); }}`.
3. **Layout name cleanup (Medium)** — Internal layout IDs (`monolith`, `cinematic`, `curator`, `architect`) exposed to users/agent. Fix: expanded `LAYOUT_ALIASES` with user-facing names (The Monolith, Cinematic, The Curator, The Architect) + legacy aliases (`bento` → `architect`, `sidebar` → `curator`, `vertical` → `monolith`). Made `resolveLayoutAlias()` case-insensitive with 3-step resolution. Updated agent tool descriptions and DATA_MODEL_REFERENCE.
4. **Agent contradiction handling (Medium)** — Agent sometimes bypassed identity/role fact when user stated a new profession. Fix: added directive to update identity/role FIRST, wait for confirmation before proceeding.
5. **Agent prompt improvements (Medium)** — Added unsupported features block (video, audio, custom CSS), response variety rule ("NEVER repeat the same sentence pattern"), registration CTA in first-visit Phase C ("Register to get your own URL like openself.dev/yourname!").

### Post-Import Agent Reaction ✅

After a LinkedIn ZIP import, the agent automatically reacts with a brief data review and
asks targeted gap-filling questions. 12 commits, 33 new tests (2110 total, 174 files).

1. **Import gap analyzer** (`src/lib/connectors/import-gap-analyzer.ts`) — Deterministic, zero-LLM analysis of all active facts. Produces `ImportGapReport` with summary (current role, past roles, education/language/skill/certification counts) and prioritized gaps (no_interests > no_personal_description > no_social_links).
2. **Import event flag** (`src/lib/connectors/import-event.ts`) — Three-state machine (pending → processing → consumed) stored in `sessions.metadata` JSON. Atomic CAS via `json_set`/`json_extract` in SQL WHERE clause (G1). 24h TTL with automatic cleanup (G3). Error recovery: reverts to pending on LLM failure (G2).
3. **Situation detection** — `has_recent_import` situation in Journey Intelligence (`journey.ts`). Detected when connector-sourced facts exist within 30 minutes.
4. **Policy directive** — `recentImportDirective()` in `policies/situations.ts`. Generates POST-IMPORT REVIEW MODE prompt block with sanitized summary, gap descriptions, and `--- BEGIN/END IMPORT CONTEXT ---` delimiters (G5).
5. **Chat route wiring** — Flag consumed AFTER quota checks (avoids stuck "processing" on 429). Gap report injected into `bootstrap.importGapReport` and passed through to `assembleContext()`. Error recovery in `onFinish`, `getErrorMessage`, and outer catch blocks.
6. **Frontend auto-trigger** — DOM CustomEvent bridge between `ConnectorSection` (import success) and `ChatPanelInner` (event listener + `append()`). Localized trigger message (8 languages). `metadata.source = "auto_import_trigger"` for telemetry (G4).

### Post-Phase 1d Fixes

- `fix(avatar)`: `profileId` fallback aligned to `__default__` for consistency across all projection/composition paths.
- `fix(uat)`: Settings overlay z-index, style persistence after theme change, signup modal validation, quota nudge messaging.

### Later
1. ~~Auth + CSRF on publish endpoint~~ — Done (signup-before-publish + server-side auth gate)
2. Full builder UI persistence across browser reloads (beyond chat history)
3. Community component registry enforcement
4. Additional connector ecosystem
5. Multi-profile / multi-tenant model

## 4) Layout Count (Requested Snapshot)

Page web layout counts at current code state:
- Layout templates: 4 (`monolith`, `cinematic`, `curator`, `architect`) — all fully functional
- User-facing names: The Monolith, Cinematic, The Curator, The Architect
- Legacy aliases: `vertical` → monolith, `sidebar`/`sidebar-left` → curator, `bento`/`bento-standard` → architect
- Legacy `style.layout` field (`centered`, `split`, `stack`): retained for backward compat but ignored for layout resolution; canonicalized to `"centered"` when `layoutTemplate` is present
- Default without explicit `layoutTemplate`: monolith (renders identically to the original centered layout)

Builder interface layouts (chat experience):
- Desktop split view: 1
- Mobile tab view: 1
- Settings panel: template picker with 4 options

## 5) Test and Quality Snapshot

- Automated tests: 2196 passed / 2196 total (Vitest, 189 test files)
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
  61. Onboarding policy — first-visit 3-phase turn structure, language injection, low-signal handling (25 tests)
  62. Situation directives — pending proposals, thin sections, stale facts, open conflicts, guards (22 tests)
  63. Policy registry — journey state mapping, situation composition, expertise calibration, backward compat (18 tests)
  64. Context assembler bootstrap — buildSystemPrompt wiring, mode mapping from journey state (2 tests)
  65. Provider tiers — ModelTier capable, getModelIdForTier all providers + env override, getModelForTier, getProviderName (13 tests)
  66. Translate structured output — generateObject usage, Zod schema, merge, fallback, cache (6 tests)
  67. Publish preflight — gates (draft/auth/username), quality (incomplete/thin/proposed/contact), info counts (10 tests)
  68. Inspect page state — layout info, slot assignment, locked sections, completeness/richness, warnings (10 tests)
  69. Action awareness — policy output, tool classification (high/low impact), expertise modulation (12 tests)
  70. Undo awareness — policy output, keyword sets, reversal steps, per-tool scope (10 tests)
  71. Expertise calibration — 3 levels (novice/familiar/expert), behavioral instructions, expertise-specific content (7 tests)
  72. Cross-provider evals — 8 scenarios × N providers: onboarding, translation, personalization, layout, undo, returning, publish, low-signal (52 tests)
  73. Connector sync handler — syncFn dispatch, error handling, sync_log entries (9 tests)
  74. Connector registration — both connectors registered in registry (2 tests)
  75. GitHub client — fetchProfile, fetchRepos, fetchRepoLanguages, pagination, auth errors (12 tests)
  76. GitHub mapper — mapProfile (6 fact types), mapRepos (projects + skills + stats) (16 tests)
  77. GitHub sync — full flow, auth error, empty repos, cursor update (11 tests)
  78. GitHub OAuth — connect initiation, callback, state validation, cookie handling (13 tests)
  79. GitHub API routes — manual sync trigger, auth gates (4 tests)
  80. GitHub E2E — full flow integration: OAuth → sync → facts → page (7 tests)
  81. LinkedIn date normalizer — 5 formats, edge cases, placeholder rejection (17 tests)
  82. LinkedIn CSV parser — BOM handling, preamble detection, relaxed columns (8 tests)
  83. LinkedIn ZIP mapper — 12 mappers, position sorting, proficiency mapping, key collision (48 tests)
  84. LinkedIn ZIP import — full flow, sensitive file exclusion, corrupt ZIP handling (10 tests)
  85. LinkedIn ZIP API — multipart upload, file validation, size limit, auth gate (11 tests)
  86. LinkedIn ZIP E2E — full flow integration: upload → parse → facts → page (18 tests)
  87. Connector hardening — private-contact category, date placeholder validation (8 tests)
  88. Avatar — magic bytes detection, EXIF stripping, POST/DELETE endpoints, composer wiring (12 tests)
  89. Accept-Language parser — q-weight sorting, region fallback, bot detection, supported languages (15 tests)
  90. Public page translation — language precedence, cache key hardening, TranslationBanner, bot bypass (18 tests)
  91. Compact widgets — compact variant resolution, slot assignment for third-sized slots (8 tests)
  92. Architect layout — affinity-based slot ranking, anti-clustering, expanded accepts (6 tests)
  93. Connector UI — ConnectorSection status fetch, OAuth return flow, sync idempotency, rate limiting (10 tests)
  94. Import gap analyzer — category counts, role derivation, gap detection/absence, experience fallback (10 tests)
  95. Import event flag — write, consume, CAS idempotency, TTL expiry, revert, no-flag (6 tests)
  96. Journey import situation — recent connector facts, old facts, non-connector facts (3 tests)
  97. Import policy directive — role rendering, gap descriptions, sanitization, delimiters, policy rules (5 tests)
  98. Import reaction pipeline — full lifecycle (write→detect→consume→analyze→directive), error recovery (2 tests)
  99. Chat route import flag — flag wiring, bootstrap population, no-flag skip, situation forcing, quota guard, error revert (6 tests)
  100. LinkedIn ZIP API (updated) — import event flag write on success (1 new test)
- Current gaps in tests:
  1. End-to-end browser integration tests

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
