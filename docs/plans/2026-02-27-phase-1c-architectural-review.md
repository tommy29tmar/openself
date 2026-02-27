# Phase 1c: Architectural Review

**Date**: 2026-02-27
**Status**: Review of design doc and implementation plan before coding
**Input**: User feedback on initial review + deep code analysis

---

## Part 1: Structured Review of the Plan

### What Is Valid

1. **Per-section LLM personalizer concept** — rewriting text fields with soul voice/tone while keeping structural fields from facts. The `PERSONALIZABLE_FIELDS` map, Zod schemas, and `mergePersonalized` logic are sound.

2. **Section copy cache as a pure cache** — content-addressed, hash-based, TTL-safe. The concept of caching LLM output to avoid redundant calls is correct.

3. **Impact detector** — the idea of mapping changed fact categories to impacted section types via `SECTION_FACT_CATEGORIES` is correct and efficient.

4. **Section richness helper** — prompt-driven drill-down behavior controlled by a context block. Lightweight, no over-engineering.

5. **Fire-and-forget synthesis in web process** — simpler than worker jobs, context already in memory.

6. **Testing strategy** — mock LLM, same patterns as existing tests.

### What Is Incoherent

#### 1. SOURCE OF TRUTH CONFLICT (Critical — blocks implementation)

**The plan says:** Save personalized copy into `draft.config`, preview/SSE reads it from there.

**Reality (ADR-0009):** Preview and publish **never serve `draft.config` raw**. Both routes call `projectCanonicalConfig()` → `composeOptimisticPage()`, which recomposes all section content from facts deterministically. The draft is only used for metadata (theme, style, layoutTemplate, section order, locks).

**Impact:** The entire flow of Task 9 (generate_page saving personalized config) and Task 10 (SSE reading it) is broken. The personalized copy has no path to reach the user's screen.

**Further issue:** The plan treats `section_copy_cache` as both cache AND source of truth. But the plan also applies a 30-day TTL cleanup. If the cache IS the source of truth for visible copy, TTL cleanup destroys active personalized content. These are two incompatible roles.

#### 2. PRIVACY RISK (Critical — security issue)

**The plan says:** The personalizer prompt includes facts + soul + memories + conversation summaries.

**Risk:** Memories (Tier 3) and summaries (Tier 2) can contain private information that the user never intended to publish. If the LLM uses this material to write section text, private data leaks into the public page.

**Example:** User tells agent "I'm going through a divorce" → saved as memory → personalizer uses it to write bio text → published page contains reference to personal situation.

**Required fix:** The personalizer for public-facing copy MUST be grounded ONLY in:
- Publishable facts (`filterPublishableFacts()` — visibility public/proposed, non-sensitive categories)
- Soul compiled voice/tone (safe: contains only style preferences, not private content)

Memories and summaries must NOT be inputs to the personalizer prompt for section copy.

#### 3. PREVIEW STATE CONFLICT (Design inconsistency)

**The plan says:** Add `synthesis_status` to the page table and new SSE states (`synthesizing`, `synthesis_ready`, `synthesis_failed`).

**Reality (ROADMAP.md line 29):** Phase 0.2.1 explicitly simplified preview to `idle | optimistic_ready`, removing synthesis states. `preview-state.ts` has only `PreviewStatus = "idle" | "optimistic_ready"`.

**Decision needed:** Does Phase 1c reopen preview state complexity? If yes, this should be an explicit ADR amendment, not a silent regression.

**Recommendation:** Keep preview states minimal. The shimmer can be driven by a separate client-side signal (a field in the SSE payload like `personalizationPending: boolean`), not by extending the core `PreviewStatus` enum. The page model doesn't need a `synthesis_status` column.

#### 4. CONFORMITY CHECKS AS SILENT REGEN (Architectural gap)

**The plan says:** Conformity check finds issues → calls `personalizeSections()` → overwrites draft copy directly.

