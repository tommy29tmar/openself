# OpenSelf - Project Status

Last updated: 2026-02-23
Snapshot owner: engineering

## 1) Executive Summary

OpenSelf has a working MVP with a hardened core flow:
- Full onboarding loop: chat → fact extraction → page generation → live preview → publish
- Two-row page model: draft and published coexist, editing never breaks the live page
- Server-side publish gate: agent proposes, user confirms via explicit action
- Centralized theme validation: 2 themes (minimal, warm), single source of truth
- Simplified preview state machine: idle + optimistic_ready
- 112 automated tests passing

Phase 0.2.1 (Hardening) is complete. Ready for Phase 0 Gate (dogfooding).

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
| LLM-powered content translation | Done | Translates via generateText on language change, cached in translation_cache |
| Translation cache | Done | Hash-based, no explicit invalidation, eliminates repeated LLM calls |
| Steady-state mode switching | Missing | Route always uses onboarding prompt mode |

### Data and Persistence

| Capability | Status | Notes |
|---|---|---|
| SQLite schema + migrations | Done | Migration tracking via `_migrations` table, transactional |
| Two-row page model | Done | draft + published rows, DB CHECK constraints |
| Facts KB CRUD + taxonomy normalization | Done | Alias mapping and pending categories |
| Visibility policy engine | Done | Sensitive categories handled |
| Event logging | Done | `agent_events` writes are in place |

### Page Engine and UI

| Capability | Status | Notes |
|---|---|---|
| Optimistic page composition from facts | Done | Hero/Bio/Skills/Projects/Interests/Social/Footer |
| Preview API polling | Done | Builder polls every 3s, exposes `publishStatus` |
| Theme switch in preview | Done | `minimal` and `warm` + light/dark, centralized validation |
| Layout engine | Done | Centered MVP; split/stack fallback to centered (Phase 1 for distinct layouts) |
| Public page sections renderer | Partial | Renders only a subset of schema section types |

### Safety, Budget, Reliability

| Capability | Status | Notes |
|---|---|---|
| Rate limiting | Done | Per-IP + pacing constraints |
| Usage accounting and budget guardrails | Done | Daily token/cost checks |
| Async worker queue | Partial | Worker exists, scheduler not wired in app lifecycle |
| Reserved username protection | Done | `draft`, `api`, `builder`, `admin`, `_next` blocked |

### Media

| Capability | Status | Notes |
|---|---|---|
| Media retrieval route | Done | `/api/media/[id]` returns stored blobs |
| Avatar upload service function | Done (service layer) | No public upload API endpoint yet |

## 3) What Is Not Done Yet

### Phase 1 (Next)
1. Split/stack layout implementations (distinct from centered)
2. Bold/elegant/hacker themes
3. Worker scheduler wiring into app lifecycle
4. SSE preview (replace polling)
5. History summarization in context budget
6. Additional section types: timeline, achievements, stats, reading, music, contact
7. Public page auto-translation for visitors (on-demand + cached)

### Later
1. Auth + CSRF on publish endpoint (currently trusted local env only)
2. Synthesis state machine (full async page generation)
3. Session persistence across browser reloads
4. Steady-state agent mode switching
5. Connectors (GitHub, etc.)
6. Multi-profile / multi-tenant model
7. Community component registry enforcement

## 4) Layout Count (Requested Snapshot)

Page web layout counts at current code state:
- Declared in schema: 3 (`centered`, `split`, `stack`)
- Actually rendered on public page today: 1 (centered; split/stack fallback to centered)

Builder interface layouts (chat experience):
- Desktop split view: 1
- Mobile tab view: 1

## 5) Test and Quality Snapshot

- Automated tests: 112 passed / 112 total (Vitest)
- Covered areas:
  1. Fact-to-section composition behavior (15 tests)
  2. PageConfig validation behavior (15 tests)
  3. Rate-limit behavior (6 tests)
  4. Layout and theme validation (8 tests)
  5. Publish flow — tool level, service level, edge cases (15 tests, mocked)
  6. Page service integration — real SQLite in-memory DB (18 tests)
  7. Translation — LLM translation + cache behavior (18 tests)
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
