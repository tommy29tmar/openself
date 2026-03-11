# UAT v3b Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 4 issues found in UAT v3b: prompt clarification limit not enforced (FIX-1), and 3 UAT script bugs (confirmation regex, state machine stuck, project counter inflated).

**Architecture:** Two independent workstreams — (1) strengthen the shared-rules prompt so the LLM stops re-asking after 2 attempts, (2) fix the UAT script's state machine and tracking logic so it correctly simulates a user and doesn't get stuck in confirmation loops.

**Tech Stack:** TypeScript (prompt), Vitest (tests), Node.js ESM (UAT script)

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/lib/agent/policies/shared-rules.ts` | Universal behavioral rules prompt | Modify: strengthen clarification limit wording |
| `tests/evals/shared-rules.test.ts` | Eval tests for shared-rules | Modify: add test for "2-STRIKE" keyword |
| `/tmp/uat-chiara/chat-agent-v2.mjs` | UAT script (canonical copy) | Modify: fix 3 bugs + fix BUG-6/7 detectors |
| `scripts/uat-chat-agent-v3.mjs` | UAT script (project copy for execution) | Overwrite: copy from /tmp after edits |

---

## Shared Helpers

Add these after the `detectTopic`/`consumeInfo` helpers (around line 77) in the UAT script:

```javascript
/** Extract only question sentences from text (chunks ending with "?") */
function questionSentences(text) {
  return text.match(/[^.!?]*\?/g) ?? [];
}

/** Check if any question sentence matches a keyword regex */
function hasQuestionWith(text, re) {
  return questionSentences(text).some(s => re.test(s));
}

/**
 * Check if an agent message is asking for delete confirmation.
 * Message-level check: the FULL message must contain delete context
 * (anywhere) AND have a confirmation/proceed question sentence (anywhere).
 * This handles the common pattern: "Sto per togliere: Yoga, Ceramica.
 * Confermi tutto?" where the deletion list and confirmation question
 * are in different sentences.
 */
