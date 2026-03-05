# ADR-0013 — Agent Memory Upgrade

**Date:** 2026-03-05
**Status:** Accepted
**Branch:** `feat/agent-memory-upgrade`

---

## Context

The agent context assembler had several limitations:

1. **Stale context** — The agent could not see the current state of the draft page (layout, presence, sections). In steady-state turns, it had to call tools to discover state it should already know, wasting steps.
2. **Small turn cap** — 12 turns × 22k-token budget was tight for multi-step sessions. Users with long conversations lost recent context unnecessarily.
3. **Small facts cap** — Top-50 facts left significant known facts out of context for users with rich profiles.
4. **Truncation regression** — The post-assembly overflow guard was rebuilding the prompt from only the mutable blocks, silently dropping static blocks (auth, coherence, quota, magic paste, pending ops) when budgets were tight.
5. **No async memory distillation** — Raw chat history was only summarized via the existing `memory_summary` job, which produced a single rolling summary per owner. No structured per-session analysis extracted facts or communication patterns.

---

## Decisions

### 1. Page State Block in Context

**Decision:** Inject a `CURRENT DRAFT PAGE:` block for steady-state profiles (`draft_ready`, `active_fresh`, `active_stale`).

**Content:** `layoutTemplate`, `surface`/`voice`/`light` presence values, sections list (type, slot, widgetId).

**Budget:** 1500 tokens (mutable — shrinkable under overflow).

**Profile gate:** `pageState: { include: boolean; budget: number }` on `ContextProfile`. Early-journey profiles get `include: false`.

**Rationale:** Avoids the "cold start" problem on every steady-state turn where the agent doesn't know the page structure. The draft exists and is cheap to read — there's no reason not to show it.

### 2. Raise maxTurns and Facts Cap

**Decision:**
- `maxTurns`: 12 → 20 (within existing 22k-token turn budget)
- `sortFactsForContext` cap: 50 → 120

**Rationale:** The token budget (22000 for turns, 17000 for facts) was always larger than the item caps implied. Raising the caps makes full use of the available budget for users with rich profiles and long sessions.

### 3. mutableParts / staticParts Split

**Decision:** Refactor `assembleContext` to separate context blocks into:
- `mutableParts` — blocks that may be shrunk by the overflow guard (facts, soul, summary, memories, conflicts, pageState)
- `staticParts` — blocks that are always appended unchanged (auth, exploration priorities, pending ops, coherence, quota, magic paste)

The overflow guard only rebuilds `mutableParts`; `staticSuffix = staticParts.join("")` is always appended after rebuild.

**Rationale:** The prior implementation dropped static blocks when rebuilding under budget overflow. Auth context (`USER AUTH: Authenticated as...`) and pending operation injection (`INCOMPLETE_OPERATION`) were being silently lost — directly breaking agent behavior.

### 4. Session Compaction Worker

**Decision:** Add a new `session_compaction` worker job that asynchronously distills raw chat history into structured semantic memory.

**Key design choices:**

| Choice | Decision | Rationale |
|---|---|---|
| Cursor type | `rowid INTEGER` | Monotonic, no second-level collisions (vs. `created_at TEXT`) |
| Ordering in `getLastCompactionRowid` | `ORDER BY cursor_rowid DESC` | Correct for multi-window same-second runs |
| Anti-burn scope | Deterministic failures only (`json_parse_failure`, `schema_validation_failure`) | Transient errors must not permanently skip valid windows |
| Anti-burn trigger | `deterministicFailures + 1 >= MAX_FAILURES_PER_WINDOW` | Fires skip within `MAX_ATTEMPTS=3`, no 4th attempt needed |
| Failure handling | `skipped:true` → no throw (cursor advances); non-skipped failure → throw (executeJob retries) | Preserves retry semantics while preventing infinite loops |
| Backlog draining | 5-window loop per job execution; continuation enqueue if `lastRowsLength === 40` | Bounded per execution; handles large backlogs incrementally |
| Dedup index | `WHERE status='queued'` only (not `'running'`) | Running job can enqueue continuation without UNIQUE conflict |
| Shape validation | `isStringArray` + `VALID_MOODS` Set | Non-string array elements throw at runtime without validation |
| Pattern persistence | Save up to 2 `patternsObserved` per window as `type="pattern"` agent memories | Feeds Tier 3 memory with behavioral observations |

**Trigger:** Enqueued after every chat turn in `route.ts` `onFinish` callback, after `enqueueSummaryJob`. Uses `enqueueJob` which calls `.onConflictDoNothing()` — UNIQUE violations are handled silently at ORM level.

---

## Consequences

- Agent has full draft page awareness on every steady-state turn (no "blind" turns)
- Static prompt blocks are guaranteed to be included regardless of context size
- Session patterns and moods are distilled into Tier 3 agent memories asynchronously
- Per-session compaction log provides full audit trail (`session_compaction_log`)
- Migration 0026 adds `session_compaction` to jobs table CHECK constraint + dedup indexes

## Schema Changes

- **Migration 0026** (`db/migrations/0026_session_compaction.sql`):
  - Rebuilds `jobs` table with `session_compaction` in `job_type` CHECK
  - Adds global dedup index (queued|running) for non-compaction types
  - Adds per-session compaction dedup index (queued only)
  - Adds `idx_messages_session` on `messages(session_id)`
  - Creates `session_compaction_log` table with `cursor_rowid INTEGER` and DESC index
- **EXPECTED_SCHEMA_VERSION**: 25 → 26
- **EXPECTED_HANDLER_COUNT**: 9 → 10
