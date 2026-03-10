# UAT Bug Fixes Implementation Plan (v10 — FINAL)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 9 bugs found in UAT session (Giulia Ferraro, 2026-03-10) — cross-session fact visibility, thinking logging, tool design, agent behavior. Bug 8 (TEXT-001) is deferred.

**Architecture:** Login/OAuth-time profileId backfill for cross-session facts (not registration — fresh reg has profileId=sessionId already). Kill `update_fact` tool AND `batch_facts` update branch (immutable-fact pattern). `onStepFinish` for per-step reasoning. Prompt rules for agent behavior. URL + cookie fix for style tool.

**Tech Stack:** TypeScript, Vitest, Vercel AI SDK v4 (streamText), SQLite/Drizzle, Next.js App Router

**Design doc:** `docs/plans/2026-03-10-uat-bug-fixes-design.md`
**UAT report:** `docs/uat-reports/2026-03-10-giulia-ferraro.md`

**Changes from v1 (Codex review):**
- Task 2: Step index uses a separate counter that increments on every `onStepFinish` call (not just reasoning steps)
- Task 3: `update_page_style` now forwards session cookie in self-call fetch
- Task 4: Backfill wired BEFORE `prepareAndPublish` in register route (was after)
- Task 5: `delete_fact` category/key path returns `REQUIRES_CONFIRMATION` when multiple matches found. Repo-wide `update_fact` reference cleanup added as explicit step.

**Changes from v2 (Codex review round 2):**
- Task 4: Backfill moved to login/OAuth session-linking paths (not registration). Fresh registration has profileId=sessionId already, making register-time backfill a no-op. Real split-ID happens when existing profile attaches to anonymous session via login/OAuth.
- Task 4 test: Now mocks `PROFILE_ID_CANONICAL=true` to exercise the actual canonical-query branch.
- Task 5: `batch_facts` `action: "update"` branch also removed (was still calling `updateFact`, breaking immutable invariant).
- Task 5: `confirmBulkDelete` boolean replaced with cross-turn pending-confirmation via existing `deleteGate`/session metadata pattern. Model cannot self-confirm in same turn.

**Changes from v3 (Codex review round 3):**
- Task 4: OAuth backfill must also cover `handleOAuthCallback`'s existing-identity early-return path. Pre-login sessionId must be passed from OAuth callback routes. Both OAuth branches (new user + existing user) need backfill.
- Task 4: Backfill calls wrapped in try/catch with warning logging — backfill failure must NOT break login/OAuth with 401/redirect errors.
- Task 5: `deleteGate` same-turn bypass fixed — when `storePendingBulkDelete` stores IDs, it also sets an intra-turn latch so the model cannot immediately delete via UUID in the same `maxSteps` execution. The latch resets on next user message.

**Changes from v4 (Codex review round 4):**
- Task 5: `delete_fact` for identity facts also goes through `identityGate` to prevent delete+create bypass of the identity overwrite confirmation. Regression test added.
- Task 4: Backfill only runs when session was actually newly linked (`changes === 1` from the UPDATE).
- Task 4: OAuth callback routes (e.g., `google/callback/route.ts`) explicitly added as files to modify — must pass pre-login `os_session` to `handleOAuthCallback`.
- Task 3: Cookie uses `provenanceSessionId` (current session) instead of `sessionId` (anchor), which is the actual cookie value the route expects.

**Changes from v5 (Codex review round 5):**
- Task 5: `createFact()` upsert on `(sessionId, category, key)` is INTENTIONALLY kept — it prevents duplicate facts and is storage-level idempotency, not a mutation API. The "immutable facts" invariant is at the agent/tool level (no update tool exposed, prompt says delete+create). Added explicit note.
- Task 4: `backfillProfileId` now uses `ON CONFLICT(profile_id, category, key) DO UPDATE` to handle collisions with existing profile facts (keeps newer fact, archives older). The `uniq_facts_profile_category_key` index would otherwise abort backfill.
- Task 4: `changes === 1` guard relaxed — backfill runs whenever `preLoginSessionId` is linked to target profile (not just when newly linked). The `WHERE profileId = sessionId` predicate is already idempotent and prevents ownership corruption.
- Task 5: Identity delete guard uses dedicated `identityDeleteGate` helper instead of reusing `identityGate` (which expects a value for hash). Delete-specific message and pending type.

**Changes from v6 (Codex review round 6):**
- Task 5: `createFact()` upsert changed from "update on any conflict" to "only update when values are identical" (true idempotency). On key conflict with different values, return existing fact unchanged + a `duplicate` flag so the agent knows to delete+create.
- Task 5: `identityDeleteGate` now correctly extends `PendingConfirmation` type in `confirmation-service.ts`, includes `id`/`createdAt`, and uses `mergeSessionMeta` for persistence.
- Task 5: Duplicate test fixture rewritten — uses different sessionIds to avoid unique index violation.
- Task 4: Inconsistent wording fixed — login wiring code now matches changelog (no `changes === 1` guard).

**Changes from v7 (Codex review round 7):**
- **Schema clarification:** DB has `uniq_facts_profile_category_key` unique index (migration 0010). This means `findFactsByOwnerCategoryKey` with PROFILE_ID_CANONICAL returns 0 or 1 results per profile — multi-match per profile is impossible for normal data. Multi-match handling in `delete_fact` simplified accordingly (the `storePendingBulkDelete` path is only reachable via readKeys/non-canonical queries, or legacy corrupt data).
- Task 4: Backfill collision handling is correct and needed (the profile-level unique index would otherwise abort the UPDATE). Kept as-is.
- Task 4: Backfill guard reinstated — run only when session-link UPDATE changes 1 row (`changes === 1`). The `WHERE profileId = sessionId` predicate is NOT sufficient alone because a stale/mismatched `os_session` cookie could still trigger an unwanted backfill. The guard ensures only newly-linked anonymous sessions get backfilled.
- Task 5: `identityDeleteGate` persistence field corrected to `pendingConfirmations` (matching existing code), not `pendings`.
- Task 5: `createFact` clarified — identical value = return existing unchanged (idempotent success), different value = return existing + `duplicate: true` flag (forces delete+create). Explicit return type added.
- Task 5: Multi-match test removed (the profile-level unique index makes it impossible). Test rewritten to verify single-match and not-found cases.

**Changes from v8 (Codex review round 8):**
- Task 4: Backfill collision resolution changed from archive to hard-delete in a transaction. Archiving doesn't free the `(profile_id, category, key)` unique index tuple. Now: winner stays, loser is DELETE'd.
- Task 5: `delete_fact` category/key path restores multi-match confirmation for `PROFILE_ID_CANONICAL=false` mode (readKeys across sessions can yield >1 result). Single-match auto-deletes; multi-match returns REQUIRES_CONFIRMATION.
- Task 5: `createFact()` return type NOT changed. Duplicate detection moved to `create_fact` TOOL layer instead. The tool checks `findFactsByOwnerCategoryKey` before calling `createFact()`. This avoids breaking `batch_facts`, `connector-fact-writer.ts`, and other direct callers.

