# Design: System Prompt Structural Refactor

**Date:** 2026-03-09
**Status:** Implemented
**Challenge:** Gemini + Codex (2 rounds)

## Problem

The agent system prompt (13 blocks, ~5000 tokens) has 11 issues:
- 4 P1 contradictions (batch vs immediate, opening bans vs expertise, cluster 3 vs 2, cap 8 vs 6)
- 3 P2 gaps (planning protocol not journey-aware, search_facts confusion, minimal schema bias)
- 4 P3 redundancies (~420 tokens wasted on repeated rules)

## Architectural Principle

**Two layers, zero branching:**
- **Layer 1 — Universal blocks**: rules that apply to ALL 6 states with zero exceptions. No conditionals in prompt text.
- **Layer 2 — Journey policy**: everything state-specific (phases, clusters, caps, greeting, publish, page timing).

Rules that appear in 2-3 policies but are NOT universal → **TS string constants** interpolated at build time. Code is DRY, prompt is flat and localized.

## Block Composition (after refactor)

```
CORE_CHARTER                          ← unchanged
SAFETY_POLICY                         ← unchanged
TOOL_POLICY                           ← MODIFIED (unified fact recording + batch by op type)
[schema reference]                    ← MODIFIED (minimal onboarding aligned)
DATA_MODEL_REFERENCE                  ← unchanged
OUTPUT_CONTRACT                       ← unchanged
journeyPolicy                        ← SLIMMED (only state-specific phases/flow/caps)
[situationDirectives]                 ← unchanged
expertiseCalibration                  ← MODIFIED (fix banned examples)
turnManagementRules                   ← MODIFIED (R1/R2 without cluster/cap, left to policies)
sharedBehavioralRules()               ← NEW (only 100% universal rules)
memoryUsageDirectives                 ← MODIFIED (remove duplicated fact recording)
planningProtocol                      ← MODIFIED (remove batch_facts line, STRUCTURAL via TS const)
undoAwarenessPolicy                   ← unchanged
```

## Changes by File

### 1. `src/lib/agent/prompts.ts` — TOOL_POLICY

Replace current batch_facts instruction with:

```
FACT RECORDING:
- Record facts as you encounter them. NEVER delay to accumulate across turns.
- For 3+ NEW facts (creates only) from a single message → use batch_facts.
- For updates, deletes, or identity changes → always use individual tool calls
  (update_fact, delete_fact). Never batch these — they have confirmation gates
  and different failure semantics.
- batch_facts runs sequentially: if one op fails, earlier ones persist. Always
  check results.
```

### 2. `src/lib/agent/prompts.ts` — `buildMinimalSchemaForOnboarding()`

Change: "After collecting name + role + 2-3 more facts, call generate_page."
To: "After exploring 2-3 topic areas beyond name + role, call generate_page."

### 3. NEW: `src/lib/agent/policies/shared-rules.ts`

```typescript
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

// TS constants for semi-universal rules (interpolated into specific policies)
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan.`;

// STRUCTURAL_EXPLANATION_RULE removed — planning-protocol STRUCTURAL section is the single source.
```

### 4. Journey Policies — Slimming

From each policy, REMOVE (now in shared or TOOL_POLICY):
- "NEVER end a turn with 'let me know if you need anything'..."
- "NEVER ask more than one question per turn."
- "Record EVERY piece of information as a fact IMMEDIATELY..." (first-visit only, 2 occurrences)

From active-fresh, active-stale, draft-ready: replace inline "execute tool THIS turn" with interpolated `IMMEDIATE_EXECUTION_RULE`.

From active-stale: remove "MAX 6 EXCHANGES RULE" (now in R2).

KEEP in each policy: greeting, phase flow, state-specific caps, publish flow, special handling.

### 5. `turn-management.ts` — R1/R2

R1 becomes generic (no cluster count/cap):
```
R1 — Topic exploration:
When exploring a topic, target ~2 exchanges before moving on.
One exchange = your question + user's reply.
If the user is still developing, extend to 3 max.
When a topic feels complete, use a bridge sentence to transition.
```

R2 becomes steady_state default:
```
R2 — Max exchanges before action:
After 6 fact-gathering exchanges, MUST propose an action:
- No page exists → generate_page
- Page exists → offer to regenerate or publish
- User seems done → propose publish
Exception: first_visit has its own exchange cap in its journey policy.
```

### 6. `index.ts` — Expertise Calibration

Novice: change `('Capito!', 'Perfetto!')` to `('Bene.', 'Ricevuto.')`.

### 7. `context.ts` — Empty facts handling

When `factsBlock` is empty AND journeyState is `first_visit`, inject:
```
[No facts recorded yet. Start extracting information from the user's messages immediately.]
```

### 8. `memory-directives.ts`

Remove line 20: "When the user shares new information, record it immediately via create_fact. Do not batch or delay." (now in TOOL_POLICY).

### 9. `planning-protocol.ts`

Remove COMPOUND line: "Use batch_facts for multiple fact changes (not individual create_fact calls)" (now in TOOL_POLICY).
Remove STRUCTURAL block (now via TS constant in steady_state policies).

### 10. Tests

- `build-system-prompt.test.ts` — update block count (+1)
- `onboarding-policy.test.ts` — remove assertions on migrated strings
- `returning-policies.test.ts` — same
- `turn-management.test.ts` — update for slimmed R1/R2
- `planning-protocol.test.ts` — update for removed batch_facts line
- `memory-directives.test.ts` — verify "record immediately" NOT present
- NEW: `shared-rules.test.ts` — test universality, no conditionals

## Token Budget

| Block | Before | After | Delta |
|-------|--------|-------|-------|
| TOOL_POLICY | ~800 | ~850 | +50 |
| sharedBehavioralRules | 0 | ~150 | +150 |
| first-visit | ~800 | ~550 | -250 |
| active-fresh | ~400 | ~300 | -100 |
| active-stale | ~450 | ~350 | -100 |
| draft-ready | ~400 | ~300 | -100 |
| returning-no-page | ~350 | ~280 | -70 |
| turn-management | ~300 | ~200 | -100 |
| planning-protocol | ~250 | ~200 | -50 |
| **Total** | ~4950 | ~4530 | **-420** |

## Challenge Results

Validated by Gemini (design challenger) and Codex (technical validator), 2 rounds.

Key changes from challenge:
1. No prompt-level conditionals — Gemini caught that branching in shared blocks forces LLM runtime evaluation
2. `returning_no_page` ≠ `first_visit` — Codex caught grouping regression
3. batch_facts by operation type, not volume — both caught mixed-op failure modes
4. Minimal schema hidden contradiction — Codex found "2-3 more facts" biases early generation
5. Tests are coupled to block structure — Codex identified coordinated update requirement
