# UAT Conversation Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 bugs (3 P0 + 4 P1) discovered in UAT conversation analysis — journey state flip, visibility pipeline opacity, fabrication guard, item reordering, maxSteps, batch facts, visibility recomposition.

**Architecture:** Pin journey state in sessions table to prevent mid-conversation mode flips. Enrich tool responses with visibility info. Add `sort_order` column to facts for persistent item ordering. Batch `create_facts` tool to overcome maxSteps limit.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, SQLite, Vercel AI SDK

**Review fixes applied (v4):**
1. P0: Journey pin uses `knowledgePrimaryKey` (anchor), not `currentSessionId` — consistent read/write session
2. P1: New facts get append-only `sort_order` via `getNextSortOrder()` — no unstable ordering
3. P1: `set_fact_visibility` now passes `readKeys` for cross-session fact lookup
4. P2: Anti-fabrication test uses runtime `buildSystemPrompt()` output, not source-string matching
5. P2: Migration verified via explicit `sqlite3` application + `PRAGMA table_info` check
6. BUG: `buildSystemPrompt` test uses correct `BootstrapPayload` shape (not legacy context object)
7. MINOR: `create_facts` batch logs `tool_call_error` per individual failure for telemetry
8. MINOR: `updateFactSortOrder` documents anchor-session-only scoping design choice
9. BUG (P1): `getOrDetectJourneyState` checks blocked (quota) BEFORE cached pin — safety override
10. P2: `request_publish` transitions pin to `active_fresh` after successful publish + TODO for stale

---

## Task 1: Migration — `journey_state` and `sort_order` columns

**Files:**
- Create: `db/migrations/0021_journey_state_and_sort_order.sql`
- Modify: `src/lib/db/schema.ts:58-68` (sessions) and `src/lib/db/schema.ts:71-87` (facts)

**Step 1: Write the migration SQL**

```sql
-- Add journey_state to sessions (pinned per session, survives turns)
ALTER TABLE sessions ADD COLUMN journey_state TEXT;

-- Add sort_order to facts (item ordering within sections)
ALTER TABLE facts ADD COLUMN sort_order INTEGER DEFAULT 0;
```

Create file: `db/migrations/0021_journey_state_and_sort_order.sql`

**Step 2: Update Drizzle schema — sessions**

In `src/lib/db/schema.ts`, add `journeyState` to the sessions table (after `updatedAt`):

```typescript
export const sessions = sqliteTable("sessions", {
  // ... existing columns ...
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  journeyState: text("journey_state"),  // ← ADD
});
```

**Step 3: Update Drizzle schema — facts**

In `src/lib/db/schema.ts`, add `sortOrder` to the facts table (after `updatedAt`):

```typescript
// Inside facts table definition, after updatedAt:
  sortOrder: integer("sort_order").default(0),  // ← ADD
```

**Step 4: Verify migration SQL is valid**

Run the migration SQL against a scratch SQLite DB to verify it applies cleanly:

```bash
# Create a temp DB with the current schema, then apply migration
sqlite3 /tmp/openself-migration-test.db < <(
  echo "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, invite_code TEXT, username TEXT, message_count INTEGER DEFAULT 0, status TEXT DEFAULT 'active', user_id TEXT, profile_id TEXT, created_at TEXT, updated_at TEXT);"
  echo "CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, session_id TEXT NOT NULL DEFAULT '__default__', profile_id TEXT, category TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, source TEXT DEFAULT 'chat', confidence REAL DEFAULT 1.0, visibility TEXT DEFAULT 'private', created_at TEXT, updated_at TEXT);"
  cat db/migrations/0021_journey_state_and_sort_order.sql
  echo "PRAGMA table_info(sessions);"
  echo "PRAGMA table_info(facts);"
)
```

Expected: `journey_state` appears in sessions columns, `sort_order` appears in facts columns. No SQL errors.

```bash
rm /tmp/openself-migration-test.db
```

**Step 5: Verify existing tests still pass**

