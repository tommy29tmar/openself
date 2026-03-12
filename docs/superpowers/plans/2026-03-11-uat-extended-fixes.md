# UAT Extended Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three issues found in the extended Marco Rossetti UAT: BUG-7 batch identity delete attempt, missing stale greeting time acknowledgment, and delayed execution when user confirms agent's own proposal.

**Architecture:** All three fixes are prompt-level refinements (no business logic changes). BUG-7 is already correctly blocked by code — the prompt needs reinforcement so the agent doesn't attempt it. The stale greeting and immediate execution are behavioral compliance gaps where existing instructions aren't emphatic enough. UAT script verifications are tightened: BUG-7 uses dual-signal (WARN for attempts with counter, FAIL for safety-net failures), stale greeting and delayed execution become scored penalties.

**Tech Stack:** TypeScript (prompt strings), Vitest (tests), Node.js ESM (UAT script)

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/lib/agent/policies/active-stale.ts` | Stale greeting policy | Modify: strengthen time-gap acknowledgment with MUST |
| `src/lib/agent/policies/shared-rules.ts` | Universal behavioral rules | Modify: extend IMMEDIATE_EXECUTION_RULE for proposal confirmation |
| `src/lib/agent/prompts.ts` | TOOL_POLICY with fact recording rules | Modify: reinforce identity delete instruction (keep NEVER) |
| `tests/evals/returning-policies.test.ts` | Policy eval tests | Modify: add test for MUST time-gap language |
| `tests/evals/shared-rules.test.ts` | Shared rules eval tests | Modify: add test for proposal confirmation + preserved guards |
| `scripts/uat-extended.mjs` | Extended UAT script | Modify: BUG-7 dual-signal with counter, stale greeting + execution penalties |

---

## Accepted Limitations

**UUID identity delete detection in UAT:** The BUG-7 FAIL path detects identity deletes by category/key format (`factId.startsWith("identity/")`). UUID-based identity deletes that bypass the block cannot be distinguished from non-identity deletes at the UAT level because the script has no DB access to resolve UUIDs to fact categories. This is accepted because:
1. The code-level `IDENTITY_DELETE_BLOCKED` guard handles both category/key AND UUID formats identically (`tools.ts:514-530`).
2. Both formats are unit-tested (`bulk-delete-confirmation.test.ts:497,529`).
3. The WARN path catches ALL blocked identity delete attempts (both formats) via the `IDENTITY_DELETE_BLOCKED` result code.
4. A UUID-based identity delete succeeding would be a code regression (safety-net bug), not a prompt regression — code regressions are caught by unit tests, not UAT.

---

## Chunk 1: All Tasks

### Task 1: Reinforce identity delete instruction in TOOL_POLICY (BUG-7)

**Context:** The code already blocks identity deletes via `batch_facts` (returns `IDENTITY_DELETE_BLOCKED` at `tools.ts:514-530`). The TOOL_POLICY at `prompts.ts:130` says "NEVER use batch_facts to delete identity facts." But the agent still tries it first. The instruction needs reinforcement — lead with the *consequence* while keeping "NEVER" to satisfy existing test contracts at `tool-policy-uat-r3.test.ts:69` and `prompt-contracts.test.ts:65`.

**Files:**
- Modify: `src/lib/agent/prompts.ts:130`
- Test: `tests/evals/tool-policy-uat-r3.test.ts` (existing, verifies `NEVER.*batch_facts.*identity`)
- Test: `tests/evals/prompt-contracts.test.ts:65` (existing, verifies same pattern)

- [ ] **Step 1: Update the identity delete instruction**

In `src/lib/agent/prompts.ts`, replace line 130:

From:
```
- For deletes of identity facts → NEVER use batch_facts to delete identity facts. ALWAYS use delete_fact individually — identity deletes require cross-turn confirmation that only delete_fact supports. If batch_facts returns IDENTITY_DELETE_BLOCKED, switch to delete_fact.
```

To:
```
- IDENTITY DELETES: NEVER include identity facts in batch_facts delete operations — batch_facts REJECTS them (returns IDENTITY_DELETE_BLOCKED). ALWAYS use delete_fact for identity deletions — it supports the required cross-turn confirmation.
```

Rationale: Keeps `NEVER.*batch_facts.*identity` pattern to satisfy existing test contracts. Leads with "IDENTITY DELETES:" header for scannability and states the consequence ("REJECTS them") before the instruction.

- [ ] **Step 2: Run existing contract tests**

Run: `npx vitest run tests/evals/tool-policy-uat-r3.test.ts tests/evals/prompt-contracts.test.ts`
Expected: PASS — both tests verify `NEVER.*batch_facts.*identity` pattern which is preserved

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/prompts.ts
git commit -m "fix: reinforce identity delete prompt — lead with consequence, keep NEVER contract"
```

