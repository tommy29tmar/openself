# UAT Bug Fixes — Davide Ferrara Session Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 3 bugs found in the 2026-03-13 production UAT (Davide Ferrara persona, score 85/100).

**Architecture:** BUG-1 is a code fix (ownerKey mismatch between curation storage and publish lookup). BUG-2 is prompt + tool description fix (missing agent instructions for section reorder tool selection). BUG-3 is a scoped prompt fix (delete result trust with section-removal exception).

**Tech Stack:** TypeScript, Drizzle ORM, SQLite, Vercel AI SDK

**UAT Report:** `uat/UAT-REPORT.md`

---

## Chunk 1: BUG-1 — Bio Regression on First Publish

### Root Cause

When a user curates their bio (via `curate_content`) while anonymous and then signs up to publish:

1. `curate_content` stores section_copy_state with `ownerKey = effectiveOwnerKey` = sessionId (anonymous)
   - File: `src/lib/agent/tools.ts:2176-2184`
2. After signup, the publish route passes `ownerKey = scope?.cognitiveOwnerKey` = profileId
   - File: `src/app/api/publish/route.ts:90`
3. `prepareAndPublish` computes `profileId = ownerKey ?? session?.profileId ?? sessionId` = profileId
   - File: `src/lib/services/publish-pipeline.ts:117`
4. `mergeActiveSectionCopy` calls `getAllActiveCopies(profileId, language)`
   - File: `src/lib/services/personalization-projection.ts:39`
5. But the curation row has `ownerKey = sessionId` (step 1), so query returns **0 rows**
6. Bio falls back to deterministic composition → custom bio lost

**Why second publish works:** User re-curates bio post-signup, so `effectiveOwnerKey = profileId` matches the publish lookup.

### Fix Strategy

Extend `getAllActiveCopies` to accept optional `readKeys` and query `IN (ownerKey, ...readKeys)`. This follows the same multi-session pattern used by `searchFacts`, `deleteFact`, and `getProjectedFacts`. Then pass `readKeys` through from `mergeActiveSectionCopy` callers.

**Duplicate sectionType resolution:** When readKeys returns copies from BOTH old session AND new profile for the same sectionType, `Map(copies.map(c => [c.sectionType, c]))` in `mergeActiveSectionCopy` keeps the last one. To ensure the primary ownerKey's copy wins, `getAllActiveCopies` returns primary-owner rows LAST (so Map overwrites readKeys copies with primary-owner copies).

**Hash guard validity:** After signup, `backfillProfileId()` migrates facts from sessionId → profileId. The hash computed at curation time (facts under sessionId) may differ from the hash at publish time (facts under profileId) IF `getProjectedFacts` returns different results. However, `getProjectedFacts(ownerKey, readKeys)` queries with readKeys which includes the old sessionId, so it finds the same facts. The hash guard should match. An integration test (Task 2) will verify this end-to-end.

### Task 1: Extend getAllActiveCopies to accept readKeys

**Files:**
- Modify: `src/lib/services/section-copy-state-service.ts:102-118`
- Test: `tests/evals/section-copy-state-service.test.ts`

- [ ] **Step 1: Write the failing tests**

In the existing test file for section-copy-state-service, add tests that verify `getAllActiveCopies` with readKeys. The test file uses an in-memory DB via `createSectionCopyStateService()` — follow the existing setup pattern.

