# Phase 1c: Architectural Review

**Date**: 2026-02-27
**Status**: Review v4 — editorially unified, single source of truth
**Input**: User feedback on initial review + deep code analysis + second-round findings

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

**Resolution:** No new preview states, no new SSE fields. Personalized copy merges silently via `mergeActiveSectionCopy()` on the next SSE tick — the config hash changes and the client renders the improved text. No `synthesis_status` column, no `personalizationPending` flag, no shimmer CSS.

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
| `setSynthesisStatus(sessionId, status)` | Does not exist, and `synthesis_status` column doesn't exist either | Not needed — personalized copy upgrades silently, no status tracking |
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
  facts_hash TEXT NOT NULL,           -- baseline: per-section hash of relevant facts when proposal was made
  soul_hash TEXT NOT NULL,            -- baseline: hash of soul.compiled when proposal was made
  baseline_state_hash TEXT NOT NULL,  -- hash of section_copy_state.personalized_content at proposal time
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
```

**Staleness rule:** A proposal is stale if ANY of its three baselines no longer match:
1. `facts_hash` — per-section hash of relevant facts changed (new/modified/deleted facts)
2. `soul_hash` — soul.compiled changed (voice/tone shift)
3. `baseline_state_hash` — active copy was regenerated by live synthesis after the proposal was made

Stale proposals are never auto-applied. See §2.7 for staleness check pseudocode and Part 4 Fix 4 for implementation.

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

### 2.4 Preview: Silent Copy Upgrade (No New States)

`PreviewStatus = "idle" | "optimistic_ready"` stays unchanged. No new SSE fields. No shimmer. No in-memory flags.

How it works:
1. `generate_page` writes optimistic (deterministic) config via `upsertDraft()` immediately
2. Fire-and-forget synthesis runs in the same web process
3. Synthesis completes → writes result to `section_copy_state`
4. On next SSE tick (1s interval), `mergeActiveSectionCopy()` picks up the new active copy
5. Config hash changes → client receives updated config → renders improved text

The user sees the text swap within ~1-2 seconds of synthesis completing. No loading indicator, no new SSE payload fields. The preview just "gets better" naturally.

**If shimmer is wanted later:** Add a `pending_regen` boolean column to `section_copy_state` and read it in `mergeActiveSectionCopy()`. But YAGNI for Phase 1c.

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

### 2.6 Impact Detection: Per-Section Delta via `section_copy_state`

No separate `synthesis_state` table. The `section_copy_state` table already has one row per `(owner_key, section_type, language)` with `facts_hash` and `soul_hash`. This IS the delta anchor.

Each section type has relevant fact categories defined in `SECTION_FACT_CATEGORIES` (e.g., `bio → [identity, interest]`, `skills → [skill]`). The `facts_hash` is computed from ONLY the publishable facts in that section type's relevant categories:

```typescript
function computeSectionFactsHash(
  publishableFacts: FactRow[],
  sectionType: string,
): string {
  const categories = SECTION_FACT_CATEGORIES[sectionType] ?? [];
  const relevant = publishableFacts
    .filter(f => categories.includes(f.category))
    .sort((a, b) => a.id.localeCompare(b.id));
  return computeHash(JSON.stringify(relevant.map(f => ({
    id: f.id, category: f.category, key: f.key, value: f.value,
  }))));
}
```

**Note:** `visibility` is excluded from the hash. Since `filterPublishableFacts()` already treats both `public` and `proposed` as publishable, a promote (proposed→public) would change the hash without changing content — falsely marking state/proposals as stale.

Impact detection flow:
1. Fetch current publishable facts for owner
2. For each personalizable section type:
   - Compute current `sectionFactsHash`
   - Read `section_copy_state` row for `(owner, sectionType, language)`
   - No row → never personalized → add to synthesis queue
   - Row exists AND `facts_hash` matches AND `soul_hash` matches → skip
   - Hash mismatch → add to synthesis queue
3. Synthesize only queued sections

### 2.7 Conformity Checks: Full Proposal System

#### Heartbeat flow

```
handleConformityCheck(ownerKey):
  0. Resolve scope: resolveOwnerScopeForWorker(ownerKey) → { knowledgePrimaryKey, knowledgeReadKeys }
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
        - facts_hash, soul_hash: current per-section baselines
        - baseline_state_hash: hash of current active copy content
        - status: 'pending'
  8. Log to trust ledger
