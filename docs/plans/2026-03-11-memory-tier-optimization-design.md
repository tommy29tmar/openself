# Memory Tier Optimization — Design Document

**Date:** 2026-03-11
**Status:** Approved
**Challenge:** Multi-model (Gemini + Codex + Claude, 2 rounds)

## Problem

OpenSelf's 4-tier memory architecture has two severely underutilized tiers:
- **Tier 3C (Meta-Memories):** 3.5k budget, agent never calls `save_memory()` spontaneously. Worker already extracts `patternsObserved` but the pipeline has quality and reliability issues.
- **Tier 4 (Episodic):** 0 tokens in context, pull-only via `recall_episodes()`, agent never calls it. Events are never passively visible to the LLM.

Additionally:
- Connectors (GitHub, LinkedIn) write only to Facts (T3A), missing the activity stream dimension (Episodic T4).
- Summary (T2) absent for `draft_ready`, Soul (T3B) absent for `first_visit`.

## Confirmed Design

### Budget: 65k → 75k tokens

User preference: quality over token efficiency. The extra 10k enables proper episodic injection and expanded meta-memory retrieval without cannibalizing other tiers.

### WS1 — Fix Meta-Memory Pipeline (Tier 3C)

**Current state:** Session compaction worker already extracts `patternsObserved` and saves via `saveMemory()`. But:
- Extraction prompt produces generic observations
- `saveMemory()` silently drops writes when cooldown (5/60s) is hit during batch drain
- Only 10 memories retrieved regardless of budget

**Changes:**
1. **Improve compaction prompt** — few-shot examples of good vs. bad behavioral observations. Use standard-tier model (not fast) for higher quality.
2. **`saveMemoryFromWorker()`** — new function: no per-minute cooldown (worker runs infrequently), same 50 max quota, provenance tag `source: "worker"` on saved memories.
3. **Relevance-scored retrieval** — replace `getActiveMemories(ownerKey, 10)` (recency-only) with scoring: `score = recency × frequency_referenced × provenance_weight`. Worker-extracted memories get lower weight than agent-saved. Return top 15 by score.
4. **Budget: 3.5k → 5.5k**

### WS2 — Episodic Smart Injection (Tier 4)

**Current state:** Episodic events never appear in system prompt. Agent must call `recall_episodes()` manually (never does).

**Changes:**
1. **New `source` column on `episodic_events`** — values: `'chat'`, `'github'`, `'linkedin'`, etc. New migration required.
2. **New `PromptBlock` "RECENT EVENTS"** — mutable, shrinkable, 5k budget.
3. **Source-weighted injection:**
   - User-reported (`source = 'chat'`): up to 10 events
   - Per connector: up to 3 events each
   - Total cap: 15 events in block
   - Sorted by recency within each source bucket
4. **Query:** last 30 days, non-archived, non-superseded.
5. **Eligible states:** `returning_no_page`, `active_fresh`, `active_stale` (NOT `first_visit` — no events yet).
6. **Format:** `[YYYY-MM-DD actionType] narrativeSummary` (chronological, one line per event).
7. **Empty = 0 tokens** — block not added when no events exist.
8. **Dream Cycle:** filter `source = 'chat'` by default to prevent machine-imported data from proposing habits.

### WS3 — Connector Dual-Write

**Architectural principle (from Gemini R2 challenge):** Aggregates are facts, not episodic events. T4 must remain a chronological ledger of discrete occurrences.

**Connector output pattern:**
- **Aggregated summaries → Facts (T3A):** "Active on repo X: 12 commits this week"
- **Notable discrete events → Episodic (T4):** "Merged PR #42: Add auth module"
- Each connector defines its own **significance filter** (what qualifies as "notable")

**GitHub changes:**
- Current: imports repos, languages, bio → Facts only
- Add: fetch recent events via GitHub API (`/users/{user}/events`)
- Significance filter: only `PullRequestEvent` (merged), `ReleaseEvent`, `CreateEvent` (repo)
- Aggregated: commit counts per repo per week → Fact
- Notable: merged PRs, releases → Episodic event with `source: 'github'`
- Rate limit handling: cache with TTL, degrade to profile-only sync