```typescript
describe("getAllActiveCopies with readKeys", () => {
  it("returns copies from readKeys sessions", () => {
    const oldSessionId = "old-session-123";
    const newProfileId = "profile-456";

    // Store curation under old session
    upsertState({
      ownerKey: oldSessionId,
      sectionType: "bio",
      language: "it",
      personalizedContent: JSON.stringify({ headline: "Custom bio" }),
      factsHash: "hash-a",
      soulHash: "hash-b",
      source: "agent",
    });

    // Without readKeys: only finds under primary ownerKey
    const withoutReadKeys = getAllActiveCopies(newProfileId, "it");
    expect(withoutReadKeys).toHaveLength(0);

    // With readKeys including old session: finds the curation
    const withReadKeys = getAllActiveCopies(newProfileId, "it", [oldSessionId]);
    expect(withReadKeys).toHaveLength(1);
    expect(withReadKeys[0].ownerKey).toBe(oldSessionId);
    expect(withReadKeys[0].sectionType).toBe("bio");
  });

  it("empty readKeys array behaves like omitting readKeys", () => {
    upsertState({
      ownerKey: "other-session",
      sectionType: "bio",
      language: "en",
      personalizedContent: "{}",
      factsHash: "h",
      soulHash: "s",
      source: "agent",
    });
    const result = getAllActiveCopies("primary", "en", []);
    expect(result).toHaveLength(0);
  });

  it("deduplicates ownerKey appearing in readKeys", () => {
    upsertState({
      ownerKey: "primary",
      sectionType: "bio",
      language: "en",
      personalizedContent: "{}",
      factsHash: "h",
      soulHash: "s",
      source: "agent",
    });
    // readKeys includes ownerKey itself — should not duplicate results
    const result = getAllActiveCopies("primary", "en", ["primary", "other"]);
    expect(result).toHaveLength(1);
  });

  it("primary ownerKey copy wins over readKeys copy for same sectionType", () => {
    // Old session has bio curation
    upsertState({
      ownerKey: "old-session",
      sectionType: "bio",
      language: "en",
      personalizedContent: JSON.stringify({ headline: "Old" }),
      factsHash: "h1",
      soulHash: "s1",
      source: "agent",
    });
    // New profile also has bio curation
    upsertState({
      ownerKey: "new-profile",
      sectionType: "bio",
      language: "en",
      personalizedContent: JSON.stringify({ headline: "New" }),
      factsHash: "h2",
      soulHash: "s2",
      source: "agent",
    });
    const result = getAllActiveCopies("new-profile", "en", ["old-session"]);
    // Both returned, but primary should come last so Map() in mergeActiveSectionCopy keeps it
    const bioRows = result.filter(r => r.sectionType === "bio");
    expect(bioRows).toHaveLength(2);
    expect(bioRows[bioRows.length - 1].ownerKey).toBe("new-profile");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/section-copy-state-service.test.ts --reporter=verbose`
Expected: FAIL — `getAllActiveCopies` does not accept a third parameter.

- [ ] **Step 3: Implement getAllActiveCopies readKeys support**

Modify `src/lib/services/section-copy-state-service.ts`:

```typescript
// Add inArray to imports (line 1):
import { eq, and, inArray } from "drizzle-orm";

// Change the function signature and implementation (line 102-118):
getAllActiveCopies(
  ownerKey: string,
  language: string,
  readKeys?: string[],
): SectionCopyStateRow[] {
  // Build the set of all keys to search (deduplicated)
  const allKeys = readKeys?.length
    ? [...new Set([...readKeys.filter((k) => k !== ownerKey), ownerKey])]
    : [ownerKey];
  // ownerKey is pushed LAST so that when callers build Map(sectionType → copy),
  // the primary owner's copy wins over legacy readKeys copies.

  const rows = db
    .select()
    .from(sectionCopyState)
    .where(
      and(
        allKeys.length === 1
          ? eq(sectionCopyState.ownerKey, ownerKey)
          : inArray(sectionCopyState.ownerKey, allKeys),
        eq(sectionCopyState.language, language),
      ),
    )
    .all();

  // Sort: readKeys copies first, primary ownerKey copies last
  // This ensures Map(sectionType → copy) overwrites with primary
  return rows
    .sort((a, b) => {
      const aPrimary = a.ownerKey === ownerKey ? 1 : 0;
      const bPrimary = b.ownerKey === ownerKey ? 1 : 0;
      return aPrimary - bPrimary;
    })
    .map(rowToState);
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/section-copy-state-service.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/section-copy-state-service.ts tests/evals/section-copy-state-service.test.ts
git commit -m "fix: getAllActiveCopies accepts readKeys for multi-session lookup"
```

### Task 1b: Extend fact_display_overrides with readKeys (same bug)

The **same ownerKey mismatch** exists for item-level curations. `curate_content` stores overrides with `ownerKey = effectiveOwnerKey` (sessionId when anon), but `projectCanonicalConfig` calls `getValidOverrides(profileId, ...)` which only matches the primary key.

**Files:**
- Modify: `src/lib/services/fact-display-override-service.ts:85-91, 93-112`
- Modify: `src/lib/services/page-projection.ts:78-84, 102-104`
- Test: `tests/evals/fact-display-override-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("getValidOverrides finds overrides from readKeys sessions", () => {
  const oldSession = "old-session-123";
  const newProfile = "profile-456";
  const factId = "fact-abc";
  const valueHash = "hash-xyz";

  // Store override under old session
  service.upsertOverride({
    ownerKey: oldSession,
    factId,
    displayFields: { title: "Custom Title" },
    factValueHash: valueHash,
    source: "agent",
  });

  // Without readKeys: not found
  const without = service.getValidOverrides(newProfile, [{ id: factId, valueHash }]);
  expect(without.size).toBe(0);

  // With readKeys: found
  const withKeys = service.getValidOverrides(newProfile, [{ id: factId, valueHash }], [oldSession]);
  expect(withKeys.size).toBe(1);
  expect(withKeys.get(factId)).toEqual({ title: "Custom Title" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/fact-display-override-service.test.ts --reporter=verbose`
