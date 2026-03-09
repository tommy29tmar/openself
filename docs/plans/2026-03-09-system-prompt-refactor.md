# System Prompt Structural Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate 4 P1 contradictions, 3 P2 gaps, and 4 P3 redundancies in the agent system prompt by establishing single-source-of-truth rules and removing cross-block conflicts.

**Architecture:** Two-layer prompt (universal shared rules + state-specific journey policies). Zero prompt-level conditionals. TS string constants for semi-universal rules interpolated at build time.

**Tech Stack:** TypeScript, Vitest, Vercel AI SDK prompt composition

**Design doc:** `docs/plans/2026-03-09-system-prompt-refactor-design.md`

**Codebase context:**
- `src/lib/agent/prompts.ts` — Main prompt builder. Contains CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY, FACT_SCHEMA_REFERENCE, DATA_MODEL_REFERENCE, OUTPUT_CONTRACT consts. `buildSystemPrompt()` composes all blocks. `buildMinimalSchemaForEditing()` injects editing schema for active states.
- `src/lib/agent/context.ts` — Context assembler. `assembleContext()` builds system prompt + context blocks (facts via `getActiveFacts()`, soul, summary, memories, conflicts, pageState). Synthesises first_visit bootstrap when no bootstrap provided (line 354-374).
- `src/lib/agent/policies/` — Journey policies (first-visit.ts, active-fresh.ts, active-stale.ts, draft-ready.ts, returning-no-page.ts, blocked.ts), turn-management.ts, memory-directives.ts, planning-protocol.ts, undo-awareness.ts, index.ts (expertise calibration).
- `tests/evals/` — Test suite (~2593 tests across 225 files).
- Block composition order (design doc, lines 24-39): CORE_CHARTER → SAFETY_POLICY → TOOL_POLICY → [schema reference] → DATA_MODEL_REFERENCE → OUTPUT_CONTRACT → journeyPolicy → [situationDirectives] → expertiseCalibration → turnManagementRules → **sharedBehavioralRules()** → memoryUsageDirectives → planningProtocol → undoAwarenessPolicy.

---

### Task 1: Create `shared-rules.ts` — Universal Behavioral Rules

**Files:**
- Create: `src/lib/agent/policies/shared-rules.ts`
- Create: `tests/evals/shared-rules.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/evals/shared-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  sharedBehavioralRules,
  IMMEDIATE_EXECUTION_RULE,
} from "@/lib/agent/policies/shared-rules";

describe("sharedBehavioralRules", () => {
  const rules = sharedBehavioralRules();

  it("returns a non-empty string", () => {
    expect(typeof rules).toBe("string");
    expect(rules.length).toBeGreaterThan(100);
  });

  it("contains BEHAVIORAL RULES header", () => {
    expect(rules).toContain("BEHAVIORAL RULES");
  });

  it("limits to one question per turn", () => {
    expect(rules).toMatch(/one\s*question\s*per\s*turn/i);
  });

  it("bans passive closings with specific phrases", () => {
    expect(rules).toMatch(/let me know if you need anything/i);
    expect(rules).toMatch(/feel free to ask/i);
    expect(rules).toMatch(/is there anything else/i);
    expect(rules).toMatch(/just let me know/i);
  });

  it("does NOT duplicate response-length calibration (lives in CORE_CHARTER)", () => {
    expect(rules).not.toMatch(/response.*length/i);
    expect(rules).not.toMatch(/1.*2.*sentence/i);
  });

  it("defines clarification expiry", () => {
    expect(rules).toMatch(/clarification/i);
    expect(rules).toMatch(/at most.*once more|one more time/i);
    expect(rules).toMatch(/proceed.*available\s*facts/i);
  });

  it("contains ZERO conditional branching (no if/when state mentions)", () => {
    expect(rules).not.toMatch(/\bif\s+(in\s+)?first_visit\b/i);
    expect(rules).not.toMatch(/\bif\s+(in\s+)?steady.?state\b/i);
    expect(rules).not.toMatch(/\bif\s+(in\s+)?onboarding\b/i);
    expect(rules).not.toMatch(/\bexception.*first_visit\b/i);
    expect(rules).not.toMatch(/\bexception.*onboarding\b/i);
    expect(rules).not.toMatch(/\bexception.*first\s*page/i);
  });

  it("does NOT duplicate response-length exception from CORE_CHARTER", () => {
    expect(rules).not.toMatch(/first.*page.*generation.*longer/i);
  });
});

describe("IMMEDIATE_EXECUTION_RULE", () => {
  it("is a non-empty string", () => {
    expect(typeof IMMEDIATE_EXECUTION_RULE).toBe("string");
    expect(IMMEDIATE_EXECUTION_RULE.length).toBeGreaterThan(20);
  });

  it("mentions executing tool calls in THIS turn", () => {
    expect(IMMEDIATE_EXECUTION_RULE).toMatch(/this\s*turn/i);
  });
});

// STRUCTURAL_EXPLANATION_RULE removed — planning-protocol is the single source.
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/shared-rules.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/agent/policies/shared-rules.ts
/**
 * Universal behavioral rules — apply to ALL journey states without exception.
 *
 * INVARIANT: This block must contain ZERO conditional branching.
 * If a rule needs an exception for any state, it does NOT belong here.
 * Use TS string constants (below) for semi-universal rules instead.
 */

export function sharedBehavioralRules(): string {
  return `BEHAVIORAL RULES:
- Ask at most ONE question per turn. Never stack questions.
- NEVER end a turn with passive deferrals: "let me know if you need anything",
  "feel free to ask", "I'm here if you need me", "is there anything else?",
  "just let me know". End with a concrete anchor instead (a completion confirmation,
  a suggestion, or a direct question).
