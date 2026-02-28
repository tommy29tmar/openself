# UAT Conversation Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 bugs (3 P0 + 4 P1) discovered in UAT conversation analysis — journey state flip, visibility pipeline opacity, fabrication guard, item reordering, maxSteps, batch facts, visibility recomposition.

**Architecture:** Pin journey state in sessions table to prevent mid-conversation mode flips. Enrich tool responses with visibility info. Add `sort_order` column to facts for persistent item ordering. Batch `create_facts` tool to overcome maxSteps limit.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, SQLite, Vercel AI SDK

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

**Step 4: Verify migration runs**

Run: `npx vitest run tests/evals/agent-auto-recompose.test.ts --reporter=verbose 2>&1 | tail -5`
Expected: Existing tests still pass (migration doesn't break anything)

**Step 5: Commit**

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

  it("detects first_visit and pins it in sessions table", () => {
    // No cached state
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => undefined), // no cached journey_state
      run: vi.fn(), // write
    });

    const state = getOrDetectJourneyState(sessionId, scope);
    expect(state).toBe("first_visit");
    // Should have written to DB
    expect(mockSqlite.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions"),
    );
  });

  it("returns cached state on subsequent calls even if facts/draft exist", () => {
    // Cached state = first_visit
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => ({ journey_state: "first_visit" })),
      run: vi.fn(),
    });
    // Meanwhile, facts exist and draft exists (would normally → draft_ready)
    mockCountFacts.mockReturnValue(5);
    mockGetDraft.mockReturnValue({ config: {} });

    const state = getOrDetectJourneyState(sessionId, scope);
    expect(state).toBe("first_visit"); // pinned, not draft_ready
  });

  it("allows explicit transition via updateJourneyStatePin", () => {
    mockSqlite.prepare.mockReturnValue({
      get: vi.fn(() => ({ journey_state: "first_visit" })),
      run: vi.fn(),
    });

    // Import the update function
    const { updateJourneyStatePin } = require("@/lib/agent/journey");
    updateJourneyStatePin(sessionId, "draft_ready");

    expect(mockSqlite.prepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sessions SET journey_state"),
    );
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
 */
export function getOrDetectJourneyState(
  sessionId: string,
  scope: OwnerScope,
  authInfo?: AuthInfo,
): JourneyState {
  // Read cached state
  const row = sqlite
    .prepare("SELECT journey_state FROM sessions WHERE id = ?")
    .get(sessionId) as { journey_state: string | null } | undefined;

  if (row?.journey_state) {
    return row.journey_state as JourneyState;
  }

  // First call: detect and pin
  const detected = detectJourneyState(scope, authInfo);
  sqlite
    .prepare("UPDATE sessions SET journey_state = ? WHERE id = ?")
    .run(detected, sessionId);

  return detected;
}

/**
 * Explicitly update the pinned journey state (e.g., after generate_page).
 */
export function updateJourneyStatePin(
  sessionId: string,
  newState: JourneyState,
): void {
  sqlite
    .prepare("UPDATE sessions SET journey_state = ? WHERE id = ?")
    .run(newState, sessionId);
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
const journeyState = getOrDetectJourneyState(
  scope.currentSessionId,
  scope,
  authInfo,
);
```

**Step 5: Wire `generate_page` to transition pin**

In `src/lib/agent/tools.ts`, inside `generate_page` execute (after the `upsertDraft` call at line 417), add:

```typescript
// Transition journey state pin: onboarding → draft_ready
// Import at top: import { updateJourneyStatePin } from "@/lib/agent/journey";
updateJourneyStatePin(sessionId, "draft_ready");
```

Also add the import at the top of tools.ts:
```typescript
import { updateJourneyStatePin } from "@/lib/agent/journey";
```

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

// This test needs the real initialVisibility to verify recalculation.
// We mock the DB layer but keep visibility logic real.

const mockDb = {
  insert: vi.fn(),
  prepare: vi.fn(),
};
const mockRun = vi.fn();
const mockGet = vi.fn();

vi.mock("@/lib/db", () => ({
  default: mockDb,
  sqlite: { prepare: mockDb.prepare },
}));

// We'll test the behavior by checking that the onConflictDoUpdate set
// includes visibility. This is a unit test of the SQL shape.

describe("createFact upsert includes visibility", () => {
  it("should include visibility in onConflictDoUpdate set", async () => {
    // This is a structural test: we verify that the code path
    // for upsert includes visibility in the update set.
    // The actual integration test would require a real DB.
    // For now, verify by reading the source.
    const source = await import("fs").then(fs =>
      fs.readFileSync("src/lib/services/kb-service.ts", "utf-8")
    );

    // Check that onConflictDoUpdate set includes visibility
    const upsertSection = source.match(
      /onConflictDoUpdate\(\{[\s\S]*?set:\s*\{([\s\S]*?)\}/
    );
    expect(upsertSection).toBeTruthy();
    const setBlock = upsertSection![1];

    // visibility should be in the set block (either as a direct field or sql expression)
    expect(setBlock).toMatch(/visibility/);
  });
});
```

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
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("anti-fabrication prompt guards", () => {
  const source = readFileSync("src/lib/agent/prompts.ts", "utf-8");

  it("SAFETY_POLICY prohibits creating facts for unmentioned categories", () => {
    expect(source).toContain("NEVER create facts for categories the user has NOT explicitly mentioned");
  });

  it("SAFETY_POLICY prohibits inventing optional fields", () => {
    expect(source).toContain("NEVER invent optional fields");
  });

  it("TOOL_POLICY requires explicit user statement for fact creation", () => {
    expect(source).toContain("Only create facts from information the user explicitly stated");
  });
});
```

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

**Step 3: Add `updateFactSortOrder` to kb-service**

In `src/lib/services/kb-service.ts`, add a new exported function:

```typescript
/** Update the sort_order of a fact by sessionId + category + key. */
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

Ensure `and`, `eq` are imported from `drizzle-orm` (they likely are already).

**Step 4: Update `getAllFacts` to order by sort_order**

In `src/lib/services/kb-service.ts`, find the `getAllFacts` function and modify its query to include `ORDER BY sort_order ASC, created_at ASC`. If it uses Drizzle query builder, add `.orderBy(asc(facts.sortOrder), asc(facts.createdAt))`. If it uses raw SQL, append `ORDER BY sort_order ASC, created_at ASC`.

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
    const fact = setFactVisibility(factId, visibility, "assistant", sessionId);
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