Run: `npx vitest run tests/evals/agent-auto-recompose.test.ts --reporter=verbose 2>&1 | tail -5`
Expected: Existing tests still pass (schema change doesn't break anything)

**Step 7: Commit**

```bash
git add db/migrations/0021_journey_state_and_sort_order.sql src/lib/db/schema.ts
git commit -m "feat(db): add journey_state to sessions + sort_order to facts (migration 0021)"
```

---

## Task 2: F1 — Pin journey state per session

**Files:**
- Modify: `src/lib/agent/journey.ts:79-131` and `218-226`
- Modify: `src/app/api/chat/route.ts:128`
- Modify: `src/app/api/chat/bootstrap/route.ts` (wherever `assembleBootstrapPayload` is called)
- Test: `tests/evals/journey-state-pin.test.ts`

**Step 1: Write the failing test**

Create `tests/evals/journey-state-pin.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSqlite = {
  prepare: vi.fn(),
};

const mockGetDraft = vi.fn();
const mockHasAnyPublishedPage = vi.fn();
const mockCountFacts = vi.fn();
const mockGetDistinctSessionCount = vi.fn();

vi.mock("@/lib/db", () => ({ sqlite: mockSqlite }));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  hasAnyPublishedPage: mockHasAnyPublishedPage,
  getPublishedUsername: vi.fn(() => null),
}));
vi.mock("@/lib/services/kb-service", () => ({
  countFacts: mockCountFacts,
  getAllFacts: vi.fn(() => []),
  getDistinctSessionCount: mockGetDistinctSessionCount,
}));
vi.mock("@/lib/services/soul-service", () => ({ getActiveSoul: vi.fn() }));
vi.mock("@/lib/services/conflict-service", () => ({ getOpenConflicts: vi.fn(() => []) }));
vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({ getPendingProposals: vi.fn(() => []) })),
}));
vi.mock("@/lib/services/section-richness", () => ({ classifySectionRichness: vi.fn(() => "empty") }));
vi.mock("@/lib/services/page-projection", () => ({ filterPublishableFacts: vi.fn(() => []) }));
vi.mock("@/lib/services/personalization-hashing", () => ({ SECTION_FACT_CATEGORIES: {} }));

import { getOrDetectJourneyState } from "@/lib/agent/journey";

describe("journey state pinning", () => {
  const sessionId = "sess-1";
  const scope = {
    cognitiveOwnerKey: "owner-1",
    knowledgeReadKeys: ["owner-1"],
    knowledgePrimaryKey: "owner-1",
    currentSessionId: sessionId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasAnyPublishedPage.mockReturnValue(false);
    mockCountFacts.mockReturnValue(0);
    mockGetDistinctSessionCount.mockReturnValue(0);
    mockGetDraft.mockReturnValue(null);
  });

  it("detects first_visit and pins it on the anchor session", () => {
    // No cached state
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => undefined), // no cached journey_state
      run: vi.fn(), // write
    });

    const state = getOrDetectJourneyState(scope);
    expect(state).toBe("first_visit");
    // Should have written to DB using knowledgePrimaryKey (anchor), not currentSessionId
    const runCalls = mockSqlite.prepare.mock.results
      .filter((r: any) => r.value?.run)
      .map((r: any) => r.value.run.mock.calls)
      .flat();
    const updateCall = runCalls.find((c: any) => c[0] === "first_visit");
    expect(updateCall).toBeTruthy();
    // Second arg should be the anchor session ID (knowledgePrimaryKey = "owner-1")
    expect(updateCall[1]).toBe("owner-1");
  });

  it("returns cached state on subsequent calls even if facts/draft exist", () => {
    // Cached state = first_visit (read from anchor session)
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => ({ journey_state: "first_visit" })),
      run: vi.fn(),
    });
    // Meanwhile, facts exist and draft exists (would normally → draft_ready)
    mockCountFacts.mockReturnValue(5);
    mockGetDraft.mockReturnValue({ config: {} });

    const state = getOrDetectJourneyState(scope);
    expect(state).toBe("first_visit"); // pinned, not draft_ready
  });

  it("reads pin from anchor session even when currentSessionId differs", () => {
    const multiScope = {
      ...scope,
      knowledgePrimaryKey: "anchor-session",
      currentSessionId: "browser-session-99", // different!
    };
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => ({ journey_state: "first_visit" })),
      run: vi.fn(),
    });

    const state = getOrDetectJourneyState(multiScope);
    expect(state).toBe("first_visit");
    // SELECT should use anchor session ID
    const getCalls = mockSqlite.prepare.mock.results
      .map((r: any) => r.value?.get?.mock?.calls)
      .flat()
      .filter(Boolean);
    expect(getCalls.some((c: any) => c[0] === "anchor-session")).toBe(true);
  });

  it("allows explicit transition via updateJourneyStatePin", () => {
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => ({ journey_state: "first_visit" })),
      run: vi.fn(),
    });

    const { updateJourneyStatePin } = require("@/lib/agent/journey");
    updateJourneyStatePin("owner-1", "draft_ready");

    expect(mockSqlite.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET journey_state"),
    );
  });

  it("returns blocked when quota exhausted, even if pin says active_fresh", () => {
    // Pin says active_fresh — but quota is exhausted
    let callIndex = 0;
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => {
        callIndex++;
        if (callIndex === 1) {
          // First query: quota check
          return { count: 200 }; // >= AUTH_MESSAGE_LIMIT
        }
        // Second query: cached pin (should NOT be reached)
        return { journey_state: "active_fresh" };
      }),
      run: vi.fn(),
    });

    const state = getOrDetectJourneyState(scope, { authenticated: true });
    expect(state).toBe("blocked"); // safety override wins
  });

  it("uses cached pin when quota is NOT exhausted", () => {
    let callIndex = 0;
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => {
        callIndex++;
        if (callIndex === 1) {
          // First query: quota check — under limit
          return { count: 50 };
        }
        // Second query: cached pin
        return { journey_state: "active_fresh" };
      }),
      run: vi.fn(),
    });

    const state = getOrDetectJourneyState(scope, { authenticated: true });
    expect(state).toBe("active_fresh"); // pin honored
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/journey-state-pin.test.ts --reporter=verbose`
Expected: FAIL — `getOrDetectJourneyState` does not exist

**Step 3: Implement `getOrDetectJourneyState` and `updateJourneyStatePin`**

In `src/lib/agent/journey.ts`, add after `detectJourneyState()` (after line 131):

```typescript
/**
 * Get journey state from session cache, or detect + pin on first call.
 * This prevents mid-conversation mode flips (e.g., first_visit → draft_ready
 * after the first create_fact triggers recomposeAfterMutation).
 *
 * Blocked check runs FIRST as a safety override — a user who exhausts their
 * quota must be detected even if the pin says active_fresh or draft_ready.
 *
 * IMPORTANT: The pin is stored on the ANCHOR session (knowledgePrimaryKey),
 * not the current browser session (currentSessionId). This ensures the pin
 * is consistent across multi-session scenarios (e.g., OAuth re-auth creates
 * a new currentSessionId but the anchor stays the same).
 */
export function getOrDetectJourneyState(
  scope: OwnerScope,
  authInfo?: AuthInfo,
): JourneyState {
  const anchorSessionId = scope.knowledgePrimaryKey;

  // SAFETY OVERRIDE: blocked always takes precedence over cached pin.
  // A user who exhausts their quota mid-conversation must be detected
  // even if the pin says active_fresh or draft_ready.
  // Import at top: import { AUTH_MESSAGE_LIMIT } from "@/lib/constants";
  if (authInfo?.authenticated) {
    const quota = sqlite
      .prepare("SELECT count FROM profile_message_usage WHERE profile_key = ?")
      .get(scope.cognitiveOwnerKey) as { count: number } | undefined;
    if (quota && quota.count >= AUTH_MESSAGE_LIMIT) {
      return "blocked";
    }
  }

  // Read cached state from anchor session
  const row = sqlite
    .prepare("SELECT journey_state FROM sessions WHERE id = ?")
    .get(anchorSessionId) as { journey_state: string | null } | undefined;

  if (row?.journey_state) {
    return row.journey_state as JourneyState;
  }

  // First call: detect and pin on the anchor session
  const detected = detectJourneyState(scope, authInfo);
  sqlite
    .prepare("UPDATE sessions SET journey_state = ? WHERE id = ?")
    .run(detected, anchorSessionId);

  return detected;
}

/**
 * Explicitly update the pinned journey state (e.g., after generate_page).
 * Uses the anchor session ID (knowledgePrimaryKey) for consistency.
 */
export function updateJourneyStatePin(
  anchorSessionId: string,
  newState: JourneyState,
): void {
  sqlite
    .prepare("UPDATE sessions SET journey_state = ? WHERE id = ?")
    .run(newState, anchorSessionId);
}
```

**Step 4: Wire into `assembleBootstrapPayload`**

In `src/lib/agent/journey.ts`, modify `assembleBootstrapPayload()` (line 226):

Change:
```typescript
const journeyState = detectJourneyState(scope, authInfo);
```
To:
```typescript
const journeyState = getOrDetectJourneyState(scope, authInfo);
```

**Step 5: Wire `generate_page` to transition pin**

In `src/lib/agent/tools.ts`, inside `generate_page` execute (after the `upsertDraft` call at line 417), add:

```typescript
// Transition journey state pin: onboarding → draft_ready.
// sessionId here is knowledgePrimaryKey (the anchor), which is the same
// session where getOrDetectJourneyState stores the pin.
// Import at top: import { updateJourneyStatePin } from "@/lib/agent/journey";
updateJourneyStatePin(sessionId, "draft_ready");
```

Also add the import at the top of tools.ts:
```typescript
import { updateJourneyStatePin } from "@/lib/agent/journey";
```

**Step 5b: Wire `request_publish` to transition pin → active_fresh**

In `src/lib/agent/tools.ts`, inside `request_publish` execute (after the successful publish call), add:

```typescript
// Transition journey state pin: draft_ready → active_fresh.
// After publishing, the user has a live page — they should receive
// the active_fresh policy (maintenance suggestions, not "publish your page" CTAs).
updateJourneyStatePin(sessionId, "active_fresh");
```

> **TODO (future sprint):** Wire `active_fresh → active_stale` transition based on
> `lastSeenDaysAgo` threshold. Since both map to `steady_state` mode, the practical
> impact is limited to policy prompt tone/suggestions. Not a blocker for this sprint.

**Step 6: Run tests**

Run: `npx vitest run tests/evals/journey-state-pin.test.ts --reporter=verbose`
Expected: PASS

**Step 7: Run full suite to check for regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All existing tests pass

**Step 8: Commit**

```bash
git add src/lib/agent/journey.ts src/lib/agent/tools.ts tests/evals/journey-state-pin.test.ts
git commit -m "fix(P0): pin journey state per session — prevent mid-conversation mode flip"
```

---

## Task 3: F2 — Transparent visibility in tool responses

**Files:**
- Modify: `src/lib/agent/tools.ts:128-155` (create_fact), `168-187` (update_fact), `196-213` (delete_fact)
- Modify: `src/lib/agent/prompts.ts:41-57` (TOOL_POLICY)
- Test: `tests/evals/tool-visibility-response.test.ts`

**Step 1: Write the failing test**

Create `tests/evals/tool-visibility-response.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetAllFacts, mockGetDraft, mockUpsertDraft, mockCreateFact,
  mockUpdateFact, mockDeleteFact, mockLogEvent, mockGetFactLanguage,
} = vi.hoisted(() => ({
  mockGetAllFacts: vi.fn(),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockCreateFact: vi.fn(),
  mockUpdateFact: vi.fn(),
  mockDeleteFact: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetFactLanguage: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: mockUpdateFact,
  deleteFact: mockDeleteFact,
  searchFacts: vi.fn(),
  getAllFacts: mockGetAllFacts,
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "hash-a"),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
  filterPublishableFacts: vi.fn((f: unknown[]) => f),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: vi.fn() }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: vi.fn() }));
vi.mock("@/lib/services/soul-service", () => ({ proposeSoulChange: vi.fn(), getActiveSoul: vi.fn() }));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: vi.fn() }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error { code = "FACT_VALIDATION_FAILED"; constructor(m: string) { super(m); } },
}));
vi.mock("@/lib/layout/contracts", () => ({ LAYOUT_TEMPLATES: ["vertical"], resolveLayoutAlias: vi.fn() }));
vi.mock("@/lib/layout/registry", () => ({ getLayoutTemplate: vi.fn(), resolveLayoutTemplate: vi.fn() }));
vi.mock("@/lib/layout/assign-slots", () => ({ assignSlotsFromFacts: vi.fn() }));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn() }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: vi.fn() }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: vi.fn() }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: vi.fn() }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";

describe("tool response includes visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "proposed" },
    ]);
    mockGetDraft.mockReturnValue(null);
  });

  it("create_fact returns visibility and pageVisible", async () => {
    mockCreateFact.mockReturnValue({
      id: "f1", category: "skill", key: "python", visibility: "proposed",
    });

    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1"]);
    const result = await tools.create_fact.execute(
      { category: "skill", key: "python", value: { name: "Python" }, confidence: 1.0 },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("visibility", "proposed");
    expect(result).toHaveProperty("pageVisible", true);
  });

  it("create_fact with private visibility returns pageVisible: false", async () => {
    mockCreateFact.mockReturnValue({
      id: "f2", category: "skill", key: "css", visibility: "private",
    });

    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1"]);
    const result = await tools.create_fact.execute(
      { category: "skill", key: "css", value: { name: "CSS" }, confidence: 0.5 },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("visibility", "private");
    expect(result).toHaveProperty("pageVisible", false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/tool-visibility-response.test.ts --reporter=verbose`
Expected: FAIL — result does not have property "visibility"

**Step 3: Implement visibility in create_fact response**

In `src/lib/agent/tools.ts`, modify `create_fact` execute (lines 128-144):

```typescript
execute: async ({ category, key, value, confidence }) => {
  try {
    const fact = await createFact({ category, key, value, confidence }, sessionId);
    let recomposeOk = true;
    try { recomposeAfterMutation(); } catch (e) {
      console.warn("[tools] recomposeAfterMutation failed:", e);
      recomposeOk = false;
    }
    return {
      success: true,
      factId: fact.id,
      category: fact.category,
      key: fact.key,
      visibility: fact.visibility,
      pageVisible: fact.visibility === "public" || fact.visibility === "proposed",
      recomposeOk,
    };
  } catch (error) {
    // ... existing error handling unchanged ...
  }
},
```

**Step 4: Same for update_fact and delete_fact**

In `update_fact` execute (line 168-175), change the success return to:

```typescript
const fact = updateFact({ factId, value }, sessionId, readKeys);
if (!fact) return { success: false, error: "Fact not found" };
let recomposeOk = true;
try { recomposeAfterMutation(); } catch (e) {
  console.warn("[tools] recomposeAfterMutation failed:", e);
  recomposeOk = false;
}
return {
  success: true,
  factId: fact.id,
  visibility: fact.visibility,
  pageVisible: fact.visibility === "public" || fact.visibility === "proposed",
  recomposeOk,
};
```

In `delete_fact` execute (line 196-204), change to:

```typescript
const deleted = deleteFact(factId, sessionId, readKeys);
if (deleted) {
  let recomposeOk = true;
  try { recomposeAfterMutation(); } catch (e) {
    console.warn("[tools] recomposeAfterMutation failed:", e);
    recomposeOk = false;
  }
  return { success: deleted, recomposeOk };
}
return { success: deleted };
```

**Step 5: Update TOOL_POLICY prompt**

In `src/lib/agent/prompts.ts`, after line 57 (end of set_fact_visibility instruction), add:

```
- When create_fact returns pageVisible: false, inform the user the fact is saved but not yet visible on the page. Use set_fact_visibility(factId, "proposed") to make it visible.
- When recomposeOk: false is returned, tell the user there was an issue refreshing the preview and suggest calling generate_page to rebuild.
```

**Step 6: Run tests**

Run: `npx vitest run tests/evals/tool-visibility-response.test.ts --reporter=verbose`
Expected: PASS

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All pass (check agent-auto-recompose.test.ts in particular — update any assertions that check exact response shape if needed)

**Step 7: Commit**

```bash
git add src/lib/agent/tools.ts src/lib/agent/prompts.ts tests/evals/tool-visibility-response.test.ts
git commit -m "fix(P0): return visibility + pageVisible + recomposeOk in fact tool responses"
```

---

## Task 4: F3 — Visibility recalculated on upsert

**Files:**
- Modify: `src/lib/services/kb-service.ts:141-150`
- Test: `tests/evals/visibility-upsert.test.ts`

**Step 1: Write the failing test**

Create `tests/evals/visibility-upsert.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock the DB to capture the SQL and verify visibility is in the upsert set.
// This is a behavioral test: we call createFact twice with the same key
// and verify the second call updates visibility.

const mockInsertRun = vi.fn();
const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ run: mockInsertRun })) }));
const mockSelectGet = vi.fn();
const mockSelectAll = vi.fn(() => []);

vi.mock("@/lib/db", () => {
  const db = {
    insert: vi.fn(() => ({ values: mockInsertValues })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockSelectGet, all: mockSelectAll })),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) })),
  };
  return { default: db, sqlite: { prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })) } };
});

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/services/fact-validation", () => ({
  validateFactValue: vi.fn(),
  FactValidationError: class extends Error {},
}));

describe("createFact upsert recalculates visibility", () => {
  it("includes visibility in onConflictDoUpdate set block", async () => {
    // This test verifies the fix is present by importing createFact
    // and checking that the Drizzle chain includes visibility.
    // A full integration test requires a real SQLite DB.
    //
    // The behavioral proof: read the source and verify the SQL expression.
    // This is intentionally a structural check because Drizzle mocking
    // is too fragile for verifying SQL generation.
    const { readFileSync } = await import("fs");
    const source = readFileSync("src/lib/services/kb-service.ts", "utf-8");

    // Find the onConflictDoUpdate block and verify visibility is in the set
    const match = source.match(/onConflictDoUpdate\(\{[\s\S]*?set:\s*\{([\s\S]*?)\}\s*,?\s*\}/);
    expect(match).toBeTruthy();
    const setBlock = match![1];
    // Should contain visibility with a CASE expression (not just the field name)
    expect(setBlock).toMatch(/visibility/);
    expect(setBlock).toMatch(/private/); // The CASE WHEN condition
  });
});
```

**Note on test approach:** This task is one of the rare cases where a structural test is acceptable — the Drizzle ORM upsert chain is too complex to mock behaviorally without a real DB. The test verifies both that `visibility` is present AND that the `CASE WHEN ... 'private'` guard exists, catching regressions if someone removes the conditional logic.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/visibility-upsert.test.ts --reporter=verbose`
Expected: FAIL — visibility not found in onConflictDoUpdate set

**Step 3: Implement visibility in upsert**

In `src/lib/services/kb-service.ts`, modify the `onConflictDoUpdate` block (lines 141-150).

Change:
```typescript
.onConflictDoUpdate({
  target: [facts.sessionId, facts.category, facts.key],
  set: {
    value: input.value,
    source: input.source ?? "chat",
    confidence,
    profileId: effectiveProfileId,
    updatedAt: now,
  },
})
```

To:
```typescript
.onConflictDoUpdate({
  target: [facts.sessionId, facts.category, facts.key],
  set: {
    value: input.value,
    source: input.source ?? "chat",
    confidence,
    // Recalculate visibility on upsert, but only upgrade from "private".
    // Never downgrade user-set "public" or "proposed" visibility.
    visibility: sql`CASE WHEN ${facts.visibility} = 'private' THEN ${visibility} ELSE ${facts.visibility} END`,
    profileId: effectiveProfileId,
    updatedAt: now,
  },
})
```

Add `sql` to the Drizzle import at the top of kb-service.ts if not already imported:
```typescript
import { sql } from "drizzle-orm";
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/visibility-upsert.test.ts --reporter=verbose`
Expected: PASS

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/services/kb-service.ts tests/evals/visibility-upsert.test.ts
git commit -m "fix(P0): recalculate visibility on fact upsert — upgrade from private only"
```

---

## Task 5: F4 — Anti-fabrication prompt guard

**Files:**
- Modify: `src/lib/agent/prompts.ts:29-39` (SAFETY_POLICY) and `41-73` (TOOL_POLICY / fact extraction rules)
- Test: `tests/evals/anti-fabrication-prompt.test.ts`

**Step 1: Write the test**

Create `tests/evals/anti-fabrication-prompt.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// Mock all heavy dependencies so we can import prompts cleanly
vi.mock("@/lib/agent/policies", () => ({
  getJourneyPolicy: vi.fn(() => ""),
  getSituationDirectives: vi.fn(() => ""),
  getExpertiseCalibration: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({ memoryUsageDirectives: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/turn-management", () => ({ turnManagementRules: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/action-awareness", () => ({ actionAwarenessPolicy: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({ undoAwarenessPolicy: vi.fn(() => "") }));

import { buildSystemPrompt } from "@/lib/agent/prompts";

describe("anti-fabrication prompt guards", () => {
  // Build a real system prompt and check the runtime output
  // NOTE: buildSystemPrompt takes a BootstrapPayload — use its actual shape
  const prompt = buildSystemPrompt({
    journeyState: "first_visit",
    situations: [],
    expertiseLevel: "novice",
    userName: null,
    lastSeenDaysAgo: null,
    publishedUsername: null,
    pendingProposalCount: 0,
    thinSections: [],
    staleFacts: [],
    openConflicts: [],
    language: "en",
    conversationContext: null,
  });

  it("system prompt prohibits creating facts for unmentioned categories", () => {
    expect(prompt).toContain("NEVER create facts for categories the user has NOT explicitly mentioned");
  });

  it("system prompt prohibits inventing optional fields", () => {
    expect(prompt).toContain("NEVER invent optional fields");
  });

  it("system prompt requires explicit user statement for fact creation", () => {
    expect(prompt).toContain("Only create facts from information the user explicitly stated");
  });
});
```

Note: This tests the **runtime output** of `buildSystemPrompt()` rather than reading source strings. If the function signature differs, adjust the mock context to match — the key point is testing that the assembled prompt contains the guard strings.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/anti-fabrication-prompt.test.ts --reporter=verbose`
Expected: FAIL — strings not found

**Step 3: Add anti-fabrication instructions to SAFETY_POLICY**

In `src/lib/agent/prompts.ts`, at the end of SAFETY_POLICY (before the closing backtick at line 39), add:

```
- NEVER create facts for categories the user has NOT explicitly mentioned in this conversation. If the user has not discussed books, music, or hobbies, do NOT create reading, music, or interest facts.
- NEVER invent optional fields (rating, description, note, frequency). If the user did not specify a rating or description, leave those fields empty — do NOT guess or assume defaults.
- When in doubt about whether the user mentioned something, ASK rather than create a fact from assumption.
```

**Step 4: Add explicit-source rule to TOOL_POLICY**

In `src/lib/agent/prompts.ts`, after line 42 ("Use create_fact when the user shares new information about themselves"), add:

```
- Only create facts from information the user explicitly stated. Confidence 1.0 = stated directly, 0.7 = clearly implied from context. Do NOT create facts from your own assumptions, general knowledge, or inferences about what the user "might" like.
```

**Step 5: Run tests**

Run: `npx vitest run tests/evals/anti-fabrication-prompt.test.ts --reporter=verbose`
Expected: PASS

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All pass

**Step 6: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/anti-fabrication-prompt.test.ts
git commit -m "fix(P1): strengthen anti-fabrication prompt guards — no unmentioned categories or invented fields"
```

---

## Task 6: F5 — Item reordering within sections

**Files:**
- Modify: `src/lib/services/kb-service.ts` (add `updateFactSortOrder`, modify `getAllFacts` ORDER BY)
- Modify: `src/lib/agent/tools.ts` (add `reorder_section_items` tool)
- Modify: `src/lib/agent/prompts.ts` (document tool in DATA_MODEL_REFERENCE)
- Test: `tests/evals/item-reorder.test.ts`

**Step 1: Write the failing test**

Create `tests/evals/item-reorder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetAllFacts, mockGetDraft, mockUpsertDraft, mockCreateFact,
  mockSearchFacts, mockLogEvent, mockGetFactLanguage,
  mockUpdateFactSortOrder,
} = vi.hoisted(() => ({
  mockGetAllFacts: vi.fn(),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockCreateFact: vi.fn(),
  mockSearchFacts: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetFactLanguage: vi.fn(),
  mockUpdateFactSortOrder: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: mockSearchFacts,
  getAllFacts: mockGetAllFacts,
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
  updateFactSortOrder: mockUpdateFactSortOrder,
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "hash-a"),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
  filterPublishableFacts: vi.fn((f: unknown[]) => f),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: vi.fn() }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: vi.fn() }));
vi.mock("@/lib/services/soul-service", () => ({ proposeSoulChange: vi.fn(), getActiveSoul: vi.fn() }));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: vi.fn() }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error { code = "FACT_VALIDATION_FAILED"; constructor(m: string) { super(m); } },
}));
vi.mock("@/lib/layout/contracts", () => ({ LAYOUT_TEMPLATES: ["vertical"], resolveLayoutAlias: vi.fn() }));
vi.mock("@/lib/layout/registry", () => ({ getLayoutTemplate: vi.fn(), resolveLayoutTemplate: vi.fn() }));
vi.mock("@/lib/layout/assign-slots", () => ({ assignSlotsFromFacts: vi.fn() }));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn() }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: vi.fn() }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: vi.fn() }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: vi.fn() }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";

describe("reorder_section_items tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "education", key: "deutsche-schule", value: {}, visibility: "proposed", sortOrder: 0 },
      { id: "f2", category: "education", key: "luiss", value: {}, visibility: "proposed", sortOrder: 1 },
    ]);
    mockGetDraft.mockReturnValue(null);
  });

  it("calls updateFactSortOrder for each key in order", async () => {
    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1"]);
    const result = await tools.reorder_section_items.execute(
      { category: "education", orderedKeys: ["luiss", "deutsche-schule"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    expect(mockUpdateFactSortOrder).toHaveBeenCalledTimes(2);
    expect(mockUpdateFactSortOrder).toHaveBeenCalledWith("sess-1", "education", "luiss", 0);
    expect(mockUpdateFactSortOrder).toHaveBeenCalledWith("sess-1", "education", "deutsche-schule", 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/item-reorder.test.ts --reporter=verbose`
Expected: FAIL — `reorder_section_items` does not exist

**Step 3: Add `updateFactSortOrder` and `getNextSortOrder` to kb-service**

In `src/lib/services/kb-service.ts`, add two new exported functions:

```typescript
/** Get the next sort_order for a new fact in a category (append-only). */
export function getNextSortOrder(sessionId: string, category: string): number {
  const row = db
    .select({ maxOrder: sql<number>`MAX(sort_order)` })
    .from(facts)
    .where(and(eq(facts.sessionId, sessionId), eq(facts.category, category)))
    .get();
  return (row?.maxOrder ?? -1) + 1;
}

/** Update the sort_order of a fact by sessionId + category + key.
 * NOTE: scoped to anchor session (knowledgePrimaryKey) only —
 * facts from prior sessions in the same profile are not reorderable.
 * Consistent with createFact/getNextSortOrder scoping. */
export function updateFactSortOrder(
  sessionId: string,
  category: string,
  key: string,
  sortOrder: number,
): void {
  db.update(facts)
    .set({ sortOrder })
    .where(
      and(
        eq(facts.sessionId, sessionId),
        eq(facts.category, category),
        eq(facts.key, key),
      ),
    )
    .run();
}
```

Ensure `and`, `eq`, `sql` are imported from `drizzle-orm` (they likely are already).

**Step 3b: Initialize sort_order in createFact**

In `src/lib/services/kb-service.ts`, in the `createFact` function, before the `db.insert(facts)` call (around line 127), compute the next sort_order:

```typescript
const sortOrder = getNextSortOrder(sessionId, normalized.canonical);
```

Then add it to the `.values()` object:
```typescript
.values({
  id,
  sessionId,
  // ... existing fields ...
  sortOrder,  // ← ADD
  createdAt: now,
  updatedAt: now,
})
```

This ensures new facts are always appended at the end of their category, preventing unstable ordering when multiple facts share sort_order = 0.

**Step 4: Update `getAllFacts` to order by sort_order**

In `src/lib/services/kb-service.ts`, modify all three branches of `getAllFacts` to append `.orderBy(asc(facts.sortOrder), asc(facts.createdAt))`:

```typescript
export function getAllFacts(sessionId: string = "__default__", sessionIds?: string[]): FactRow[] {
  if (PROFILE_ID_CANONICAL) {
    return db.select().from(facts).where(eq(facts.profileId, sessionId))
      .orderBy(asc(facts.sortOrder), asc(facts.createdAt)).all() as FactRow[];
  }
  if (sessionIds && sessionIds.length > 0) {
    return db.select().from(facts).where(inArray(facts.sessionId, sessionIds))
      .orderBy(asc(facts.sortOrder), asc(facts.createdAt)).all() as FactRow[];
  }
  return db.select().from(facts).where(eq(facts.sessionId, sessionId))
    .orderBy(asc(facts.sortOrder), asc(facts.createdAt)).all() as FactRow[];
}
```

Add `asc` to the Drizzle import: `import { asc, and, eq, inArray, sql } from "drizzle-orm";`

**Step 5: Add `reorder_section_items` tool**

In `src/lib/agent/tools.ts`, add the import:
```typescript
import { updateFactSortOrder } from "@/lib/services/kb-service";
```

(Note: `updateFactSortOrder` is added to the existing kb-service import block.)

Then add the tool after `reorder_sections` (after line 365):

```typescript
reorder_section_items: tool({
  description:
    "Reorder items WITHIN a section (e.g., education entries, experience entries). Use this when the user asks to move one item above/below another. This is different from reorder_sections which moves entire sections.",
  parameters: z.object({
    category: z.string().describe("The fact category (e.g., 'education', 'experience', 'skill')"),
    orderedKeys: z
      .array(z.string())
      .describe("Fact keys in desired display order, top to bottom (e.g., ['luiss', 'deutsche-schule'])"),
  }),
  execute: async ({ category, orderedKeys }) => {
    try {
      for (let i = 0; i < orderedKeys.length; i++) {
        updateFactSortOrder(sessionId, category, orderedKeys[i], i);
      }
      try { recomposeAfterMutation(); } catch (e) {
        console.warn("[tools] recomposeAfterMutation after reorder failed:", e);
      }
      return { success: true, category, newOrder: orderedKeys };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
}),
```

**Step 6: Update DATA_MODEL_REFERENCE prompt**

In `src/lib/agent/prompts.ts`, in DATA_MODEL_REFERENCE (after line 116, the "To REMOVE a section" line), add:

```
- To REORDER ITEMS within a section (e.g., put LUISS above Deutsche Schule in education): use reorder_section_items(category, orderedKeys). Do NOT use reorder_sections for this — that moves entire sections, not items within them.
```

**Step 7: Run tests**

Run: `npx vitest run tests/evals/item-reorder.test.ts --reporter=verbose`
Expected: PASS

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All pass

**Step 8: Commit**

```bash
git add src/lib/services/kb-service.ts src/lib/agent/tools.ts src/lib/agent/prompts.ts tests/evals/item-reorder.test.ts
git commit -m "feat(P1): add reorder_section_items tool + sort_order on facts"
```

---

## Task 7: F6 — Increase maxSteps + batch create_facts tool

**Files:**
- Modify: `src/app/api/chat/route.ts:259` (maxSteps)
- Modify: `src/lib/agent/tools.ts` (add `create_facts` batch tool)
- Modify: `src/lib/agent/prompts.ts` (TOOL_POLICY)
- Test: `tests/evals/batch-create-facts.test.ts`

**Step 1: Write the failing test**

Create `tests/evals/batch-create-facts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetAllFacts, mockGetDraft, mockUpsertDraft, mockCreateFact,
  mockLogEvent, mockGetFactLanguage,
} = vi.hoisted(() => ({
  mockGetAllFacts: vi.fn(),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockCreateFact: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetFactLanguage: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getAllFacts: mockGetAllFacts,
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
  updateFactSortOrder: vi.fn(),
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "hash-a"),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
  filterPublishableFacts: vi.fn((f: unknown[]) => f),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: vi.fn() }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: vi.fn() }));
vi.mock("@/lib/services/soul-service", () => ({ proposeSoulChange: vi.fn(), getActiveSoul: vi.fn() }));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: vi.fn() }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error { code = "FACT_VALIDATION_FAILED"; constructor(m: string) { super(m); } },
}));
vi.mock("@/lib/layout/contracts", () => ({ LAYOUT_TEMPLATES: ["vertical"], resolveLayoutAlias: vi.fn() }));
vi.mock("@/lib/layout/registry", () => ({ getLayoutTemplate: vi.fn(), resolveLayoutTemplate: vi.fn() }));
vi.mock("@/lib/layout/assign-slots", () => ({ assignSlotsFromFacts: vi.fn() }));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn() }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: vi.fn() }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: vi.fn() }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: vi.fn() }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";

describe("create_facts batch tool", () => {
  let callCount: number;

  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    mockGetFactLanguage.mockReturnValue("en");
    mockGetAllFacts.mockReturnValue([]);
    mockGetDraft.mockReturnValue(null);
    mockCreateFact.mockImplementation(({ category, key }: any) => ({
      id: `f${++callCount}`,
      category,
      key,
      visibility: "proposed",
    }));
  });

  it("creates multiple facts with single recomposition", async () => {
    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1"]);
    const result = await tools.create_facts.execute(
      {
        facts: [
          { category: "skill", key: "python", value: { name: "Python" }, confidence: 1.0 },
          { category: "skill", key: "css", value: { name: "CSS" }, confidence: 1.0 },
          { category: "skill", key: "html", value: { name: "HTML" }, confidence: 1.0 },
        ],
      },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.totalCreated).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r: any) => r.success)).toBe(true);
    expect(mockCreateFact).toHaveBeenCalledTimes(3);
    // upsertDraft called at most once (single recomposition)
    expect(mockUpsertDraft.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("reports per-fact errors without failing the batch", async () => {
    mockCreateFact
      .mockReturnValueOnce({ id: "f1", category: "skill", key: "python", visibility: "proposed" })
      .mockImplementationOnce(() => { throw new Error("validation failed"); })
      .mockReturnValueOnce({ id: "f3", category: "skill", key: "html", visibility: "proposed" });

    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1"]);
    const result = await tools.create_facts.execute(
      {
        facts: [
          { category: "skill", key: "python", value: { name: "Python" }, confidence: 1.0 },
          { category: "skill", key: "bad", value: { name: "" }, confidence: 1.0 },
          { category: "skill", key: "html", value: { name: "HTML" }, confidence: 1.0 },
        ],
      },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as any },
    );

    expect(result.totalCreated).toBe(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[2].success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/batch-create-facts.test.ts --reporter=verbose`
Expected: FAIL — `create_facts` does not exist

**Step 3: Increase maxSteps**

In `src/app/api/chat/route.ts:259`, change:
```typescript
maxSteps: 5, // Allow up to 5 tool-calling rounds per turn
```
To:
```typescript
maxSteps: 10, // Allow up to 10 tool-calling rounds per turn
```

**Step 4: Add `create_facts` batch tool**

In `src/lib/agent/tools.ts`, add after `create_fact` tool (after line 157):

```typescript
create_facts: tool({
  description:
    "Store multiple facts at once. Use when the user shares several pieces of information in one message (e.g., multiple skills, languages, or interests). More efficient than calling create_fact multiple times.",
  parameters: z.object({
    facts: z.array(z.object({
      category: z.string().describe("Fact category"),
      key: z.string().describe("Unique key within category"),
      value: z.record(z.unknown()).describe("Value object"),
      confidence: z.number().optional().default(1.0).describe("Confidence: 1.0 = stated, 0.7 = implied"),
    })).describe("Array of facts to create"),
  }),
  execute: async ({ facts: inputs }) => {
    const results: Array<{ success: boolean; factId?: string; key: string; visibility?: string; error?: string }> = [];
    for (const input of inputs) {
      try {
        const fact = await createFact(input, sessionId);
        results.push({
          success: true,
          factId: fact.id,
          key: input.key,
          visibility: fact.visibility,
        });
      } catch (error) {
        results.push({ success: false, key: input.key, error: String(error) });
        logEvent({ eventType: "tool_call_error", actor: "assistant", payload: { requestId, tool: "create_facts", key: input.key, error: String(error) } });
      }
    }
    // Single recomposition at the end (not per-fact)
    try { recomposeAfterMutation(); } catch (e) {
      console.warn("[tools] recomposeAfterMutation after batch create failed:", e);
    }
    return {
      results,
      totalCreated: results.filter(r => r.success).length,
    };
  },
}),
```

**Step 5: Update TOOL_POLICY prompt**

In `src/lib/agent/prompts.ts`, in TOOL_POLICY after the create_fact line (after line 42), add:

```
- When the user shares 3 or more facts in one message (e.g., multiple skills, languages, interests), prefer create_facts (batch) over multiple create_fact calls — it's faster and uses fewer tool-calling steps
```

**Step 6: Run tests**

Run: `npx vitest run tests/evals/batch-create-facts.test.ts --reporter=verbose`
Expected: PASS

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All pass

**Step 7: Commit**

```bash
git add src/app/api/chat/route.ts src/lib/agent/tools.ts src/lib/agent/prompts.ts tests/evals/batch-create-facts.test.ts
git commit -m "feat(P1): add create_facts batch tool + increase maxSteps to 10"
```

---

## Task 8: F7 — set_fact_visibility triggers recomposition

**Files:**
- Modify: `src/lib/agent/tools.ts:772-789`
- Test: `tests/evals/visibility-recompose.test.ts`

**Step 1: Write the failing test**

Create `tests/evals/visibility-recompose.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetAllFacts, mockGetDraft, mockUpsertDraft, mockSetFactVisibility,
  mockGetFactLanguage,
} = vi.hoisted(() => ({
  mockGetAllFacts: vi.fn(),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockSetFactVisibility: vi.fn(),
  mockGetFactLanguage: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getAllFacts: mockGetAllFacts,
  setFactVisibility: mockSetFactVisibility,
  VisibilityTransitionError: class extends Error {},
  updateFactSortOrder: vi.fn(),
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "hash-new"),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({
    username: "draft", theme: "minimal", style: {},
    sections: [{ id: "skills-1", type: "skills", content: {} }],
  })),
  filterPublishableFacts: vi.fn((f: unknown[]) => f),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: vi.fn() }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: vi.fn() }));
vi.mock("@/lib/services/soul-service", () => ({ proposeSoulChange: vi.fn(), getActiveSoul: vi.fn() }));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: vi.fn() }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error { code = "FACT_VALIDATION_FAILED"; constructor(m: string) { super(m); } },
}));
vi.mock("@/lib/layout/contracts", () => ({ LAYOUT_TEMPLATES: ["vertical"], resolveLayoutAlias: vi.fn() }));
vi.mock("@/lib/layout/registry", () => ({ getLayoutTemplate: vi.fn(), resolveLayoutTemplate: vi.fn() }));
vi.mock("@/lib/layout/assign-slots", () => ({ assignSlotsFromFacts: vi.fn() }));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn() }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: vi.fn() }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: vi.fn() }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: vi.fn() }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";

describe("set_fact_visibility triggers recomposition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "skill", key: "python", value: { name: "Python" }, visibility: "proposed" },
    ]);
    mockGetDraft.mockReturnValue({
      username: "draft",
      config: { username: "draft", theme: "minimal", style: {}, sections: [] },
      configHash: "hash-old",
    });
  });

  it("recomposes draft after visibility change", async () => {
    mockSetFactVisibility.mockReturnValue({
      id: "f1", visibility: "proposed",
    });

    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1"]);
    await tools.set_fact_visibility.execute(
      { factId: "f1", visibility: "proposed" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    // Verify recomposition happened (upsertDraft called with new config)
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("passes readKeys to setFactVisibility for cross-session lookup", async () => {
    mockSetFactVisibility.mockReturnValue({
      id: "f1", visibility: "proposed",
    });

    const tools = createAgentTools("en", "sess-1", "owner-1", "req-1", ["owner-1", "old-sess"]);
    await tools.set_fact_visibility.execute(
      { factId: "f1", visibility: "proposed" },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as any },
    );

    // Verify readKeys was passed as 5th argument
    expect(mockSetFactVisibility).toHaveBeenCalledWith(
      "f1", "proposed", "assistant", "sess-1", ["owner-1", "old-sess"],
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/visibility-recompose.test.ts --reporter=verbose`
Expected: FAIL — `mockUpsertDraft` not called (no recomposition after visibility change)

**Step 3: Add recomposition to set_fact_visibility**

In `src/lib/agent/tools.ts`, modify the `set_fact_visibility` execute function (lines 772-789):

Change:
```typescript
execute: async ({ factId, visibility }) => {
  try {
    const fact = setFactVisibility(factId, visibility, "assistant", sessionId);
    return {
      success: true,
      factId: fact.id,
      visibility: fact.visibility,
    };
  } catch (error) {
```

To:
```typescript
execute: async ({ factId, visibility }) => {
  try {
    // Pass readKeys for cross-session fact lookup (same as update_fact/delete_fact)
    const fact = setFactVisibility(factId, visibility, "assistant", sessionId, readKeys);
    try { recomposeAfterMutation(); } catch (e) {
      console.warn("[tools] recomposeAfterMutation after visibility change failed:", e);
    }
    return {
      success: true,
      factId: fact.id,
      visibility: fact.visibility,
    };
  } catch (error) {
```

**Step 4: Run tests**

Run: `npx vitest run tests/evals/visibility-recompose.test.ts --reporter=verbose`
Expected: PASS

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/visibility-recompose.test.ts
git commit -m "fix(P1): set_fact_visibility triggers recomposition — preview stays fresh"
```

---

## Task 9: Final verification + full suite

**Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass (previous count was 1151, new count should be ~1151 + ~30 new tests)

**Step 2: Run TypeScript build check**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Expected: No type errors

**Step 3: Verify migration works end-to-end**

Run: `npx vitest run tests/evals/journey-state-pin.test.ts tests/evals/tool-visibility-response.test.ts tests/evals/visibility-upsert.test.ts tests/evals/anti-fabrication-prompt.test.ts tests/evals/item-reorder.test.ts tests/evals/batch-create-facts.test.ts tests/evals/visibility-recompose.test.ts --reporter=verbose`
Expected: All 7 new test files pass

**Step 4: Commit verification**

```bash
git log --oneline -8
```

Expected output (most recent first):
```
fix(P1): set_fact_visibility triggers recomposition — preview stays fresh
feat(P1): add create_facts batch tool + increase maxSteps to 10
feat(P1): add reorder_section_items tool + sort_order on facts
fix(P1): strengthen anti-fabrication prompt guards
fix(P0): recalculate visibility on fact upsert — upgrade from private only
fix(P0): return visibility + pageVisible + recomposeOk in fact tool responses
fix(P0): pin journey state per session — prevent mid-conversation mode flip
feat(db): add journey_state to sessions + sort_order to facts (migration 0021)
```