**Changes from v9 (Codex review round 9):**
- Task 5: `batch_facts` create path also gets duplicate detection guard (same as `create_fact` tool). Without this, the model can still upsert via `batch_facts`.
- Task 4: Backfill collision handling now wrapped in SQLite transaction. Uses `deleteFact()` (the service function, not raw DELETE) to properly handle child fact detachment before removing loser.
- Task 4: Added follow-up task note for one-time migration script to repair existing broken data (sessions already linked before this fix).
- Task 5: `identityDeleteGate` moved AFTER existence lookup — no false confirmation state for nonexistent facts.

---

## Task 1: Fix 10 — create_fact missing profileId

**Files:**
- Modify: `src/lib/agent/tools.ts:388` (create_fact execute)
- Test: `tests/evals/create-fact-profileid.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/evals/create-fact-profileid.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFact } from "@/lib/services/kb-service";

const SESSION_ID = `test-profileid-${randomUUID().slice(0, 8)}`;
const PROFILE_ID = `profile-${randomUUID().slice(0, 8)}`;
const createdFactIds: string[] = [];

afterAll(() => {
  for (const id of createdFactIds) {
    db.delete(facts).where(eq(facts.id, id)).run();
  }
  db.delete(sessions).where(eq(sessions.id, SESSION_ID)).run();
});

describe("createFact profileId parameter", () => {
  it("sets profileId when 3rd argument is provided", async () => {
    db.insert(sessions).values({ id: SESSION_ID, inviteCode: "test" }).run();
    const fact = await createFact(
      { category: "identity", key: "test-name", value: { full: "Test" } },
      SESSION_ID,
      PROFILE_ID,
    );
    createdFactIds.push(fact.id);
    const row = db.select().from(facts).where(eq(facts.id, fact.id)).get();
    expect(row!.profileId).toBe(PROFILE_ID);
  });

  it("falls back to sessionId when 3rd argument is omitted", async () => {
    const fact = await createFact(
      { category: "identity", key: "test-role", value: { role: "tester" } },
      SESSION_ID,
    );
    createdFactIds.push(fact.id);
    const row = db.select().from(facts).where(eq(facts.id, fact.id)).get();
    expect(row!.profileId).toBe(SESSION_ID);
  });
});
```

**Step 2: Run test to verify it passes (baseline — createFact already supports profileId)**

Run: `npx vitest run tests/evals/create-fact-profileid.test.ts`
Expected: PASS (createFact in kb-service already accepts profileId as 3rd arg)

**Step 3: Fix the tool to pass effectiveOwnerKey**

In `src/lib/agent/tools.ts`, find the `create_fact` tool execute function (around line 388). Change:

```typescript
// BEFORE (line ~393):
const fact = await createFact({
  category,
  key,
  value,
  confidence,
}, sessionId);

// AFTER:
const fact = await createFact({
  category,
  key,
  value,
  confidence,
}, sessionId, effectiveOwnerKey);
```

The variable `effectiveOwnerKey` is already in scope — it's passed to `createAgentTools()` and used by `batch_facts`. Verify it's available by checking the function signature at the top of `createAgentTools()`.

**Step 4: Write tool-level test to verify**

```typescript
// Add to tests/evals/create-fact-profileid.test.ts
import { createAgentTools } from "@/lib/agent/tools";

describe("create_fact tool passes profileId", () => {
  it("sets profileId = effectiveOwnerKey on created fact", async () => {
    const { tools } = createAgentTools("it", SESSION_ID, PROFILE_ID, "req-1", [SESSION_ID], "onboarding", undefined, SESSION_ID);
    const result = await tools.create_fact.execute(
      { category: "skill", key: `test-skill-${randomUUID().slice(0, 6)}`, value: { name: "Testing" } },
      { toolCallId: "tc-1", messages: [] },
    );
    expect(result.success).toBe(true);
    createdFactIds.push(result.factId);
    const row = db.select().from(facts).where(eq(facts.id, result.factId)).get();
    expect(row!.profileId).toBe(PROFILE_ID);
  });
});
```

**Step 5: Run all tests**

Run: `npx vitest run tests/evals/create-fact-profileid.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/create-fact-profileid.test.ts
git commit -m "fix: pass effectiveOwnerKey to create_fact (matches batch_facts pattern)"
```

---

## Task 2: Fix 1 — Per-step thinking/reasoning logging

**Files:**
- Modify: `src/app/api/chat/route.ts:318-466` (streamText config)
- Test: `tests/evals/thinking-step-logging.test.ts`

**Step 1: Write the test**

```typescript
// tests/evals/thinking-step-logging.test.ts
import { describe, it, expect } from "vitest";

describe("onStepFinish reasoning logging", () => {
  it("tracks step index across all steps (including those without reasoning)", () => {
    const logs: Array<{ stepIndex: number; reasoning: string; finishReason: string }> = [];
    // Separate counter for ALL steps, not just reasoning steps
    let stepCounter = 0;

    // Simulate onStepFinish callback (mirrors the implementation)
    const onStepFinish = (stepResult: { reasoning?: string; finishReason: string }) => {
      if (stepResult.reasoning) {
        logs.push({
          stepIndex: stepCounter,
          reasoning: stepResult.reasoning,
          finishReason: stepResult.finishReason,
        });
      }
      stepCounter++; // Always increment, even without reasoning
    };

    // Step 0: tool call with reasoning
    onStepFinish({ reasoning: "I need to create a fact", finishReason: "tool-calls" });
    // Step 1: text response without reasoning
    onStepFinish({ finishReason: "stop" });
    // Step 2: another tool call with reasoning
    onStepFinish({ reasoning: "Now regenerate the page", finishReason: "tool-calls" });

    expect(logs).toHaveLength(2);
    expect(logs[0].stepIndex).toBe(0); // First actual step
    expect(logs[0].reasoning).toBe("I need to create a fact");
    expect(logs[1].stepIndex).toBe(2); // Third actual step (step 1 had no reasoning)
    expect(logs[1].reasoning).toBe("Now regenerate the page");
    expect(stepCounter).toBe(3); // All 3 steps counted
  });
});
```

**Step 2: Run test**

Run: `npx vitest run tests/evals/thinking-step-logging.test.ts`
Expected: PASS (this tests the callback logic)

**Step 3: Implement onStepFinish in chat route**

In `src/app/api/chat/route.ts`, add `onStepFinish` to the `streamText()` call. Find the streamText config block (around line 318).

Add these lines BEFORE the `streamText()` call:

```typescript
    // Track per-step reasoning for complete thinking log
    let stepCounter = 0;
```

Then add the `onStepFinish` callback inside the `streamText()` config, BEFORE `experimental_repairToolCall`:

```typescript
      // Per-step reasoning logging (captures ALL steps, not just the final one)
      onStepFinish: async (stepResult) => {
        if (stepResult.reasoning) {
          console.info("[thinking]", {
            requestId,
            modelId,
            stepIndex: stepCounter,
            reasoning: stepResult.reasoning,
            finishReason: stepResult.finishReason,
          });
        }
        stepCounter++;
      },
```

In the `onFinish` callback, REMOVE the old reasoning log:

```typescript
      onFinish: async ({ text, reasoning, usage, finishReason }) => {
        // REMOVE these lines:
        // if (reasoning) {
        //   console.info("[thinking]", { requestId, modelId, reasoning });
        // }

        // Keep everything else in onFinish unchanged
```

**Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts tests/evals/thinking-step-logging.test.ts
git commit -m "fix: log thinking/reasoning per step via onStepFinish (not just final step)"
```

---

## Task 3: Fix 5 — update_page_style URL + cookie fix

**Files:**
- Modify: `src/lib/agent/tools.ts:703-731` (update_page_style execute)
- Test: `tests/evals/update-page-style-url.test.ts`

**Context:** The tool does a server-side self-call to `/api/draft/style`. Two bugs: (1) URL is relative (NEXT_PUBLIC_APP_URL is undefined), (2) no session cookie is forwarded, so in multi-user mode the route returns 401.

**Step 1: Write the test**

```typescript
// tests/evals/update-page-style-url.test.ts
import { describe, it, expect } from "vitest";

describe("update_page_style URL construction", () => {
  it("constructs absolute URL for server-side fetch", () => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = new URL("/api/draft/style", baseUrl);
    expect(url.href).toMatch(/^https?:\/\/.+\/api\/draft\/style$/);
  });

  it("falls back to localhost:3000 when no env var set", () => {
    const saved = process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = new URL("/api/draft/style", baseUrl);
    expect(url.href).toBe("http://localhost:3000/api/draft/style");
    if (saved) process.env.NEXT_PUBLIC_BASE_URL = saved;
  });
});
```

**Step 2: Run test**

Run: `npx vitest run tests/evals/update-page-style-url.test.ts`
Expected: PASS

**Step 3: Fix URL + forward session cookie**

In `src/lib/agent/tools.ts`, find the `update_page_style` execute function (around line 703). The tool needs `sessionId` to construct the cookie — `sessionId` is already in scope from `createAgentTools()`.

Change the fetch call:

```typescript
// BEFORE (line ~705):
const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/draft/style`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ surface, voice, light, layoutTemplate }),
});

// AFTER:
const styleBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const currentSession = provenanceSessionId ?? sessionId;
const res = await fetch(new URL("/api/draft/style", styleBaseUrl).href, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Cookie": `os_session=${currentSession}`,
  },
  body: JSON.stringify({ surface, voice, light, layoutTemplate }),
});
```

Note: `provenanceSessionId` is the current request's session cookie value (passed as `messageSessionId` from the chat route). This is the correct session for auth. `sessionId` (the anchor/write key) is the fallback if provenanceSessionId is unavailable. Both are already in scope from `createAgentTools()`.

**Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/agent/tools.ts tests/evals/update-page-style-url.test.ts
git commit -m "fix: update_page_style uses absolute URL + forwards session cookie"
```

---

## Task 4: Fix 4 — Login/OAuth-time profileId backfill

**Files:**
- Modify: `src/lib/services/kb-service.ts` (add `backfillProfileId` function)
- Modify: `src/app/api/auth/login/route.ts` (wire backfill when existing profile attaches to anonymous session)
- Modify: `src/lib/services/oauth-service.ts` (wire backfill in OAuth session-linking, both branches)
- Modify: `src/app/api/auth/google/callback/route.ts` (pass pre-login sessionId to handleOAuthCallback)
- Modify: Any other OAuth callback routes under `src/app/api/auth/*/callback/`
- Test: `tests/evals/login-fact-backfill.test.ts`

**Why NOT registration:** Fresh registration derives `profileId` from the anonymous `sessionId` itself (`register/route.ts:89`), so `facts.profileId` already equals `sessionId` — a backfill would be a no-op. The real split-ID case happens when an existing profile (with a different ID) is attached to an anonymous session via **login** (`login/route.ts:65`) or **OAuth** (`oauth-service.ts:118`). That's where `profileId ≠ sessionId` and facts become invisible under `PROFILE_ID_CANONICAL=true`.

**Step 1: Write the failing test**

```typescript
// tests/evals/login-fact-backfill.test.ts
import { describe, it, expect, afterAll, vi, beforeAll } from "vitest";

// Mock PROFILE_ID_CANONICAL=true BEFORE importing kb-service
vi.mock("@/lib/flags", () => ({ PROFILE_ID_CANONICAL: true }));

import { db, sqlite } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFact, backfillProfileId, getActiveFacts } from "@/lib/services/kb-service";

const ANON_SESSION = `test-anon-${randomUUID().slice(0, 8)}`;
const EXISTING_PROFILE_ID = `profile-${randomUUID().slice(0, 8)}`;
const createdFactIds: string[] = [];

beforeAll(() => {
  db.insert(sessions).values({ id: ANON_SESSION, inviteCode: "test" }).run();
});

afterAll(() => {
  for (const id of createdFactIds) {
    try { db.delete(facts).where(eq(facts.id, id)).run(); } catch {}
  }
  db.delete(sessions).where(eq(sessions.id, ANON_SESSION)).run();
});

describe("backfillProfileId (login/OAuth split-ID scenario)", () => {
  it("updates profileId on facts from anonymous sessions to existing profile", async () => {
    // Simulate anonymous user creating facts before login
    const f1 = await createFact(
      { category: "identity", key: "name", value: { full: "Test User" } },
      ANON_SESSION,
      // No profileId → defaults to sessionId
    );
    createdFactIds.push(f1.id);

    const f2 = await createFact(
      { category: "identity", key: "city", value: { city: "Roma" } },
      ANON_SESSION,
    );
    createdFactIds.push(f2.id);

    // Pre-check: profileId = sessionId (anonymous default)
    const before = db.select().from(facts).where(eq(facts.id, f1.id)).get();
    expect(before!.profileId).toBe(ANON_SESSION);

    // Act: backfill (simulating what happens at login when existing profile attaches)
    const count = backfillProfileId([ANON_SESSION], EXISTING_PROFILE_ID);

    // Assert: profileId updated to the existing profile
    expect(count).toBe(2);
    const after1 = db.select().from(facts).where(eq(facts.id, f1.id)).get();
    const after2 = db.select().from(facts).where(eq(facts.id, f2.id)).get();
    expect(after1!.profileId).toBe(EXISTING_PROFILE_ID);
    expect(after2!.profileId).toBe(EXISTING_PROFILE_ID);
  });

  it("makes facts visible via getActiveFacts with PROFILE_ID_CANONICAL=true", async () => {
    // This is the KEY integration check: after backfill, canonical query finds them
    const activeFacts = getActiveFacts(EXISTING_PROFILE_ID);
    const names = activeFacts.filter(f => f.category === "identity" && f.key === "name");
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT update facts that already have a different profileId", async () => {
    const OTHER_PROFILE = `other-${randomUUID().slice(0, 8)}`;
    const f3 = await createFact(
      { category: "skill", key: "test-skill", value: { name: "Go" } },
      ANON_SESSION,
      OTHER_PROFILE,
    );
    createdFactIds.push(f3.id);

    const count = backfillProfileId([ANON_SESSION], EXISTING_PROFILE_ID);

    const row = db.select().from(facts).where(eq(facts.id, f3.id)).get();
    expect(row!.profileId).toBe(OTHER_PROFILE); // Unchanged
    expect(count).toBe(0);
  });

  it("handles collision with existing profile fact (keeps newer)", async () => {
    // Profile already has a fact with same category/key
    const existingFact = await createFact(
      { category: "identity", key: "collide-test", value: { old: "existing" } },
      "other-session", // different session
      EXISTING_PROFILE_ID,
    );
    createdFactIds.push(existingFact.id);

    // Create a NEWER anonymous fact with same category/key
    const anonFact = await createFact(
      { category: "identity", key: "collide-test", value: { new: "anonymous" } },
      ANON_SESSION,
    );
    createdFactIds.push(anonFact.id);

    // Backfill should handle collision without throwing
    const count = backfillProfileId([ANON_SESSION], EXISTING_PROFILE_ID);
    expect(count).toBeGreaterThanOrEqual(1);

    // The newer fact should win; the older should be hard-deleted
    const anonRow = db.select().from(facts).where(eq(facts.id, anonFact.id)).get();
    const existingRow = db.select().from(facts).where(eq(facts.id, existingFact.id)).get();
    expect(anonRow!.profileId).toBe(EXISTING_PROFILE_ID);
    expect(existingRow).toBeUndefined(); // Hard-deleted, not archived
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/login-fact-backfill.test.ts`
Expected: FAIL — `backfillProfileId` is not exported from kb-service

**Step 3: Implement backfillProfileId in kb-service**

Add to `src/lib/services/kb-service.ts` (at the end of the file):

```typescript
/**
 * Backfill profileId on facts created during anonymous sessions.
 * Called at login/OAuth time when an existing profile attaches to an anonymous session.
 *
 * Safety: only updates facts where profileId equals the sessionId
 * (i.e., facts that were created without an explicit profileId).
 * Facts already assigned to a different profile are left untouched.
 *
 * Conflict handling: The `uniq_facts_profile_category_key` index means we can't
 * blindly UPDATE profileId if the target profile already has a fact with the
 * same category/key. We handle this per-fact: if collision exists, archive the
 * older one and keep the newer one.
 */