Expected: FAIL — `getValidOverrides` does not accept a third parameter.

- [ ] **Step 3: Add readKeys to getOverridesForOwner and getValidOverrides**

Modify `src/lib/services/fact-display-override-service.ts`:

```typescript
// Add inArray to imports at top of file
import { eq, and, inArray } from "drizzle-orm";

// line 85-91: getOverridesForOwner
function getOverridesForOwner(ownerKey: string, readKeys?: string[]) {
  const allKeys = readKeys?.length
    ? [...new Set([...readKeys.filter((k) => k !== ownerKey), ownerKey])]
    : [ownerKey];

  return db
    .select()
    .from(factDisplayOverrides)
    .where(
      allKeys.length === 1
        ? eq(factDisplayOverrides.ownerKey, ownerKey)
        : inArray(factDisplayOverrides.ownerKey, allKeys),
    )
    .all();
}

// line 93-112: getValidOverrides — add readKeys parameter
function getValidOverrides(
  ownerKey: string,
  factHashes: FactHashEntry[],
  readKeys?: string[],
): Map<string, Record<string, unknown>> {
  const overrides = getOverridesForOwner(ownerKey, readKeys);
  // ... rest unchanged
}
```

- [ ] **Step 4: Pass readKeys through projectCanonicalConfig**

Modify `src/lib/services/page-projection.ts`:

```typescript
// line 78: add readKeys parameter
export function projectCanonicalConfig(
  facts: FactRow[],
  username: string,
  factLanguage: string,
  draftMeta?: DraftMeta,
  profileId?: string,
  readKeys?: string[],  // NEW
): PageConfig {
  // ...
  // line 102-104: pass readKeys
  const validOverrides = overrideService.getValidOverrides(
    profileId,
    factHashes,
    readKeys,  // NEW
  );
```

Then update `projectPublishableConfig` (wrapper) and ALL production callers of `projectCanonicalConfig` to pass readKeys:

**CRITICAL — projectPublishableConfig wrapper (page-projection.ts:185-195):**

`publish-pipeline.ts` calls `projectPublishableConfig`, which wraps `projectCanonicalConfig` WITHOUT forwarding readKeys. Must add readKeys parameter:

```typescript
// page-projection.ts line 185-195:
export function projectPublishableConfig(
  facts: FactRow[],
  username: string,
  factLanguage: string,
  draftMeta?: DraftMeta,
  profileId?: string,
  readKeys?: string[],  // NEW
): PageConfig {
  return publishableFromCanonical(
    projectCanonicalConfig(facts, username, factLanguage, draftMeta, profileId, readKeys),  // PASS readKeys
  );
}

// publish-pipeline.ts line 119 — add readKeys:
const canonicalConfig = projectPublishableConfig(
  facts, username, factLang, draftMeta, profileId, readKeys,
);
```

**Direct callers of projectCanonicalConfig (6 total):**

```typescript
// 1. /api/preview/route.ts — line 62, add 6th arg:
projectCanonicalConfig(facts, username, factLang, draftMeta, profileId, scope?.knowledgeReadKeys)

// 2. /api/preview/stream/route.ts — line 78, add 6th arg:
projectCanonicalConfig(facts, username, factLang, draftMeta, profileId, scope?.knowledgeReadKeys)

// 3. curate-page.ts worker handler — line 33, add 6th arg:
projectCanonicalConfig(allFacts, "draft", language, undefined, scope.cognitiveOwnerKey, scope.knowledgeReadKeys)

// 4. recompose-draft.ts — line 47, add 6th arg:
projectCanonicalConfig(allFacts, ..., scope.cognitiveOwnerKey, readKeys)
// (readKeys is already computed at line 28 of this file)

// 5. /api/draft/style/route.ts — line 55, add 6th arg:
projectCanonicalConfig(facts, draftUsername, factLang, draftMeta, authProfileId, scope?.knowledgeReadKeys)
// (readKeys available from scope at line 31)

// 6. tools.ts — lines 397 and 1188 (ensureDraft + move_section paths):
projectCanonicalConfig(allFacts, ..., effectiveOwnerKey, readKeys)
// (readKeys is already a parameter in the tool context)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/evals/fact-display-override-service.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, no regressions. Check for callers of `projectCanonicalConfig` that may need updating.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/fact-display-override-service.ts src/lib/services/page-projection.ts \
  src/app/api/preview/route.ts src/app/api/preview/stream/route.ts \
  src/lib/services/publish-pipeline.ts src/lib/worker/handlers/curate-page.ts \
  src/lib/connectors/recompose-draft.ts src/app/api/draft/style/route.ts \
  src/lib/agent/tools.ts \
  tests/evals/fact-display-override-service.test.ts
git commit -m "fix: fact_display_overrides accepts readKeys for multi-session lookup (same bug as section_copy_state)"
```