---

### Task 2: Strengthen stale greeting time acknowledgment

**Context:** The `active-stale.ts` policy at line 23 says "Acknowledge the time gap warmly" but the agent ignored it in UAT (said "Marco! Dimmi cosa vuoi cambiare." without mentioning time). Need to make the time-gap acknowledgment mandatory with MUST language and example phrases that explicitly reference elapsed time.

**Files:**
- Modify: `src/lib/agent/policies/active-stale.ts:21-28`
- Modify: `tests/evals/returning-policies.test.ts:319-321`

- [ ] **Step 1: Write the failing test**

In `tests/evals/returning-policies.test.ts`, replace lines 319-321:

From:
```typescript
it("instructs to acknowledge time passed", () => {
  expect(policyEn).toMatch(/acknowledge.*time|been\s*a\s*while|time\s*gap/i);
});
```

To:
```typescript
it("MUST acknowledge time gap in greeting (not optional)", () => {
  expect(policyEn).toMatch(/MUST.*acknowledge|MUST.*mention.*time/i);
  expect(policyEn).toMatch(/been\s*a\s*while|it's\s*been|time.*passed/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/returning-policies.test.ts`
Expected: FAIL — "MUST" not found in current text

- [ ] **Step 3: Update the policy text**

In `src/lib/agent/policies/active-stale.ts`, replace lines 21-28:

From:
```
GREETING (turn 1):
- Use their name from facts (identity/name). NEVER ask for their name.
- Acknowledge the time gap warmly (not apologetically): "Hey [name], it's been a while! What's new?"
- Ask ONE focused question about likely changes. Pick from:
  - Work: "Still at [company]?" or "Any new projects?"
  - Interests: "Picked up any new hobbies lately?"
  - General: "Anything you'd like to update on your page?"
- Use search_facts to reference something specific from their profile — shows you remember them.
```

To:
```
GREETING (turn 1):
- Use their name from facts (identity/name). NEVER ask for their name.
- You MUST acknowledge the time gap in your first message. This is NOT optional.
  The user needs to feel recognized as a returning visitor, not treated like a new conversation.
  Reference the elapsed time explicitly — e.g. "it's been a while", "è passato un po' di tempo",
  "da qualche giorno non ci sentiamo". Do NOT just say "bentornato" without mentioning time.
  Example: "Hey [name], it's been a while! What's new?"
- Ask ONE focused question about likely changes. Pick from:
  - Work: "Still at [company]?" or "Any new projects?"
  - Interests: "Picked up any new hobbies lately?"
  - General: "Anything you'd like to update on your page?"
- Use search_facts to reference something specific from their profile — shows you remember them.
```

