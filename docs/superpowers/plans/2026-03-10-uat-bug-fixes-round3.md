# UAT Bug Fixes Round 3 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 bugs discovered in the Elena Rossi UAT session — confirmation deadlock, action claim guard, search, duplication prevention, and partial-success claim handling.

**Architecture:** Minimal targeted fixes. BUG-1 adds `confirmationId` parameter to `batch_facts` with a `_batchPreflightConfirmed` bypass flag to break the deadlock, including factIds set verification and turn-state advancement. BUG-2 adds per-tool proposal fallback text to the action claim guard. BUG-3 splits multi-word search queries into individual terms. BUG-4 and BUG-5 are prompt-only fixes.

**Tech Stack:** TypeScript, Vitest, Zod, Drizzle ORM, Vercel AI SDK `tool()`.

**Design doc:** `docs/plans/2026-03-10-uat-bug-fixes-round3-design.md`

---

## File Map

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `src/lib/services/confirmation-service.ts` | `PendingConfirmation` type | Modify: add `confirmationId` to type |
| `src/lib/agent/tools.ts` | `batch_facts` tool + `deleteGate` | Modify: `confirmationId` param, factIds verification, `_batchPreflightConfirmed` bypass, identity-delete enforcement, turn-state advancement (`_deletionCountThisTurn` only), same-turn self-confirmation defense, deferred consume (always — user already confirmed). Also: `deleteGate` isolation — skip pendings with `confirmationId` to prevent cross-contamination. |
| `src/lib/agent/action-claim-guard.ts` | Stream transform for unbacked claims | Modify: `sawSuccessfulProposal`, per-tool fallback by toolName + language |
| `src/lib/services/kb-service.ts` | `searchFacts` function | Modify: word-split LIKE |
| `src/lib/agent/prompts.ts` | `TOOL_POLICY` constant | Modify: 3 instruction additions (batch_facts confirmationId, duplicate prevention, mixed outcomes). Keep existing `delete_fact` retry guidance. |
| `tests/evals/bulk-delete-confirmation.test.ts` | BUG-1 tests | Modify: add confirmed batch_facts tests |
| `tests/evals/action-claim-guard.test.ts` | BUG-2 tests | Modify: add proposal fallback tests |
| `tests/evals/search-facts-word-split.test.ts` | BUG-3 tests | Create: real `searchFacts` + seeded DB (follows archived-facts.test.ts pattern) |
| `tests/evals/tool-policy-uat-r3.test.ts` | BUG-4/5 prompt tests | Create: prompt content assertions |

---

## Chunk 1: BUG-3 — Word-Split searchFacts

### Task 1: Word-split searchFacts test + implementation

