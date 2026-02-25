# OpenSelf - Project Status

Last updated: 2026-02-25
Snapshot owner: engineering

## 1) Executive Summary

OpenSelf has a working MVP with a hardened core flow:
- Full onboarding loop: chat → fact extraction → page generation → live preview → publish
- Two-row page model: draft and published coexist, editing never breaks the live page
- Server-side publish gate: agent proposes, user confirms via explicit action
- Centralized theme validation: 2 themes (minimal, warm), single source of truth
- Simplified preview state machine: idle + optimistic_ready
- Chat resilience: no reset on mobile tab switch; DB-backed history restore on page refresh
- 206 automated tests passing
- 3-tier memory (summaries + meta-memory), soul profiles, worker process, SSE preview, fact conflicts, trust ledger

Phase 0.2.1 (Hardening) is complete. Phase 0 Gate (dogfooding) passed. Phase 1a (Memory, Soul & Heartbeat) complete.

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
| Tool-calling agent | Done | Fact CRUD, page generation, request_publish, reorder, theme |
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
| Optimistic page composition from facts | Done | Deterministic skeleton: Hero/Bio/Skills/Projects/Interests/Social/Footer. Hybrid LLM personalizer planned for Phase 1c. |
| Preview API (SSE + fallback polling) | Done | SSE via /api/preview/stream, fallback after 5 errors |
| Theme switch in preview | Done | `minimal` and `warm` + light/dark, centralized validation |
| Layout engine | Done | Centered MVP; split/stack fallback to centered (Phase 1 for distinct layouts) |
| Public page sections renderer | Partial | Renders only a subset of schema section types |
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

### Phase 1b — Extended Sections
1. Education section (timeline/cards, multi-item)
2. Experience section (timeline, multi-item)
3. Additional section types: achievements, stats, reading, music, contact
4. Split/stack layout implementations (distinct from centered)
5. Bold/elegant/hacker themes

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
3. Steady-state agent mode switching
4. Community component registry enforcement
5. Additional connector ecosystem
6. Multi-profile / multi-tenant model

## 4) Layout Count (Requested Snapshot)

Page web layout counts at current code state:
- Declared in schema: 3 (`centered`, `split`, `stack`)
- Actually rendered on public page today: 1 (centered; split/stack fallback to centered)

Builder interface layouts (chat experience):
- Desktop split view: 1
- Mobile tab view: 1

## 5) Test and Quality Snapshot

- Automated tests: 206 passed / 206 total (Vitest)
- Covered areas:
  1. Fact-to-section composition behavior + role casing (18 tests)
  2. PageConfig validation behavior (15 tests)
  3. Rate-limit behavior (6 tests)
  4. Layout and theme validation (8 tests)
  5. Publish flow — tool level, service level, edge cases (15 tests, mocked)
  6. Page service integration — real SQLite in-memory DB (18 tests)
  7. Translation — LLM translation + cache behavior (18 tests)
  8. Owner scope — multi-session anchor, quota, migration bootstrap (12 tests)
  9. Context assembler — mode detection, token budgets, message trimming (19 tests)
  10. Memory service — CRUD, dedup, quota, cooldown, feedback (15 tests)
  11. Soul service — versioning, proposals, review, expire (12 tests)
  12. Trust ledger + conflicts + heartbeat config (15 tests)
- Current gaps in tests:
  1. End-to-end browser integration tests
  2. Renderer behavior for visual layout modes
  3. Connector and worker lifecycle integration

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