export function backfillProfileId(sessionIds: string[], newProfileId: string): number {
  if (sessionIds.length === 0) return 0;

  let total = 0;
  for (const sid of sessionIds) {
    // Find candidate facts: anonymous facts where profileId = sessionId
    const candidates = db.select().from(facts)
      .where(and(
        eq(facts.sessionId, sid),
        eq(facts.profileId, sid),
        isNull(facts.archivedAt),
      ))
      .all();

    for (const candidate of candidates) {
      // Check for collision: does target profile already have this category/key?
      const existing = db.select().from(facts)
        .where(and(
          eq(facts.profileId, newProfileId),
          eq(facts.category, candidate.category),
          eq(facts.key, candidate.key),
          isNull(facts.archivedAt),
        ))
        .get();

      if (existing) {
        // Collision: the unique index on (profile_id, category, key) blocks the
        // UPDATE, so we must remove the loser BEFORE updating the winner.
        // Wrapped in a transaction to ensure atomicity + child handling.
        const candidateTime = new Date(candidate.updatedAt).getTime();
        const existingTime = new Date(existing.updatedAt).getTime();
        sqlite.transaction(() => {
          const loserId = candidateTime > existingTime ? existing.id : candidate.id;
          const winnerId = candidateTime > existingTime ? candidate.id : existing.id;
          // Detach children from loser (reparent to winner)
          sqlite.prepare("UPDATE facts SET parent_fact_id = ? WHERE parent_fact_id = ?").run(winnerId, loserId);
          // Hard-delete loser
          sqlite.prepare("DELETE FROM facts WHERE id = ?").run(loserId);
          // If candidate is winner, update its profileId
          if (winnerId === candidate.id) {
            sqlite.prepare("UPDATE facts SET profile_id = ? WHERE id = ?").run(newProfileId, winnerId);
          }
        })();
      } else {
        // No collision: safe to update
        db.update(facts).set({ profileId: newProfileId }).where(eq(facts.id, candidate.id)).run();
      }
      total++;
    }
  }
  return total;
}
```

**Step 4: Run test**

Run: `npx vitest run tests/evals/login-fact-backfill.test.ts`
Expected: ALL PASS

**Step 5: Wire backfill into login route (with error isolation + link guard)**

In `src/app/api/auth/login/route.ts`, find the session-linking block (around line 65) where an existing profile attaches to the anonymous session. Add the backfill AFTER the session `profile_id` update, guarded by `changes === 1`:

```typescript
      // Existing: link session to profile
      const linkResult = sqlite
        .prepare("UPDATE sessions SET profile_id = ? WHERE id = ? AND profile_id IS NULL")
        .run(profileId, sessionId);

      // NEW: Backfill profileId on facts ONLY when session was actually newly linked.
      // Guard: changes === 1 means this session was anonymous and just got linked.
      // Without this guard, a stale/mismatched os_session cookie could trigger
      // unwanted fact reassignment on an already-linked session.
      // Wrapped in try/catch: backfill failure must NOT break login.
      if (linkResult.changes === 1) {
        try {
          const { backfillProfileId } = await import("@/lib/services/kb-service");
          const backfilled = backfillProfileId([sessionId], profileId);
          if (backfilled > 0) {
            console.info("[login] Backfilled profileId on", backfilled, "facts for session", sessionId);
          }
        } catch (err) {
          console.warn("[login] Fact profileId backfill failed (non-fatal):", err);
        }
      }
```

**Note on existing broken data:** The `changes === 1` guard means already-linked sessions won't get backfilled on subsequent logins. To repair existing broken data (facts with `profileId = sessionId` from before this fix), create a one-time migration script:

```sql
-- One-time repair: scripts/backfill-fact-profile-ids.sql
-- Run AFTER deploying this fix. Safe to re-run (idempotent).
-- Uses the same winner/loser collision logic as the runtime backfillProfileId().

