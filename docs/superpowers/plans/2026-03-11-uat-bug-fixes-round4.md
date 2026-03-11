# UAT Bug Fixes Round 4 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 code bugs and 1 setup issue discovered during Chiara Donati UAT session — identity delete infinite loop, confirmationId propagation failure, prompt hardening for identity deletes, and UAT DB isolation.

**Architecture:** BUG-6 and BUG-1b are both in the confirmation gate system (`tools.ts` + `context.ts`). BUG-6 is a pre-flight check that doesn't handle category/key format factIds. BUG-1b is a context assembly gap — pending confirmations with confirmationIds aren't surfaced to the agent. BUG-7 is prompt hardening. DB-1 is a UAT cleanup script.

**Tech Stack:** TypeScript, Vitest, SQLite (Drizzle ORM)

---

## File Map

| File | Role | Changes |
|---|---|---|
| `scripts/uat-reset-db.sh` | New: UAT DB reset script | DB-1: Backup + reset DB for clean UAT sessions |
| `src/lib/agent/tools.ts` | Agent tool definitions, confirmation gates | BUG-6: Fix identity enforcement pre-flight in `batch_facts`; fix `deleteGate` turn-counter on failed deletes inside batch loop |
| `src/lib/agent/context.ts` | System prompt assembly, context blocks | BUG-1b: Add `PENDING CONFIRMATIONS` static block injecting confirmationIds from session metadata |
| `src/lib/agent/prompts.ts` | TOOL_POLICY prompt text | BUG-7: Strengthen identity-delete-in-batch prohibition; BUG-1b: Add instruction to read confirmationId from context |
| `tests/evals/bulk-delete-confirmation.test.ts` | Confirmation gate tests | BUG-6: Tests for category/key identity enforcement; turn-counter rollback |
| `tests/evals/confirmation-context.test.ts` | New: context injection tests | BUG-1b: Tests for pending confirmations block in system prompt |
| `tests/evals/tool-policy-uat-r3.test.ts` | Prompt contract tests | BUG-7: Test for identity-in-batch prohibition text |

---

## Chunk 1: DB-1 + BUG-6 — UAT Cleanup + Identity Delete Infinite Loop

### Task 1: UAT DB reset script

**Files:**
- Create: `scripts/uat-reset-db.sh`

- [ ] **Step 1: Create the reset script**

