# ADR-0015: Tier 3 Memory Eviction & Scoring Policy

**Status:** Accepted
**Date:** 2026-03-12
**Deciders:** Engineering
**Supersedes:** Rigid quota enforcement in ADR-0013

## Context

ADR-0013 introduced a 50-memory quota for Tier 3 (agent memory). The original design
used a rigid quota: once 50 active memories existed, new saves would fail. This created
two problems:

1. **Worker flood**: Session compaction and heartbeat journal analysis generate patterns
   via `saveMemoryFromWorker()`. Under heavy use, worker-sourced memories could fill the
   quota, crowding out agent-observed behavioral notes that are typically higher quality.
2. **Stale accumulation**: Memories that were never referenced in LLM context occupied
   quota slots indefinitely, even if they provided no value to conversation quality.

## Decision

Replace rigid quota enforcement with a **dynamic eviction policy** and a **three-factor
scoring formula**.

### Eviction Policy

When `saveMemory()` would exceed the 50-memory limit, `evictLowestScoring()` deactivates
the single lowest-scored memory — with one protection: a minimum of 5 agent-sourced
memories (`AGENT_FLOOR = 5`) are always preserved. If the lowest-scored memory is
agent-sourced and only 5 agent memories remain, the eviction skips it and targets the
next lowest-scored memory (which will be worker-sourced).

### Scoring Formula

```
score = creationRecency × provenanceWeight × usageBoost
```

- **creationRecency** = `0.5 ^ (ageDays / 14)` — 14-day half-life on creation date
- **provenanceWeight** — `agent: 1.0`, `worker: 0.6`
- **usageBoost** — tracks actual LLM context usage:
  - Referenced: `0.5 ^ (daysSinceLastRef / 28)` (28-day half-life)
  - Never referenced: `0.5` fixed penalty (`NEVER_REFERENCED_PENALTY`)

### Usage Tracking

`updateLastReferencedAt(ownerKey, memoryIds)` updates the `last_referenced_at` column
for all memory IDs that survived context assembly. Called asynchronously in `onFinish`
of the chat route. Paired ID tracking through all truncation phases (per-block budget,
overflow shrink loop, final hard truncation) ensures accurate reference counting.

Defensive cap: SQLite's 999-parameter limit is respected via chunked queries.

## Consequences

### Positive
- Agent memories are protected from worker flood (AGENT_FLOOR guarantee)
- Unused memories naturally decay and get evicted
- No hard failures on quota — saves always succeed (eviction makes room)
- Usage tracking creates a positive feedback loop: useful memories persist

### Negative
- Slightly more complex save path (eviction query on every save at quota)
- Async `updateLastReferencedAt` adds a DB write per chat turn
- New migration (0030) adds `last_referenced_at` column

## Alternatives Considered

1. **Increase quota to 100**: Delays the problem without solving it. More memories
   ≠ better context; budget truncation means only top-N are used anyway.
2. **Keep rigid quota with priority lanes**: Complex slot allocation (e.g., 30 agent,
   20 worker) is brittle and hard to tune.
3. **Time-based TTL only**: Ignores usage signals. A 6-month-old memory that's
   referenced every session is more valuable than a 1-day-old memory that's ignored.

## Related

- ADR-0013 (Agent Memory Upgrade) — original memory architecture
- Migration 0030 (`0030_memory_usage_tracking.sql`)
- `src/lib/services/memory-service.ts` — eviction and scoring implementation