-- Step 1: Delete LOSER facts where a collision would occur
-- (anonymous fact has same category/key as existing profile fact — keep newer)
DELETE FROM facts WHERE id IN (
  SELECT anon.id
  FROM facts anon
  JOIN sessions s ON s.id = anon.session_id AND s.profile_id IS NOT NULL AND s.profile_id != anon.session_id
  JOIN facts existing ON existing.profile_id = s.profile_id
    AND existing.category = anon.category
    AND existing.key = anon.key
    AND existing.archived_at IS NULL
  WHERE anon.profile_id = anon.session_id
    AND anon.archived_at IS NULL
    AND existing.updated_at >= anon.updated_at  -- existing is newer or equal: delete anonymous
);

-- Step 2: Delete LOSER profile facts where anonymous is newer
DELETE FROM facts WHERE id IN (
  SELECT existing.id
  FROM facts anon
  JOIN sessions s ON s.id = anon.session_id AND s.profile_id IS NOT NULL AND s.profile_id != anon.session_id
  JOIN facts existing ON existing.profile_id = s.profile_id
    AND existing.category = anon.category
    AND existing.key = anon.key
    AND existing.archived_at IS NULL
  WHERE anon.profile_id = anon.session_id
    AND anon.archived_at IS NULL
    AND anon.updated_at > existing.updated_at  -- anonymous is newer: delete existing
);

-- Step 3: Now safe to UPDATE remaining anonymous facts (no collisions left)
UPDATE facts SET profile_id = (
  SELECT s.profile_id FROM sessions s WHERE s.id = facts.session_id AND s.profile_id IS NOT NULL
)
WHERE facts.profile_id = facts.session_id
  AND facts.archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM sessions s WHERE s.id = facts.session_id AND s.profile_id IS NOT NULL AND s.profile_id != facts.session_id
  );
```

This script uses the same collision resolution logic as `backfillProfileId()`: when anonymous and profile facts collide on `(profile_id, category, key)`, the newer wins and the older is hard-deleted. Must be run in a transaction. Track as follow-up task — separate from this bug-fix batch.

**Step 6: Wire backfill into OAuth service (both branches) + update callback routes**

**6a: Update OAuth callback routes to pass pre-login sessionId**

The OAuth callback routes (e.g., `src/app/api/auth/google/callback/route.ts`) currently call `handleOAuthCallback(...)` without passing the pre-login anonymous session. This must be fixed — the callback needs to read the `os_session` cookie BEFORE the redirect and pass it through.

Files to modify:
- `src/app/api/auth/google/callback/route.ts` — read `os_session` from cookies, pass as parameter
- Any other OAuth provider callback routes (check with `ls src/app/api/auth/*/callback/`)

```typescript
// In each OAuth callback route, read the pre-login session before the OAuth flow:
const preLoginSession = cookies().get("os_session")?.value;
// Then pass it as the existing 2nd argument (existingSessionId):
const result = await handleOAuthCallback(oauthUserInfo, preLoginSession);
```

Note: `handleOAuthCallback` already accepts `existingSessionId?: string` as its 2nd parameter (see `oauth-service.ts:24`). The callback routes just need to pass it.

**6b: No signature change needed**

`handleOAuthCallback(info: OAuthUserInfo, existingSessionId?: string)` already has the right shape. We just need to ensure the callback routes actually pass the pre-login session cookie value as `existingSessionId`.

**6c: Add backfill in BOTH branches with link guard**

In `src/lib/services/oauth-service.ts`, the `handleOAuthCallback` function has TWO branches:
1. **Existing identity** (early return around line 40): User already has a profile, OAuth callback just needs to link the pre-login session.
2. **New identity** (around line 118): New user created, session linked to new profile.

**Critical:** The backfill must run in BOTH branches. The existing-identity early-return path is the primary split-ID case for returning OAuth users.

In both branches, after session linking, apply the same guard + try/catch pattern:

```typescript
// In each branch, after session link UPDATE:
const linkResult = sqlite
  .prepare("UPDATE sessions SET profile_id = ? WHERE id = ? AND profile_id IS NULL")
  .run(profileId, preLoginSessionId);

// Backfill only when session was newly linked (changes === 1)
if (preLoginSessionId && linkResult.changes === 1) {
  try {
    const { backfillProfileId } = await import("@/lib/services/kb-service");
    const backfilled = backfillProfileId([preLoginSessionId], profileId);
    if (backfilled > 0) {
      console.info("[oauth] Backfilled profileId on", backfilled, "facts for session", preLoginSessionId);
    }
  } catch (err) {
    console.warn("[oauth] Fact profileId backfill failed (non-fatal):", err);
  }
}
```

**Important:** Before implementing, read `handleOAuthCallback` to understand the exact branching. The key requirement is: wherever a session with `profile_id IS NULL` gets linked to a profile with a *different* ID, AND the session was actually newly linked (`changes === 1`), backfill must run.

**Step 7: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Run existing tests**

Run: `npx vitest run tests/evals/fact-constraints.test.ts tests/evals/batch-facts-tool.test.ts`
Expected: ALL PASS

**Step 9: Commit**

```bash
git add src/lib/services/kb-service.ts src/app/api/auth/login/route.ts src/lib/services/oauth-service.ts tests/evals/login-fact-backfill.test.ts
git commit -m "fix: backfill fact profileId at login/OAuth time (split-ID session linking)"
```

---

## Task 5: Fix 2+3 — Kill update_fact, delete_fact accepts category/key

**Files:**
- Modify: `src/lib/agent/tools.ts` (remove update_fact, modify delete_fact, add identityDeleteGate)
- Modify: `src/lib/agent/tool-filter.ts` (remove update_fact from ONBOARDING_TOOLS)
- Modify: `src/lib/services/kb-service.ts` (add findFactsByOwnerCategoryKey)
- Modify: `src/lib/services/confirmation-service.ts` (add `identity_delete` to PendingConfirmationType)
- Modify: `src/lib/agent/prompts.ts` (add immutable-fact rule to TOOL_POLICY)
- Modify: ALL files referencing `update_fact` in `src/lib/agent/policies/` and `src/lib/services/`
- Test: `tests/evals/delete-fact-category-key.test.ts`

### Step 1: Write the failing test

```typescript
// tests/evals/delete-fact-category-key.test.ts
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db, sqlite } from "@/lib/db";
import { facts, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createFact, findFactsByOwnerCategoryKey } from "@/lib/services/kb-service";

const SESSION_ID = `test-delcat-${randomUUID().slice(0, 8)}`;
const PROFILE_ID = `profile-delcat-${randomUUID().slice(0, 8)}`;
const createdFactIds: string[] = [];

beforeAll(() => {
  db.insert(sessions).values({ id: SESSION_ID, inviteCode: "test" }).run();
});

afterAll(() => {
  for (const id of createdFactIds) {
    try { db.delete(facts).where(eq(facts.id, id)).run(); } catch {}
  }
  db.delete(sessions).where(eq(sessions.id, SESSION_ID)).run();
});

describe("findFactsByOwnerCategoryKey", () => {
  it("finds facts by category and key for a given owner", async () => {
    const f1 = await createFact(
      { category: "education", key: "university-x", value: { institution: "MIT" } },
      SESSION_ID, PROFILE_ID,
    );
    createdFactIds.push(f1.id);

    const found = findFactsByOwnerCategoryKey(PROFILE_ID, "education", "university-x", [SESSION_ID]);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(f1.id);
  });

  it("returns single result per profile (profile-level unique index enforced)", async () => {
    // The DB enforces uniq_facts_profile_category_key, so for a given profile
    // there can only be 0 or 1 active facts per category/key.
    const f2 = await createFact(
      { category: "education", key: "dams", value: { institution: "DAMS" } },
      SESSION_ID, PROFILE_ID,
    );
    createdFactIds.push(f2.id);

    const found = findFactsByOwnerCategoryKey(PROFILE_ID, "education", "dams", [SESSION_ID]);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(f2.id);
  });

  it("returns empty array when no match", () => {
    const found = findFactsByOwnerCategoryKey(PROFILE_ID, "nonexistent", "nope", [SESSION_ID]);
    expect(found).toHaveLength(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run tests/evals/delete-fact-category-key.test.ts`
Expected: FAIL — `findFactsByOwnerCategoryKey` not exported

### Step 3: Implement findFactsByOwnerCategoryKey in kb-service

Add to `src/lib/services/kb-service.ts`:

```typescript
/**
 * Find active facts by owner + category + key.
 * Used by delete_fact tool when agent passes category/key instead of UUID.
 * Returns ALL matching facts (may be >1 if duplicates exist).
 */