Create `scripts/uat-reset-db.sh`. The app resolves DB path via `OPENSELF_DB_PATH` env var with fallback to `db/openself.db` relative to project root (see `src/lib/db/index.ts:8-22`). SQLite runs in WAL mode, so the backup must include `-wal` and `-shm` siblings. The script derives its default path from the repo root (script's parent directory) to avoid cwd-dependent behavior:

```bash
#!/usr/bin/env bash
# UAT DB Reset — backup current DB and create a clean one for UAT sessions.
# Usage: ./scripts/uat-reset-db.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="${OPENSELF_DB_PATH:-$REPO_ROOT/db/openself.db}"

# Safety: refuse to run if any DB file is still held open
for f in "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"; do
  if [ -f "$f" ] && lsof "$f" 2>/dev/null | grep -q .; then
    echo "ERROR: $f is still open by another process. Stop the dev server first."
    exit 1
  fi
done

if [ -f "$DB_PATH" ]; then
  TIMESTAMP=$(date +%s)
  BACKUP="${DB_PATH}.bak-$TIMESTAMP"
  # WAL-safe backup: copy all three files together
  cp "$DB_PATH" "$BACKUP"
  [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${BACKUP}-wal"
  [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${BACKUP}-shm"
  echo "Backed up to $BACKUP (+ WAL/SHM if present)"
fi

# Remove DB + WAL/SHM files
rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
echo "Removed $DB_PATH (+ WAL/SHM) — next server start will run migrations on a fresh DB."
echo "Start the dev server to initialize a fresh database."
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x scripts/uat-reset-db.sh
git add scripts/uat-reset-db.sh
git commit -m "chore: add UAT DB reset script (DB-1)"
```

---

### Task 2: Fix batch_facts identity enforcement pre-flight

**Root cause:** `batch_facts` pre-flight identity enforcement (L506-513) calls `getFactById(factId)` which only handles UUIDs. When `factId` is `"identity/name"` (category/key format), `getFactById` returns `null`, the identity check is bypassed, and the delete enters the batch loop where `deleteGate` increments `_deletionCountThisTurn` even though `deleteFact("identity/name")` silently fails. This poisons the turn counter, blocking legitimate `delete_fact` calls later in the same turn.

**Scope note:** This fix addresses the category/key identity-delete case only (the UAT-reported bug). Non-identity `category/key` deletes in `batch_facts` also silently no-op because `deleteFact()` only handles UUIDs — but that's a broader issue not reported in this UAT round. A future pass could resolve all `category/key` factIds to UUIDs during batch pre-flight, or reject them outright.

**Files:**
- Modify: `src/lib/agent/tools.ts:506-513`
- Test: `tests/evals/bulk-delete-confirmation.test.ts`

- [ ] **Step 1: Write the failing test — category/key identity delete blocked in batch**

Add to `tests/evals/bulk-delete-confirmation.test.ts`:

```typescript
it("batch_facts rejects identity delete via category/key format", async () => {
  const { tools } = createAgentTools("en", "s1");
  const result = await tools.batch_facts.execute({
    operations: [
      { action: "delete" as const, factId: "identity/name" },
      { action: "create" as const, category: "skill", key: "ts", value: { name: "TS" } },
    ],
  }, toolCtx);
  expect(result.success).toBe(false);
  expect(result.code).toBe("IDENTITY_DELETE_BLOCKED");
  expect(result.created).toBe(0);
  expect(result.deleted).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts -t "batch_facts rejects identity delete via category/key format"`
Expected: FAIL — currently `getFactById("identity/name")` returns `null`, so the identity check is bypassed.

- [ ] **Step 3: Fix the identity enforcement pre-flight in batch_facts**

In `src/lib/agent/tools.ts`, replace lines 506-513:

```typescript
      // Pre-flight: identity-delete enforcement (rejected from batch regardless of confirmation)
      for (const op of deleteOps) {
        const factId = (op as { factId: string }).factId;
        // Category/key format: parse directly — don't need DB lookup
        if (factId.includes("/") && !factId.match(/^[0-9a-f]{8}-/)) {
          const [cat] = factId.split("/");
          if (cat === "identity") {
            return { success: false, code: "IDENTITY_DELETE_BLOCKED", message: `Cannot delete identity fact ${factId} via batch_facts. ALWAYS use delete_fact for identity deletions — it supports the required cross-turn confirmation. Call delete_fact("${factId}") instead.`, created: 0, deleted: 0 };
          }
        } else {
          // UUID format: check via DB
          const fact = getFactById(factId, sessionId, readKeys);
          if (fact && fact.category === "identity") {
            return { success: false, code: "IDENTITY_DELETE_BLOCKED", message: `Cannot delete identity fact ${factId} via batch_facts. ALWAYS use delete_fact for identity deletions — it supports the required cross-turn confirmation. Call delete_fact("${factId}") instead.`, created: 0, deleted: 0 };
          }
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts -t "batch_facts rejects identity delete via category/key format"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/bulk-delete-confirmation.test.ts
git commit -m "fix: batch_facts identity enforcement handles category/key format (BUG-6a)"
```

---

### Task 3: Fix turn-counter poisoning on failed deletes in batch loop

**Files:**
- Modify: `src/lib/agent/tools.ts:278-316,651-665,737,765`
- Test: `tests/evals/bulk-delete-confirmation.test.ts`

- [ ] **Step 1: Write the failing test — failed batch delete doesn't poison turn counter**

Add to `tests/evals/bulk-delete-confirmation.test.ts`:

```typescript
it("failed delete in batch does not poison turn counter for subsequent delete_fact", async () => {
  // Setup: batch with 1 delete that fails (deleteFact returns false)
  mockDeleteFact.mockReturnValue(false);
  mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });
  mockCreateFact.mockReturnValue({ id: "f-new", category: "skill", key: "ts", visibility: "proposed" });

  const { tools } = createAgentTools("en", "s1");

  // Batch with 1 delete (fails silently) + 1 create
  const r1 = await tools.batch_facts.execute({
    operations: [
      { action: "delete" as const, factId: "f1" },
      { action: "create" as const, category: "skill", key: "ts", value: { name: "TS" } },
    ],
  }, toolCtx);
  expect(r1.success).toBe(true);
  expect(r1.deleted).toBe(0); // delete failed

  // Now a direct delete_fact should succeed (turn counter not poisoned)
  mockDeleteFact.mockReturnValue(true);
  const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx);
  expect(r2.success).toBe(true); // should be allowed — no prior SUCCESSFUL delete
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts -t "failed delete in batch does not poison turn counter"`
Expected: FAIL — `deleteGate` currently increments `_deletionCountThisTurn` at line 314 regardless of whether the subsequent `deleteFact()` succeeds.

- [ ] **Step 3: Refactor deleteGate to support deferred counting**

The current flow is: `deleteGate()` increments counter → `deleteFact()` may fail. We need the counter to only increment when the delete actually succeeds.

**Solution**: `deleteGate` returns an `{ allowed, commit }` object for ALL paths where a delete is allowed. The caller calls `commit()` only after `deleteFact()` returns `true`.

**Critical design decision for confirmed pendings:** When a user-confirmed delete fails (fact already gone, access denied), we must still CONSUME the pending (remove from session metadata) to prevent infinite retry. But we must NOT increment `_deletionCountThisTurn` since no delete actually happened. So for confirmed pendings, `deleteGate` returns `{ allowed, commit, consumeOnly }`:
- `commit()` — consume pending + increment counter (call when deleteFact returns true)
- `consumeOnly()` — consume pending without incrementing (call when deleteFact returns false)

For unconfirmed first-deletes, only `commit()` is returned (nothing to consume).

In `src/lib/agent/tools.ts`, replace the entire `deleteGate` function (lines 278-316):

```typescript
  type DeleteGateResult =
    | { requiresConfirmation: true; message: string }
    | { allowed: true; commit: () => void; consumeOnly?: () => void };

  function deleteGate(factId: string): DeleteGateResult | null {
    if (_deleteBlockedThisTurn) {
      const existingPending = pendings.find(p => p.type === "bulk_delete" && !p.confirmationId);
      if (existingPending?.factIds && !existingPending.factIds.includes(factId)) {
        existingPending.factIds.push(factId);
        mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
      }
      return { requiresConfirmation: true, message: "Further deletions blocked this turn — wait for user confirmation in a new message." };
    }

    // Check pending (confirmed delete from previous turn) — defer until outcome known
    const matchIdx = pendings.findIndex(p => p.type === "bulk_delete" && !p.confirmationId && p.factIds?.includes(factId));
    if (matchIdx >= 0) {
      const pending = pendings[matchIdx];

      const consumePending = () => {
        pending.factIds = pending.factIds!.filter((id: string) => id !== factId);
        if (pending.factIds!.length === 0) {
          pendings.splice(matchIdx, 1);
        }
        mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
      };

      return {
        allowed: true,
        commit: () => { consumePending(); _deletionCountThisTurn++; },
        consumeOnly: () => { consumePending(); },
      };
    }

    // Unconfirmed: allow first, block 2nd+
    if (_deletionCountThisTurn >= 1) {
      _deleteBlockedThisTurn = true;
      pendings.push({
        id: randomUUID(),
        type: "bulk_delete",
        factIds: [factId],
        createdAt: new Date().toISOString(),
      });
      mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
      return { requiresConfirmation: true, message: "2nd+ deletion in this turn requires confirmation. List the items to delete and ask the user to confirm." };
    }

    // First unconfirmed delete — allowed, but defer counting until caller confirms success
    return { allowed: true, commit: () => { _deletionCountThisTurn++; } };
  }
```

Then update ALL callers of `deleteGate`:

**Caller 1: batch loop** (single-delete-within-batch, ~L651-665):

```typescript
              } else {
                // Single delete within batch — apply delete gate
                const dResult = deleteGate(op.factId);
                if (dResult && "requiresConfirmation" in dResult) {
                  warnings.push(`Delete of ${op.factId} blocked: ${dResult.message}`);
                  break;
                }
                const old = getFactById(op.factId, sessionId, readKeys);
                if (old) {
                  const { id, ...rest } = old;
                  reverseOps.push({ action: "recreate", factId: id, previousFact: rest as Record<string, unknown> });
                }
                const didDelete = deleteFact(op.factId, sessionId, readKeys);
                if (didDelete) {
                  deleted++;
                  if (dResult && "commit" in dResult) dResult.commit();
                } else if (dResult && "consumeOnly" in dResult && dResult.consumeOnly) {
                  dResult.consumeOnly();
                }
              }
```

**Caller 2: delete_fact category/key path** (~L737):

```typescript
            const dResult = deleteGate(matching[0].id);
            if (dResult && "requiresConfirmation" in dResult) return { success: false, code: "REQUIRES_CONFIRMATION", ...dResult };
            const ok = deleteFact(matching[0].id, sessionId, readKeys);
            if (!ok) {
              if (dResult && "consumeOnly" in dResult && dResult.consumeOnly) dResult.consumeOnly();
              return { success: false, error: "Fact not found after lookup" };
            }
            if (dResult && "commit" in dResult) dResult.commit();
```

**Caller 3: delete_fact UUID path** (~L765):

```typescript
        const dResult = deleteGate(factId);
        if (dResult && "requiresConfirmation" in dResult) return { success: false, code: "REQUIRES_CONFIRMATION", ...dResult };
        const ok = deleteFact(factId, sessionId, readKeys);
        if (!ok) {
          if (dResult && "consumeOnly" in dResult && dResult.consumeOnly) dResult.consumeOnly();
          return { success: false, error: "Fact not found", hint: "Use search_facts to find the correct factId, or use category/key format like 'education/dams-torino'." };
        }
        if (dResult && "commit" in dResult) dResult.commit();
```

- [ ] **Step 4: Run all bulk-delete tests**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts`
Expected: ALL PASS (including the new test and all existing tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/bulk-delete-confirmation.test.ts
git commit -m "fix: deleteGate defers turn-counter until deleteFact succeeds (BUG-6b)"
```

---

## Chunk 2: BUG-1b — confirmationId Not Propagated to Agent

### Root Cause

When `batch_facts` returns `REQUIRES_CONFIRMATION` with a `confirmationId`, that token lives only in the tool result (stream prefix `9`). The chat history sent by the client on the next turn contains only `{ role, content }` text messages — no tool results. The agent never sees the `confirmationId` in its context, so it retries `batch_facts` without it, creating a new pending each time → infinite deadlock.

**Fix**: Inject pending confirmations (including `confirmationId`) into the system prompt via a new **static** block in `assembleContext`. The block is **scoped to `bulk_delete` pendings with `confirmationId` only** — other pending types (`identity_delete`, `identity_overwrite`) already work via their existing same-session flow and don't need context injection.

**Session ID design**: Pending confirmations are stored against `writeSessionId` (= `scope.knowledgePrimaryKey`, the anchor session) by both `createAgentTools` (tools.ts:170) and `pruneUnconfirmedPendings` (route.ts:153). The context block MUST read from `scope.knowledgePrimaryKey`, NOT `conversationSessionId` (= `messageSessionId`), which is the per-conversation session cookie and may differ in multi-user flows.

**TTL alignment**: `createAgentTools` (tools.ts:169-177) applies a 5-minute TTL to pending confirmations. Since `assembleContext` runs BEFORE `createAgentTools`, the context block must apply the same TTL filter to avoid surfacing expired confirmationIds that the tool layer will reject.

**Budget safety**: The block is added to `staticBlocks` (not `mutableParts`). Anything in `mutableParts` outside the named `blocks` array (facts, soul, summary, memories, conflicts, pageState) would be silently dropped during the budget-shrink rebuild loop (context.ts:588-607). `staticBlocks` survive via `renderStaticSuffix()` (called at L606). Under extreme budget pressure, static blocks CAN still be shrunk — but the shrink loop targets the LARGEST block first, and the pending confirmations block is tiny (~100 chars), so it would be the very last to be touched.

---

### Task 4: Add PENDING CONFIRMATIONS context block

**Files:**
- Modify: `src/lib/agent/context.ts`
- Create: `tests/evals/confirmation-context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/evals/confirmation-context.test.ts`, using the same mock pattern as `tests/evals/context-assembler.test.ts`. **Important**: `context-assembler.test.ts` mocks `buildSystemPrompt` to return `"BOOTSTRAP_PROMPT"` — do the same here so the base prompt text doesn't interfere with assertions. Use specific assertion strings that only appear in the injected context block (e.g. `'PENDING CONFIRMATIONS (from previous turn):'` and `'confirmationId="'`), NOT generic phrases like `"PENDING CONFIRMATIONS"` which would also match TOOL_POLICY text:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies (same pattern as context-assembler.test.ts) ---
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
}));
vi.mock("@/lib/services/summary-service", () => ({
  getSummary: vi.fn(() => null),
}));
vi.mock("@/lib/services/memory-service", () => ({
  getActiveMemories: vi.fn(() => []),
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn(() => []),
}));
vi.mock("@/lib/connectors/magic-paste", () => ({
  detectConnectorUrls: vi.fn(() => []),
}));
vi.mock("@/lib/agent/journey", () => ({
  computeRelevance: vi.fn(() => 0.5),
}));
// Mock buildSystemPrompt to return minimal base — prevents TOOL_POLICY text from interfering
vi.mock("@/lib/agent/prompts", () => ({
  buildSystemPrompt: vi.fn(() => "BOOTSTRAP_PROMPT"),
}));