Note: The policy now explicitly says "Reference the elapsed time" and "Do NOT just say bentornato without mentioning time" — this distinguishes between return acknowledgments (bentornato) and actual time-gap acknowledgments (è passato un po').

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/returning-policies.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All 2671+ tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/policies/active-stale.ts tests/evals/returning-policies.test.ts
git commit -m "fix: make stale greeting time acknowledgment mandatory (MUST, not suggestion)"
```

---

### Task 3: Extend IMMEDIATE_EXECUTION_RULE for proposal confirmations

**Context:** At UAT msg #25, the agent proposed adding skills and removing activities. User replied "Perfetto, aggiorna tutto e pubblica." The agent asked for confirmation AGAIN instead of executing. The `IMMEDIATE_EXECUTION_RULE` says "when you have enough info" — but the agent treated its own proposal as insufficient info. Need to clarify: when the user confirms your own *concrete, fully specified* proposal, you already HAVE the info. The rule must preserve the sufficiency gate for vague approvals.

**Files:**
- Modify: `src/lib/agent/policies/shared-rules.ts:43-44`
- Modify: `tests/evals/shared-rules.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/evals/shared-rules.test.ts`, first add `IMMEDIATE_EXECUTION_RULE` to the import:

```typescript
import { sharedBehavioralRules, IMMEDIATE_EXECUTION_RULE } from "@/lib/agent/policies/shared-rules";
```

Then add the test after the existing "2-STRIKE" test:

```typescript
it("immediate execution covers user confirming agent's concrete proposal", () => {
  const rule = IMMEDIATE_EXECUTION_RULE;
  // New clause: proposal confirmation triggers execution
  expect(rule).toMatch(/confirm|approv/i);
  expect(rule).toMatch(/your.*(suggestion|proposal)|you.*(proposed|suggested)/i);
  // Original guards preserved: "concrete" and "enough info" still present
  expect(rule).toMatch(/concrete/i);
  expect(rule).toMatch(/enough info/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/shared-rules.test.ts`
Expected: FAIL — "confirm" and "proposal" not in current IMMEDIATE_EXECUTION_RULE text

- [ ] **Step 3: Update the rule text**

In `src/lib/agent/policies/shared-rules.ts`, replace lines 43-44:

From:
```typescript
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan.`;
```

To:
```typescript
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan. This includes when the user confirms your own concrete suggestion/proposal — you already proposed the specific edits, so execute them immediately.`;
```

Note: "concrete suggestion/proposal" preserves the sufficiency gate — vague approvals of vague suggestions don't qualify. Only when the agent has already specified the exact edits and the user says "yes, do it." The test verifies both "concrete" and "enough info" are still in the rule text.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/shared-rules.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All 2671+ tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/policies/shared-rules.ts tests/evals/shared-rules.test.ts
git commit -m "fix: IMMEDIATE_EXECUTION_RULE covers user confirming agent's concrete proposal"
```

---

### Task 4: Update UAT extended script — BUG-7 detector, stale greeting penalty, execution check

**Context:** Three UAT script improvements:
1. BUG-7 detector: Dual-signal approach with counter. WARN for blocked attempts (behavioral visibility — prompt fix should reduce these over time, tracked via `STATE.blockedIdDeleteAttempts`). FAIL (scored) only when the safety net FAILED. UUID limitation: see Accepted Limitations section above.
2. Stale greeting time-gap check: WARN→FAIL with -5 penalty. Regex restricted to explicit elapsed-time phrases only — return markers like "bentornato" do NOT pass without a time reference.
3. Execution check for `return_publish` turn: single combined metric — "did the agent complete the publish flow on the confirmation turn?" Counts `request_publish` or any write tool as PASS. `publish_preflight` (any result) also counts — it's the required first step of the publish flow. No separate "Re-publish (phase 2)" check to avoid double-penalizing.

**Files:**
- Modify: `scripts/uat-extended.mjs:385-392` (BUG-7 detector)
- Modify: `scripts/uat-extended.mjs:432-532` (runConversation: add tool tracking for return_publish)
- Modify: `scripts/uat-extended.mjs:684` (stale greeting → FAIL)
- Modify: `scripts/uat-extended.mjs:700-703` (add execution check after re-publish check)
- Modify: `scripts/uat-extended.mjs:728-743` (score formula: add penalties)

- [ ] **Step 1: Update BUG-7 detector to dual-signal with counter**

Replace lines 385-392 in `scripts/uat-extended.mjs`:

From:
```javascript
  // BUG-7: batch_facts for identity delete
  for (const tr of tools) {
    const ops = tr.toolName === "batch_facts" ? (tr.args?.operations || []) : [];
    const idDeletes = ops.filter(op => op.action === "delete" && op.factId?.startsWith("identity/"));
    if (idDeletes.length > 0) {
      anomalies.push({ msg: msgNum, phase: currentPhase, type: "BUG-7_BATCH_IDENTITY_DELETE" });
      console.log("  !! BUG-7: batch_facts used for identity delete!");
    }
  }
```

To:
```javascript
  // BUG-7: batch_facts with identity delete — dual-signal
  // WARN = agent tried but was correctly blocked (prompt fix reduces these over time)
  // FAIL = safety net failed, identity delete went through (real regression)
  // IDENTITY_DELETE_BLOCKED fires for both category/key AND UUID formats
  // (unit-tested in bulk-delete-confirmation.test.ts:497,529).
  // UUID limitation: see Accepted Limitations in plan doc.
  for (const tr of tools) {
    if (tr.toolName === "batch_facts") {
      const ops = tr.args?.operations || [];
      const hasIdDeleteByKey = ops.some(op => op.action === "delete" && op.factId?.startsWith("identity/"));
      const wasBlocked = tr.result?.code === "IDENTITY_DELETE_BLOCKED";
      if (wasBlocked) {
        STATE.blockedIdDeleteAttempts = (STATE.blockedIdDeleteAttempts || 0) + 1;
        console.log("  [WARN] batch_facts attempted identity delete but was correctly blocked");
      } else if (hasIdDeleteByKey && tr.result?.success === true && (tr.result?.deleted || 0) > 0) {
        anomalies.push({ msg: msgNum, phase: currentPhase, type: "BUG-7_BATCH_IDENTITY_DELETE" });
        console.log("  !! BUG-7: batch_facts SUCCEEDED with identity delete (safety net failed)!");
      }
    }
  }
```

- [ ] **Step 2: Add return_publish tool tracking in runConversation**

In the conversation loop in `runConversation` (around line 491, after `checkAnomalies`), add:

```javascript
    // Track return_publish tool names for Phase 2 execution verification
    if (phaseLabel === "phase2" && topicUsed === "return_publish") {
      STATE.returnPublishTools = (res.toolResults || []).map(tr => tr.toolName);
    }
```

This stores tool names only (3 lines). Sufficient for the execution check.

- [ ] **Step 3: Tighten stale greeting regex and change WARN to FAIL**

At line 684, replace:

From:
```javascript
  const ackedTimeGap = /un po'|tempo|settiman|giorn|while|tornato|rivedert|bentornat/i.test(phase2FirstAgent);
  console.log(`Stale greeting (time ack):      ${ackedTimeGap ? "PASS" : "WARN — no time gap acknowledgment"}`);
```

To:
```javascript
  // Explicit elapsed-time phrases only. "bentornato" alone does NOT pass — must reference time.
  const ackedTimeGap = /da un po'|è passato|sono passat|been a while|it's been|da qualche|da tanto|quanto tempo|(?:da|dopo|sono passat[ioe]?\s+\w*\s*)(?:giorni?|settiman[ae]?)/i.test(phase2FirstAgent);
  console.log(`Stale greeting (time ack):      ${ackedTimeGap ? "PASS" : "FAIL — no time gap acknowledgment"}`);
```

Regex — explicit elapsed-time markers only:
- `da un po'` — "for a bit [of time]"
- `è passato` / `sono passat` — "has passed" / "have passed"
- `been a while` / `it's been` — English gap phrases
- `da qualche` / `da tanto` — "for some [time]" / "for a long time"
- `quanto tempo` — "how long!" (time-gap exclamation)
- `(?:da|dopo|sono passat[ioe]?\s+\w*\s*)(?:giorni?|settiman[ae]?)` — "days/weeks" only with elapsed-time context

Explicitly excluded: bare `bentornato`, `tornato`, `rivederti`, bare `giorni`, bare `settimane`. These are return markers, not time-gap acknowledgments.

- [ ] **Step 4: Add return_publish execution check**

After the `Return: Re-publish called` check (around line 702), add:

```javascript
  // Execution check: did the agent act on the confirmation turn?
  // Any tool in the publish flow (preflight, write, publish) counts as immediate execution.
  // publish_preflight is the required first step — calling it means the agent started acting.
  const EXEC_TOOLS = new Set(["create_fact", "delete_fact", "batch_facts", "generate_page", "request_publish", "publish_preflight"]);
  const hadExecTools = (STATE.returnPublishTools || []).some(t => EXEC_TOOLS.has(t));
  console.log(`Return: Immediate execution:    ${hadExecTools ? "PASS" : "WARN — agent didn't execute on confirmation turn"}`);
```

Note: This is a single combined metric. `publish_preflight` counts unconditionally because calling it means the agent started acting on the confirmation instead of stalling. Whether the agent completed the full publish flow is already checked by the existing `publishPass` metric (which uses global `requestPublishCount`). No separate "Re-publish (phase 2)" check — avoids double-penalizing.

- [ ] **Step 5: Add BUG-7 blocked attempts summary to FINAL REPORT**

After the existing BUG-7 line in the FINAL REPORT section, add:

```javascript
  if (STATE.blockedIdDeleteAttempts > 0) {
    console.log(`BUG-7 blocked attempts:         WARN (${STATE.blockedIdDeleteAttempts} blocked by code)`);
  }
```

- [ ] **Step 6: Update score formula with new penalties**

In the score formula at line 728-743, add penalties for `ackedTimeGap` and `hadExecTools`:

From:
```javascript
  const score = Math.max(0, 100
    - (phaseStats.phase1.errors + phaseStats.phase2.errors) * 5
    - bug6.length * 20
    - bug7.length * 20
    - unbacked.length * 3
    - nonsense.length * 5
    - passive.length * 2
    - (fix1Pass ? 0 : 10)
    - (publishPass ? 0 : 10)
    - (batchDeletePass ? 0 : 10)
    - (nameCorrect ? 0 : 5)
    - (usedName ? 0 : 5)
    - (condeNast ? 0 : 5)
    - (bouldering ? 0 : 5)
    - (bolognaDark ? 0 : 5)
  );
```

To:
```javascript
  const score = Math.max(0, 100
    - (phaseStats.phase1.errors + phaseStats.phase2.errors) * 5
    - bug6.length * 20
    - bug7.length * 20
    - unbacked.length * 3
    - nonsense.length * 5
    - passive.length * 2
    - (fix1Pass ? 0 : 10)
    - (publishPass ? 0 : 10)
    - (batchDeletePass ? 0 : 10)
    - (nameCorrect ? 0 : 5)
    - (usedName ? 0 : 5)
    - (ackedTimeGap ? 0 : 5)
    - (hadExecTools ? 0 : 5)
    - (condeNast ? 0 : 5)
    - (bouldering ? 0 : 5)
    - (bolognaDark ? 0 : 5)
  );
```

- [ ] **Step 7: Verify script parses**

Run: `node --check scripts/uat-extended.mjs`
Expected: no output (clean parse)

- [ ] **Step 8: Commit**

```bash
git add scripts/uat-extended.mjs
git commit -m "fix: UAT BUG-7 dual-signal with counter, stale greeting scored, execution check"
```

---

### Task 5: Clean re-run UAT to verify all fixes

- [ ] **Step 1: Stop dev server and reset DB**

```bash
kill $(lsof -ti:3000) 2>/dev/null; sleep 2
./scripts/uat-reset-db.sh
```

- [ ] **Step 2: Restart dev server**

```bash
npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/invite
# Expected: 405 (server ready)
```

- [ ] **Step 3: Run the extended UAT**

```bash
UAT_DELAY_MS=10000 node scripts/uat-extended.mjs 2>&1 | tee /tmp/uat-marco/uat-v2-output.log
```

- [ ] **Step 4: Verify results**

Expected in FINAL REPORT:
- `BUG-7 (batch identity): PASS` — no safety-net failures
- `BUG-7 blocked attempts: WARN (N blocked by code)` — if agent still tries, shows count
- `Stale greeting (time ack): PASS` — agent references elapsed time (likely but not guaranteed)
- `Return: Immediate execution: PASS` — agent started executing on confirmation turn
- All other checks: PASS or WARN (not FAIL)
- Score: ≥90/100

Note: Stale greeting and immediate execution fixes are prompt-level — they increase the probability of correct behavior but cannot guarantee it deterministically. The UAT will correctly score non-compliance as a penalty, which is the desired behavior.
