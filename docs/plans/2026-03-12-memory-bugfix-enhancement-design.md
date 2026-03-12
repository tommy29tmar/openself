# Memory System Bug Fixes + T3/T4 Value-Add Enhancement

**Date:** 2026-03-12
**Status:** Approved (post multi-model challenge: Gemini + Codex + Claude, 2 rounds)

## Problem

A 6-agent audit of the 4-tier memory system found 8 bugs (1 HIGH, 4 MEDIUM, 3 LOW) and identified that Tier 3 (Meta-Memories) delivers low value due to: agent rarely saving memories spontaneously, worker-extracted patterns being low quality, no feedback loop to identify useful memories, and shared quota allowing worker to crowd out agent writes. Tier 4 (Episodic) FTS search is phrase-only and there's no guidance for cross-tier linking.

## Design Decisions

### Bug Fixes (8)

**BUG-E1 (HIGH)** — GitHub first-sync episodic violation:
- Wrap activity stream path B in `if (!isFirstSync)` guard (`github/sync.ts:165`)
- Seed `syncCursor.lastSeenEventId` from first event in GitHub response on first sync (baseline for second sync)

**BUG-E2/E3 (MEDIUM)** — RSS + Strava dedup gap:
- Remove `AND event_id IS NOT NULL` from dedup query in `connector-event-writer.ts:48`
- Baseline `connector_items` (without event_id) become visible to dedup, blocking re-emission

**BUG-E4 (MEDIUM)** — LinkedIn source inconsistency:
- Change `source: "linkedin"` to `source: "linkedin_zip"` in `activity-mapper.ts:69,101`

**BUG-F1 (MEDIUM)** — Stale Spotify facts:
- Add `staleSinceSync` counter in `syncCursor` JSON (existing field, no migration)
- Each sync: increment counter for `sp-artist-*`/`sp-track-*`/`sp-genre-*` facts not in current top
- Archive after 3 consecutive absent syncs via new `archiveFact()` export from kb-service
- Reset counter to 0 if artist/track reappears

**BUG-M1 (LOW)** — Fix stale comment in `prompts.ts:395`: 65000 → 75000

**BUG-M2 (LOW)** — Remove `updateFact()` from `kb-service.ts` (deprecated dead code)

**BUG-M3 (LOW)** — Remove `getActiveMemories()` from `memory-service.ts`, migrate tests to `getActiveMemoriesScored()`

### Tier 3 — Meta-Memory Improvements

**1. Async usage tracking** (1 migration: `last_referenced_at` column on `agent_memory`):
- In `chat/route.ts` `onFinish`: batch-UPDATE `last_referenced_at` for memory IDs that were in context
- IDs passed via closure from `assembleContext()` (extended return value)
- Pure read path preserved — `getActiveMemoriesScored()` remains side-effect-free

**2. Scoring formula**:
```
score = creationRecency * provenance * usageBoost
creationRecency = 0.5 ^ (ageDays / 14)
provenance = { agent: 1.0, worker: 0.6 }
usageBoost = lastReferencedAt ? 0.5 ^ (daysSinceLastRef / 28) : 0.5
```

**3. Eviction policy** (replaces rigid quota):
- On save #51: deactivate lowest-scoring memory
- Floor: minimum 5 agent-sourced memories always protected from eviction
- Worker patterns naturally evicted first (lower provenance score)

**4. Compaction prompt upgrade** (tier fast maintained):
- Rewrite prompt: demand behavioral synthesis, ban mechanical summaries
- Add 3 few-shot examples of good/bad patterns
- Add `pattern_quality` field in `session_compaction_log` for tracking
- Tier upgrade to standard only with data justification

**5. Context format**: `- [type|category] content`

**6. MEMORY SELF-MANAGEMENT policy** in `memory-directives.ts`:
- Structured when-to-save / when-NOT-to-save with examples
- Cross-tier prompt: "When episodic events relate to facts, mention connections naturally"

### Tier 4 — Episodic Improvements

**1. FTS word-split**: Split query into per-word quoted tokens (AND semantics)

**2. Cross-tier via prompt**: Zero infrastructure — LLM does semantic synthesis

### Test Coverage (8 new files + extensions)

New: github-firstsync-guard, connector-dedup-baseline, spotify-stale-cleanup, batch-record-events, memory-scoring-formula, episodic-fts-wordsplit, session-compaction-real-db, memory-eviction

Extensions: memory-service (last_referenced_at, usageBoost), episodic-consolidation (evaluatePatternWithLLM mock)

### Minimal API

- `GET /api/memory` — active memories sorted by score (authenticated)
- `DELETE /api/memory/:id` — deactivate memory (authenticated)

### Migration

```sql
-- 0030_memory_usage_tracking.sql
ALTER TABLE agent_memory ADD COLUMN last_referenced_at TEXT;
```

## Challenge Summary

Design survived 2 rounds of adversarial review (Gemini + Codex + Claude). Key changes from initial draft:

| Original | After challenge | Reason |
|---|---|---|
| reference_count write-on-read | last_referenced_at async post-turn | Write-on-read violates idempotency, inflates counts on retry |
| Sub-quota 35/15 hardcoded | Eviction with agent floor | Hardcoded quotas cause artificial starvation |
| Cross-tier annotation hardcoded | Prompt-driven LLM linking | No stable join key between schemas |
| Compaction fast → standard | Prompt upgrade first, fast kept | 10x cost with no evidence |
| Spotify immediate archive | staleSinceSync 3-sync threshold | Snapshot volatile, prevents thrashing |