**LinkedIn changes:**
- Current: imports experience, education, skills from ZIP → Facts only
- Add: parse `Posts.csv`, `Articles.csv`, `Certifications.csv` from ZIP
- Significance filter: posts with engagement, articles, certifications with dates
- Aggregated: post count, engagement summary → Fact
- Notable: individual articles, certifications → Episodic event with `source: 'linkedin'`
- Defensive parsing: fallback to profile-only import if CSV format changes

**No premature interface abstraction:** Each connector implements its own dual-write logic. No forced `ConnectorOutput` type — connectors are too different (OAuth API vs. ZIP upload).

### WS4 — Budget & Context Profiles

**`BUDGET.total`: 65000 → 75000**

Updated CONTEXT_PROFILES:

| State | Facts | Soul | Summary | Meta-Mem | Episodic | Conflicts | PageState |
|-------|-------|------|---------|----------|----------|-----------|-----------|
| first_visit | 17k | 3k* | — | — | — | — | — |
| returning_no_page | 17k | 7k | 7k | 5.5k* | 5k* | 1.5k | — |
| draft_ready | 13k | 13k | 5k* | — | 3k* | 1.5k | 1.5k |
| active_fresh | 13k | 8.5k | 7k | 5.5k* | 5k* | 1.5k | 1.5k |
| active_stale | 17k | 8.5k | 7k | 5.5k* | 5k* | 1.5k | 1.5k |
| blocked | — | — | — | — | — | — | — |

*Changed values marked with asterisk.

+ Chat History: 22k (unchanged, outside mutable budget)

### WS5 — Soul & Summary Expansion

- **Summary for `draft_ready`:** 5k budget. Users in draft_ready have chatted enough to have a draft — summary compresses older context.
- **Soul for `first_visit`:** 3k budget, gated by fact count ≥ `SPARSE_PROFILE_FACT_THRESHOLD` (10). Lets agent see soul proposals during advanced onboarding.

## Schema Changes

### Migration: episodic_events source column
```sql
ALTER TABLE episodic_events ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
CREATE INDEX idx_episodic_source ON episodic_events(owner_key, source, event_at_unix);
```

### Migration: agent_memory source column
```sql
ALTER TABLE agent_memory ADD COLUMN source TEXT NOT NULL DEFAULT 'agent';
-- Values: 'agent' (tool call), 'worker' (session compaction)
```

## Data Flow

```
User speaks → Agent → create_fact / record_event(source:'chat') / save_memory(source:'agent')
                           ↓
                    Session Compaction Worker
                           ↓
                    patternsObserved → saveMemoryFromWorker(source:'worker')
                           ↓
Connector Sync → significance filter → Notable events → insertEvent(source:'github'/'linkedin')
                                     → Aggregated data → createFact()
                           ↓
                    Dream Cycle (source='chat' only)
                           ↓
                    Pattern Proposals → (user accepts) → Facts (T3A)

Context Assembly:
  Facts (T3A)      ──→ ┐
  Soul (T3B)       ──→ │
  Summary (T2)     ──→ ├──→ System Prompt → LLM
  Meta-Mem (T3C)   ──→ │  (relevance-scored, top 15)
  Episodic (T4)    ──→ │  (source-weighted, per-source caps)
  Chat History (T1)──→ ┘
```

## Challenge Summary

**Multi-model adversarial review (Gemini + Codex + Claude, 2 rounds):**

- **Codex** discovered the worker already extracts meta-memories → avoided building duplicate pipeline
- **Gemini** prevented putting aggregates in episodic events → preserved tier purity
- **All three** agreed on: source/provenance columns required, per-source caps in injection, fix retrieval quality before raising budget
- **Rejected:** Gemini's "keep 65k" (user chose 75k), Gemini's "never inject T4" (defeats the purpose), Gemini's "internal_reflection scratchpad" (adds prompt weight)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Compaction prompt produces generic observations | Standard-tier model + few-shot examples + validate against existing memories |
| LinkedIn CSV format changes | Defensive parsing, fallback to profile-only import |
| GitHub API rate limits | Cache with TTL, respect rate limit headers, degrade gracefully |
| Dream Cycle false positives from imported events | Default filter `source = 'chat'`, opt-in per connector |
| Memory quota (50) fills quickly with worker writes | Worker provenance allows targeted cleanup; quota shared but worker writes are lower-weighted in retrieval |