**Problem:** The heartbeat runs asynchronously, potentially while the user is offline. Silently modifying visible page content without user awareness violates the project principle: "The agent proposes. You approve. Nothing goes live without your consent." (ARCHITECTURE.md, "The Rule").

**Required fix:** Conformity checks must produce proposals, not direct modifications. Full proposal system needed (see Part 2).

#### 5. ownerKey vs sessionId MISMATCH (Implementation blocker)

**The plan uses:** `handleConformityCheck(ownerKey)`, but then needs to update the draft which is keyed by `sessionId`.

**Reality:** `getDraft(sessionId)` takes a sessionId. There is no `getDraftByOwnerKey()`. In multi-session, one owner can have multiple sessions. The heartbeat job payload contains `ownerKey` but not necessarily the correct `sessionId`.

**Required fix:** Either add sessionId to heartbeat job payloads, or create a lookup function `getWriteSessionForOwner(ownerKey)`.

#### 6. API/FUNCTION MISMATCHES (Implementation blockers)

| Plan reference | Reality | Fix |
|---|---|---|
| `mode` inside generate_page tool | Tool doesn't receive mode. `createAgentTools` at line 247 of chat/route.ts passes `(sessionLanguage, writeSessionId, cognitiveOwnerKey, requestId, readKeys)` — no mode. | Pass `mode` as 6th parameter from chat route (line 214 already has it from `assembleContext`) |
| `getDraftByOwnerKey` | Does not exist | Not needed if we fix the conformity check architecture |
| `setSynthesisStatus(sessionId, status)` | Does not exist, and `synthesis_status` column doesn't exist either | Not needed if we use `personalizationPending` signal instead |
| `saveSynthesisResult(sessionId, config, hash)` | Does not exist | Replace with `upsertSectionCopyState()` (new function) |
| `computeConfigHash` imported from `normalize.ts` | Lives in `page-service.ts` line 15 | Fix import path |
| `hashConfig()` | Does not exist. It's `computeConfigHash()` | Use correct name |
| `logEvent("conformity_check", {...})` | `logEvent` takes a single `LogEventInput` object: `logEvent({ eventType, actor, payload })` | Fix call signature |
| `getActiveSoul(ownerKey)` returns `{ compiled }` | Returns `SoulProfile \| null` with `compiled` field | Access `.compiled` on the returned object |

---

## Part 2: Revised Design

### 2.1 Three-Layer Data Model

```
section_copy_cache          section_copy_state           section_copy_proposals
(pure LLM output cache)     (active approved copy)        (heartbeat proposals)
                            ↑                            ↑
TTL cleanup OK              projection reads this         user reviews these
never source of truth       no destructive TTL            staleness detection
hash → content mapping      hash-guarded                  baseline hashes saved
```

#### Table: `section_copy_cache`
Pure cache. Avoids redundant LLM calls. TTL cleanup (30 days) is safe.
```sql
CREATE TABLE section_copy_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_key, section_type, facts_hash, soul_hash, language)
);
```

#### Table: `section_copy_state`
Active approved personalized copy. Read by projection. Written by:
- Personalizer (auto-applied when user is in builder watching live)
- Proposal acceptance (user reviews and approves)

```sql
CREATE TABLE section_copy_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  facts_hash TEXT NOT NULL,          -- hash of facts used to generate this copy
  soul_hash TEXT NOT NULL,           -- hash of soul used to generate this copy
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'live', -- 'live' (auto during builder) or 'proposal' (user-accepted)
  UNIQUE(owner_key, section_type, language)
);
```

**Hash guard:** When projection reads from `section_copy_state`, it compares the stored `facts_hash` and `soul_hash` against the current values. If they don't match (facts changed since copy was generated), the active copy is stale → fall back to deterministic. This prevents serving copy that doesn't reflect the latest facts.

#### Table: `section_copy_proposals`
Conformity check proposals. Reviewed by user in builder.