```

#### Proposal staleness

Per-section staleness (consistent with per-section hashing in §2.6). Cannot be done in SQL because each proposal's `section_type` maps to different fact categories:

```
markStaleProposals(ownerKey):
  1. Resolve scope → get publishable facts + soul hash
  2. For each pending proposal:
     a. Compute currentFactsHash = computeSectionFactsHash(facts, proposal.sectionType)
     b. If proposal.factsHash != currentFactsHash OR proposal.soulHash != currentSoulHash:
        → mark proposal status = 'stale'
     c. If proposal.baselineStateHash != current active copy hash:
        → mark proposal status = 'stale' (active state changed since proposal was made)
```

Run at builder load (sync) and in light heartbeat (async, best-effort).

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

## Part 3: ~~Revised Implementation Plan~~ (SUPERSEDED — see Part 5)

*This section contained an intermediate task list that is now superseded by Part 5. Kept for audit trail only.*

---

## Part 4: Targeted Fixes (Third Feedback Round)

### Fix 1: Per-Section Delta Detection — Drop `synthesis_state`

**Problem:** The `synthesis_state` table stores one row per owner with a single `last_facts_hash`. This doesn't enable per-category/per-section selective regen. If any fact changes, we'd have to re-synthesize ALL sections, even if the changed fact (e.g., a skill) only affects the `skills` section.

**Fix:** Remove `synthesis_state` entirely. Use `section_copy_state` as the delta anchor — it already has one row per `(owner_key, section_type, language)` with a `facts_hash`.

**Per-section hashing:** See §2.6 for `computeSectionFactsHash()` definition and rationale (visibility excluded from hash).

**Impact detection flow (in `generate_page` and heartbeat):**

```
1. Fetch current publishable facts for owner
2. For each personalizable section type:
   a. Compute current sectionFactsHash
   b. Read section_copy_state row for (owner, sectionType, language)
   c. If no row → never personalized → add to synthesis queue
   d. If row exists AND facts_hash matches AND soul_hash matches → skip
   e. If hash mismatch → add to synthesis queue
3. Synthesize only queued sections
```

**Migration update:** Remove `synthesis_state` from migration 0018. `section_copy_state` already serves this purpose.

**Revised `section_copy_state` table** (unchanged from Part 2 — it already has `facts_hash` and `soul_hash`):

```sql
CREATE TABLE section_copy_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  facts_hash TEXT NOT NULL,    -- per-section hash (only relevant categories)
  soul_hash TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'live',
  UNIQUE(owner_key, section_type, language)
);
```

### Fix 2: Worker Fact Scope Resolution

**Problem:** The heartbeat job payload contains only `{ ownerKey }`. But reading facts requires `(knowledgePrimaryKey, knowledgeReadKeys)`. For authenticated users, `ownerKey = profileId`, and the fact tables are keyed by `sessionId`. The worker has no way to resolve from profileId → sessionIds.

**Solution:** Export a new function `resolveOwnerScopeForWorker(ownerKey)` from `src/lib/auth/session.ts`.

**Implementation:**

1. Export `allSessionIdsForProfile` and `anchorSessionId` (currently private in `session.ts`).
2. Add `resolveOwnerScopeForWorker`:

```typescript
// src/lib/auth/session.ts — new exported function

/**
 * Resolve OwnerScope from ownerKey alone (for worker context where no HTTP request exists).
 * ownerKey is profileId for authenticated users, sessionId for anonymous.
 */