// Session metadata mock — keyed by sessionId so we can verify which session is read
const sessionMetaStore: Record<string, Record<string, unknown>> = {};
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn((sessionId: string) => sessionMetaStore[sessionId] ?? {}),
  mergeSessionMeta: vi.fn(),
}));

import { assembleContext } from "@/lib/agent/context";
import type { OwnerScope } from "@/lib/auth/session";
import type { BootstrapPayload } from "@/lib/agent/journey";

const makeBootstrap = (state: string = "active_fresh"): BootstrapPayload => ({
  journeyState: state as BootstrapPayload["journeyState"],
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

const ANCHOR_SESSION = "anchor-session-id";
const CONV_SESSION = "conv-session-id";

const makeScope = (): OwnerScope => ({
  knowledgePrimaryKey: ANCHOR_SESSION,
  knowledgeReadKeys: [ANCHOR_SESSION],
  cognitiveOwnerKey: ANCHOR_SESSION,
  currentSessionId: ANCHOR_SESSION,
});

// Unique string that only appears in the injected context block, NOT in TOOL_POLICY
const CONTEXT_BLOCK_HEADER = "PENDING CONFIRMATIONS (from previous turn):";

describe("PENDING CONFIRMATIONS context block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(sessionMetaStore).forEach(k => delete sessionMetaStore[k]);
  });

  it("injects confirmationId from pending batch_delete into system prompt", () => {
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p1",
          type: "bulk_delete",
          factIds: ["f1", "f2"],
          confirmationId: "conf-abc-123",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì, confermo" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).toContain(CONTEXT_BLOCK_HEADER);
    expect(result.systemPrompt).toContain('confirmationId="conf-abc-123"');
    expect(result.systemPrompt).toContain("batch_facts");
  });

  it("does NOT inject non-bulk_delete pending types", () => {
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p2",
          type: "identity_delete",
          category: "identity",
          key: "name",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    // identity_delete pendings are handled by the existing tool flow, not context injection
    expect(result.systemPrompt).not.toContain(CONTEXT_BLOCK_HEADER);
  });

  it("no block when no pending confirmations", () => {
    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Ciao" }],
      undefined,
      makeBootstrap("first_visit"),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).not.toContain(CONTEXT_BLOCK_HEADER);
  });

  it("reads from anchor session, not conversationSessionId", () => {
    // Store DIFFERENT data on anchor vs conversation session
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p3",
          type: "bulk_delete",
          factIds: ["f3"],
          confirmationId: "conf-from-anchor",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    sessionMetaStore[CONV_SESSION] = {
      pendingConfirmations: [
        {
          id: "p-wrong",
          type: "bulk_delete",
          factIds: ["f-wrong"],
          confirmationId: "conf-from-conv-WRONG",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    // Must contain anchor's confirmationId, not conversation's
    expect(result.systemPrompt).toContain('confirmationId="conf-from-anchor"');
    expect(result.systemPrompt).not.toContain("conf-from-conv-WRONG");
  });

  it("filters out expired pending confirmations (5min TTL)", () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p-expired",
          type: "bulk_delete",
          factIds: ["f-old"],
          confirmationId: "conf-expired",
          createdAt: sixMinutesAgo,
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).not.toContain(CONTEXT_BLOCK_HEADER);
    expect(result.systemPrompt).not.toContain("conf-expired");
  });
});
```

**Note to implementer:** The test file uses the same mock pattern as `tests/evals/context-assembler.test.ts`, including mocking `buildSystemPrompt` to return `"BOOTSTRAP_PROMPT"` so TOOL_POLICY text doesn't interfere. Assertions use the exact injected header string `"PENDING CONFIRMATIONS (from previous turn):"` and `confirmationId="..."` format which only appear in the context block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/confirmation-context.test.ts`
Expected: FAIL — `assembleContext` doesn't currently inject pending confirmations.