```sql
CREATE TABLE section_copy_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  current_content TEXT NOT NULL,      -- copy that was active when proposal was generated
  proposed_content TEXT NOT NULL,     -- suggested replacement
  issue_type TEXT NOT NULL,           -- 'tone_drift' | 'contradiction' | 'stale_content'
  reason TEXT NOT NULL,               -- LLM's explanation of the issue
  severity TEXT NOT NULL DEFAULT 'low', -- 'low' | 'medium'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected' | 'stale' | 'expired'
  facts_hash TEXT NOT NULL,           -- baseline: hash of facts when proposal was made
  soul_hash TEXT NOT NULL,            -- baseline: hash of soul when proposal was made
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
```

**Staleness rule:** When facts or soul change after a proposal is created, the proposal's `facts_hash`/`soul_hash` no longer match current state → mark as `stale`. Stale proposals are never auto-applied.

### 2.2 Where Personalized Copy Lives in the Flow

```
                     LIVE (user in builder)          ASYNC (heartbeat, user offline)
                     ─────────────────────           ──────────────────────────────
generate_page
  → composeOptimisticPage()                          handleConformityCheck()
  → personalizeSections()                              → reads section_copy_state
  → write to section_copy_cache (pure cache)           → single LLM call analyzing coherence
  → write to section_copy_state (auto-approved)        → if issues found:
  → return to agent                                        write to section_copy_proposals (pending)

PREVIEW (SSE/polling)                                USER RETURNS TO BUILDER
  → projectCanonicalConfig()                           → fetch pending proposals
  → mergeActiveSectionCopy(canonical, ownerKey)        → show review banner
      reads section_copy_state                         → user accepts/rejects
      hash-guards: if stale → skip, use deterministic  → accept: copy proposal → section_copy_state
  → return config to client                            → reject: mark rejected

PUBLISH
  → projectPublishableConfig()
  → mergeActiveSectionCopy() (same path as preview)
  → only active approved copy enters published page
  → proposals pending/stale never leak into publish
```

### 2.3 Privacy: What Goes Into the Personalizer Prompt

```
SAFE inputs (used by personalizer):              EXCLUDED from personalizer:
─────────────────────────────────                 ───────────────────────────
filterPublishableFacts(facts)                     Raw memories (Tier 3)
  → visibility: public | proposed                 Conversation summaries (Tier 2)
  → non-sensitive categories only                 Private facts
soul.compiled (voice, tone, perspective)          Sensitive-category facts
username                                          Conflict details
factLanguage
```

The personalizer prompt template becomes:
```
You are a personal page copywriter. Rewrite the content of a "{sectionType}" section
for {username}'s personal page.

## Voice & Tone
{soul.compiled}

## Facts for this section
{publishableFacts filtered to relevant categories}

## Current deterministic content
{section.content}

## Instructions
- Rewrite ONLY text fields: {personalizable fields}
- Keep structured fields EXACTLY as provided
- Ground everything in the facts — do not invent information
- Do not reference private details, medical conditions, relationships, or sensitive topics
- Write in {factLanguage}
- Keep it concise: {maxWords} words max per text field
```

No memories. No summaries. Only publishable facts and soul voice.

### 2.4 Preview: No New States, Minimal Signal

Keep `PreviewStatus = "idle" | "optimistic_ready"` unchanged. Add a lightweight boolean signal:

```typescript
// SSE payload (extended, backward-compatible)
type PreviewEvent = {
  status: "idle" | "optimistic_ready" | "keepalive";
  publishStatus: string;
  config: PageConfig | null;
  configHash: string;
  personalizationPending?: boolean;  // NEW: true while synthesis is running
};
```

**No `synthesis_status` column on the page table.** No new enum values in `PreviewStatus`. The signal is ephemeral — it exists only in the SSE stream, driven by in-memory state in the web process.

How it works:
1. `generate_page` fires background synthesis → sets in-memory flag `personalizationPending[sessionId] = true`
2. SSE poll loop checks the flag → includes `personalizationPending: true` in event
3. Synthesis completes → writes `section_copy_state` → clears flag
4. Next SSE poll: `mergeActiveSectionCopy()` picks up new copy, hash changes → sends update with `personalizationPending: false`
5. Client: shows shimmer on personalizable sections while `personalizationPending === true`

