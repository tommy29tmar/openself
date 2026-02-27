# ADR-0010: Personalization Layer

**Status:** Accepted
**Date:** 2026-02-27
**Context:** Phase 1c adds per-section LLM personalization to page composition.

## Decision

### Three-Layer Data Model
- `section_copy_cache`: Pure LLM output cache. TTL cleanup (30d) safe. Content-addressed by (owner, sectionType, factsHash, soulHash, language).
- `section_copy_state`: Active approved copy. Read by projection via `mergeActiveSectionCopy()`. One row per (owner, sectionType, language). Hash-guarded reads.
- `section_copy_proposals`: Heartbeat-generated proposals. Reviewed by user. Staleness detection via three baselines (factsHash, soulHash, baselineStateHash).

### ADR-0009 Compliance
`projectCanonicalConfig()` remains pure — no DB access, no side effects. Personalized copy merges AFTER projection via `mergeActiveSectionCopy()`.

### Privacy
Personalizer inputs: `filterPublishableFacts()` + `soul.compiled` only. No memories (Tier 3), no summaries (Tier 2).

### Preview
No new states. `PreviewStatus = "idle" | "optimistic_ready"` unchanged. Copy upgrades silently on next SSE tick when `mergeActiveSectionCopy()` picks up new active copy.

### Conformity
Two-phase LLM (analyze all sections → propose rewrites, max 3). Proposals require user approval. Server-side guards on accept (STALE_PROPOSAL, STATE_CHANGED).

### Per-Section Hashing
`computeSectionFactsHash()` hashes only facts in relevant categories per section type. Visibility excluded from hash — promote proposed→public does not invalidate.

### Worker Scope Resolution
`resolveOwnerScopeForWorker(ownerKey)` resolves from ownerKey (profileId or sessionId) to full OwnerScope without HTTP request context.

## Consequences
- Preview remains `idle | optimistic_ready` — no shimmer, no pending states
- Publish only serves accepted copy from `section_copy_state` — proposals never leak
- Per-section hashing enables selective regeneration (only impacted sections)
- Worker uses `resolveOwnerScopeForWorker()` for fact access in heartbeat
- Fire-and-forget synthesis in `generate_page` — deterministic config saved first, personalized copy arrives on next SSE tick
- Conformity check proposals reviewed by user in builder — "The agent proposes. You approve."