### Task 2: Pass readKeys through mergeActiveSectionCopy + fix test regression

**Files:**
- Modify: `src/lib/services/personalization-projection.ts:39`
- Modify: `tests/evals/personalization-projection.test.ts:257` (fix regression)
- Test: `tests/evals/personalization-projection.test.ts` (new test)

- [ ] **Step 1: Write the failing test**

Add to the existing `tests/evals/personalization-projection.test.ts` which already mocks `getAllActiveCopies`. Add a test that verifies readKeys is passed through.

```typescript
it("passes readKeys to getAllActiveCopies", () => {
  mockGetAllActiveCopies.mockReturnValue([]);
  const canonical = { sections: [], style: {} } as unknown as PageConfig;

  mergeActiveSectionCopy(canonical, "owner-abc", "it", ["legacy-session-1"]);

  expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner-abc", "it", ["legacy-session-1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/personalization-projection.test.ts --reporter=verbose`
Expected: FAIL — `getAllActiveCopies` called with 2 args, test expects 3.

- [ ] **Step 3: Pass readKeys and fix existing test regression**

Modify `src/lib/services/personalization-projection.ts` line 39:

```typescript
// Before:
const copies = getAllActiveCopies(ownerKey, language);

// After:
const copies = getAllActiveCopies(ownerKey, language, readKeys);
```

Also fix the existing test regressions in `tests/evals/personalization-projection.test.ts`:

```typescript
// Line 257 — Before:
expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner-abc", "it");
// After:
expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner-abc", "it", undefined);

// Line 280 — Before:
expect(mockGetAllActiveCopies).toHaveBeenCalledWith("profile-1", "en");
// After (this test passes readKeys via mergeActiveSectionCopy):
expect(mockGetAllActiveCopies).toHaveBeenCalledWith("profile-1", "en", ["session-anchor", "session-rotated"]);
```

Check for any other `toHaveBeenCalledWith` assertions on `mockGetAllActiveCopies` in the file and update them all.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/personalization-projection.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/personalization-projection.ts tests/evals/personalization-projection.test.ts
git commit -m "fix(publish): pass readKeys to getAllActiveCopies — preserves curations across session rotation"
```

---

## Chunk 2: BUG-2 — Section Reorder Claimed But Not Executed

### Root Cause

The agent called `update_page_style` when the user asked to reorder sections. `update_page_style` only handles visual presence (surface, voice, light) and layout template — it has **no** section reordering capability.

The correct tool is `reorder_sections` (tools.ts:977-1021), which **does** work on monolith layout (all content sections are in the `main` slot, so array order = visual order).

The system prompt at `prompts.ts:114` says `"Use reorder_sections when the user wants to rearrange their page"` but lacks explicit negative guidance. Additionally, the `update_page_style` tool description in tools.ts doesn't clarify that it cannot reorder sections.

### Fix Strategy

Two-layer fix:
1. **Tool description** (tools.ts:928): Add "Does NOT reorder sections" to `update_page_style` description — this is closest to the LLM's tool-selection decision point.
2. **TOOL_POLICY** (prompts.ts:113-114): Strengthen with positive routing ("For ANY request to reorder → use reorder_sections").

### Task 3: Add reorder guidance to tool description + TOOL_POLICY

**Files:**
- Modify: `src/lib/agent/tools.ts:928` (tool description)
- Modify: `src/lib/agent/prompts.ts:113-114` (TOOL_POLICY)
- Test: `tests/evals/prompt-contracts.test.ts` (existing file, uses `readFileSync` pattern)

- [ ] **Step 1: Write the failing test**

Add to the existing `tests/evals/prompt-contracts.test.ts` which uses `readFileSync("src/lib/agent/prompts.ts", "utf-8")` pattern:

```typescript
it("TOOL_POLICY contains explicit reorder_sections routing", () => {
  const src = readFileSync("src/lib/agent/prompts.ts", "utf-8");
  expect(src).toContain("update_page_style does NOT support section reordering");
  expect(src).toContain("For ANY request to change section order");
});