export function resolveOwnerScopeForWorker(ownerKey: string): OwnerScope {
  // Try as profileId first (authenticated)
  const sessionIds = allSessionIdsForProfile(ownerKey);
  if (sessionIds.length > 0) {
    const anchor = anchorSessionId(ownerKey, sessionIds[0]);
    return {
      cognitiveOwnerKey: ownerKey,
      knowledgeReadKeys: sessionIds,
      knowledgePrimaryKey: anchor,
      currentSessionId: sessionIds[0], // not meaningful in worker, but type-safe
    };
  }

  // Anonymous: ownerKey is the sessionId itself
  return {
    cognitiveOwnerKey: ownerKey,
    knowledgeReadKeys: [ownerKey],
    knowledgePrimaryKey: ownerKey,
    currentSessionId: ownerKey,
  };
}
```

**Why not expand the job payload instead?** The job payload route (`enqueueHeartbeat`) is already deployed and stable. Adding fields to the payload means coordinating the enqueue side (web process) and dequeue side (worker). A worker-side resolver is simpler: one function, one place, zero coordination. The pattern also works for any future worker job that needs scope.

**Consumer in heartbeat:**

```typescript
// heartbeat.ts (conformity check section)
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getAllFacts } from "@/lib/services/kb-service";

function handleConformityCheck(ownerKey: string): void {
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const facts = getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
  const publishable = filterPublishableFacts(facts);
  // ... proceed with conformity analysis
}
```

### Fix 3: Drop `personalizationPending` — Silent Copy Upgrade

Resolved in §2.4. No in-memory flags, no SSE extensions, no shimmer. Copy upgrades silently on next SSE tick.

### Fix 4: Per-Section Proposal Staleness

**Problem:** The staleness SQL in Part 2 uses "current facts hash and soul hash for the owner" but doesn't specify WHICH hash. A global hash (all facts) would mark ALL proposals stale if ANY fact changes. A per-section hash correctly marks only proposals whose relevant categories changed.

**Decision: Per-section hashing, consistent with Fix 1.**

A proposal for section type `bio` stores:
- `facts_hash = computeSectionFactsHash(publishableFacts, "bio")` — only `identity` + `interest` categories
- `soul_hash = computeHash(soul.compiled)`

**Staleness check** (at builder load or light heartbeat):

```typescript
function markStaleProposals(ownerKey: string): number {
  const scope = resolveOwnerScopeForWorker(ownerKey);
  const facts = getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
  const publishable = filterPublishableFacts(facts);
  const soul = getActiveSoul(ownerKey);
  const currentSoulHash = soul?.compiled ? computeHash(soul.compiled) : "";

  const pending = db.select().from(sectionCopyProposals)
    .where(and(
      eq(sectionCopyProposals.ownerKey, ownerKey),
      eq(sectionCopyProposals.status, "pending"),
    ))
    .all();

  let staleCount = 0;
  for (const proposal of pending) {
    const currentFactsHash = computeSectionFactsHash(publishable, proposal.sectionType);
    let isStale = false;

    // Check 1: facts or soul changed since proposal was made
    if (proposal.factsHash !== currentFactsHash || proposal.soulHash !== currentSoulHash) {
      isStale = true;
    }

    // Check 2: active copy changed since proposal was made (e.g., live synthesis ran)
    if (!isStale) {
      const activeState = getActiveSectionCopy(proposal.ownerKey, proposal.sectionType, proposal.language);
      if (activeState) {
        const currentStateHash = computeHash(activeState.personalizedContent);
        if (currentStateHash !== proposal.baselineStateHash) {
          isStale = true;
        }
      }
    }

    if (isStale) {
      db.update(sectionCopyProposals)
        .set({ status: "stale" })
        .where(eq(sectionCopyProposals.id, proposal.id))
        .run();
      staleCount++;
    }
  }
  return staleCount;
}
```

**Why not a single SQL UPDATE?** Because per-section hashing requires computing the hash for each proposal's `section_type` against its specific categories. This is application logic, not expressible in SQL. The loop is small (max ~18 proposals, one per section type).

### Strengthened Conformity Check Specification

#### Two-Phase LLM

**Phase 1 — Analyze (single call, all sections):**

```typescript
// Input: all active section texts + soul voice
// Output: structured array of issues