- If you asked for a clarification and the user replies with NEW information
  instead of answering: record the new info immediately. Ask the same
  clarification at most once more. Then proceed with available facts.
  Missing optional dates, levels, or descriptions do NOT block fact creation
  or page generation.`;
}
// Note: Response length calibration lives in CORE_CHARTER (RESPONSE LENGTH section).
// Do NOT add it here — single source of truth.

/**
 * Semi-universal rule: execute concrete edits immediately.
 * Interpolated into: active-fresh, active-stale, draft-ready, returning-no-page.
 * NOT used in: first-visit (has its own phased flow), blocked (no tools).
 *
 * This is the SINGLE SOURCE OF TRUTH for same-turn execution timing.
 * planning-protocol SIMPLE section says "act immediately" but does NOT
 * duplicate the "THIS turn" timing directive (which lives here).
 */
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan.`;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/shared-rules.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/shared-rules.ts tests/evals/shared-rules.test.ts
git commit -m "feat: add shared-rules.ts with universal behavioral rules and TS constants"
```

---

### Task 2: Wire `sharedBehavioralRules` into `buildSystemPrompt`

**Rationale:** Wire the shared block BEFORE any policy slimming (Tasks 5-9) to avoid a regression window where the assembled prompt has lost duplicated rules but the shared replacement isn't composed yet.

**Files:**
- Modify: `src/lib/agent/prompts.ts` (import + composition)
- Modify: `tests/evals/build-system-prompt.test.ts` (block count + ordering + mock)

**Step 1: Update tests**

In `tests/evals/build-system-prompt.test.ts`:

Add mock at top (after existing mocks):
```typescript
vi.mock("@/lib/agent/policies/shared-rules", () => ({
  sharedBehavioralRules: vi.fn(() => "SHARED_BEHAVIORAL_RULES_BLOCK"),
}));
```

Add composition test:
```typescript
it("includes shared behavioral rules block", () => {
  const result = buildSystemPrompt(makeBootstrap());
  expect(result).toContain("SHARED_BEHAVIORAL_RULES_BLOCK");
});
```

Add ordering tests matching the design doc order (sharedBehavioralRules comes AFTER turnManagement, BEFORE memoryDirectives):
```typescript
it("shared behavioral rules come after turn management", () => {
  const result = buildSystemPrompt(makeBootstrap());
  const turnIdx = result.indexOf("TURN_MANAGEMENT_RULES_BLOCK");
  const sharedIdx = result.indexOf("SHARED_BEHAVIORAL_RULES_BLOCK");
  expect(turnIdx).toBeGreaterThan(-1);
  expect(sharedIdx).toBeGreaterThan(turnIdx);
});

it("shared behavioral rules come before memory directives", () => {
  const result = buildSystemPrompt(makeBootstrap());
  const sharedIdx = result.indexOf("SHARED_BEHAVIORAL_RULES_BLOCK");
  const memoryIdx = result.indexOf("MEMORY_USAGE_DIRECTIVES_BLOCK");
  expect(sharedIdx).toBeGreaterThan(-1);
  expect(memoryIdx).toBeGreaterThan(sharedIdx);
});
```

Update block count tests (lines 265-287):
```typescript
it("composition has 13 blocks without situation directives", () => {
  const result = buildSystemPrompt(makeBootstrap());
  const parts = result.split("\n\n---\n\n");
  // [CORE_CHARTER, SAFETY, TOOL, FACT_SCHEMA, DATA_MODEL, OUTPUT,
  //  journeyPolicy, expertiseCalibration, turnManagement,
  //  sharedBehavioralRules, memoryDirectives, planningProtocol, undoAwareness]
  expect(parts.length).toBe(13);
});