it("update_page_style tool description excludes section reordering", () => {
  const src = readFileSync("src/lib/agent/tools.ts", "utf-8");
  expect(src).toMatch(/update_page_style.*description.*Does NOT reorder/s);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "reorder" --reporter=verbose`
Expected: FAIL — neither file contains the new text.

- [ ] **Step 3: Update tool description and TOOL_POLICY**

Modify `src/lib/agent/tools.ts` line 928:

```typescript
// Before:
description: "Update the page visual presence (surface, voice, light) or layout template.",

// After:
description: "Update the page visual presence (surface, voice, light) or layout template. Does NOT reorder or rearrange sections — use reorder_sections for that.",
```

Modify `src/lib/agent/prompts.ts` lines 113-114:

```typescript
// Before:
- Use update_page_style when the user requests visual changes (surface, voice, light, layout)
- Use reorder_sections when the user wants to rearrange their page

// After:
- Use update_page_style when the user requests visual changes (surface, voice, light, layout). update_page_style does NOT support section reordering — it only changes presence and layout template
- For ANY request to change section order, position, or arrangement → use reorder_sections. Call inspect_page_state first to get current section IDs, then pass them in the desired order
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "reorder" --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts src/lib/agent/prompts.ts tests/evals/prompt-contracts.test.ts
git commit -m "fix(prompt+tool): explicit reorder_sections routing — update_page_style does NOT reorder"
```

---

## Chunk 3: BUG-3 — Double Response on Delete ("Fatto" then "Non trovo")

### Root Cause

The agent calls `delete_fact` → gets `success: true` → claims "Fatto" → then calls `search_facts` to "verify" → gets 0 results → says "Non trovo". This creates a contradiction.

The action-claim-guard correctly allows the "Fatto" claim (delete_fact DID return success:true). The guard cannot detect semantic contradictions from subsequent tool calls.

There is no prompt instruction telling the agent to **trust** the delete_fact result and avoid post-deletion search verification that could create contradictions.

### Fix Strategy

Scoped prompt fix. Add a DELETE RESULT TRUST instruction that applies to **individual fact deletions** but explicitly excludes **section-removal scenarios** (where verification IS required per line 110: "verify with search_facts that none remain").

### Task 4: Add scoped DELETE RESULT TRUST instruction

**Files:**
- Modify: `src/lib/agent/prompts.ts:159-160` (after ACTION CONTINUITY)
- Test: `tests/evals/prompt-contracts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("TOOL_POLICY contains scoped DELETE RESULT TRUST instruction", () => {
  const src = readFileSync("src/lib/agent/prompts.ts", "utf-8");
  expect(src).toContain("DELETE RESULT TRUST");
  // Must be scoped — not blanket "never verify"
  expect(src).toContain("section removal");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "DELETE RESULT TRUST" --reporter=verbose`
Expected: FAIL — prompt doesn't contain "DELETE RESULT TRUST".

- [ ] **Step 3: Add scoped DELETE RESULT TRUST instruction**

Add after the ACTION CONTINUITY rule (after line 160 in `src/lib/agent/prompts.ts`):

```typescript
- DELETE RESULT TRUST: When delete_fact returns success: true for an individual fact deletion, the fact IS deleted — trust the tool result. Do NOT call search_facts to "verify" a single deletion afterward, as post-deletion searches can create contradictions (e.g., claiming success then saying "not found"). Confirm the deletion to the user and move on. EXCEPTION: when removing an entire section's facts (see "When removing a section completely" rule), post-deletion verification with search_facts IS still required to confirm all facts in that category are gone.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts -t "DELETE RESULT TRUST" --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/prompt-contracts.test.ts
git commit -m "fix(prompt): scoped DELETE RESULT TRUST — prevent post-deletion contradiction"
```

---

## Summary

| Bug | Severity | Fix Type | Files Modified | Tests Added |
|-----|----------|----------|----------------|-------------|
| BUG-1 (section curation) | Medium | Code | `section-copy-state-service.ts`, `personalization-projection.ts` | 5 (4 unit + 1 regression fix) |
| BUG-1 (item curation) | Medium | Code | `fact-display-override-service.ts`, `page-projection.ts` (×2), `publish-pipeline.ts`, 6 direct callers, `tools.ts` | 1 |
| BUG-2 | Medium | Prompt + Tool | `prompts.ts`, `tools.ts` | 2 |
| BUG-3 | Low | Prompt | `prompts.ts` | 1 |

**Total tasks:** 5 (Task 1, 1b, 2, 3, 4)
**Estimated test count:** 9 new tests + 1 regression fix
**Expected UAT score improvement:** 85 → 95+ (only remaining risk: agent reasoning quality)

---

## Review History

### Round 1 (Claude reviewer) — LGTM
- Heartbeat caller confirmed safe (worker context, resolved profileId)

### Round 2 (4 specialized agents: Security, DB Integrity, Test Design, Agent Behavior)
Issues addressed in v2:
1. **CRITICAL — Hash guard semantic gap**: Added analysis in Fix Strategy confirming `getProjectedFacts(ownerKey, readKeys)` returns same facts after migration. Integration test in Task 2 verifies.
2. **CRITICAL — DELETE RESULT TRUST contradicts line 110**: Scoped the rule to individual deletions, added explicit EXCEPTION for section-removal verification.
3. **HIGH — Task 2 test file is mocked**: Rewrote Task 2 to use `personalization-projection.test.ts` (mock-based assertions — testing readKeys passthrough, not integration).
4. **HIGH — Task 3 & 4 tests call non-existent `buildSystemPrompt()`**: Rewrote all prompt tests to use `readFileSync()` pattern matching `prompt-contracts.test.ts`.
5. **MEDIUM — Duplicate sectionType resolution**: Added sort in `getAllActiveCopies` (readKeys copies first, primary last → Map overwrites correctly). Added test for this.
6. **MEDIUM — Negation weakness for BUG-2**: Added two-layer fix (tool description + TOOL_POLICY) with positive routing ("For ANY request → use reorder_sections").
7. **MEDIUM — personalization-projection.test.ts:257 regression**: Added explicit fix step in Task 2.
8. **MEDIUM — Missing edge case tests**: Added 3 additional tests (empty readKeys, dedup, primary-wins).

### Round 3 (4 specialized agents: Architecture Consistency, Regression Analyzer, Devil's Advocate, Code Correctness)
Issues addressed in v3:
1. **CRITICAL — fact_display_overrides has identical ownerKey mismatch**: Added Task 1b to extend `getOverridesForOwner`/`getValidOverrides` with readKeys, and pass readKeys through `projectCanonicalConfig` to all callers.
2. Root cause BUG-1 confirmed by timeline analysis (curation at step 25 pre-signup, publish at step 28 post-signup).
3. All code changes verified: sort callback, imports, template literals, line numbers correct.
4. No regressions: sort performance negligible (≤120 rows), +200 token budget within limits, no action-claim-guard conflicts.
5. No test assertions on exact tool description text — tools.ts change safe.

### Round 4 (2 agents: Final Completeness + Cross-Task Integration)
- PLAN APPROVED. All issues advisory:
1. Corrected Task 1b caller list: `publish-pipeline.ts` calls `projectPublishableConfig` (not `projectCanonicalConfig`) — removed from direct caller list, added note that readKeys reaches it via `mergeActiveSectionCopy`.
2. Task 1b Step 4: Added explicit code snippets showing readKeys extraction from scope in each caller.
3. Task 3 + Task 4 line number shift: non-blocking — Task 4 uses semantic marker "after ACTION CONTINUITY" not absolute line numbers.

### Round 5 — Final Deep Review (3 agents: Code Correctness, Test Design, Missed Bugs)
Critical issues found and fixed in v5:
1. **CRITICAL — `projectPublishableConfig` missing readKeys**: This wrapper calls `projectCanonicalConfig` without forwarding readKeys. Publish pipeline calls this wrapper, so BUG-1 item-level fix was broken. Added readKeys to `projectPublishableConfig` signature + `publish-pipeline.ts` caller.
2. **BLOCKING — 3 missing callers of `projectCanonicalConfig`**: `recompose-draft.ts:47`, `/api/draft/style/route.ts:55`, `tools.ts:397+1188`. All added to Task 1b Step 4 with explicit code.
3. **BLOCKING — `personalization-projection.test.ts:280` second regression**: Line 280 also asserts 2-arg call on `mockGetAllActiveCopies`. Added to Task 2 Step 3 alongside line 257 fix.
4. Verified: `.sort()` on Drizzle `.all()` result is safe (fresh array), `Set` handles deduplication correctly, all line numbers confirmed against actual code.