### 2.5 Mode Passing to Tools

Chat route (line 214) already has `mode` from `assembleContext()`. Pass it to `createAgentTools`:

```typescript
// chat/route.ts line 247, add mode as 6th param:
tools: createAgentTools(sessionLanguage, writeSessionId, effectiveScope.cognitiveOwnerKey, requestId, effectiveScope.knowledgeReadKeys, mode),
```

```typescript
// tools.ts line 27, add mode param:
export function createAgentTools(
  sessionLanguage: string = "en",
  sessionId: string = "__default__",
  ownerKey?: string,
  requestId?: string,
  readKeys?: string[],
  mode?: "onboarding" | "steady_state",  // NEW
)
```

The personalizer only runs when `mode === "steady_state"`.

### 2.6 Impact Detection: Explicit State

New table for clean delta detection:

```sql
CREATE TABLE synthesis_state (
  owner_key TEXT PRIMARY KEY,
  last_facts_hash TEXT NOT NULL,
  last_soul_hash TEXT NOT NULL,
  last_synthesized_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

One row per owner. Updated after each successful synthesis. The impact detector reads this single row instead of querying per-section cache entries.

### 2.7 Conformity Checks: Full Proposal System

#### Heartbeat flow

```
handleConformityCheck(ownerKey, sessionId):
  1. Read section_copy_state for this owner
     → if no active personalized copy: skip (nothing to check)
  2. Read soul compiled + current publishable facts
  3. Check budget (llm_limits). Skip if exhausted.
  4. Hash-guard: verify active copy hashes match current facts/soul
     → if any section's copy is stale: skip that section (will be regenerated next live session)
  5. Single LLM call: all active section texts + soul voice
     → "Analyze for tone drift, contradictions, stale content"
  6. Parse structured output (array of issues)
  7. For each issue:
     a. Generate proposed replacement copy (single LLM call per section, max 3)
     b. INSERT into section_copy_proposals with:
        - current_content: the text being replaced
        - proposed_content: the new text
        - issue_type, reason, severity
        - facts_hash, soul_hash: current baselines
        - status: 'pending'
  8. Log to trust ledger
```

#### Proposal staleness

A background check (in light heartbeat or at builder load):
```sql
UPDATE section_copy_proposals
SET status = 'stale'
WHERE status = 'pending'
  AND (facts_hash != ? OR soul_hash != ?);
```

Parameters: current facts hash and soul hash for the owner. If the world changed, proposals are stale.

#### User review UX (builder)

1. On builder load: `GET /api/proposals?status=pending` → returns pending proposals
2. If any: show banner "I've prepared N improvements for your page"
3. Per-proposal view: before/after text, issue type, reason
4. Actions: Accept (single), Reject (single), Accept All
5. Accept: `POST /api/proposals/:id/accept`
   → Copy `proposed_content` into `section_copy_state`
   → Mark proposal `status = 'accepted'`, `reviewed_at = now()`
   → Preview auto-updates (next SSE tick picks up new active copy)
6. Reject: `POST /api/proposals/:id/reject`
   → Mark `status = 'rejected'`, `reviewed_at = now()`

#### Publish interaction

- Publish pipeline calls `mergeActiveSectionCopy()` which reads only from `section_copy_state`
- Pending proposals never enter the publish hash or published config
- After accepting a proposal, user must still click Publish separately

### 2.8 mergeActiveSectionCopy(): The Bridge

New function that sits between canonical projection and the consumer:

```typescript
// src/lib/services/personalization-projection.ts