it("composition has 14 blocks with situation directives", () => {
  const result = buildSystemPrompt(
    makeBootstrap({
      journeyState: "active_stale",
      situations: ["has_thin_sections"],
      thinSections: ["skills", "projects"],
    }),
  );
  const parts = result.split("\n\n---\n\n");
  expect(parts.length).toBe(14);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/build-system-prompt.test.ts`
Expected: FAIL — block count 12, shared block not found

**Step 3: Wire into `src/lib/agent/prompts.ts`**

Add import:
```typescript
import { sharedBehavioralRules } from "@/lib/agent/policies/shared-rules";
```

In `buildSystemPrompt()`, insert `sharedBehavioralRules()` AFTER `turnManagementRules()` and BEFORE `memoryUsageDirectives()`, matching the design doc order:

```typescript
blocks.push(expertiseCalibration);
blocks.push(turnManagementRules());
blocks.push(sharedBehavioralRules());   // ← NEW, per design doc order
blocks.push(memoryUsageDirectives());
blocks.push(planningProtocol());
blocks.push(undoAwarenessPolicy());
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/build-system-prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/build-system-prompt.test.ts
git commit -m "feat: wire sharedBehavioralRules into buildSystemPrompt composition"
```

---

### Task 3: Fix TOOL_POLICY — Unified Fact Recording + Batch by Op Type + Edit Schema

**Files:**
- Modify: `src/lib/agent/prompts.ts` (TOOL_POLICY const, lines 102-157; buildMinimalSchemaForOnboarding, line 258; buildMinimalSchemaForEditing, line 280)
- Modify: `tests/evals/build-system-prompt.test.ts` (line 224 assertion)
- Modify: `tests/evals/prompt-contracts.test.ts` (new assertion)
- Modify: `tests/evals/schema-mode.test.ts` (line 27 — ONBOARDING_MARKER)
- Modify: `tests/evals/tool-policy-update.test.ts` (lines 75-78 — trust-ledger assertion + shared-rules mock)

**Step 1: Write/update the failing tests**

In `tests/evals/prompt-contracts.test.ts`, add:

```typescript
it("TOOL_POLICY contains unified fact recording rule (single source of truth)", () => {
  expect(src).toMatch(/FACT RECORDING/);
  expect(src).toMatch(/NEVER delay.*accumulate.*across.*turns/i);
  expect(src).toMatch(/3\+.*NEW.*facts.*creates.*only.*batch_facts/i);
  expect(src).toMatch(/updates.*deletes.*identity.*individual\s*tool/i);
});
```

In `tests/evals/schema-mode.test.ts`, change line 27 from:
```typescript
const ONBOARDING_MARKER = "After collecting name + role + 2-3 more facts, call generate_page.";
```
To:
```typescript
const ONBOARDING_MARKER = "After exploring 2-3 topic areas beyond name + role, call generate_page.";
```

In `tests/evals/tool-policy-update.test.ts`:

Add mock for shared-rules at the top (after existing mocks):
```typescript
vi.mock("@/lib/agent/policies/shared-rules", () => ({
  sharedBehavioralRules: vi.fn(() => ""),
}));
```

Replace lines 75-79:
```typescript
it("mentions batch_facts runs sequentially with partial-failure semantics", () => {
  const prompt = buildSystemPrompt(makeBootstrap());
  expect(prompt).toMatch(/batch_facts.*sequential|sequential.*batch_facts/i);
  expect(prompt).toMatch(/one op fails.*earlier.*persist|earlier.*persist/i);
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts tests/evals/schema-mode.test.ts tests/evals/tool-policy-update.test.ts tests/evals/build-system-prompt.test.ts`
Expected: FAIL

**Step 3: Modify TOOL_POLICY in `src/lib/agent/prompts.ts`**

Replace the batch_facts line at ~121:
```
- When the user shares 3 or more facts in one message, prefer batch_facts over multiple create_fact calls. batch_facts runs operations sequentially — if one fails, earlier ones persist. Trust ledger provides undo for the entire batch.
```

With:
```
FACT RECORDING:
- Record facts as you encounter them in the user's message. NEVER delay extraction to accumulate facts across multiple turns. NEVER skip saving a fact because you expect more in the next message.
- For 3+ NEW facts (creates only) from a single message → use batch_facts.
- For updates, deletes, or identity changes → always use individual tool calls (update_fact, delete_fact). Never batch these — they have confirmation gates and different failure semantics.
  (Prompt-level simplification: the code does support single deletes and generic updates in batch_facts, but this guidance steers the LLM toward the safest patterns.)
- batch_facts runs operations sequentially: if one op fails, earlier ones persist. Always check results.
```

Update `buildMinimalSchemaForOnboarding()` at line 258. Replace:
```
After collecting name + role + 2-3 more facts, call generate_page.
```
With:
```
After exploring 2-3 topic areas beyond name + role, call generate_page.
```

Update `buildMinimalSchemaForEditing()` at line 280. Replace:
```
When the user asks for a concrete change and you already have enough info, execute it in this turn instead of only describing the plan.
```
With:
```
When the user asks for a concrete change and you already have enough info, act immediately instead of only describing the plan.
```
Rationale: the specific "THIS turn" timing directive lives in `IMMEDIATE_EXECUTION_RULE` (interpolated into journey policies). The edit schema uses softer "act immediately" language to avoid 3 drift-prone sources of the same directive.

**Step 4: Update test assertion in `tests/evals/build-system-prompt.test.ts`**

Line 224, change:
```typescript
expect(result).toContain("After collecting name + role + 2-3 more facts");
```
To:
```typescript
expect(result).toContain("After exploring 2-3 topic areas beyond name + role");
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/evals/prompt-contracts.test.ts tests/evals/build-system-prompt.test.ts tests/evals/schema-mode.test.ts tests/evals/tool-policy-update.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/agent/prompts.ts tests/evals/prompt-contracts.test.ts \
  tests/evals/build-system-prompt.test.ts tests/evals/schema-mode.test.ts \
  tests/evals/tool-policy-update.test.ts
git commit -m "fix: unify fact recording rule in TOOL_POLICY, fix minimal schema bias, deduplicate same-turn directive in edit schema"
```

---

### Task 4: Fix Expertise Calibration — Banned Examples

**Files:**
- Modify: `src/lib/agent/policies/index.ts` (line 78)

**Step 1: Write the failing test**

Add to `tests/evals/build-system-prompt.test.ts`:

```typescript
it("expertise calibration (novice) does NOT use CORE_CHARTER banned words as examples", () => {
  const result = buildSystemPrompt(makeBootstrap({ expertiseLevel: "novice" }));
  const bannedExamples = /acknowledgment.*(?:Capito!|Perfetto!)/i;
  expect(result).not.toMatch(bannedExamples);
  expect(result).toMatch(/Bene\.|Ricevuto\./);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/build-system-prompt.test.ts`
Expected: FAIL — "Capito!" still in novice text

**Step 3: Fix in `src/lib/agent/policies/index.ts`**

Line 78, change:
```
- Do not proactively announce saved facts. A brief acknowledgment is fine ("Capito!", "Perfetto!") but do not enumerate what was saved unprompted.
```
To:
```
- Do not proactively announce saved facts. A brief acknowledgment is fine ("Bene.", "Ricevuto.") but do not enumerate what was saved unprompted.
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/evals/build-system-prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/index.ts tests/evals/build-system-prompt.test.ts
git commit -m "fix: replace CORE_CHARTER-banned examples in novice expertise calibration"
```

---

### Task 5: Slim `first-visit.ts` — Remove Duplicated Rules

**Files:**
- Modify: `src/lib/agent/policies/first-visit.ts`
- Modify: `tests/evals/onboarding-policy.test.ts`
- Modify: `tests/evals/first-visit-policy.test.ts`

**Step 1: Update test assertions for migrated rules**

In `tests/evals/onboarding-policy.test.ts`:

**Line 74** — Update cluster count:
```typescript
it("targets 3 topic clusters", () => {
  expect(policyEn).toMatch(/3\s*(topic\s*)?cluster/i);
});
```

**Lines 96-98** — Remove "requires exactly one question per turn" test (migrated to shared-rules).

**Lines 100-102** — Update exchange cap:
```typescript
it("hard cap at exchange 8", () => {
  expect(policyEn).toMatch(/hard\s*cap.*8|cap.*exchange\s*8/i);
});
```

**Line 37** — Update Phase C trigger assertion. Current: `/2\s*cluster.*done|Phase\s*B.*complete|6-exchange.*cap|6-exchange cap/`. After refactor, Phase B says "3 topic clusters" and "Hard cap: exchange 8", so Phase C triggers change. Update:
```typescript
expect(phaseCBlock).toMatch(/3\s*cluster.*done|Phase\s*B.*complete|8-exchange|hard\s*cap/i);
```

**Lines 129-142** — Replace fact recording tests:
```typescript
describe("fact recording (delegated to TOOL_POLICY)", () => {
  it("does NOT duplicate the immediate fact recording mandate", () => {
    expect(policyEn).not.toMatch(/record.*every.*piece.*information.*fact.*immediately/i);
  });

  it("does NOT duplicate the batch prohibition", () => {
    expect(policyEn).not.toMatch(/do not batch or delay/i);
  });
});
```

**Lines 171-178** — Replace banned patterns:
```typescript
describe("banned patterns (delegated to shared-rules)", () => {
  it("does NOT duplicate passive closing bans", () => {
    expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/onboarding-policy.test.ts tests/evals/first-visit-policy.test.ts`
Expected: FAIL — old assertions still match old text

**Step 3: Modify `src/lib/agent/policies/first-visit.ts`**

Remove from CRITICAL RULES section (line 64-67):
```
- Record EVERY piece of information as a fact IMMEDIATELY via create_fact. Do not batch or delay.
- NEVER end a turn with "let me know if you need anything" or similar passive closings.
- NEVER ask more than one question per turn.
```

Remove from Phase B Rules section (line 38):
```
- Record EVERY piece of information as a fact immediately via create_fact.
```

Update Phase B header (line 25). Change:
```
Target 3 topic clusters, ~2 exchanges each. Total Phase B budget: ~6 exchanges. Hard cap: exchange 8.
```
To:
```
Target 3 topic clusters, ~2 exchanges each. Hard cap: exchange 8.
```

The CRITICAL RULES section becomes:
```
CRITICAL RULES:
- After generating the page, ALWAYS move toward publishing. Never leave the user hanging.
- If the user seems done at any point, generate the page and propose publish.
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/onboarding-policy.test.ts tests/evals/first-visit-policy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/first-visit.ts tests/evals/onboarding-policy.test.ts tests/evals/first-visit-policy.test.ts
git commit -m "refactor: slim first-visit policy, delegate shared rules"
```

---

### Task 6: Slim Returning-User Policies

**Files:**
- Modify: `src/lib/agent/policies/active-fresh.ts`
- Modify: `src/lib/agent/policies/active-stale.ts`
- Modify: `src/lib/agent/policies/draft-ready.ts`
- Modify: `src/lib/agent/policies/returning-no-page.ts`
- Modify: `tests/evals/returning-policies.test.ts`

**Step 1: Update test assertions**

In `tests/evals/returning-policies.test.ts`:

For `returningNoPagePolicy` banned patterns (lines 95-111):
```typescript
describe("banned patterns (delegated to shared-rules)", () => {
  it("does NOT duplicate passive closing bans locally", () => {
    expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
  });

  it("bans fresh interview (policy-specific)", () => {
    expect(policyEn).toMatch(/never.*fresh\s*interview|never.*start.*interview/i);
  });
});
```

For `draftReadyPolicy` (lines 186-202):
```typescript
describe("banned patterns (delegated to shared-rules)", () => {
  it("does NOT duplicate passive closing bans locally", () => {
    expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
  });

  it("bans reopening the interview (policy-specific)", () => {
    expect(policyEn).toMatch(/not.*interview|not.*exploratory|not.*ask.*what.*do/i);
  });

  it("bans proactive section suggestions (policy-specific)", () => {
    expect(policyEn).toMatch(/not.*add.*section.*proactiv|not.*offer.*add/i);
  });
});
```

For `activeFreshPolicy` (lines 286-298):
```typescript
describe("banned patterns (delegated to shared-rules)", () => {
  it("does NOT duplicate passive closing bans locally", () => {
    expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
  });

  it("bans reopening exploration (policy-specific)", () => {
    expect(policyEn).toMatch(/not.*reopen.*explor|not.*ask.*tell.*more/i);
  });
});
```

For `activeFreshPolicy` proportional response test (line 245-246):
```typescript
it("does NOT duplicate response length calibration (canonical source is CORE_CHARTER)", () => {
  expect(policyEn).not.toMatch(/proportional.*response.*length/i);
});
```

For `activeStalePolicy` (lines 382-394):
```typescript
describe("banned patterns (delegated to shared-rules)", () => {
  it("does NOT duplicate passive closing bans locally", () => {
    expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
  });

  it("forbids re-asking known facts (policy-specific)", () => {
    expect(policyEn).toMatch(/never.*re-?ask|never.*ask.*name/i);
  });
});
```

For `blockedPolicy` (lines 450-457) — keep as-is. Blocked has its own unique constraint.

Update execution-in-THIS-turn assertions for `activeFreshPolicy` (line 271-273), `activeStalePolicy` (line 367-369), `draftReadyPolicy` (line 181-183), and `returningNoPagePolicy` — these tests should match the interpolated `IMMEDIATE_EXECUTION_RULE` text:
```typescript
it("requires executing concrete edits in the same turn", () => {
  expect(policyEn).toMatch(/concrete.*edit.*this turn|execute.*tool.*this turn|do not.*respond.*only.*plan/i);
});
```

For `returningNoPagePolicy`, add in `tests/evals/returning-policies.test.ts`:
```typescript
it("includes immediate execution directive via IMMEDIATE_EXECUTION_RULE", () => {
  expect(returningNoPagePolicyEn).toMatch(/concrete.*edit.*this turn|execute.*tool.*this turn|do not.*respond.*only.*plan/i);
});
```

For `activeStalePolicy` "limits fact-gathering to max 6 exchanges" (line 363-365) — moves to turn-management R2:
```typescript
it("does NOT duplicate max exchanges rule locally (now in turn-management R2)", () => {
  expect(policyEn).not.toMatch(/max\s*6\s*exchange.*rule/i);
});
```

Also update any proportional-response tests for `activeStalePolicy` and `draftReadyPolicy` if they exist — flip to "does NOT duplicate" pattern.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/returning-policies.test.ts`
Expected: FAIL — old assertions still match old text

**Step 3: Modify the 4 policy files**

**`active-fresh.ts`** — Add import and interpolate:
```typescript
import { IMMEDIATE_EXECUTION_RULE } from "@/lib/agent/policies/shared-rules";
```

Remove from text:
- "NEVER end a turn with 'let me know if you need anything' or similar passive closings."
- "NEVER ask more than one question per turn."
- "Response length must be proportional to the user's message. Short message = short response."

Replace inline execution rule with `${IMMEDIATE_EXECUTION_RULE}`.

Note: do NOT interpolate STRUCTURAL_EXPLANATION_RULE — planning-protocol's STRUCTURAL section is the single universal source for inspect_page_state/explain/preview guidance.

**`active-stale.ts`** — Same pattern:
- Import `IMMEDIATE_EXECUTION_RULE`
- Remove passive closing ban, one-question rule, response proportion
- Replace inline execution rule with `${IMMEDIATE_EXECUTION_RULE}`
- From the "MAX 6 EXCHANGES RULE" section (lines 44-46): remove ONLY the duplicated 6-exchange cap line (now in turn-management R2). KEEP any stale-specific guidance such as the "after 3 exchanges with updates, offer early regeneration" rule — this is state-specific behavior, not a duplicate

**`draft-ready.ts`** — Same pattern:
- Import `IMMEDIATE_EXECUTION_RULE`
- Remove passive closing ban
- Replace inline execution rule with `${IMMEDIATE_EXECUTION_RULE}`
- Remove clarification-related lines (lines 32-34): "Do NOT repeat the same clarification more than once" and "Optional clarifications must not block progress" — these now live in sharedBehavioralRules()

**`returning-no-page.ts`** — Lighter touch:
- Import `IMMEDIATE_EXECUTION_RULE`
- Remove passive closing ban, one-question rule
- Add `${IMMEDIATE_EXECUTION_RULE}` to fact hygiene section

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/returning-policies.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/active-fresh.ts src/lib/agent/policies/active-stale.ts \
  src/lib/agent/policies/draft-ready.ts src/lib/agent/policies/returning-no-page.ts \
  tests/evals/returning-policies.test.ts
git commit -m "refactor: slim returning-user policies, interpolate shared constants"
```

---

### Task 7: Refactor `turn-management.ts` — Scope R1/R2

**Files:**
- Modify: `src/lib/agent/policies/turn-management.ts`
- Modify: `tests/evals/turn-management.test.ts`

**Step 1: Update test assertions**

In `tests/evals/turn-management.test.ts`:

Update structure test (lines 21-28):
```typescript
it("contains rules R1, R2, and R4", () => {
  expect(rules).toContain("R1");
  expect(rules).toContain("R2");
  expect(rules).toContain("R4");
});

it("does NOT contain removed rules R3, R5, R6", () => {
  expect(rules).not.toMatch(/^R3\b/m);
  expect(rules).not.toMatch(/^R5\b/m);
  expect(rules).not.toMatch(/^R6\b/m);
});
```

Update R1 tests (lines 31-65):
```typescript
describe("R1 — Topic exploration", () => {
  it("targets ~2 exchanges per topic in exploration mode", () => {
    expect(rules).toMatch(/~2\s*exchange|target.*2\s*exchange/i);
  });

  it("allows flexible end (short answer) or extension (still developing)", () => {
    expect(rules).toMatch(/end\s*earlier|extend.*3|still\s*developing/i);
  });

  it("requires a bridge sentence when transitioning", () => {
    expect(rules).toMatch(/bridge\s*sentence/i);
  });

  it("scopes cluster approach to exploration, excludes edit sessions", () => {
    expect(rules).toMatch(/exploring|exploration/i);
    expect(rules).toMatch(/editing|edit.*session|returning\s*user|skip/i);
  });

  it("does NOT hard-code cluster count (now in journey policies)", () => {
    expect(rules).not.toMatch(/target\s*2\s*(primary\s*)?cluster/i);
  });

  it("does NOT hard-code exchange cap (now in journey policies + R2)", () => {
    expect(rules).not.toMatch(/hard\s*cap.*6\s*exchange/i);
  });
});
```

Update R2 test (lines 79-91):
```typescript
describe("R2 — Max exchanges before action", () => {
  it("specifies the 6-exchange limit as default", () => {
    expect(rules).toMatch(/6\s*exchange/i);
  });

  it("instructs to propose action after limit", () => {
    expect(rules).toMatch(/propose.*action|generate_page|publish/i);
  });

  it("references generate_page as an action option", () => {
    expect(rules).toContain("generate_page");
  });

  it("explicitly marks 6-exchange as default that journey policies may override", () => {
    expect(rules).toMatch(/default.*6|journey.*polic.*override|journey.*polic.*precedence/i);
  });

  it("notes first_visit defines its own cap that takes precedence", () => {
    expect(rules).toMatch(/first_visit.*own.*cap|first_visit.*precedence/i);
  });
});
```

Replace R3 tests (lines 93-121):
```typescript
describe("R3 — removed (now in shared-rules)", () => {
  it("does NOT contain banned phrases list (moved to sharedBehavioralRules)", () => {
    expect(rules).not.toMatch(/banned\s*phrases/i);
    expect(rules).not.toMatch(/let me know if you need anything/i);
  });
});
```

Replace R5 tests (lines 141-153):
```typescript
describe("R5 — removed (now in shared-rules)", () => {
  it("does NOT contain response length rules (moved to sharedBehavioralRules)", () => {
    expect(rules).not.toMatch(/proportional.*response/i);
  });
});
```

Replace R6 tests (lines 155-167):
```typescript
describe("R6 — removed (now in shared-rules)", () => {
  it("does NOT contain clarification rules (moved to sharedBehavioralRules)", () => {
    expect(rules).not.toMatch(/clarification.*expire/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/turn-management.test.ts`
Expected: FAIL

**Step 3: Rewrite `turn-management.ts`**

```typescript
export function turnManagementRules(): string {
  return `TURN MANAGEMENT RULES:

R1 — Topic exploration:
WHEN EXPLORING (onboarding, open-ended conversation):
When exploring a topic, target ~2 exchanges before moving on.
One exchange = your question + user's reply.
- A topic can end earlier (very short answer) or extend to 3 max (user still developing).
  Never force a switch mid-thought.
- When a topic feels complete, transition with a bridge sentence — never cold-switch topics.

WHEN EDITING (returning user making a specific update):
Skip the cluster approach. Make the requested change, confirm briefly, and move on.

R2 — Max exchanges before action (default: 6, journey policies may override):
After 6 fact-gathering exchanges, you MUST propose an action:
- If no page exists: use generate_page to build it.
  Exception: if name or role/work is still missing, ask a single combined request
  (e.g. "Before I build it, tell me your name and what you do") — then generate
  immediately after (answered or declined).
- If page exists: offer to regenerate or publish.
- If user seems done: propose publish.
Do NOT keep asking questions beyond this limit without offering a concrete next step.
Override: first_visit defines its own exchange cap (8) in its journey policy — that takes precedence over this default.

R4 — Stall detection and recovery:
If the user gives 2+ consecutive low-signal replies (single words, "ok", "sure", emojis, "I don't know"):
- Switch from open questions to concrete options: "Pick one: [Option A] [Option B] [Option C]"
- If options don't work, try fill-in-the-blank: "The thing I enjoy most outside work is ___"
- If 3+ low-signal replies in a row: stop pushing, work with what you have, propose generating
  the page (if name or role/work is still missing, ask a single combined request to collect them,
  then generate immediately).`;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/turn-management.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/turn-management.ts tests/evals/turn-management.test.ts
git commit -m "refactor: slim turn-management to R1/R2/R4, delegate R3/R5/R6 to shared-rules"
```

---

### Task 8: Fix `memory-directives.ts` — Remove Duplicated Fact Recording

**Files:**
- Modify: `src/lib/agent/policies/memory-directives.ts` (line 20)
- Modify: `tests/evals/memory-directives.test.ts`

**Step 1: Update test**

Add to `tests/evals/memory-directives.test.ts`:

```typescript
it("does NOT duplicate fact recording mandate (now in TOOL_POLICY)", () => {
  expect(directives).not.toMatch(/when the user shares new information.*record it immediately/i);
  expect(directives).not.toMatch(/do not batch or delay/i);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/memory-directives.test.ts`
Expected: FAIL — old text still present

**Step 3: Modify `memory-directives.ts`**

In the Tier 1 section, change line 20 from:
```
- When the user shares new information, record it immediately via create_fact. Do not batch or delay.
```
To:
```
- When the user shares new information, record it as a fact (see FACT RECORDING in Tool Policy for batch vs. individual guidance).
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/memory-directives.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/memory-directives.ts tests/evals/memory-directives.test.ts
git commit -m "refactor: remove duplicated fact recording mandate from memory-directives"
```

---

### Task 9: Fix `planning-protocol.ts` — Remove Batch Line, Deduplicate Same-Turn Directive

**Files:**
- Modify: `src/lib/agent/policies/planning-protocol.ts`
- Modify: `tests/evals/planning-protocol.test.ts`

**Step 1: Update tests**

In `tests/evals/planning-protocol.test.ts`:

Change line 83-85 — "mentions batch_facts":
```typescript
it("does NOT mention batch_facts (now in TOOL_POLICY)", () => {
  expect(text).not.toContain("batch_facts");
});
```

Add test for SIMPLE section deduplication:
```typescript
it("SIMPLE section does NOT use 'SAME turn' or 'THIS turn' phrasing (timing lives in IMMEDIATE_EXECUTION_RULE)", () => {
  expect(text).not.toMatch(/same\s*turn/i);
  expect(text).not.toMatch(/this\s*turn/i);
});
```

Keep existing "mentions inspect_page_state for STRUCTURAL" test as-is.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/evals/planning-protocol.test.ts`
Expected: FAIL — batch_facts and "SAME turn" still in text

**Step 3: Modify `planning-protocol.ts`**

In the SIMPLE section (line 16-19), change:
```
SIMPLE (1-2 tool calls): Act directly.
Examples: create a single fact, change theme, answer a question.
Rule:
- If the user asks for one concrete edit ("add this", "remove that", "change this"), execute the needed tool in the SAME turn. Do NOT stop at "I'll update it" or other intention-only replies.
```

To:
```
SIMPLE (1-2 tool calls): Act directly.
Examples: create a single fact, change theme, answer a question.
Rule:
- If the user asks for one concrete edit ("add this", "remove that", "change this"), act immediately — do NOT stop at "I'll update it" or other intention-only replies.
```

Rationale: the specific "THIS turn" / "SAME turn" timing directive is the single-source IMMEDIATE_EXECUTION_RULE in journey policies. The planning protocol uses "act immediately" to convey urgency without duplicating the timing directive.

In the COMPOUND section (line 24), replace:
```
- Use batch_facts for multiple fact changes (not individual create_fact calls)
```
With:
```
- For multiple fact changes, follow the FACT RECORDING rule in Tool Policy
```

Keep the STRUCTURAL section (lines 28-32) exactly as-is — it's a universal classification block needed by all states including first-visit and returning-no-page during post-generation edits.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/planning-protocol.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/policies/planning-protocol.ts tests/evals/planning-protocol.test.ts
git commit -m "refactor: remove batch_facts from planning-protocol, deduplicate same-turn directive"
```

---

### Task 10: Fix `context.ts` — Empty Facts Injection for First Visit

**Files:**
- Modify: `src/lib/agent/context.ts` (after line 290)
- Modify: `tests/evals/context-assembler.test.ts` (extend existing suite)

**Step 1: Write the failing test**

Add to `tests/evals/context-assembler.test.ts` in the bootstrap/assembleContext describe block (around line 486).

Important context: `assembleContext()` uses `getActiveFacts()` (not `searchFacts`) to build the facts block (see `context.ts` line 276-280). The no-bootstrap path (line 354-374) always synthesizes a `first_visit` bootstrap regardless of actual state — this is a pre-existing issue. We only inject the empty-facts notice when `bootstrap` is explicitly provided as `first_visit` to avoid interacting with that legacy behavior.

```typescript
it("injects empty-facts notice for first_visit when no facts exist", () => {
  vi.mocked(getActiveFacts).mockReturnValue([]);

  const bootstrap: BootstrapPayload = {
    journeyState: "first_visit",
    situations: [],
    expertiseLevel: "novice",
    userName: null,
    lastSeenDaysAgo: null,
    publishedUsername: null,
    pendingProposalCount: 0,
    thinSections: [] as string[],
    staleFacts: [] as string[],
    openConflicts: [] as string[],
    archivableFacts: [] as string[],
    language: "en",
    conversationContext: null,
    archetype: "generalist" as const,
  };

  const result = assembleContext(SCOPE, "en", [], undefined, bootstrap);
  expect(result.systemPrompt).toContain("No facts recorded yet");
  expect(result.systemPrompt).toContain("Start extracting information");
});

it("does NOT inject empty-facts notice for non-first_visit states", () => {
  vi.mocked(getActiveFacts).mockReturnValue([]);

  const bootstrap: BootstrapPayload = {
    journeyState: "active_fresh",
    situations: [],
    expertiseLevel: "novice",
    userName: "Test User",
    lastSeenDaysAgo: 1,
    publishedUsername: null,
    pendingProposalCount: 0,
    thinSections: [] as string[],
    staleFacts: [] as string[],
    openConflicts: [] as string[],
    archivableFacts: [] as string[],
    language: "en",
    conversationContext: null,
    archetype: "generalist" as const,
  };

  const result = assembleContext(SCOPE, "en", [], undefined, bootstrap);
  expect(result.systemPrompt).not.toContain("No facts recorded yet");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/context-assembler.test.ts`
Expected: FAIL — "No facts recorded yet" not in result

**Step 3: Modify `src/lib/agent/context.ts`**

After the factsBlock construction and truncation (after line 290, still inside the `if (!profile || profile.facts.include)` block), add:

```typescript
// Empty-facts notice for first_visit: tell the agent to extract immediately.
// Only inject when bootstrap is explicitly provided with first_visit — the
// no-bootstrap fallback (line 354) always synthesizes first_visit regardless
// of actual state, so we don't inject there to avoid false positives.
if (!factsBlock && bootstrap?.journeyState === "first_visit") {
  factsBlock = "[No facts recorded yet. Start extracting information from the user's messages immediately.]";
}
```

This is deliberately simple: `bootstrap?.journeyState === "first_visit"` is the correct check because `bootstrap` is always provided by the production chat route via `assembleBootstrapPayload()`, which correctly classifies the journey state. The no-bootstrap path is a legacy fallback for testing — injecting there would require fixing the pre-existing `detectMode()` vs `buildSystemPrompt()` state mismatch, which is out of scope.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/evals/context-assembler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/agent/context.ts tests/evals/context-assembler.test.ts
git commit -m "fix: inject empty-facts notice for first_visit in context builder"
```

---

### Task 11: Full Test Suite Verification

**Files:** None (verification only)

**Step 1: Run the complete test suite**

Run: `npx vitest run`
Expected: All tests PASS. Check that total test count is approximately the same as before (~2593).

**Step 2: Run TypeScript compiler check**

Run: `npx tsc --noEmit`
Expected: 0 errors

**Step 3: Token budget sanity check**

Run:
```bash
npx tsx -e "
import { buildSystemPrompt } from './src/lib/agent/prompts';
const bp = {
  journeyState: 'first_visit' as const,
  situations: [] as string[],
  expertiseLevel: 'novice' as const,
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [] as string[],
  staleFacts: [] as string[],
  openConflicts: [] as string[],
  archivableFacts: [] as string[],
  language: 'en',
  conversationContext: null,
  archetype: 'generalist' as const,
};
const p = buildSystemPrompt(bp);
console.log('Estimated tokens:', Math.ceil(p.length / 4));
"
```

Expected: ~4500-4600 tokens (down from ~5000)

If the number is > 6000, investigate which block grew unexpectedly.

**Step 4: No commit needed**

This is a verification-only task. All code changes were committed in Tasks 1-10. If the full suite passes and tsc is clean, the refactor is complete.

---

## Summary of Changes

| File | Action | What Changes |
|------|--------|-------------|
| `src/lib/agent/policies/shared-rules.ts` | CREATE | Universal rules + TS constants |
| `src/lib/agent/prompts.ts` | MODIFY | TOOL_POLICY unified, minimal schema, edit schema same-turn dedup, import shared-rules |
| `src/lib/agent/policies/first-visit.ts` | MODIFY | Remove 4 duplicated rules |
| `src/lib/agent/policies/active-fresh.ts` | MODIFY | Remove 3 rules, interpolate constants |
| `src/lib/agent/policies/active-stale.ts` | MODIFY | Remove 4 rules, interpolate constants |
| `src/lib/agent/policies/draft-ready.ts` | MODIFY | Remove 2 rules, interpolate constants |
| `src/lib/agent/policies/returning-no-page.ts` | MODIFY | Remove 2 rules, interpolate constant |
| `src/lib/agent/policies/turn-management.ts` | MODIFY | R1/R2 slimmed, R3/R5/R6 removed |
| `src/lib/agent/policies/memory-directives.ts` | MODIFY | Remove fact recording line |
| `src/lib/agent/policies/planning-protocol.ts` | MODIFY | Remove batch_facts, deduplicate same-turn wording |
| `src/lib/agent/policies/index.ts` | MODIFY | Fix novice examples |
| `src/lib/agent/context.ts` | MODIFY | Empty-facts injection for first_visit |
| `tests/evals/shared-rules.test.ts` | CREATE | Test universality, no conditionals |
| `tests/evals/build-system-prompt.test.ts` | MODIFY | Block count +1, ordering, mock |
| `tests/evals/onboarding-policy.test.ts` | MODIFY | Update migrated assertions |
| `tests/evals/returning-policies.test.ts` | MODIFY | Update migrated assertions + proportional response |
| `tests/evals/turn-management.test.ts` | MODIFY | R1/R2 only, R3/R5/R6 gone |
| `tests/evals/planning-protocol.test.ts` | MODIFY | batch_facts removed, same-turn dedup |
| `tests/evals/memory-directives.test.ts` | MODIFY | No fact recording mandate |
| `tests/evals/prompt-contracts.test.ts` | MODIFY | New unified fact recording assertion |
| `tests/evals/schema-mode.test.ts` | MODIFY | ONBOARDING_MARKER updated |
| `tests/evals/tool-policy-update.test.ts` | MODIFY | trust-ledger → partial-failure + shared-rules mock |
| `tests/evals/context-assembler.test.ts` | MODIFY | Real empty-facts injection test (2 cases) |

**Total: 12 source files (1 new, 11 modified), 10 test files (1 new, 9 modified)**

## Revision History

### v1 → v2 (Round 1 fixes)
1. Task 1: Removed "Exception: first page generation..." from sharedBehavioralRules() — violates ZERO conditional branching, duplicates CORE_CHARTER.
2. Task 2: Added schema-mode.test.ts and tool-policy-update.test.ts updates.
3. Task 9: Fixed block ordering to match design doc (after turnManagement, before memoryDirectives).
4. Task 10: Replaced placeholder test with real assertion in context-assembler.test.ts.
5. Task 11: Changed node -e to npx tsx -e.

### v2 → v3 (Round 2 fixes)
1. Task 2: Added clarifying note about batch prohibition being intentional prompt-level simplification.
2. Task 8: Kept full STRUCTURAL rules in planning-protocol (universal planning block, not just a pointer).
3. Task 10: Fixed to mock getActiveFacts (not searchFacts), handle no-bootstrap fallback path.
4. Task 11: Removed unsafe git add -A commit.

### v3 → v4 (Round 3 fixes)
1. Task 2: Updated buildMinimalSchemaForEditing() to use "act immediately" instead of "execute it in this turn" — eliminates third drift-prone source of same-turn directive.
2. Task 5: Added proportional response length test update for activeFreshPolicy (line 245-246 in returning-policies.test.ts).
3. Task 8: Updated planning-protocol SIMPLE section from "execute the needed tool in the SAME turn" to "act immediately" — single source of timing directive is now IMMEDIATE_EXECUTION_RULE only.
4. Task 10: Changed empty-facts condition from `bootstrap?.journeyState ?? "first_visit"` to `bootstrap ? .journeyState === "first_visit" : !hasAnyPublishedPage()` — prevents false-positive injection for non-first_visit sessions without bootstrap. Added third test case for the negative path.

### v4 → v5 (Round 4 fixes)
1. Task 6: Made R2 explicitly a default ("default: 6, journey policies may override") with clear override note for first_visit ("defines its own cap (8) — takes precedence"). Eliminates residual 6-vs-8 ambiguity.
2. Task 10: Tightened no-bootstrap detection to require `countFacts() === 0 && !hasAnyPublishedPage()` — prevents false-positive for returning users with historical facts but zero active (all archived/deleted). Added fourth test case for this edge.
3. Issue 3 (sharedBehavioralRules vs blocked/expert): pushed back — not an actual conflict. Blocked's "suggest sign up" IS a specific next step. Expert's "Done." IS proportional to a short edit request. The two-layer architecture works as designed.

### v5 → v6 (Round 5 fixes)
1. Task 9 → Task 2: Moved "wire sharedBehavioralRules" immediately after Task 1 (create shared-rules), before any policy slimming. Eliminates regression window where assembled prompt has lost rules but shared replacement isn't composed yet. All subsequent tasks renumbered (old 2→3, 3→4, ... 8→9).
2. Task 2 (wire): Fixed ordering test marker strings from `TURN_MANAGEMENT_BLOCK` → `TURN_MANAGEMENT_RULES_BLOCK` and `MEMORY_DIRECTIVES_BLOCK` → `MEMORY_USAGE_DIRECTIVES_BLOCK` to match actual mocked returns in build-system-prompt.test.ts.
3. Task 10: Reverted countFacts check — `countFacts()` only counts active (non-archived) facts via `isNull(archivedAt)`, so it cannot distinguish "never had facts" from "had facts, all archived". Simplified back to `bootstrap ? .journeyState === "first_visit" : !hasAnyPublishedPage()`. Removed false-precision fourth test case.

### v6 → v7 (Round 6 fixes)
1. Task 10: Simplified to bootstrap-only check (`bootstrap?.journeyState === "first_visit"`). Dropped no-bootstrap path handling entirely — the no-bootstrap fallback always synthesizes first_visit regardless of actual state, which is a pre-existing issue out of scope for this refactor. Production callers always provide bootstrap.
2. Task 1: Reworded passive-closings ban from "Always end with a specific next step" to "End with a concrete anchor (completion confirmation, suggestion, or direct question)". Eliminates perceived conflict with expert calibration's "Done." / "Updated." patterns — those ARE concrete anchors.
3. Task 6: Removed STRUCTURAL_EXPLANATION_RULE interpolation from all journey policies. Planning-protocol's STRUCTURAL section is the single universal source for inspect_page_state/explain/preview guidance. The TS constant is kept for code-level documentation but not interpolated anywhere, eliminating the drift concern.

### v7 → v8 (Round 7 fixes)
1. Task 1: Removed response-length from sharedBehavioralRules() — CORE_CHARTER's RESPONSE LENGTH section (prompts.ts:79-83) is the canonical source with specific sentence calibration. Added explicit comment preventing re-addition.
2. Task 1: Removed STRUCTURAL_EXPLANATION_RULE constant entirely — dead code since planning-protocol is the single source.
3. Task 5: Added Phase C trigger assertion update in onboarding-policy.test.ts (line 37) — old pattern `/2\s*cluster.*done|6-exchange.*cap/` doesn't match the new 3-cluster/8-exchange text.
4. Task 6: Added clarification-related line removal from draft-ready.ts (lines 32-34) — these now live exclusively in sharedBehavioralRules().

### v8 → v9 (Round 8 fix)
1. Task 6: Changed active-stale.ts from "Remove MAX 6 EXCHANGES RULE section" to "remove ONLY the duplicated 6-exchange cap line, KEEP stale-specific guidance like 3-exchange early regeneration".

### v9 → v10 (Round 9 fixes)
1. Task 7: Reworded R2 generation gate from "ask ONE direct question to collect all missing fields" to "ask a single combined request" — eliminates apparent contradiction with one-question rule.
2. Task 7: Removed "Phase C gate" jargon from R4 stall recovery — inlined the name/role check without first-visit-specific terminology.
3. Task 6: Added `returningNoPagePolicy` test assertion for `IMMEDIATE_EXECUTION_RULE` interpolation in returning-policies.test.ts.