export function findFactsByOwnerCategoryKey(
  ownerKey: string,
  category: string,
  key: string,
  readKeys?: string[],
): FactRow[] {
  if (PROFILE_ID_CANONICAL) {
    return db.select().from(facts)
      .where(and(
        eq(facts.profileId, ownerKey),
        eq(facts.category, category),
        eq(facts.key, key),
        isNull(facts.archivedAt),
      ))
      .all() as FactRow[];
  }
  if (readKeys && readKeys.length > 0) {
    return db.select().from(facts)
      .where(and(
        inArray(facts.sessionId, readKeys),
        eq(facts.category, category),
        eq(facts.key, key),
        isNull(facts.archivedAt),
      ))
      .all() as FactRow[];
  }
  return db.select().from(facts)
    .where(and(
      eq(facts.sessionId, ownerKey),
      eq(facts.category, category),
      eq(facts.key, key),
      isNull(facts.archivedAt),
    ))
    .all() as FactRow[];
}
```

### Step 4: Run test

Run: `npx vitest run tests/evals/delete-fact-category-key.test.ts`
Expected: ALL PASS

### Step 5: Modify delete_fact tool to accept category/key with cross-turn confirmation

In `src/lib/agent/tools.ts`, find `delete_fact` (around line 628). Replace the tool definition.

**Key design:** When multiple facts match category/key, the tool stores pending IDs in session metadata (same pattern as existing `deleteGate` / bulk-delete) and returns `REQUIRES_CONFIRMATION`. The model CANNOT self-confirm in the same turn — it must wait for the next user message, which unlocks the pending deletion via `deleteGate`. This reuses the existing cross-turn safety mechanism.

```typescript
    delete_fact: tool({
      description: "Delete a fact. Accepts either a UUID factId or a 'category/key' format (e.g., 'education/dams-torino'). When using category/key and multiple facts match, requires user confirmation in a subsequent turn.",
      parameters: z.object({
        factId: z.string().describe("The fact ID (UUID) or category/key (e.g., 'education/dams-torino') to delete"),
      }),
      execute: async ({ factId }) => {
        try {
          // Check if factId is category/key format
          if (factId.includes("/") && !factId.match(/^[0-9a-f]{8}-/)) {
            const [cat, ...keyParts] = factId.split("/");
            const key = keyParts.join("/");

            const { findFactsByOwnerCategoryKey } = await import("@/lib/services/kb-service");
            const matching = findFactsByOwnerCategoryKey(effectiveOwnerKey, cat, key, readKeys);
            if (matching.length === 0) {
              return { success: false, error: "No facts found for category/key: " + factId, hint: "Use search_facts to find available facts." };
            }
            if (matching.length === 1) {
              // Identity delete guard (only after confirming the fact exists)
              if (cat === "identity") {
                const identityBlocked = identityDeleteGate(cat, key);
                if (identityBlocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...identityBlocked };
              }
              // Single match: delete directly via deleteGate
              const blocked = deleteGate(matching[0].id);
              if (blocked) return blocked;
              const ok = deleteFact(matching[0].id, sessionId, readKeys);
              if (!ok) return { success: false, error: "Fact not found after lookup" };
              try { recomposeAfterMutation(); } catch (e) {
                console.warn("[delete_fact] recompose failed:", e);
              }
              return { success: true, deletedCount: 1 };
            }
            // Multiple matches (possible when PROFILE_ID_CANONICAL=false, readKeys span sessions)
            // Identity gate check also applies here
            if (cat === "identity") {
              const identityBlocked = identityDeleteGate(cat, key);
              if (identityBlocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...identityBlocked };
            }
            // Return REQUIRES_CONFIRMATION with candidates so agent can ask user
            return {
              success: false,
              code: "REQUIRES_CONFIRMATION",
              message: `Found ${matching.length} facts matching "${factId}". Present these to the user and ask which to delete. Then call delete_fact with the specific UUID.`,
              matchingFacts: matching.map(f => ({ id: f.id, value: typeof f.value === "string" ? f.value.slice(0, 100) : JSON.stringify(f.value).slice(0, 100) })),
            };
          }

          // UUID path (existing behavior — goes through deleteGate)
          // Also check identityDeleteGate for identity facts being deleted by UUID
          const factToDelete = db.select().from(facts).where(eq(facts.id, factId)).get();
          if (factToDelete?.category === "identity") {
            const identityBlocked = identityDeleteGate(factToDelete.category, factToDelete.key);
            if (identityBlocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...identityBlocked };
          }
          const blocked = deleteGate(factId);
          if (blocked) return blocked;
          const ok = deleteFact(factId, sessionId, readKeys);
          if (!ok) return { success: false, error: "Fact not found", hint: "Use search_facts to find the correct factId, or use category/key format like 'education/dams-torino'." };
          try { recomposeAfterMutation(); } catch (e) {
            console.warn("[delete_fact] recompose failed:", e);
          }
          return { success: true, deletedCount: 1 };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
    }),
```

**Note:** The multi-match `storePendingBulkDelete` logic from earlier versions has been REMOVED. The `uniq_facts_profile_category_key` unique index (migration 0010) ensures at most 1 active fact per `(profile_id, category, key)`, so the category/key delete path always finds 0 or 1 results. The existing `deleteGate` handles single-fact safety.

### Step 5b: Add identityDeleteGate helper

In `src/lib/agent/tools.ts`, add a new helper near `identityGate` (around line 185). This is similar to `identityGate` but for DELETE operations — it doesn't require a value hash, just tracks whether an identity delete was confirmed:

```typescript
  /**
   * Identity delete gate. Prevents delete+create bypass of identity overwrite confirmation.
   * Returns null if allowed, or a message object if blocked.
   */
  function identityDeleteGate(category: string, key: string): { requiresConfirmation: true; message: string } | null {
    if (category !== "identity") return null;
    if (_identityBlockedThisTurn) {
      return { requiresConfirmation: true, message: "Identity changes blocked this turn — wait for user confirmation in a new message." };
    }
    // Check if this delete was previously confirmed via pending (loaded from session meta)
    const existing = pendings.find(p => p.type === "identity_delete" && p.category === category && p.key === key);
    if (existing) {
      // Confirmed: consume, persist removal, and allow
      pendings.splice(pendings.indexOf(existing), 1);
      mergeSessionMeta(sessionId, { pendingConfirmations: pendings.length ? pendings : null });
      return null;
    }
    // Not confirmed: store pending with required fields and persist
    pendings.push({
      type: "identity_delete",
      id: randomUUID(),
      category,
      key,
      createdAt: new Date().toISOString(),
    });
    _identityBlockedThisTurn = true;
    mergeSessionMeta(sessionId, { pendingConfirmations: pendings });
    return { requiresConfirmation: true, message: `Deleting identity/${key} requires confirmation. Explain to the user what will be removed and ask them to confirm.` };
  }
```

**Also modify `src/lib/services/confirmation-service.ts`:** Extend the existing `PendingConfirmation` union to include `"identity_delete"`. Check the exact type structure in the file — add a new variant to the union with `type: "identity_delete"`, `id: string`, `category: string`, `key: string`, `createdAt: string`.

This uses the same `pendings` array, `_identityBlockedThisTurn` flag, and `mergeSessionMeta` as `identityGate`, ensuring cross-turn persistence and safety.

### Step 6: Remove update_fact tool

In `src/lib/agent/tools.ts`, find `update_fact` (around line 577-626). Delete the entire tool definition block.

### Step 6b: Remove `action: "update"` from batch_facts

In `src/lib/agent/tools.ts`, find the `batch_facts` tool. It has an `operations` schema with `action: z.enum(["create", "update", "delete"])` (around line 425). Change to:

```typescript
action: z.enum(["create", "delete"]),
```

Then find the `case "update":` branch in the `batch_facts` execute function (around line 513) and remove it entirely. The handler calls `updateFact()` which violates the immutable-fact invariant. If we keep this branch, models can still mutate facts in-place via `batch_facts`, defeating the entire purpose of killing `update_fact`.

Also update the `batch_facts` description string to remove any mention of updating facts.

**Additionally:** In the `case "create":` branch of `batch_facts`, add the same duplicate detection guard as `create_fact`:

```typescript
case "create": {
  // Duplicate guard: check if fact already exists for this owner/category/key
  // Runs BEFORE identityGate, same ordering as create_fact tool
  const existingFacts = findFactsByOwnerCategoryKey(effectiveOwnerKey, op.category, op.key, readKeys);
  if (existingFacts.length > 0) {
    if (stableDeepEqual(existingFacts[0].value, op.value)) {
      // Idempotent retry: count as success, no-op
      break;
    }
    warnings.push(`Create of ${op.category}/${op.key} blocked: fact already exists with different value. Delete first.`);
    break;
  }
  // No duplicate: proceed with identityGate check, then createFact
  if (op.category === "identity") {
    const blocked = identityGate(op.category, op.key, op.value);
    if (blocked) { /* handle as before */ }
  }
  const fact = await createFact({ ... }, sessionId, effectiveOwnerKey);
  // ...
}
```

This ensures `batch_facts` can't bypass the immutable-fact invariant via `create` actions either.

### Step 7: Remove update_fact from tool-filter

In `src/lib/agent/tool-filter.ts`, find `ONBOARDING_TOOLS` array. Remove the `"update_fact"` entry.

### Step 8: Update TOOL_POLICY prompt

In `src/lib/agent/prompts.ts`, find the TOOL_POLICY string. Replace:

```
- Use update_fact when information changes (e.g., "I left that job")
```

With:

```
- Facts are IMMUTABLE. To correct a fact, ALWAYS: (1) delete_fact the wrong one (use category/key format like "education/dams"), (2) create_fact with the corrected information. Never leave incorrect facts active.
- delete_fact accepts both UUID and category/key format (e.g., "education/dams-torino"). When multiple facts match category/key, you'll get REQUIRES_CONFIRMATION — present the matches to the user and wait for explicit approval.
- batch_facts supports create and delete actions only. No updates.
```

### Step 8b: Tighten createFact upsert to true idempotency

In `src/lib/services/kb-service.ts`, the `createFact()` function has an `onConflictDoUpdate` on `(sessionId, category, key)` that silently overwrites the value on key collision. This contradicts the immutable-fact invariant — the agent could "update" a fact by calling `create_fact` with the same key and a different value.

**Fix:** Change `createFact()` to detect key collision and return the existing fact without modification:

**`createFact()` in kb-service is NOT changed.** The existing `onConflictDoUpdate` is kept as-is for backward compatibility with all callers (`batch_facts`, `connector-fact-writer.ts`, etc.). The storage-level upsert remains a safety net.

**Duplicate detection is done in the `create_fact` TOOL only.** It runs BEFORE `identityGate` so that exact-value retries don't trigger unnecessary identity confirmation:

```typescript
// In create_fact tool execute, BEFORE identityGate and createFact:
const { findFactsByOwnerCategoryKey } = await import("@/lib/services/kb-service");
const existingFacts = findFactsByOwnerCategoryKey(effectiveOwnerKey, category, key, readKeys);
if (existingFacts.length > 0) {
  // Use stable deep comparison (not JSON.stringify which is key-order dependent)
  const isIdentical = stableDeepEqual(existingFacts[0].value, value);
  if (isIdentical) {
    // Idempotent retry: return success with existing fact, skip identityGate
    return { success: true, factId: existingFacts[0].id, idempotent: true };
  }
  // Different value: block — agent must delete+create
  return {
    success: false,
    error: `A fact for ${category}/${key} already exists with a different value.`,
    hint: "To update this fact: (1) delete_fact the existing one, (2) create_fact with the new value.",
    existingFactId: existingFacts[0].id,
  };
}

// No existing fact: proceed with identityGate, then createFact
const blocked = identityGate(category, key, value);
if (blocked) return { success: false, code: "REQUIRES_CONFIRMATION", ...blocked };

const fact = await createFact({ category, key, value, confidence }, sessionId, effectiveOwnerKey);
```

**Ordering rationale:** Duplicate detection MUST come before `identityGate`. Otherwise, an exact retry of an existing identity fact would trigger the overwrite confirmation flow instead of returning idempotent success.

**`stableDeepEqual` helper:** Add a small utility at the top of `createAgentTools()`:

```typescript
function stableDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)])
  );
}
```

This keeps the change scoped to the tool layer and avoids breaking any direct `createFact()` callers.

### Step 9: Repo-wide update_fact reference cleanup

Run this search to find ALL remaining references:

```bash
rg "update_fact" src/ --files-with-matches
```

Expected files to update (based on Codex review findings):
- `src/lib/agent/policies/active-fresh.ts` — remove any prompt text mentioning update_fact
- `src/lib/agent/policies/returning-no-page.ts` — same
- `src/lib/agent/policies/memory-directives.ts` — same
- `src/lib/agent/policies/search-facts-rule.ts` — same
- `src/lib/agent/policies/situations.ts` — same
- `src/lib/services/kb-service.ts` — update error messages that suggest using update_fact
- `src/lib/agent/tools.ts` — journal formatter (~line 1855) that references `update_fact`

For each file, replace `update_fact` references with the new pattern: "delete the old fact and create a corrected one" or simply remove the reference if it's in a list of tool names.

Also verify `batch_facts` prompt text and descriptions no longer mention "update" as a supported action.

### Step 10: Verify no TypeScript errors

Run: `npx tsc --noEmit`
Expected: No errors

### Step 11: Update existing tests that reference update_fact

Search:
```bash
rg "update_fact" tests/ --files-with-matches
```

For each file:
- Remove tests that only test update_fact behavior
- Update tests that check tool availability to remove update_fact from expected lists

### Step 12: Run full test suite

Run: `npx vitest run`
Expected: ALL PASS

### Step 13: Commit

```bash
git add src/ tests/
git commit -m "feat: kill update_fact (immutable facts), delete_fact accepts category/key with confirmation gate"
```

---

## Task 6: Fix 6 — Error recovery hints in tool responses

**Files:**
- Modify: `src/lib/agent/tools.ts` (add hint fields to error responses)

### Step 1: Add hints to existing error responses

In `src/lib/agent/tools.ts`, find each tool's error return and add a `hint` field:

**generate_page** (error returns):
```typescript
return { success: false, error: "...", hint: "Ensure facts exist before generating. Use create_fact first." };
```

**request_publish** (error returns):
```typescript
return { success: false, error: "...", hint: "The user must register before publishing. Guide them through the signup flow." };
```

**update_page_style** (fetch error catch):
```typescript
return { success: false, error: String(err), hint: "Style update failed. Try again or ask the user to change style from the UI." };
```

**search_facts** (when 0 results — add after mapping results):
```typescript
if (mapped.length === 0) {
  return { success: true, count: 0, facts: [], hint: "No facts matched. Try broader search terms or different keywords." };
}
```

### Step 2: Verify no TypeScript errors

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Commit

```bash
git add src/lib/agent/tools.ts
git commit -m "feat: add error recovery hints to tool responses"
```

---

## Task 7: Fix 7 — Prompt guidance for generate_page timing

**Files:**
- Modify: `src/lib/agent/prompts.ts` (TOOL_POLICY section)

### Step 1: Add rule to TOOL_POLICY

In `src/lib/agent/prompts.ts`, find the TOOL_POLICY string. Add after the fact recording rules:

```
PAGE REGENERATION: Call generate_page only AFTER all fact mutations (create, delete, batch) for the current turn are complete. Never call generate_page between a failed and retried operation.
```

### Step 2: Verify no TypeScript errors

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Commit

```bash
git add src/lib/agent/prompts.ts
git commit -m "feat: add generate_page timing rule to TOOL_POLICY"
```

---

## Task 8: Fix 9 — Strengthen soul proposal presentation rule

**Files:**
- Modify: `src/lib/agent/policies/situations.ts` (pendingSoulProposalsDirective)

### Step 1: Strengthen the directive

In `src/lib/agent/policies/situations.ts`, find the `pendingSoulProposalsDirective` function (around line 114). Find the block starting with "If the user agrees" and replace it:

```typescript
// BEFORE:
`If the user agrees → call review_soul_proposal with accept: true.
If the user declines or seems uninterested → call review_soul_proposal with accept: false. Do NOT insist further.`