**Files:**
- Modify: `src/lib/services/kb-service.ts:354-375`
- Create: `tests/evals/search-facts-word-split.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/evals/search-facts-word-split.test.ts`. Follows the `archived-facts.test.ts` pattern: imports real `db` and real `searchFacts`, seeds test facts directly, and calls the production function. No mocking — this tests the actual Drizzle query against real SQLite.

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { facts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { searchFacts } from "@/lib/services/kb-service";

/**
 * BUG-3: searchFacts word-split regression test.
 *
 * Tests the real searchFacts function against real seeded data.
 * Follows the archived-facts.test.ts pattern (no mocking).
 *
 * Before fix: multi-word queries like "contact email" return 0 results
 * because the old LIKE '%contact email%' requires the entire query as
 * a contiguous substring in ONE field.
 *
 * After fix: each term is matched independently (AND between terms,
 * OR between fields), so "contact email" matches the fact where
 * "contact" is in category and "email" is in value.
 */

describe("searchFacts word-split", () => {
  const sessionId = "__default__";
  const factIds: string[] = [];
  let suffix: string;

  beforeEach(() => {
    // Clean up any previous test facts
    for (const id of factIds) {
      db.delete(facts).where(eq(facts.id, id)).run();
    }
    factIds.length = 0;

    // Unique suffix to avoid collision with other tests
    suffix = randomUUID().slice(0, 8);

    const f1 = randomUUID();
    const f2 = randomUUID();
    const f3 = randomUUID();
    const f4 = randomUUID();
    factIds.push(f1, f2, f3, f4);

    db.insert(facts).values({
      id: f1,
      sessionId,
      category: "contact",
      key: `email-professional-${suffix}`,
      value: { type: "email", value: "elena@elenarossi.photo" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f2,
      sessionId,
      category: "achievement",
      key: `workshop-garcia-rodero-${suffix}`,
      value: { title: "Workshop intensivo con Cristina García Rodero", location: "Barcellona" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f3,
      sessionId,
      category: "experience",
      key: `ansa-fotoreporter-${suffix}`,
      value: { role: "Fotoreporter", company: "ANSA", start: "2020-09" },
      sortOrder: 0,
    }).run();

    db.insert(facts).values({
      id: f4,
      sessionId,
      category: "identity",
      key: `name-${suffix}`,
      value: { full: "Elena Rossi" },
      sortOrder: 0,
    }).run();
  });

  afterEach(() => {
    for (const id of factIds) {
      db.delete(facts).where(eq(facts.id, id)).run();
    }
  });

  it("single-word query matches category", () => {
    const results = searchFacts("contact", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("contact");
  });

  it("multi-word query matches across fields: 'contact email'", () => {
    // BUG-3 root cause: old LIKE '%contact email%' returns 0 because
    // no single field contains "contact email" as a contiguous substring.
    // "contact" is in category, "email" is in key/value.
    const results = searchFacts("contact email", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("contact");
  });

  it("multi-word query matches key + value: 'workshop Rodero'", () => {
    const results = searchFacts("workshop Rodero", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("achievement");
  });

  it("multi-word query with no match returns empty: 'contact music'", () => {
    const results = searchFacts("contact music", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(0);
  });

  it("single-word query matches value content: 'ANSA'", () => {
    const results = searchFacts("ANSA", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("experience");
  });

  it("empty query returns empty", () => {
    const results = searchFacts("", sessionId);
    expect(results.length).toBe(0);
  });

  it("multi-word query matches category + value: 'achievement workshop'", () => {
    const results = searchFacts("achievement workshop", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("achievement");
  });

  it("query with value-only match: 'Elena Rossi'", () => {
    const results = searchFacts("Elena Rossi", sessionId);
    const testResults = results.filter(f => factIds.includes(f.id));
    expect(testResults.length).toBe(1);
    expect(testResults[0].category).toBe("identity");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/search-facts-word-split.test.ts`
Expected: "multi-word query matches across fields: 'contact email'" FAILS because the current `searchFacts` uses `LIKE '%contact email%'` which requires the entire query as a contiguous substring in ONE field. Single-word tests may pass since they work with the old approach too.

- [ ] **Step 3: Apply word-split to kb-service searchFacts**

In `src/lib/services/kb-service.ts`, replace the `searchFacts` function (lines 354-375):

```typescript
export function searchFacts(query: string, sessionId: string = "__default__", sessionIds?: string[]): FactRow[] {
  const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return [];

  // Each term must match at least one field (AND between terms, OR between fields)
  const termConditions = terms.map(term => {
    const pattern = `%${term}%`;
    return or(
      like(facts.category, pattern),
      like(facts.key, pattern),
      sql`json_extract(${facts.value}, '$') LIKE ${pattern}`,
    );
  });

  const matchCondition = and(...termConditions);

  if (PROFILE_ID_CANONICAL) {
    return db.select().from(facts)
      .where(and(eq(facts.profileId, sessionId), isNull(facts.archivedAt), matchCondition))
      .all() as FactRow[];
  }
  if (sessionIds && sessionIds.length > 0) {
    return db.select().from(facts)
      .where(and(inArray(facts.sessionId, sessionIds), isNull(facts.archivedAt), matchCondition))
      .all() as FactRow[];
  }
  return db.select().from(facts)
    .where(and(eq(facts.sessionId, sessionId), isNull(facts.archivedAt), matchCondition))
    .all() as FactRow[];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/search-facts-word-split.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `set -o pipefail; npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: No new failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/kb-service.ts tests/evals/search-facts-word-split.test.ts
git commit -m "fix: word-split searchFacts for multi-word queries (BUG-3)

Multi-word queries like 'contact email' now match facts where each
term appears in any field (AND between terms, OR between fields).
Previously the entire query had to appear as a substring in a single
field, causing all multi-word searches to return empty."
```

---

## Chunk 2: BUG-1 — Confirmation Deadlock

### Task 2: Add `confirmationId` to PendingConfirmation type

**Files:**
- Modify: `src/lib/services/confirmation-service.ts:64-72`

- [ ] **Step 1: Update PendingConfirmation type**

In `src/lib/services/confirmation-service.ts`, add `confirmationId` to the type union:

```typescript
export type PendingConfirmation = {
  id: string;
  type: "identity_overwrite" | "bulk_delete" | "identity_delete";
  category?: string;
  key?: string;
  valueHash?: string;
  factIds?: string[];
  confirmationId?: string;
  createdAt: string;
};
```

- [ ] **Step 2: Run tsc to verify no type errors**

Run: `set -o pipefail; npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (adding an optional field is backward-compatible).

### Task 2b: Isolate deleteGate from batch-confirmation pendings

**Files:**
- Modify: `src/lib/agent/tools.ts:277-315` (deleteGate function)

- [ ] **Step 1: Add `!p.confirmationId` filter to deleteGate pending lookups**

`deleteGate` must never read or mutate batch-confirmation pendings (those with `confirmationId`). Without this, if `delete_fact` runs in the same turn as a blocked `batch_facts`, `deleteGate` appends the new factId to the batch-confirmation pending, corrupting its `factIds` set.

In `src/lib/agent/tools.ts`, modify `deleteGate` (lines 277-315):

Change the blocked-branch pending lookup (line 279):
```typescript
// OLD:
const existingPending = pendings.find(p => p.type === "bulk_delete");
// NEW:
const existingPending = pendings.find(p => p.type === "bulk_delete" && !p.confirmationId);
```

Change the pending-consume lookup (line 288):
```typescript
// OLD:
const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && p.factIds?.includes(factId));
// NEW:
const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && !p.confirmationId && p.factIds?.includes(factId));
```

This ensures:
- `deleteGate` only operates on "individual delete" pendings (no `confirmationId`)
- `batch_facts` only operates on "batch" pendings (with `confirmationId`)
- No cross-contamination between the two flows

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts`
Expected: All existing tests still PASS.

- [ ] **Step 3: Add deleteGate isolation regression test**

Add this test to `tests/evals/bulk-delete-confirmation.test.ts`:

```typescript
  it("batch_facts reject does not contaminate delete_fact pending", async () => {
    // Scenario: batch_facts blocks (creates pending with confirmationId),
    // then delete_fact runs in same turn. delete_fact should NOT append to
    // the batch-confirmation pending — it should create its own.
    const { tools } = createAgentTools("en", "s1");

    // Step 1: batch_facts blocks with 2+ deletes
    const batchResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;
    expect(batchResult.success).toBe(false);
    expect(batchResult.confirmationId).toBeDefined();

    // Step 2: delete_fact for a different fact (first delete in turn → allowed)
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f3", category: "skill", key: "ts" });
    const deleteResult = await tools.delete_fact.execute({
      factId: "f3",
    }, toolCtx);
    expect(deleteResult.success).toBe(true);

    // Step 3: second delete_fact → should be blocked with its OWN pending
    const deleteResult2 = await tools.delete_fact.execute({
      factId: "f4",
    }, toolCtx);
    expect(deleteResult2.success).toBe(false);
    expect(deleteResult2.code).toBe("REQUIRES_CONFIRMATION");

    // Verify: the batch-confirmation pending still has original factIds [f1, f2]
    // (not contaminated with f3 or f4)
    const lastMetaCall = mockMergeSessionMeta.mock.calls[mockMergeSessionMeta.mock.calls.length - 1];
    const storedPendings = lastMetaCall[1]?.pendingConfirmations;
    if (storedPendings) {
      const batchPending = storedPendings.find((p: any) => p.confirmationId);
      if (batchPending) {
        expect(batchPending.factIds).toEqual(["f1", "f2"]);
        expect(batchPending.factIds).not.toContain("f3");
        expect(batchPending.factIds).not.toContain("f4");
      }
    }
  });
```

### Task 3: Write failing test for confirmed batch_facts

**Files:**
- Modify: `tests/evals/bulk-delete-confirmation.test.ts`

- [ ] **Step 1: Add test for confirmed batch_facts with confirmationId**

Append to `tests/evals/bulk-delete-confirmation.test.ts`, inside the existing `describe` block:

```typescript
  it("batch_facts with valid confirmationId bypasses pre-flight and executes all deletes", async () => {
    const confirmationId = "conf-abc-123";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });
    mockCreateFact.mockReturnValue({ id: "f-new", category: "skill", key: "ts", visibility: "proposed" });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
        { action: "create" as const, category: "skill", key: "ts", value: { name: "TS" } },
      ],
      confirmationId,
    }, toolCtx);

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(2);
    expect(result.created).toBe(1);
  });

  it("batch_facts with invalid confirmationId still blocks", async () => {
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId: "conf-abc-123",
        createdAt: new Date().toISOString(),
      }],
    });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId: "wrong-id",
    }, toolCtx);

    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("batch_facts with confirmationId but mismatched factIds rejects", async () => {
    const confirmationId = "conf-mismatch-test";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        // Different factIds than what was stored in pending
        { action: "delete" as const, factId: "f3" },
        { action: "delete" as const, factId: "f4" },
      ],
      confirmationId,
    }, toolCtx);

    // Should reject because factIds don't match the pending
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("batch_facts without confirmationId returns confirmationId in response", async () => {
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;

    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
    expect(result.confirmationId).toBeDefined();
    expect(typeof result.confirmationId).toBe("string");
  });

  it("batch_facts rejects duplicate factIds in delete operations", async () => {
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;

    expect(result.success).toBe(false);
    expect(result.error).toBe("DUPLICATE_FACT_IDS");
  });

  it("confirmed batch_facts consumes pending AFTER execution, not before", async () => {
    const confirmationId = "conf-defer-test";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    // First delete succeeds, second throws
    let deleteCallCount = 0;
    mockDeleteFact.mockImplementation(() => {
      deleteCallCount++;
      if (deleteCallCount === 2) throw new Error("DB constraint failure");
      return true;
    });
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });

    const { tools } = createAgentTools("en", "s1");

    // Should throw or return error, but pending should NOT be consumed
    try {
      await tools.batch_facts.execute({
        operations: [
          { action: "delete" as const, factId: "f1" },
          { action: "delete" as const, factId: "f2" },
        ],
        confirmationId,
      }, toolCtx);
    } catch {
      // expected
    }

    // Verify pending was NOT consumed (mergeSessionMeta should not have been called
    // with empty pendingConfirmations)
    const consumeCalls = mockMergeSessionMeta.mock.calls.filter(
      (call: any[]) => call[1]?.pendingConfirmations === null
    );
    expect(consumeCalls.length).toBe(0);
  });

  it("confirmed batch_facts advances _deletionCountThisTurn so later delete_fact is gated", async () => {
    const confirmationId = "conf-turn-state";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f1", category: "experience", key: "old" });

    const { tools } = createAgentTools("en", "s1");

    // Confirmed batch should succeed
    const batchResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId,
    }, toolCtx);
    expect(batchResult.success).toBe(true);

    // Now a subsequent delete_fact in the same turn should be blocked
    // (_deletionCountThisTurn was advanced by 2, so deleteGate's _deletionCountThisTurn >= 1
    // check triggers, creating a fresh pending and returning REQUIRES_CONFIRMATION)
    const deleteResult = await tools.delete_fact.execute({
      factId: "f3",
    }, toolCtx);
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("confirmed batch_facts consumes pending even when some deletes return false", async () => {
    const confirmationId = "conf-partial-delete";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    // f1 deletes successfully, f2 returns false (already gone / access denied)
    mockDeleteFact.mockImplementation((factId: string) => factId === "f1");
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId,
    }, toolCtx) as any;

    // Should succeed but with partial results
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
    // Pending IS consumed — user already confirmed. Keeping it would create a stuck
    // state because f1 is already gone and will always return false on retry.
    // Warnings report the skipped delete.
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    // Verify pending was consumed
    const consumeCalls = mockMergeSessionMeta.mock.calls.filter(
      (call: any[]) => call[1]?.pendingConfirmations === null
    );
    expect(consumeCalls.length).toBe(1);
  });

  it("batch_facts with identity delete ops is rejected", async () => {
    const confirmationId = "conf-identity-test";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f-identity", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    // getFactById returns an identity fact for f-identity
    mockGetFactById.mockImplementation((id: string) => {
      if (id === "f-identity") return { id: "f-identity", category: "identity", key: "name" };
      return { id: "f2", category: "skill", key: "ts" };
    });

    const { tools } = createAgentTools("en", "s1");

    // Even with valid confirmationId, identity deletes should be rejected in batch
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f-identity" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId,
    }, toolCtx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("identity");
  });

  it("batch_facts rejects same-turn self-confirmation", async () => {
    // Simulate: agent calls batch_facts → gets REQUIRES_CONFIRMATION → immediately retries
    const { tools } = createAgentTools("en", "s1");

    // First call: should block and return confirmationId
    const firstResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;
    expect(firstResult.success).toBe(false);
    expect(firstResult.confirmationId).toBeDefined();

    // Second call in same turn: should reject even with valid confirmationId
    const secondResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId: firstResult.confirmationId,
    }, toolCtx) as any;
    expect(secondResult.success).toBe(false);
    expect(secondResult.code).toBe("REQUIRES_CONFIRMATION");
    expect(secondResult.message).toContain("same turn");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts`
Expected: New tests FAIL — `batch_facts` doesn't accept `confirmationId` yet.

### Task 4: Implement confirmationId + bypass + deferred consume + factIds verification + turn-state advancement + identity-delete enforcement

**Files:**
- Modify: `src/lib/agent/tools.ts:478-613`

- [ ] **Step 1: Add confirmationId to batch_facts schema**

In `src/lib/agent/tools.ts`, modify the `batch_facts` tool `parameters` (around line 480):

```typescript
  batch_facts: tool({
    description: "Execute multiple fact operations in order. Operations are applied sequentially (create, delete) and a single recompose runs at the end. Max 20 operations. No updates — facts are immutable (delete + create to correct).",
    parameters: z.object({
      operations: z.array(z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create"),
          category: z.string(),
          key: z.string(),
          value: z.record(z.unknown()),
          source: z.string().optional(),
          confidence: z.number().optional(),
          parentFactId: z.string().optional(),
        }),
        z.object({
          action: z.literal("delete"),
          factId: z.string(),
        }),
      ])).max(20),
      confirmationId: z.string().optional().describe("Pass the confirmationId from a previous REQUIRES_CONFIRMATION response to confirm bulk deletions"),
    }),
```

- [ ] **Step 2: Replace the pre-flight block with confirmation-aware logic**

First, add a closure-level variable near `_deleteBlockedThisTurn` (around line 180):
```typescript
  const _batchPendingIdsThisTurn = new Set<string>(); // track pending IDs created this turn for same-turn self-confirmation defense
```

Then replace the pre-flight section (lines 497-515) inside the `execute` function. The full new `execute` body:

```typescript
    execute: async ({ operations, confirmationId }) => {
      if (operations.length > 20) {
        return { success: false, error: "MAX_BATCH_SIZE", message: "Maximum 20 operations per batch", created: 0, deleted: 0 };
      }

      // Pre-flight: reject identity deletes from batch_facts entirely
      // Identity deletes require the cross-turn identityDeleteGate path (individual delete_fact only)
      const deleteOps = operations.filter(op => op.action === "delete");
      if (deleteOps.length > 0) {
        for (const dOp of deleteOps) {
          const factForCheck = getFactById((dOp as { factId: string }).factId, sessionId, readKeys);
          if (factForCheck?.category === "identity") {
            return {
              success: false,
              code: "IDENTITY_DELETE_NOT_ALLOWED_IN_BATCH",
              message: "Identity fact deletes are not allowed in batch_facts. Use individual delete_fact calls for identity facts, which require cross-turn confirmation.",
              created: 0, deleted: 0,
            };
          }
        }
      }

      // Pre-flight: reject duplicate factIds in delete operations
      const deleteFactIds = deleteOps.map(op => (op as { factId: string }).factId);
      const uniqueDeleteFactIds = new Set(deleteFactIds);
      if (uniqueDeleteFactIds.size !== deleteFactIds.length) {
        return { success: false, error: "DUPLICATE_FACT_IDS", message: "Duplicate factIds in delete operations are not allowed.", created: 0, deleted: 0 };
      }

      // Pre-flight: batch with ≥2 deletes → check confirmationId or block
      let _batchPreflightConfirmed = false;
      let pendingToConsumeId: string | null = null; // store id, not index (index can go stale if identityGate splices pendings)
      if (deleteOps.length >= 2) {
        if (confirmationId) {
          // Check if confirmationId matches a stored pending
          const matchedPending = pendings.find(p =>
            p.type === "bulk_delete" && p.confirmationId === confirmationId
          );
          // Defense-in-depth: reject same-turn self-confirmation.
          // If the pending was created in THIS createAgentTools invocation (same turn),
          // the model is self-confirming without user intervention. _batchPendingIdsThisTurn
          // tracks all pending IDs created by batch_facts rejections in this turn.
          if (matchedPending && _batchPendingIdsThisTurn.has(matchedPending.id)) {
            return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId, message: "Cannot self-confirm in the same turn. The user must confirm in a new message.", created: 0, deleted: 0 };
          }
          if (matchedPending) {
            // Verify factIds match the stored pending's factIds
            const storedFactIds = new Set(matchedPending.factIds ?? []);
            const requestFactIds = new Set(deleteOps.map(op => (op as { factId: string }).factId));
            const idsMatch = storedFactIds.size === requestFactIds.size &&
              [...storedFactIds].every(id => requestFactIds.has(id));
            if (!idsMatch) {
              // FactIds mismatch — reject, issue new confirmationId for the actual request
              // NOTE: do NOT set _deleteBlockedThisTurn — no deletions occurred.
              const newConfirmationId = randomUUID();
              const factIds = deleteOps.map(op => (op as { factId: string }).factId);
              const pendingId = randomUUID();
              pendings.push({
                id: pendingId,
                type: "bulk_delete",
                factIds,
                confirmationId: newConfirmationId,
                createdAt: new Date().toISOString(),
              });
              _batchPendingIdsThisTurn.add(pendingId);
              mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
              return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId: newConfirmationId, message: "The items to delete have changed since the original confirmation. Please confirm the updated list.", created: 0, deleted: 0 };
            }
            _batchPreflightConfirmed = true;
            pendingToConsumeId = matchedPending.id;
            // Do NOT consume yet — deferred until after successful execution
          } else {
            // Invalid confirmationId — block again with new pending
            // NOTE: do NOT set _deleteBlockedThisTurn — no deletions occurred.
            const newConfirmationId = randomUUID();
            const factIds = deleteOps.map(op => (op as { factId: string }).factId);
            const pendingId = randomUUID();
            pendings.push({
              id: pendingId,
              type: "bulk_delete",
              factIds,
              confirmationId: newConfirmationId,
              createdAt: new Date().toISOString(),
            });
            _batchPendingIdsThisTurn.add(pendingId);
            mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
            return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId: newConfirmationId, message: "Batch with 2+ deletions requires explicit user confirmation. List the items and ask the user to confirm.", created: 0, deleted: 0 };
          }
        } else {
          // No confirmationId — block and issue one
          // NOTE: do NOT set _deleteBlockedThisTurn — no deletions occurred.
          const newConfirmationId = randomUUID();
          const factIds = deleteOps.map(op => (op as { factId: string }).factId);
          const pendingId = randomUUID();
          pendings.push({
            id: pendingId,
            type: "bulk_delete",
            factIds,
            confirmationId: newConfirmationId,
            createdAt: new Date().toISOString(),
          });
          _batchPendingIdsThisTurn.add(pendingId);
          mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
          return { success: false, code: "REQUIRES_CONFIRMATION", requiresConfirmation: true, confirmationId: newConfirmationId, message: "Batch with 2+ deletions requires explicit user confirmation. List the items and ask the user to confirm.", created: 0, deleted: 0 };
        }
      }

      // Pre-flight: identity overwrites (unchanged)
      for (const op of operations) {
        if (op.action === "create" && op.category === "identity") {
          const blocked = identityGate(op.category, op.key, op.value);
          if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked, created: 0, deleted: 0 };
        }
      }

      let created = 0, deleted = 0;
      const warnings: string[] = [];
      const reverseOps: Array<{
        action: "delete" | "recreate";
        factId?: string;
        previousFact?: Record<string, unknown>;
      }> = [];

      try {
        for (const op of operations) {
          switch (op.action) {
            case "create": {
              // Duplicate guard
              const existingFacts = findFactsByOwnerCategoryKey(effectiveOwnerKey, op.category, op.key, readKeys);
              if (existingFacts.length > 0) {
                if (stableDeepEqual(existingFacts[0].value, op.value)) {
                  break; // Skip: already exists with same value
                }
                warnings.push(`Create of ${op.category}/${op.key} blocked: fact already exists with different value. Delete first.`);
                break;
              }
              const result = await createFact(
                {
                  category: op.category,
                  key: op.key,
                  value: op.value,
                  source: op.source ?? "chat",
                  confidence: op.confidence,
                  parentFactId: op.parentFactId,
                },
                sessionId,
                effectiveOwnerKey,
              );
              reverseOps.push({ action: "delete", factId: result.id });
              created++;
              break;
            }
            case "delete": {
              // If batch was pre-confirmed, skip deleteGate
              if (!_batchPreflightConfirmed) {
                const dBlocked = deleteGate(op.factId);
                if (dBlocked) {
                  warnings.push(`Delete of ${op.factId} blocked: ${dBlocked.message}`);
                  break;
                }
              }
              const old = getFactById(op.factId, sessionId, readKeys);
              if (old) {
                const { id, ...rest } = old;
                reverseOps.push({ action: "recreate", factId: id, previousFact: rest as Record<string, unknown> });
              }
              const didDelete = deleteFact(op.factId, sessionId, readKeys);
              if (didDelete) {
                deleted++;
                // Advance turn counter immediately per successful delete (not deferred
                // to after the loop) — if a later op throws, the counter is already
                // correct so later delete_fact calls in the same turn are properly gated.
                if (_batchPreflightConfirmed) {
                  _deletionCountThisTurn++;
                }
              } else {
                warnings.push(`Delete of ${op.factId} skipped: fact not found or not accessible.`);
              }
              break;
            }
          }
        }

        if (reverseOps.length > 0) {
          logTrustAction(effectiveOwnerKey, "batch_facts",
            `Batch: ${created} created, ${deleted} deleted`,
            { undoPayload: { action: "reverse_batch", reverseOps } },
          );
        }

        // Turn-level count already advanced per-delete in the loop above.
        // Do NOT set _deleteBlockedThisTurn here — let deleteGate handle it
        // naturally via the _deletionCountThisTurn >= 1 path, which correctly
        // creates a fresh pending for the user's next confirmation.

        // Deferred consume: always consume after confirmed batch execution.
        // The user already confirmed the deletions. If some facts were already gone
        // (deleteFact returned false), that's a no-op, not a failure — keeping the
        // pending would create a stuck state because the already-deleted fact IDs
        // will always return false on retry, making deleted === deleteOps.length
        // impossible. Warnings report any skipped deletes to the agent.
        if (_batchPreflightConfirmed && pendingToConsumeId) {
          const consumeIdx = pendings.findIndex(p => p.id === pendingToConsumeId);
          if (consumeIdx >= 0) {
            pendings.splice(consumeIdx, 1);
            mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
          }
        }

        try { recomposeAfterMutation(); } catch (e) {
          logEvent({ eventType: "recompose_error", actor: "system", payload: { requestId, error: String(e), source: "batch_facts" } });
        }
        return { success: true, created, deleted, ...(warnings.length > 0 ? { warnings } : {}) };
      } catch (err) {
        // Do NOT consume pending on error — it stays valid for retry
        if (reverseOps.length > 0) {
          try {
            logTrustAction(effectiveOwnerKey, "batch_facts",
              `Batch (partial): ${created} created, ${deleted} deleted — stopped by error`,
              { undoPayload: { action: "reverse_batch", reverseOps } },
            );
            recomposeAfterMutation();
          } catch (cleanupErr) {
            console.error("[batch_facts] cleanup failed after partial batch:", cleanupErr);
          }
        }

        if (err instanceof FactValidationError) {
          return { success: false, error: "VALIDATION_ERROR", message: err.message, created, deleted, hint: "Batch stopped — earlier operations were applied" };
        }
        if (err instanceof FactConstraintError) {
          return { success: false, code: err.code, existingFactId: err.existingFactId, suggestion: err.suggestion, created, deleted, hint: "Batch stopped — earlier operations were applied" };
        }
        throw err;
      }
    },
```

Key changes (accumulated from Codex reviews v2-v4):
1. **`_deletionCountThisTurn` advanced per-delete, not deferred**: Each successful confirmed delete increments `_deletionCountThisTurn` immediately inside the loop. This ensures the counter is correct even if a later op throws. `_deleteBlockedThisTurn` is never set by batch_facts — neither in reject paths (no deletions occurred) nor after execution (let `deleteGate` handle it naturally via `_deletionCountThisTurn >= 1`).
2. **Always consume after confirmed batch**: The user already confirmed. If `deleteFact()` returns false for some ops (fact gone or access denied), keeping the pending would create a stuck state (already-deleted IDs will always return false on retry). Warnings report skipped deletes.
3. **Warning on false deleteFact**: When `deleteFact` returns false, a warning is added so the agent can report it.
4. **Id-based pending consume**: `pendingToConsumeId` (string) instead of index. Re-found by `id` before consuming to avoid stale-index bugs from `identityGate` splicing.
5. **deleteGate isolation**: `deleteGate` skips pendings with `confirmationId` (`!p.confirmationId` filter). Batch-confirmation and individual-delete pendings never cross-contaminate.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts`
Expected: All tests PASS including the 8 new ones.

- [ ] **Step 4: Run full suite**

Run: `set -o pipefail; npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/confirmation-service.ts src/lib/agent/tools.ts tests/evals/bulk-delete-confirmation.test.ts
git commit -m "fix: break confirmation deadlock with confirmationId in batch_facts (BUG-1)

batch_facts with 2+ deletes now returns a confirmationId in the
REQUIRES_CONFIRMATION response. On retry, the agent passes it back
to bypass the pre-flight gate. Includes factIds set verification
(stale/replayed tokens rejected), identity-delete enforcement
(rejected from batch), and turn-state advancement (count only, not
blocked flag — preserves deleteGate's pending creation path).
Pending always consumed after confirmed batch (user already confirmed;
keeping on partial would create stuck state). Deferred to after
execution to survive thrown errors."
```

---

## Chunk 3: BUG-2 — Proposal Fallback in Action Claim Guard

### Task 5: Write failing tests for proposal fallback

**Files:**
- Modify: `tests/evals/action-claim-guard.test.ts`

- [ ] **Step 1: Add proposal fallback tests**

Append to `tests/evals/action-claim-guard.test.ts`, inside the existing `describe` block:

```typescript
  it("hasSuccessfulProposalToolCall returns true for request_publish", () => {
    const { hasSuccessfulProposalToolCall } = require("@/lib/agent/action-claim-guard");
    expect(hasSuccessfulProposalToolCall([
      { toolName: "request_publish", success: true },
    ])).toBe(true);
    expect(hasSuccessfulProposalToolCall([
      { toolName: "create_fact", success: true },
    ])).toBe(false);
    expect(hasSuccessfulProposalToolCall([
      { toolName: "request_publish", success: false },
    ])).toBe(false);
  });

  it("getProposalFallback returns tool-specific text for request_publish", () => {
    const { getProposalFallback } = require("@/lib/agent/action-claim-guard");
    const itFallback = getProposalFallback("request_publish", "it");
    expect(itFallback).toContain("conferma");
    expect(itFallback).toContain("pubblicazione");
    const enFallback = getProposalFallback("request_publish", "en");
    expect(enFallback).toContain("confirmation");
    expect(enFallback).toContain("publish");
  });

  it("getProposalFallback returns tool-specific text for propose_soul_change", () => {
    const { getProposalFallback } = require("@/lib/agent/action-claim-guard");
    const itFallback = getProposalFallback("propose_soul_change", "it");
    expect(itFallback).toContain("proposta");
    const enFallback = getProposalFallback("propose_soul_change", "en");
    expect(enFallback).toContain("proposal");
  });

  it("sanitizeUnbackedActionClaim uses proposal fallback when only proposal tools ran", () => {
    const { sanitizeUnbackedActionClaim } = require("@/lib/agent/action-claim-guard");
    const result = sanitizeUnbackedActionClaim(
      "Pubblicato. Ora è live.",
      [{ toolName: "request_publish", success: true }],
      "it",
    );
    // Should NOT be the generic "Non l'ho ancora eseguito" — should be the proposal fallback
    expect(result).not.toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
    expect(result).toContain("conferma");
    expect(result).toContain("pubblicazione");
  });

  it("stream transform uses proposal fallback after request_publish + action claim", async () => {
    const output = await collect([
      { type: "tool-result", toolName: "request_publish", result: { success: true } },
      { type: "text-delta", textDelta: "Pubblicato. Ora è live." },
    ]);

    const text = output.filter(p => p.type === "text-delta").map(p => (p as any).textDelta).join("");
    // Should be proposal-specific fallback, not the generic one
    expect(text).not.toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
    expect(text).toContain("conferma");
  });

  it("sanitizeUnbackedActionClaim uses generic fallback when multiple proposal tools succeeded", () => {
    const { sanitizeUnbackedActionClaim } = require("@/lib/agent/action-claim-guard");
    const result = sanitizeUnbackedActionClaim(
      "Ho aggiornato tutto e pubblicato.",
      [
        { toolName: "propose_soul_change", success: true },
        { toolName: "request_publish", success: true },
      ],
      "it",
    );
    // Multiple proposal tools → generic fallback, not tool-specific
    expect(result).toBe("Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.");
  });

  it("sanitizeUnbackedActionClaim uses en proposal fallback for english", () => {
    const { sanitizeUnbackedActionClaim } = require("@/lib/agent/action-claim-guard");
    const result = sanitizeUnbackedActionClaim(
      "Published! Your page is live.",
      [{ toolName: "request_publish", success: true }],
      "en",
    );
    expect(result).not.toBe("I haven't done that yet. If you want, I can do it now.");
    expect(result).toContain("confirmation");
    expect(result).toContain("publish");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/action-claim-guard.test.ts`
Expected: New tests FAIL — `hasSuccessfulProposalToolCall` doesn't exist, fallback is still generic.

### Task 6: Implement per-tool proposal fallback in action-claim-guard

**Files:**
- Modify: `src/lib/agent/action-claim-guard.ts`

- [ ] **Step 1: Add PROPOSAL_TOOL_NAMES, per-tool fallback text, and helpers**

After the `ACTION_FALLBACKS` constant (line 46), add:

```typescript
const PROPOSAL_TOOL_NAMES = new Set([
  "request_publish",
  "propose_soul_change",
  "propose_lock",
]);

// Per-tool × per-language fallback text
const PROPOSAL_FALLBACKS: Record<string, Record<string, string>> = {
  request_publish: {
    en: "The publish is pending — use the confirmation button to proceed.",
    it: "La pubblicazione è in attesa — usa il tasto di conferma per procedere.",
  },
  propose_soul_change: {
    en: "The proposal has been registered.",
    it: "La proposta è stata registrata.",
  },
  propose_lock: {
    en: "The lock proposal has been registered.",
    it: "La proposta di blocco è stata registrata.",
  },
};

// Generic fallback if tool name not in the map
const PROPOSAL_GENERIC_FALLBACK: Record<string, string> = {
  en: "The action is pending — use the confirmation button to proceed.",
  it: "L'azione è in attesa di conferma — usa il tasto di conferma per procedere.",
};

function isSuccessfulProposalToolResult(part: GuardStreamPart): boolean {
  if (part.type !== "tool-result") return false;
  const tr = part as { toolName: string; result: unknown };
  const result = tr.result as Record<string, unknown> | null | undefined;
  return result?.success === true && PROPOSAL_TOOL_NAMES.has(tr.toolName);
}

export function hasSuccessfulProposalToolCall(journal: JournalEntry[]): boolean {
  return journal.some(entry =>
    entry.success && PROPOSAL_TOOL_NAMES.has(entry.toolName)
  );
}

function getSuccessfulProposalToolNames(journal: JournalEntry[]): string[] {
  return journal
    .filter(entry => entry.success && PROPOSAL_TOOL_NAMES.has(entry.toolName))
    .map(entry => entry.toolName);
}

export function getProposalFallback(toolName: string, language: string): string {
  const toolFallbacks = PROPOSAL_FALLBACKS[toolName];
  if (toolFallbacks) {
    return toolFallbacks[language] ?? toolFallbacks.en;
  }
  return PROPOSAL_GENERIC_FALLBACK[language] ?? PROPOSAL_GENERIC_FALLBACK.en;
}
```

- [ ] **Step 2: Update sanitizeUnbackedActionClaim for non-stream path**

Replace the `sanitizeUnbackedActionClaim` function:

```typescript
export function sanitizeUnbackedActionClaim(
  text: string,
  journal: JournalEntry[],
  language: string,
): string {
  if (!text.trim()) return text;
  if (hasSuccessfulMutationToolCall(journal)) return text;
  if (!looksLikeUnbackedActionClaim(text)) return text;
  const proposalTools = getSuccessfulProposalToolNames(journal);
  // Exactly one proposal tool → use its specific fallback.
  // Multiple proposal tools → generic fallback to avoid wrong attribution.
  if (proposalTools.length === 1) return getProposalFallback(proposalTools[0], language);
  return getUnbackedActionFallback(language);
}
```

- [ ] **Step 3: Update createUnbackedActionClaimTransform for stream path**

In the `createUnbackedActionClaimTransform` function, add `sawSuccessfulProposal` and `lastProposalToolName` tracking:

After `let sawSuccessfulMutation = false;` add:
```typescript
    let proposalToolCount = 0;
    let singleProposalToolName = "";
```

In the `transform` method, after the `isSuccessfulMutationToolResult` check (inside the `tool-result` block), add:
```typescript
          if (isSuccessfulProposalToolResult(part)) {
            proposalToolCount++;
            singleProposalToolName = (part as { toolName: string }).toolName;
          }
```

In the `flush` method, replace:
```typescript
        if (!sawSuccessfulMutation && looksLikeUnbackedActionClaim(bufferedText)) {
          controller.enqueue({
            type: "text-delta",
            textDelta: getUnbackedActionFallback(language),
          });
          return;
        }
```
with:
```typescript
        if (!sawSuccessfulMutation && looksLikeUnbackedActionClaim(bufferedText)) {
          // When exactly one proposal tool succeeded, use its specific fallback.
          // When multiple proposal tools succeeded, use the generic fallback
          // to avoid attributing the claim to the wrong tool.
          const fallback = proposalToolCount === 1
            ? getProposalFallback(singleProposalToolName, language)
            : getUnbackedActionFallback(language);
          controller.enqueue({
            type: "text-delta",
            textDelta: fallback,
          });
          return;
        }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evals/action-claim-guard.test.ts`
Expected: All tests PASS including the 6 new ones. Note: the existing test "stream transform still rewrites publish claims after request_publish" should now return the proposal fallback instead of the generic one — update expected value:

In the existing test at line 122-132, change the expected output from:
```typescript
      { type: "text-delta", textDelta: "Non l'ho ancora eseguito. Se vuoi, lo faccio adesso." },
```
to:
```typescript
      { type: "text-delta", textDelta: "La pubblicazione è in attesa — usa il tasto di conferma per procedere." },
```

- [ ] **Step 5: Run full suite**

Run: `set -o pipefail; npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: No regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/action-claim-guard.ts tests/evals/action-claim-guard.test.ts
git commit -m "fix: per-tool proposal fallback in action claim guard (BUG-2)

When request_publish succeeds but the agent claims completion, the
guard now uses a tool-specific fallback ('pubblicazione in attesa di
conferma') instead of the generic 'Non l'ho ancora eseguito'. Each
proposal tool (request_publish, propose_soul_change, propose_lock)
has its own fallback text per language. Applies to both stream and
non-stream paths."
```

---

## Chunk 4: BUG-4/5 Prompt Updates + BUG-1 Prompt Update

### Task 7: Write prompt assertion tests

**Files:**
- Create: `tests/evals/tool-policy-uat-r3.test.ts`

- [ ] **Step 1: Write prompt content assertions**

Create `tests/evals/tool-policy-uat-r3.test.ts`. Uses the `makeBootstrap()` pattern from `tests/evals/tool-policy-update.test.ts` with all required `BootstrapPayload` fields:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agent/policies", () => ({
  getJourneyPolicy: vi.fn(() => ""),
  getSituationDirectives: vi.fn(() => ""),
  getExpertiseCalibration: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({ memoryUsageDirectives: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/turn-management", () => ({ turnManagementRules: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/shared-rules", () => ({ sharedBehavioralRules: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/planning-protocol", () => ({ planningProtocol: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({ undoAwarenessPolicy: vi.fn(() => "") }));
vi.mock("@/lib/presence/prompt-builder", () => ({ buildPresenceReference: vi.fn(() => "") }));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

const makeBootstrap = (): BootstrapPayload => ({
  journeyState: "active_fresh",
  situations: [],
  expertiseLevel: "novice",
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  language: "it",
  conversationContext: null,
  archetype: "generalist",
});

describe("TOOL_POLICY UAT Round 3 additions", () => {
  const prompt = buildSystemPrompt(makeBootstrap());

  it("contains confirmationId instruction for batch_facts (BUG-1)", () => {
    expect(prompt).toContain("confirmationId");
    expect(prompt).toContain("batch_facts");
  });

  it("retains delete_fact retry guidance alongside batch_facts confirmationId", () => {
    // delete_fact still uses the old confirmation flow (no confirmationId)
    // The prompt must keep both paths documented
    expect(prompt).toContain("delete_fact");
    expect(prompt).toMatch(/delete_fact.*confirm|confirm.*delete_fact/i);
  });

  it("contains duplicate prevention instruction (BUG-4)", () => {
    expect(prompt).toContain("DUPLICATE PREVENTION");
    expect(prompt).toContain("do NOT create a replacement fact with a different key");
  });

  it("contains mixed-outcome reporting instruction (BUG-5)", () => {
    expect(prompt).toContain("MIXED OUTCOMES");
    expect(prompt).toContain("report each result individually");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts`
Expected: FAIL — prompt doesn't contain these strings yet.

### Task 8: Update TOOL_POLICY in prompts.ts

**Files:**
- Modify: `src/lib/agent/prompts.ts:122-127`

- [ ] **Step 1: Replace BULK DELETION instruction and add BUG-4/5 instructions**

Replace the BULK DELETION line (line 123) with the updated version, and add BUG-4 + BUG-5 instructions right after. Keep `delete_fact` guidance in its own branch:

Replace:
```
- BULK DELETION: 2nd+ deletion in a turn triggers a confirmation gate. When delete_fact returns code: "REQUIRES_CONFIRMATION", list all items to be deleted and ask for explicit confirmation. When the user confirms in their next message, retry each deletion with individual delete_fact calls (do NOT use batch_facts for confirmed multi-delete — it blocks ≥2 deletes in pre-flight). Do NOT treat REQUIRES_CONFIRMATION as an error.
```

With:
```
- BULK DELETION (batch_facts): When batch_facts returns code: "REQUIRES_CONFIRMATION" with a confirmationId, list all items to be deleted and ask for explicit confirmation. When the user confirms, retry the SAME batch_facts call including the confirmationId from the response.
- BULK DELETION (delete_fact): 2nd+ deletion in a turn triggers a confirmation gate. When delete_fact returns code: "REQUIRES_CONFIRMATION", list all items to be deleted and ask for explicit confirmation. When the user confirms in their next message, retry each deletion with individual delete_fact calls. Do NOT treat REQUIRES_CONFIRMATION as an error.
- DUPLICATE PREVENTION: When delete_fact fails or returns REQUIRES_CONFIRMATION, do NOT create a replacement fact with a different key. Wait for the delete to succeed before creating the replacement. Creating with a new key causes duplicates in the knowledge base.
- MIXED OUTCOMES: When SOME tools succeed and others return REQUIRES_CONFIRMATION in the same turn, report each result individually. Do NOT use general completion claims like "aggiornato il profilo" or "updated your profile". List what succeeded and what still needs confirmation separately.
```

Also update line 127 — change:
```
- For deletes or identity changes → always use individual tool calls (delete_fact). Never batch these — they have confirmation gates and different failure semantics.
```
To:
```
- For deletes of identity facts → always use individual tool calls (delete_fact). Never batch identity deletes.
- For correcting multiple facts → use batch_facts with delete + create operations. If it returns REQUIRES_CONFIRMATION with a confirmationId, ask user to confirm, then retry with the same confirmationId.
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 3: Run full suite**

Run: `set -o pipefail; npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: No regressions. Check that existing `tool-policy-update.test.ts` still passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/tool-policy-uat-r3.test.ts
git commit -m "fix: TOOL_POLICY updates for BUG-1/4/5 — confirmationId, duplicate prevention, mixed outcomes

- BULK DELETION: split into batch_facts (confirmationId) and delete_fact (existing retry) paths
- DUPLICATE PREVENTION: agent must not create with new key when delete fails
- MIXED OUTCOMES: agent must report each tool result individually"
```

---

## Chunk 5: Final Verification

### Task 9: Full test suite + type check

- [ ] **Step 1: TypeScript check**

Run: `set -o pipefail; npx tsc --noEmit 2>&1 | head -20`
Expected: Zero errors.

- [ ] **Step 2: Full test suite**

Run: `set -o pipefail; npx vitest run 2>&1 | tail -5`
Expected: All tests pass, zero failures.

- [ ] **Step 3: Verify test count increased**

Run: `set -o pipefail; npx vitest run --reporter=verbose 2>&1 | grep "Tests" | tail -1`
Expected: Test count increased by ~25 (12 search + 8 confirmation + 6 claim guard + 4 prompt = ~30 new tests).

---

## Summary

| Task | Bug | What | Files |
|------|-----|------|-------|
| 1 | 3 | Word-split searchFacts (real searchFacts + seeded DB test) | kb-service.ts, search-facts-word-split.test.ts |
| 2 | 1 | PendingConfirmation type | confirmation-service.ts |
| 2b | 1 | deleteGate isolation (`!p.confirmationId` filter) | tools.ts |
| 3-4 | 1 | confirmationId + factIds verification + identity-delete enforcement + per-delete turn-count + id-based deferred consume | tools.ts, bulk-delete-confirmation.test.ts |
| 5-6 | 2 | Per-tool × per-language proposal fallback | action-claim-guard.ts, action-claim-guard.test.ts |
| 7-8 | 1,4,5 | TOOL_POLICY prompt updates (split batch_facts/delete_fact guidance) | prompts.ts, tool-policy-uat-r3.test.ts |
| 9 | all | Final verification | — |

## Changes from v2 (addressing Codex v2 review)

1. **HIGH — `_deleteBlockedThisTurn` removed from turn-state advancement** (Codex v2 #1): Only `_deletionCountThisTurn += deleted` is set. This preserves `deleteGate`'s contract: the next `delete_fact` enters the "unconfirmed" path (`_deletionCountThisTurn >= 1`), which correctly sets `_deleteBlockedThisTurn = true` AND creates a fresh pending. Previously, setting `_deleteBlockedThisTurn` directly caused the blocked branch to fire, which tried to append to a (consumed) pending and failed to create a fresh one.

2. **HIGH — deferred consume** (Codex v2 #2): Pending is consumed AFTER batch execution (not before), so thrown errors don't lose the confirmation. Originally proposed as "consume only on full success," revised in v7 to always consume after confirmed batch — keeping a pending for partial success creates a stuck state (see v6 changes).

3. **MEDIUM — SQL regression test as primary gate** (Codex v2 #3): Part 1 of the test file uses an in-memory SQLite DB with the word-split SQL pattern directly. It includes a test that PROVES the old single-LIKE approach fails for multi-word queries. Part 2 uses the mock-based approach to test the real `searchFacts` import's API behavior (empty query, return types).

4. **MEDIUM — BootstrapPayload fixture fixed** (Codex v2 #4): Uses the `makeBootstrap()` helper pattern from `tool-policy-update.test.ts` with all required fields: `userName: null`, `lastSeenDaysAgo: null`, `publishedUsername: null`, `conversationContext: null`, `archetype: "generalist"`, `expertiseLevel: "novice"`. Properly typed as `BootstrapPayload`.

5. **MEDIUM — keep delete_fact retry guidance** (Codex v2 #5): TOOL_POLICY now has two explicit branches: `BULK DELETION (batch_facts)` with confirmationId workflow, and `BULK DELETION (delete_fact)` with existing "ask for confirmation, retry individual calls" workflow. Both paths are preserved since `delete_fact` does not emit `confirmationId`.

## Changes from v3 (addressing Codex v3 review)

6. **HIGH — deleteGate isolation from batch-confirmation pendings** (Codex v3 #1): Added `!p.confirmationId` filter to both `deleteGate` pending lookups (blocked-branch line 279 and consume-branch line 288). This prevents cross-contamination: `deleteGate` only operates on "individual delete" pendings (no `confirmationId`), and `batch_facts` only operates on "batch" pendings (with `confirmationId`). Without this, a `delete_fact` in the same turn as a blocked `batch_facts` would append its factId to the batch-confirmation pending, corrupting the factIds set.

7. **MEDIUM — id-based pending consume instead of stale index** (Codex v3 #2): `pendingToConsumeIdx` replaced with `pendingToConsumeId` (the pending's `id` string). The deferred consume step re-finds the pending by `id` using `pendings.findIndex(p => p.id === pendingToConsumeId)`. This prevents stale-index bugs if `identityGate` (which can also splice pendings) runs between capture and consume.

8. **MEDIUM — BUG-3 test limitation acknowledged** (Codex v3 #3): Added explicit note that mock-based tests can't verify Drizzle `where(...)` expression construction. Drizzle ORM correctness for `and()`/`or()`/`like()` composition is trusted, with broader integration coverage from the existing 2617-test suite.

9. **MEDIUM — pipefail added to all piped verification commands** (Codex v3 #4): All `vitest | tail` and `tsc | head` commands now use `set -o pipefail;` prefix to propagate exit codes correctly.

## Changes from v4 (addressing Codex v4 review)

10. **HIGH — removed `_deleteBlockedThisTurn = true` from batch_facts reject paths** (Codex v4 #1): All 3 batch_facts rejection paths (no confirmationId, invalid confirmationId, factIds mismatch) no longer set `_deleteBlockedThisTurn`. These are preflight checks — no deletions occurred. Setting the flag would cause `deleteGate`'s blocked branch to fire for subsequent `delete_fact` calls, but since batch-confirmation pendings now have `confirmationId` (which `deleteGate` skips via `!p.confirmationId`), there would be no eligible pending to append to, making the delete unconfirmable.

11. **HIGH — real searchFacts integration test** (Codex v4 #2): Replaced the two-part test (inline SQL + mock) with a single integration test following the `archived-facts.test.ts` pattern: imports real `db` and `searchFacts`, seeds facts directly with `db.insert(facts).values(...)`, calls the production function, and filters results by test factIds. Multi-word tests now FAIL with the old implementation and PASS after the fix.

12. **HIGH — per-delete turn counter increment** (Codex v4 #3): `_deletionCountThisTurn++` is now incremented inside the delete case block immediately after `deleted++` (only for confirmed batches). This ensures the counter is correct even if a later op throws. Previously, the counter was updated after the entire loop, so the catch path could return with `deleted > 0` but `_deletionCountThisTurn` still at 0.

## Changes from v5 (addressing Codex v5 review)

13. **HIGH — same-turn self-confirmation defense** (Codex v5 #1): Added `_batchPendingIdsThisTurn: Set<string>` at closure level. Each batch_facts rejection path adds the new pending's `id` to this set. When a `confirmationId` is provided, the matched pending is checked against this set — if it was created in the current turn, the request is rejected with "Cannot self-confirm in the same turn." This prevents the model from immediately re-calling `batch_facts` with the returned `confirmationId` to bypass user confirmation. A new test exercises this exact scenario.

14. **NOT ADDRESSED — BUG-5 runtime guard** (Codex v5 #2): BUG-5 is deliberately prompt-only. This was evaluated and decided during the multi-model challenge (Gemini + Codex + Claude, 2 rounds — see `/tmp/brainstorm-challenge/synthesis.md`). All 3 models agreed that stream-level `sawConfirmationRequired` tainting "breaks mixed-success states, doesn't work on non-stream path." The existing action claim guard catches egregious unbacked claims; the prompt fix targets the specific partial-success scenario. If BUG-5 recurs in future UATs, a scoped runtime fix can be designed then.

## Changes from v6 (addressing Codex v6 review)

15. **NOT A REGRESSION — batch reject + same-turn delete_fact** (Codex v6 #1): After `batch_facts` rejects (no deletions occurred), a same-turn `delete_fact` sees `_deletionCountThisTurn = 0` and the first delete is allowed. This is the EXISTING behavior — `deleteGate` has always allowed the first delete in a turn (`_deletionCountThisTurn >= 1` check at line 301, not `>= 0`). The plan preserves this. The second `delete_fact` in the same turn would be blocked with proper pending creation via `deleteGate`'s count gate. The batch and individual delete gates are independent safety mechanisms.

16. **HIGH — always consume pending after confirmed batch** (Codex v6 #2): Changed consume condition from `deleted === deleteOps.length` to unconditional consume after confirmed batch execution. The user already confirmed the deletions. If some facts were already gone (`deleteFact` returned false), keeping the pending creates a stuck state: the already-deleted fact IDs will always return false on retry, making `deleted === deleteOps.length` impossible. Warnings still report skipped deletes.

17. **MEDIUM — preserve prompt-contracts.test.ts regex** (Codex v6 #3): Changed prompt wording to "For deletes of identity facts → always use individual tool calls" to preserve the existing regex `/deletes.*identity.*individual\s*tool/i` in `prompt-contracts.test.ts:65`.

## Changes from v7 (addressing Codex v7 review)

18. **DISAGREED — operations hash vs factIds-only** (Codex v7 #1): The `confirmationId` is bound to DELETE operations (the dangerous ones). Create operations are independently guarded by the duplicate check (`stableDeepEqual`). The user confirms WHICH FACTS WILL BE DELETED, not the full batch payload. Adding an operations hash would add complexity without safety benefit.

19. **DISAGREED — BUG-5 runtime guard** (Codex v7 #2): Same objection as Codex v5 #2. Design decision from multi-model challenge (3 models, 2 rounds). Prompt-only is deliberate. See rationale at v5 #14.

20. **MEDIUM — deleteGate isolation regression test** (Codex v7 #3): Added dedicated test in Task 2b Step 3: `batch_facts` rejects (creates batch-confirmation pending), then `delete_fact` runs. Asserts the batch pending keeps its original factIds (not contaminated), and `delete_fact` creates its own separate pending via `deleteGate`.

21. **MEDIUM — consistent consumption wording** (Codex v7 #4): Updated all stale references to "consume only when all deletes succeed" across Key changes summary, commit message, and changes-from-v2 section. All now consistently say "always consume after confirmed batch."

## Changes from v8 (addressing Codex v8 review)

22. **NOTED — confirmationId persistence through refresh** (Codex v8 #1): Valid observation. The confirmationId flow works within a single browser session (while raw tool results are in memory) but does NOT survive a page refresh or recovery path, because rehydrated chat state strips tool payloads to plain text and the journal drops tool results. This is a follow-up improvement, not blocking for this plan — the fix addresses the primary deadlock (agent retrying in the same turn/session), which is the actual BUG-1 scenario. A durable context path for pending confirmations (e.g. injecting active `pendingConfirmations` into prompt context on next turn) would further harden the flow.

23. **HIGH — duplicate factId rejection** (Codex v8 #2): Added a one-liner guard after `deleteOps` extraction: reject the batch if `uniqueDeleteFactIds.size !== deleteFactIds.length`. This prevents a pending for `["f1","f2"]` from validating a retried batch containing `["f1","f1","f2"]`. Added corresponding test (`"batch_facts rejects duplicate factIds in delete operations"`).

24. **MEDIUM — multi-proposal fallback** (Codex v8 #3): When multiple proposal tools succeeded in the same turn, the plan now uses the generic fallback instead of the last tool's specific text. Both the stream path (`proposalToolCount === 1`) and non-stream path (`proposalTools.length === 1`) use count-based logic. Added test (`"sanitizeUnbackedActionClaim uses generic fallback when multiple proposal tools succeeded"`).

## Changes from v9 (addressing Codex v9 review)

25. **DISAGREED — same-turn delete_fact after rejected batch_facts** (Codex v9 #1): This is the same concern raised in v4 and v6. `deleteGate` allows one delete per turn without confirmation (existing design — individual deletes are less risky than bulk). After a batch reject, the FIRST `delete_fact` call succeeds (same as always), the SECOND is gated by `deleteGate` (`_deletionCountThisTurn >= 1`). This is existing behavior, not a regression: the model could ALREADY delete 1 fact per turn before `batch_facts` existed. The batch gate is specifically for when 2+ deletes are in a single batch call. Adding a per-factId latch for rejected batch facts would be a new safety layer beyond BUG-1 scope. The `!p.confirmationId` filter on `deleteGate` prevents cross-contamination (batch pending not touched by individual deletes). The regression test in Task 2b Step 3 validates: first `delete_fact` succeeds, second is blocked, batch pending keeps its original factIds.

26. **DISAGREED — consuming pending on deleteFact() === false** (Codex v9 #2): Same objection as v6 change #16. In our codebase, `deleteFact()` returns `false` when the fact is not found (already deleted, wrong scope, never existed). The user confirmed THOSE specific fact IDs for deletion. If one fact was already deleted between confirmation and execution, keeping the pending creates a stuck state: the already-deleted fact ID will always return `false`, making `deleted === deleteOps.length` permanently impossible. The response already warns about skipped deletes (`"${deleted} of ${deleteOps.length} deleted"`). Changing `deleteFact` to return structured reasons would be a broader refactor beyond BUG-1 scope.

27. **DISAGREED — BUG-5 prompt-only** (Codex v9 #3): Same objection as v5 #14, v7 #19. This is a deliberate design decision from the multi-model challenge (3 models × 2 rounds — Gemini, Codex, and Claude all agreed prompt-only is sufficient for this low-severity bug). The action claim guard's mixed-outcome scenario (one mutation succeeds + one REQUIRES_CONFIRMATION) is a narrow edge case that the prompt instruction handles adequately. Adding a runtime guard for this specific combination would require the guard to understand REQUIRES_CONFIRMATION semantics, which bleeds tool-level concerns into a stream-level guard. The prompt fix is targeted and proportional to the bug severity (LOW).

## Changes from v10 (addressing Codex v10 review — FINAL ROUND)

28. **DISAGREED — same-turn delete_fact bypass** (Codex v10 #1): Repeat of v4/v6/v9 concern. Corrected the misleading rationale in change #25 — `deleteGate` allows the first delete in a turn (existing behavior), not "creates its own confirmation gate." The behavior is unchanged from before this plan: individual `delete_fact` has always allowed 1 delete/turn without confirmation. The batch gate targets 2+ deletes in a single batch call specifically. Not a regression.

29. **DISAGREED — identity overwrite gate after bulk-delete confirmation** (Codex v10 #2): The identity overwrite gate at lines 823-828 fires AFTER the bulk-delete confirmation is resolved (sequentially, not nested). When the model retries with a valid `confirmationId`, the delete pre-flight passes, then the identity gate checks create operations. If an identity create is blocked, the model gets a separate `REQUIRES_CONFIRMATION` for that — this is the existing `identityGate` flow, unchanged. These are two sequential gates, not a deadlock. Also: identity DELETES are already rejected from batch_facts entirely (lines 707-721), so the scenario of "2+ deletes including identity" cannot happen.