export function mergeActiveSectionCopy(
  canonical: PageConfig,
  ownerKey: string,
  language: string,
): PageConfig {
  // 1. Read all active section_copy_state entries for this owner + language
  // 2. For each section in canonical.sections:
  //    a. If section type is not personalizable: keep as-is
  //    b. Look up active copy for this section type
  //    c. If found AND facts_hash matches AND soul_hash matches:
  //       → mergePersonalized(section.content, activeCopy, sectionType)
  //    d. If not found OR hash mismatch: keep deterministic content
  // 3. Return config with merged sections
}
```

Called by:
- SSE stream route: `mergeActiveSectionCopy(projectCanonicalConfig(...), ownerKey, factLang)`
- Preview polling route: same
- Publish pipeline: `mergeActiveSectionCopy(projectPublishableConfig(...), ownerKey, factLang)`

This keeps `projectCanonicalConfig()` pure (no DB access, no side effects, ADR-0009 intact).

---

## Part 3: Revised Implementation Plan (Task Order)

### Prerequisites before coding

1. **ADR-0010**: Write a new ADR documenting the personalization layer decisions:
   - Three-layer data model (cache / state / proposals)
   - Privacy constraint (only publishable facts + soul voice in personalizer)
   - Conformity as proposals, not direct modifications
   - mergeActiveSectionCopy as bridge (does not modify projectCanonicalConfig)
   - Preview states unchanged (personalizationPending as ephemeral SSE signal)

2. **Decision: shimmer vs no shimmer**: Confirm the UI approach for personalizationPending. Shimmer CSS is low-cost but adds client complexity. Alternative: no visual indicator, copy just "upgrades" on next SSE tick.

### Task order (revised)

```
T1.  Migration 0018: section_copy_cache, section_copy_state, section_copy_proposals, synthesis_state
T2.  Drizzle schema: 4 new tables
T3.  Personalizer schemas (Zod, PERSONALIZABLE_FIELDS, SECTION_FACT_CATEGORIES, MAX_WORDS)
T4.  Section cache service (pure cache CRUD + cleanup)
T5.  Section copy state service (active copy CRUD + hash-guard reads)
T6.  Merge logic (mergePersonalized — text fields only, iron rule for structured)
T7.  Impact detector (uses synthesis_state table, SECTION_FACT_CATEGORIES)
T8.  Section personalizer core (LLM calls, cache, writes to state + cache)
T9.  mergeActiveSectionCopy() — bridge between projection and consumers
T10. Pass mode to createAgentTools (chat route → tools.ts signature change)
T11. generate_page integration (fire-and-forget, personalizationPending flag)
T12. SSE/preview routes: call mergeActiveSectionCopy, add personalizationPending to payload
T13. Section richness helper + agent context block
T14. Agent prompts: drill-down instructions in steady_state
T15. Client: shimmer CSS + SplitView personalizationPending handling
T16. Conformity check handler (generates proposals, not direct edits)
T17. Proposal service (CRUD, staleness detection, accept/reject)
T18. Proposal API routes (GET /api/proposals, POST accept/reject)
T19. Proposal review UI (banner, before/after, accept/reject buttons)
T20. Deep heartbeat integration (conformity check + cache cleanup)
T21. Integration tests (pipeline, preview, race condition, proposal flow)
T22. Final verification (full test suite, tsc, build)
```

### Parallelizable groups

- T3 + T4 + T5 + T7 (schemas, cache, state, detector — independent data layers)
- T13 + T14 (richness + prompts — agent-side, independent from personalizer pipeline)
- T16 + T17 + T18 (conformity + proposals — independent from live personalizer)
- T15 + T19 (client shimmer + proposal UI — independent frontend tasks)

### Removed from original plan

- `synthesis_status` column on page table (replaced by ephemeral flag)
- `setSynthesisStatus()` / `saveSynthesisResult()` functions
- New PreviewStatus enum values
- Direct modification of draft.config with personalized content
- Memories/summaries as personalizer inputs

### Added to revised plan

- `section_copy_state` table + service (T1, T2, T5)
- `section_copy_proposals` table + service (T1, T2, T17)
- `synthesis_state` table (T1, T2)
- `mergeActiveSectionCopy()` bridge function (T9)
- ADR-0010 (prerequisite)
- Proposal API routes (T18)
- Proposal review UI (T19)
- Privacy filter in personalizer prompt (T8)
- Mode passing to tools (T10)