const analysisSchema = z.object({
  issues: z.array(z.object({
    sectionType: z.string(),
    issueType: z.enum(["tone_drift", "contradiction", "stale_content"]),
    reason: z.string(),
    severity: z.enum(["low", "medium"]),
  })),
});

const { object } = await generateObject({
  model,
  schema: analysisSchema,
  prompt: `Analyze these page sections for coherence issues...`,
});
```

If `issues` is empty → no proposals needed → exit.

**Phase 2 — Propose rewrites (one call per issue, max 3):**

```typescript
// For each issue (capped at 3 to control cost):
const rewriteSchema = z.object({
  rewrittenContent: z.record(z.string()), // { fieldName: newValue }
});

const { object } = await generateObject({
  model,
  schema: rewriteSchema,
  prompt: `Rewrite the ${issue.sectionType} section to fix: ${issue.reason}...`,
});
```

**Why two phases?** Phase 1 is cheap (one call, analysis only). Most heartbeats will find zero issues and stop. Phase 2 only runs when issues are found, and is capped at 3 rewrites per heartbeat to bound cost.

#### Server-Side Guards on Proposal Accept

When `POST /api/proposals/:id/accept` is called:

```typescript
function acceptProposal(proposalId: string): { ok: boolean; error?: string } {
  const proposal = getProposal(proposalId);
  if (!proposal || proposal.status !== "pending") {
    return { ok: false, error: "PROPOSAL_NOT_FOUND" };
  }

  // Guard 1: STALE_PROPOSAL — facts/soul changed since proposal was made
  const scope = resolveOwnerScopeForWorker(proposal.ownerKey);
  const facts = getAllFacts(scope.knowledgePrimaryKey, scope.knowledgeReadKeys);
  const publishable = filterPublishableFacts(facts);
  const currentFactsHash = computeSectionFactsHash(publishable, proposal.sectionType);
  const soul = getActiveSoul(proposal.ownerKey);
  const currentSoulHash = soul?.compiled ? computeHash(soul.compiled) : "";

  if (proposal.factsHash !== currentFactsHash || proposal.soulHash !== currentSoulHash) {
    // Mark stale rather than silently rejecting
    markProposalStale(proposalId);
    return { ok: false, error: "STALE_PROPOSAL" };
  }

  // Guard 2: STATE_CHANGED — active copy was modified or deleted after proposal was created
  const activeState = getActiveSectionCopy(proposal.ownerKey, proposal.sectionType, proposal.language);
  if (!activeState) {
    // The state the proposal was made against no longer exists
    markProposalStale(proposalId);
    return { ok: false, error: "STATE_CHANGED" };
  }
  const currentStateHash = computeHash(activeState.personalizedContent);
  if (currentStateHash !== proposal.baselineStateHash) {
    markProposalStale(proposalId);
    return { ok: false, error: "STATE_CHANGED" };
  }

  // All guards pass → apply
  upsertSectionCopyState({
    ownerKey: proposal.ownerKey,
    sectionType: proposal.sectionType,
    language: proposal.language,
    personalizedContent: proposal.proposedContent,
    factsHash: proposal.factsHash,
    soulHash: proposal.soulHash,
    source: "proposal",
  });

  markProposalAccepted(proposalId);
  return { ok: true };
}
```

#### Transactional Accept All

`POST /api/proposals/accept-all` wraps all individual accepts in a single SQLite transaction:

```typescript
function acceptAllPendingProposals(ownerKey: string): {
  accepted: number;
  stale: number;
  errors: string[];
} {
  const pending = getPendingProposals(ownerKey);
  let accepted = 0;
  let stale = 0;
  const errors: string[] = [];

  // Single transaction for atomicity.
  // acceptProposal() must participate in this transaction — either it receives
  // the transaction handle or uses the same sqlite connection (SQLite serializes
  // writes on a single connection, so BEGIN/COMMIT wraps all inner operations).
  sqlite.exec("BEGIN");
  try {
    for (const proposal of pending) {
      const result = acceptProposal(proposal.id);
      if (result.ok) {
        accepted++;
      } else if (result.error === "STALE_PROPOSAL" || result.error === "STATE_CHANGED") {
        stale++;
      } else {
        errors.push(`${proposal.sectionType}: ${result.error}`);
      }
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }

  return { accepted, stale, errors };
}
```

**Behavior:** If some proposals are stale and others aren't, the stale ones are marked stale and the valid ones are accepted — all atomically. The client shows a summary: "3 accepted, 1 stale (facts changed)".

---

## Part 5: Revised Task List (Supersedes Part 3)

Incorporating all fixes from Parts 1-4. `synthesis_state` table removed. `personalizationPending` dropped. Per-section hashing throughout.

### Prerequisites

1. **ADR-0010**: Personalization layer decisions (three-layer model, privacy, proposals, per-section hashing, mergeActiveSectionCopy bridge, no new preview states)

### Tasks

```
T1.  Migration 0018: section_copy_cache, section_copy_state, section_copy_proposals (3 tables)
T2.  Drizzle schema: 3 new tables
T3.  Shared hashing: computeSectionFactsHash(), computeHash() utility
T4.  Personalizer schemas: Zod per section type, PERSONALIZABLE_FIELDS, SECTION_FACT_CATEGORIES, MAX_WORDS
T5.  Section cache service: pure cache CRUD + 30-day TTL cleanup
T6.  Section copy state service: active copy CRUD + hash-guard reads
T7.  Merge logic: mergePersonalized() — text fields only, structured fields untouched
T8.  Impact detector: uses section_copy_state for delta (per-section hash comparison)
T9.  Section personalizer core: LLM generateObject, cache, writes to state + cache
T10. mergeActiveSectionCopy() — bridge between projection and consumers
T11. Export resolveOwnerScopeForWorker() from session.ts
T12. Pass mode to createAgentTools (chat route → tools.ts signature change)
T13. generate_page integration: fire-and-forget synthesis (no personalizationPending flag)
T14. SSE/preview routes: call mergeActiveSectionCopy() after projectCanonicalConfig()
T15. Publish pipeline: call mergeActiveSectionCopy() after projectPublishableConfig()
T16. Section richness helper + agent context block
T17. Agent prompts: drill-down instructions in steady_state
T18. Conformity analysis: two-phase LLM (analyze + propose rewrites)
T19. Proposal service: CRUD, per-section staleness detection, accept with guards, accept-all
T20. Proposal API routes: GET /api/proposals, POST accept, POST reject, POST accept-all
T21. Proposal review UI: banner, before/after diff, accept/reject/accept-all buttons
T22. Deep heartbeat integration: conformity check + stale proposal cleanup + cache TTL cleanup
T23. Integration tests: pipeline, preview, race conditions, proposal flow, staleness
T24. Final verification: full test suite, tsc, build
```

### Dependency graph

```
T1 → T2 → T3 → {T4, T5, T6} → T7 → T8 → T9 → T10

T11 (independent, needed by T18 and T22)
T12 (independent, needed by T13)

T10 → {T13, T14, T15}

T16 + T17 (independent agent-side work)

T11 + T9 → T18 → T19 → T20 → T21

T11 + T18 + T19 → T22

T13 + T14 + T15 + T21 + T22 → T23 → T24
```

### Parallelizable groups

- T4 + T5 + T6 (schemas, cache service, state service — after T3)
- T11 + T12 (scope resolver + mode passing — fully independent)
- T16 + T17 (richness + prompts — independent from personalizer pipeline)
- T14 + T15 (preview + publish route changes — both consume T10)

### Removed vs Part 3

- `synthesis_state` table (Fix 1: section_copy_state is the delta anchor)
- `personalizationPending` flag, shimmer CSS, SSE extension (Fix 3: silent upgrade)
- Task count: 24 → 24 (rebalanced, not reduced, because conformity check spec expanded)