- [ ] **Step 3: Implement the PENDING CONFIRMATIONS block in context.ts**

In `src/lib/agent/context.ts`:

**3a.** Add the import at the top of the file (if not already imported):

```typescript
import type { PendingConfirmation } from "@/lib/services/confirmation-service";
```

**3b.** Add the block as a `staticBlock` — placed after the coherence issues block (~line 525) and before the quota warning block (~line 528). Read from `scope.knowledgePrimaryKey` (the anchor session). Apply the same 5-minute TTL as `createAgentTools` (tools.ts:169). Only include `bulk_delete` pendings with `confirmationId`:

```typescript
  // --- Pending confirmations injection (BUG-1b: surface confirmationIds for agent retry) ---
  // Scoped to bulk_delete with confirmationId only — other types work via existing tool flow.
  // Read from anchor session (scope.knowledgePrimaryKey), same as createAgentTools/pruneUnconfirmedPendings.
  // Apply same 5-min TTL as createAgentTools (tools.ts:169) since assembleContext runs first.
  const CONFIRM_TTL_MS = 5 * 60 * 1000;
  const anchorForConfirmations = scope.knowledgePrimaryKey;
  if (anchorForConfirmations) {
    try {
      const confirmMeta = getSessionMeta(anchorForConfirmations);
      const rawPendings = confirmMeta?.pendingConfirmations as PendingConfirmation[] | undefined;
      if (Array.isArray(rawPendings) && rawPendings.length > 0) {
        const confirmNow = Date.now();
        // Filter: TTL + only bulk_delete with confirmationId
        const confirmPendings = rawPendings.filter(
          p => p.type === "bulk_delete"
            && p.confirmationId
            && confirmNow - new Date(p.createdAt).getTime() < CONFIRM_TTL_MS
        );
        if (confirmPendings.length > 0) {
          const lines = confirmPendings.map(p => {
            const ids = (p.factIds ?? []).join(", ");
            return `- batch_facts confirmation pending: confirmationId="${p.confirmationId}" for deleting [${ids}]. Pass this confirmationId in your next batch_facts call.`;
          });
          staticBlocks.push({
            name: "pendingConfirmations",
            content: `\n\n---\n\nPENDING CONFIRMATIONS (from previous turn):\n${lines.join("\n")}`,
          });
        }
      }
    } catch { /* best-effort */ }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/confirmation-context.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing context tests to check for regressions**

Run: `npx vitest run tests/evals/context-assembler.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: No regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/context.ts tests/evals/confirmation-context.test.ts
git commit -m "fix: inject pending confirmations with confirmationId into system prompt (BUG-1b)"
```

---

### Task 5: Update TOOL_POLICY to reference the context block

**Files:**
- Modify: `src/lib/agent/prompts.ts:123`
- Test: `tests/evals/tool-policy-uat-r3.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/evals/tool-policy-uat-r3.test.ts`, using the existing `makeBootstrap()` helper:

```typescript
it("TOOL_POLICY references PENDING CONFIRMATIONS context block", () => {
  const prompt = buildSystemPrompt(makeBootstrap());
  expect(prompt).toMatch(/PENDING CONFIRMATIONS/);
  expect(prompt).toMatch(/confirmationId/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts -t "TOOL_POLICY references PENDING CONFIRMATIONS"`
Expected: FAIL

- [ ] **Step 3: Update TOOL_POLICY text**

In `src/lib/agent/prompts.ts`, replace line 123:

```
- BULK DELETION (batch_facts): When batch_facts returns code: "REQUIRES_CONFIRMATION" with a confirmationId, list all items to be deleted and ask for explicit confirmation. When the user confirms, retry the SAME batch_facts call including the confirmationId from the response.
```

With:

```
- BULK DELETION (batch_facts): When batch_facts returns code: "REQUIRES_CONFIRMATION" with a confirmationId, list all items to be deleted and ask for explicit confirmation. When the user confirms, check the PENDING CONFIRMATIONS section in your context — it contains the confirmationId. Retry the SAME batch_facts call including that confirmationId.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/tool-policy-uat-r3.test.ts
git commit -m "fix: TOOL_POLICY references PENDING CONFIRMATIONS context block (BUG-1b)"
```

---

## Chunk 3: BUG-7 — Prompt Hardening

### Task 6: Strengthen identity-in-batch prohibition in TOOL_POLICY

**Files:**
- Modify: `src/lib/agent/prompts.ts:130`
- Test: `tests/evals/tool-policy-uat-r3.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/evals/tool-policy-uat-r3.test.ts`:

```typescript
it("TOOL_POLICY has NEVER-batch identity delete instruction", () => {
  const prompt = buildSystemPrompt(makeBootstrap());
  expect(prompt).toMatch(/NEVER.*batch_facts.*identity/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts -t "NEVER-batch identity delete"`
Expected: FAIL — current text says "always use individual tool calls (delete_fact). Never batch identity deletes." but doesn't match the regex.

- [ ] **Step 3: Update TOOL_POLICY text**

In `src/lib/agent/prompts.ts`, replace line 130:

```
- For deletes of identity facts → always use individual tool calls (delete_fact). Never batch identity deletes.
```

With:

```
- For deletes of identity facts → NEVER use batch_facts to delete identity facts. ALWAYS use delete_fact individually — identity deletes require cross-turn confirmation that only delete_fact supports. If batch_facts returns IDENTITY_DELETE_BLOCKED, switch to delete_fact.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts -t "NEVER-batch identity delete"`
Expected: PASS

- [ ] **Step 5: Run all related tests**

Run: `npx vitest run tests/evals/bulk-delete-confirmation.test.ts tests/evals/tool-policy-uat-r3.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/tool-policy-uat-r3.test.ts
git commit -m "fix: strengthen identity-in-batch prohibition in TOOL_POLICY and error messages (BUG-7)"
```

---

### Task 7: Final regression test run

- [ ] **Step 1: Run all evals**

Run: `npx vitest run tests/evals/ --reporter=verbose 2>&1 | tail -30`
Expected: ALL PASS, 0 failures. Total test count should be previous count + new tests.

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors.