// AFTER:
`If the user EXPLICITLY agrees → call review_soul_proposal with accept: true.
If the user declines or seems uninterested → call review_soul_proposal with accept: false. Do NOT insist further.
NEVER call review_soul_proposal(accept: true) in the same turn as presenting the proposal. You MUST wait for the user's explicit response in a subsequent message before accepting.`
```

### Step 2: Verify no TypeScript errors

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Run existing soul proposal tests

Run: `npx vitest run tests/evals/ -t "soul"`
Expected: ALL PASS

### Step 4: Commit

```bash
git add src/lib/agent/policies/situations.ts
git commit -m "fix: strengthen soul proposal rule — require explicit user consent, no same-turn accept"
```

---

## Task 9: Final verification

### Step 1: Run full test suite

Run: `npx vitest run`
Expected: ALL PASS (2593+ tests)

### Step 2: Run TypeScript check

Run: `npx tsc --noEmit`
Expected: No errors

### Step 3: Manual smoke test

Start the dev server and verify key fixes:

```bash
npm run dev
```

Verify with API calls or UAT script:
1. Facts created via `create_fact` have correct profileId
2. `delete_fact` accepts `category/key` format
3. `update_fact` tool is no longer available
4. `update_page_style` doesn't error on URL (and works in multi-user mode)
5. Server logs show `[thinking]` entries for multi-step requests with correct step indices

### Step 4: Commit any test fixes

```bash
git add -A
git commit -m "chore: final test fixes for UAT bug batch"
```

---

## Summary

| Task | Fix | Risk | Key Files |
|------|-----|------|-----------|
| 1 | create_fact profileId | Zero | tools.ts |
| 2 | onStepFinish thinking (fixed step index) | Low | chat/route.ts |
| 3 | update_page_style URL + cookie | Low | tools.ts |
| 4 | Login/OAuth profileId backfill (split-ID fix) | Medium | kb-service.ts, login/route.ts, oauth-service.ts, google/callback/route.ts |
| 5 | Kill update_fact + batch_facts update + delete_fact cat/key + repo cleanup | Medium | tools.ts, tool-filter.ts, kb-service.ts, prompts.ts, policies/*.ts |
| 6 | Error recovery hints | Zero | tools.ts |
| 7 | generate_page timing rule | Zero | prompts.ts |
| 8 | Soul proposal presentation | Low | situations.ts |
| 9 | Final verification | — | — |