function isDeleteConfirmPrompt(text) {
  const hasDeleteContext = /elimin\w*|cancell\w*|rimuov\w*|toglie\w*|toglio|tolgo/i.test(text);
  const hasConfirmQuestion = hasQuestionWith(text, /conferm\w*|sicur\w*|proced\w*|vuoi/i);
  return hasDeleteContext && hasConfirmQuestion;
}
```

---

## Chunk 1: All Tasks

### Task 1: Strengthen clarification limit prompt (FIX-1)

**Context:** The current shared-rules.ts tells the agent "Re-ask the SAME question exactly ONCE more — then STOP" and "NEVER ask the same clarification a 3rd time." Despite this, in UAT v3b the agent asked about projects 3 times (msgs #3, #4, #5). The fix: use a numbered "2-STRIKE" metaphor that's unambiguous.

**Files:**
- Modify: `src/lib/agent/policies/shared-rules.ts:17-23`
- Modify: `tests/evals/shared-rules.test.ts:36-40`

- [ ] **Step 1: Write the failing test**

In `tests/evals/shared-rules.test.ts`, replace the existing "defines clarification expiry" test (line 36-40) with:

```typescript
it("defines clarification expiry with 2-STRIKE rule", () => {
  expect(rules).toMatch(/clarification/i);
  expect(rules).toMatch(/2-STRIKE/);
  expect(rules).toMatch(/strike 1.*strike 2/is);
  expect(rules).toMatch(/NEVER.*3rd/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/shared-rules.test.ts`
Expected: FAIL — "2-STRIKE" not found in current text

- [ ] **Step 3: Update the prompt text**

Replace lines 17-23 of `src/lib/agent/policies/shared-rules.ts` with:

```typescript
- 2-STRIKE CLARIFICATION RULE: If you ask a question and the user replies with
  NEW information on a DIFFERENT topic instead of answering, this is a deflection.
  Record the new info immediately. You get exactly 2 strikes total per topic:
  Strike 1 = your first question about that topic.
  Strike 2 = you re-ask the same topic ONE more time.
  After strike 2, if the user still deflects, that topic is CLOSED for this
  clarification attempt. NEVER ask about the same topic a 3rd time in the same
  episode. Do NOT rephrase, reframe, or sneak it into a follow-up. Drop it and
  move on with available facts. (If the USER voluntarily reopens the topic later,
  you may engage — but you do not initiate.)
  This applies everywhere — including first-visit cluster exploration. The initial
  cluster question counts as strike 1. Missing optional details do NOT block
  fact creation or page generation.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/shared-rules.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All 2658+ tests pass (the prompt change is text-only, no logic change)

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/policies/shared-rules.ts tests/evals/shared-rules.test.ts
git commit -m "fix: strengthen clarification limit with 2-STRIKE rule

The agent was asking about the same topic 3 times despite the rule saying
'ONCE more'. The new 2-STRIKE metaphor makes counting unambiguous and
explicitly includes first-visit cluster exploration in the count.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Fix UAT script — helpers, constants, and confirmation detection

**Context:** The multi_delete phase regex matches agent *statements*. The fix: add question extraction helpers, shared regex constants, and the `isDeleteConfirmPrompt` message-level checker.

**Files:**
- Modify: `/tmp/uat-chiara/chat-agent-v2.mjs` — add helpers (after line 77), add constants (after line 71)

- [ ] **Step 1: Add shared regex constant after DETECTORS array**

After the DETECTORS array (around line 71, after `detectTopic` and `consumeInfo` functions), add:

```javascript
// Shared project-topic regex — used for topic detection AND FIX-1 tracking
const PROJECT_RE = DETECTORS.find(d => d.topic === "projects").re;
```

- [ ] **Step 2: Add the helper functions**

After the `PROJECT_RE` constant, add all three helpers from the "Shared Helpers" section above:
- `questionSentences(text)`
- `hasQuestionWith(text, re)`
- `isDeleteConfirmPrompt(text)`

- [ ] **Step 3: Verify helpers with test cases**

```bash
node -e "
function questionSentences(text) { return text.match(/[^.!?]*\?/g) ?? []; }
function hasQuestionWith(text, re) { return questionSentences(text).some(s => re.test(s)); }
function isDeleteConfirmPrompt(text) {
  const hasDeleteContext = /elimin\w*|cancell\w*|rimuov\w*|toglie\w*|toglio|tolgo/i.test(text);
  const hasConfirmQuestion = hasQuestionWith(text, /conferm\w*|sicur\w*|proced\w*|vuoi/i);
  return hasDeleteContext && hasConfirmQuestion;
}
// Multi-sentence: deletion list + confirmation question
console.log('List+Q:', isDeleteConfirmPrompt('Sto per togliere: Yoga, Ceramica, Cucina. Confermi tutto?'));     // true
// Single sentence with both
console.log('Single:', isDeleteConfirmPrompt('Confermi che vuoi eliminare tutto?'));                             // true
// Proceed variant
console.log('Procedo:', isDeleteConfirmPrompt('Procedo con le eliminazioni?'));                                  // true
// Statement only
console.log('Statement:', isDeleteConfirmPrompt('non c è nulla da eliminare'));                                  // false
// Publish confirmation (no delete context)
console.log('Publish:', isDeleteConfirmPrompt('Confermi la pubblicazione?'));                                    // false
// Generic proceed (no delete context)
console.log('Generic:', isDeleteConfirmPrompt('Come vuoi procedere?'));                                          // false
// Delete context but no question
console.log('NoQ:', isDeleteConfirmPrompt('Ho rimosso yoga e ceramica.'));                                       // false
"
```
Expected: true, true, true, false, false, false, false

---

### Task 3: Fix UAT script — state machine, BUG-6 (renamed), BUG-7

**Context:** Three fixes in the state machine and anomaly detection:
1. State machine: advance after 1 confirmation (no infinite loop)
2. BUG-6: rename from "identity loop" to "delete confirm loop" + add agent-side detection
3. BUG-7: fix to use `args.operations` (not `args.deletes`)

**Files:**
- Modify: `/tmp/uat-chiara/chat-agent-v2.mjs:103-115` (STATE), `206-218` (multi_delete), `325-360` (anomaly checks), `526-534` (report labels)

- [ ] **Step 1: Add confirmsSent and justConfirmedDelete to STATE**

In the STATE object (around line 103), add:
```javascript
confirmsSent: 0,
justConfirmedDelete: false,
```

- [ ] **Step 2: Update multi_delete handler**

Replace the multi_delete handler (lines 206-218) with:

```javascript
  // ── MULTI DELETE ──
  if (STATE.phase === "multi_delete") {
    if (MULTI_DELETIONS.length > 0) {
      return { text: MULTI_DELETIONS.shift(), topic: "multi_delete" };
    }
    // After 1 confirmation sent, advance regardless
    if (STATE.confirmsSent > 0) {
      STATE.multiDeleteDone = true;
      STATE.phase = "post_publish_add";
      return { text: "Perfetto, grazie!", topic: "transition" };
    }
    // Confirm if agent asks for delete confirmation
    if (isDeleteConfirmPrompt(agentText)) {
      STATE.confirmsSent++;
      STATE.justConfirmedDelete = true;
      STATE.confirmPending = false;
      return { text: "Si, confermo! Elimina tutte le attivita che ho detto.", topic: "confirm_delete" };
    }
    STATE.multiDeleteDone = true;
    STATE.phase = "post_publish_add";
    return { text: "Perfetto, grazie!", topic: "transition" };
  }
```

- [ ] **Step 3: Fix BUG-7 check to use args.operations**

In `checkAnomalies`, replace the BUG-7 check (lines ~330-338):

From:
```javascript
  // BUG-7: batch_facts for identity delete
  for (const tr of tools) {
    if (tr.toolName === "batch_facts" && tr.args?.deletes?.length > 0) {
      const idDeletes = tr.args.deletes.filter(d => d.factId?.startsWith("identity/"));
      if (idDeletes.length > 0) {
        anomalies.push({ msg: msgNum, type: "BUG-7_BATCH_IDENTITY_DELETE" });
        console.log("  !! BUG-7: batch_facts used for identity delete!");
      }
    }
  }
```

To:
```javascript
  // BUG-7: batch_facts for identity delete (correct schema: args.operations)
  for (const tr of tools) {
    const ops = tr.toolName === "batch_facts" ? (tr.args?.operations || []) : [];
    const idDeletes = ops.filter(op => op.action === "delete" && op.factId?.startsWith("identity/"));
    if (idDeletes.length > 0) {
      anomalies.push({ msg: msgNum, type: "BUG-7_BATCH_IDENTITY_DELETE" });
      console.log("  !! BUG-7: batch_facts used for identity delete!");
    }
  }
```

- [ ] **Step 4: Add BUG-6 agent-side loop detection**

After the BUG-7 check, add:

```javascript
  // BUG-6: Agent asks for delete confirmation AFTER user already confirmed
  if (STATE.justConfirmedDelete) {
    STATE.justConfirmedDelete = false; // consume the one-turn flag
    if (isDeleteConfirmPrompt(text)) {
      anomalies.push({ msg: msgNum, type: "BUG-6_DELETE_CONFIRM_LOOP" });
      console.log("  !! BUG-6: Agent re-asked for delete confirmation after user confirmed!");
    }
  }
```

- [ ] **Step 5: Update report labels**

In the final report section (around line 526-534), update:

From:
```javascript
const bug6 = anomalies.filter(a => a.type === "BUG-6_INFINITE_CONFIRM_LOOP");
```
```javascript
console.log(`BUG-6 (identity loop):          ${bug6.length === 0 ? "PASS" : "FAIL"}`);
```

To:
```javascript
const bug6 = anomalies.filter(a => a.type === "BUG-6_DELETE_CONFIRM_LOOP");
```
```javascript
console.log(`BUG-6 (delete confirm loop):    ${bug6.length === 0 ? "PASS" : "FAIL"}`);
```

---

### Task 4: Fix UAT script — project ask counter (question-only, no phase gate)

**Context:** The project ask counter uses a regex that counts agent acknowledgments as asks. The fix: reuse the DETECTORS regex and only count question sentences. NO phase gate — the 2-STRIKE rule applies everywhere (consistent with Task 1 prompt wording).

**Files:**
- Modify: `/tmp/uat-chiara/chat-agent-v2.mjs:126-130`

- [ ] **Step 1: Replace the project tracking block**

Change lines 126-130 from:
```javascript
  // Track repeated project questions (FIX-1 verification)
  if (/progett|orgoglio|soddisfatt|successo|campagna|caso.+success|risultato/i.test(agentText)) {
    STATE.projectAskCount++;
    STATE.lastAgentQuestion = "projects";
  }
```
to:
```javascript
  // Track repeated project QUESTIONS only (FIX-1 verification)
  // Uses shared PROJECT_RE + questionSentences — only counts questions, not acknowledgments
  // No phase gate: 2-STRIKE rule applies everywhere (consistent with shared-rules.ts)
  if (hasQuestionWith(agentText, PROJECT_RE)) {
    STATE.projectAskCount++;
    STATE.lastAgentQuestion = "projects";
  }
```

---

### Task 5: Copy UAT script and verify

- [ ] **Step 1: Copy the fixed script to project directory**

```bash
cp /tmp/uat-chiara/chat-agent-v2.mjs scripts/uat-chat-agent-v3.mjs
```

- [ ] **Step 2: Verify the script parses without errors**

```bash
node --check scripts/uat-chat-agent-v3.mjs
```
Expected: no output (clean parse)

- [ ] **Step 3: Commit UAT script fixes**

```bash
git add scripts/uat-chat-agent-v3.mjs
git commit -m "fix: UAT script confirmation detection, state machine, and project counter

1. questionSentences()/hasQuestionWith()/isDeleteConfirmPrompt() helpers
2. isDeleteConfirmPrompt: message-level check (delete context + confirm question)
3. State machine: advance after 1 confirmation sent (no infinite loop)
4. Project counter: question-sentence filter, reuses DETECTORS regex
5. BUG-6: renamed to 'delete confirm loop', agent-side one-turn detection
6. BUG-7: fixed to use args.operations (not args.deletes)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Clean re-run UAT to verify all fixes

- [ ] **Step 1: Stop dev server**

```bash
kill $(lsof -ti:3000) 2>/dev/null
sleep 2
```

- [ ] **Step 2: Reset DB using the existing UAT reset script**

```bash
./scripts/uat-reset-db.sh
```

- [ ] **Step 3: Restart dev server**

```bash
npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/invite
# Expected: 405 (POST endpoint, GET returns 405 = server is ready)
```

- [ ] **Step 4: Run the UAT**

```bash
node scripts/uat-chat-agent-v3.mjs 2>&1 | tee /tmp/uat-chiara/uat-v4-output.log
```

- [ ] **Step 5: Verify results**

Expected in FINAL REPORT:
- `FIX-1 (clarification limit): PASS (≤2)` — agent asks ≤2 times about projects
- `FIX-2 (auto-publish): PASS` — request_publish called
- `BATCH DELETE: PASS` — all 3 facts removed
- `BUG-6 (delete confirm loop): PASS` — no agent re-ask after confirmation
- `BUG-7 (batch identity): PASS`
- Total messages: ≤25 (no confirmation loops eating up turns)
- Score: ≥90/100
