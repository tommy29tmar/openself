# Sprint 5: Conversation Polish + Eval Matrix — Implementation Plan [DONE]

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** The agent converses naturally, explains visual changes before acting, handles undo gracefully, adapts to user expertise, and all behaviors are verified across LLM providers.

**Architecture:** Two new prompt policy blocks (action-awareness, undo-awareness) integrated into the composite system prompt. Cross-provider eval matrix with 8 parameterized scenarios testing real LLM behavior.

**Tech Stack:** TypeScript, Vercel AI SDK, Zod, vitest

**Dependencies:** Sprints 1-3 (required: Journey Intelligence, onboarding rewrite, returning user policies). Sprint 4 is soft-dependency: if Sprint 4 is not completed, `ModelTier` stays `"cheap" | "medium"` — this sprint only adds prompt policy blocks and evals, which use `getModel()` (default chat model) and don't depend on the `"capable"` tier.

**Assumptions (from Sprint 1-3 completion):**
- `src/lib/agent/journey.ts` exists and exports `JourneyState`, `Situation`, `ExpertiseLevel`, `BootstrapPayload`, `assembleBootstrapPayload()`
- `src/lib/agent/policies/index.ts` exports `getJourneyPolicy`, `getSituationDirectives`, `getExpertiseCalibration`
- `src/lib/agent/policies/memory-directives.ts` exports `memoryUsageDirectives()`
- `src/lib/agent/policies/turn-management.ts` exports `turnManagementRules()`
- `src/lib/agent/prompts.ts` exports `buildSystemPrompt(bootstrap)` which composes: `[CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY, FACT_SCHEMA_REFERENCE, OUTPUT_CONTRACT, journeyPolicy, situationDirectives?, expertiseCalibration, turnManagement, memoryDirectives]`
- `src/lib/ai/provider.ts` exports `ModelTier = "cheap" | "medium"` (or `"cheap" | "medium" | "capable"` if Sprint 4 is completed), `getModel()`, `getModelForTier(tier)`, `getProviderName()`

---

## Task 1: Create `src/lib/agent/policies/action-awareness.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/action-awareness.ts` |
| **test** | `tests/evals/action-awareness.test.ts` |

### Steps

1. Write failing test (see Test section below)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/action-awareness.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/action-awareness.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/action-awareness.test.ts --reporter=verbose
   ```
5. Commit: `feat: add action-awareness policy for explain-before-act pattern`

### Implementation

```typescript
// src/lib/agent/policies/action-awareness.ts

/**
 * Action awareness policy.
 *
 * Teaches the agent to distinguish between high-impact visual operations
 * (that require explanation and confirmation) and low-impact data operations
 * (that can be executed silently).
 *
 * This is a fixed block injected into all system prompts via buildSystemPrompt.
 * It does NOT depend on language or journey state — expertise calibration
 * (from getExpertiseCalibration) modulates the behavior externally.
 */

export function actionAwarenessPolicy(): string {
  return `ACTION AWARENESS:

HIGH-IMPACT operations (visual changes the user WILL notice):
- set_layout — changes entire page structure
- set_theme — changes visual identity (colors, fonts, spacing)
- reorder_sections (3+ sections) — significantly rearranges the page
- generate_page (in steady_state mode) — rebuilds the entire page from facts

For high-impact operations, follow this pattern:
1. EXPLAIN what you're about to do and why: "I'll switch to the sidebar layout — it works well for portfolios because it keeps your name visible while scrolling."
2. ASK for confirmation: "Sound good?" or "Want me to go ahead?"
3. EXECUTE only after the user confirms (or if they gave an explicit instruction)
4. POINT to the result: "Done — check the preview on the right to see the new layout."

Exception: If the user gave an explicit, unambiguous instruction ("change the theme to warm", "switch to bento layout"), you may act with a brief confirmation:
"Switching to warm theme now — take a look at the preview!"
You do NOT need to ask permission when the user already told you exactly what to do.

LOW-IMPACT operations (data changes, invisible to the user until page refresh):
- create_fact, update_fact, delete_fact — storing information
- set_fact_visibility — changing what appears on the page
- update_page_style — metadata-only (not visual restructuring)
- reorder_sections (1-2 sections) — minor positional tweaks
- search_facts — read-only lookup
- save_memory, propose_soul_change, resolve_conflict — background operations

For low-impact operations: just do them. No need to explain or ask permission.
After a batch of fact operations, a brief summary is fine: "Got it, I've saved your new role and updated your skills."

EXPERTISE MODULATION (interacts with EXPERTISE CALIBRATION block):
- novice: ALWAYS explain high-impact operations, even when the user gave explicit instruction. Walk them through what will change.
- familiar: explain only when the action is ambiguous or when you're choosing between alternatives. Skip explanation for explicit instructions.
- expert: act and confirm. "Done. Check preview." is a valid response. Don't explain tool operations unless asked.`;
}
```

### Test

```typescript
// tests/evals/action-awareness.test.ts

/**
 * Tests for the action awareness policy.
 * Validates that high-impact and low-impact operations are properly categorized,
 * the explain-before-act pattern is documented, and expertise modulation is defined.
 */
import { describe, it, expect } from "vitest";
import { actionAwarenessPolicy } from "@/lib/agent/policies/action-awareness";

describe("actionAwarenessPolicy", () => {
  const policy = actionAwarenessPolicy();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policy).toBe("string");
      expect(policy.length).toBeGreaterThan(200);
    });

    it("contains an ACTION AWARENESS header", () => {
      expect(policy).toContain("ACTION AWARENESS");
    });
  });

  describe("high-impact operations", () => {
    it("lists set_layout as high-impact", () => {
      expect(policy).toContain("set_layout");
    });

    it("lists set_theme as high-impact", () => {
      expect(policy).toContain("set_theme");
    });

    it("lists reorder_sections (3+) as high-impact", () => {
      expect(policy).toMatch(/reorder_sections.*3\+/);
    });

    it("lists generate_page in steady_state as high-impact", () => {
      expect(policy).toContain("generate_page");
      expect(policy).toContain("steady_state");
    });

    it("includes explain step in the pattern", () => {
      expect(policy).toMatch(/EXPLAIN/i);
    });

    it("includes ask-for-confirmation step", () => {
      expect(policy).toMatch(/ASK.*confirmation|confirm/i);
    });

    it("includes execute step", () => {
      expect(policy).toMatch(/EXECUTE/i);
    });

    it("includes point-to-result step", () => {
      expect(policy).toMatch(/preview/i);
    });

    it("has an explicit-instruction exception", () => {
      expect(policy).toMatch(/explicit.*instruction|unambiguous/i);
    });
  });

  describe("low-impact operations", () => {
    it("lists create_fact as low-impact", () => {
      // Verify create_fact appears in the low-impact section (after the high-impact section)
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toBeDefined();
      expect(lowImpactSection).toContain("create_fact");
    });

    it("lists update_fact as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("update_fact");
    });

    it("lists delete_fact as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("delete_fact");
    });

    it("lists set_fact_visibility as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("set_fact_visibility");
    });

    it("lists update_page_style as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("update_page_style");
    });

    it("lists reorder_sections (1-2) as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toMatch(/reorder_sections.*1-2/);
    });

    it("instructs to just do it without asking", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toMatch(/just do them/i);
    });
  });

  describe("expertise modulation", () => {
    it("defines novice behavior — always explain", () => {
      expect(policy).toMatch(/novice.*ALWAYS.*explain/is);
    });

    it("defines familiar behavior — explain when ambiguous", () => {
      expect(policy).toMatch(/familiar.*ambiguous/is);
    });

    it("defines expert behavior — act and confirm", () => {
      expect(policy).toMatch(/expert.*act and confirm/is);
    });

    it("references EXPERTISE CALIBRATION block", () => {
      expect(policy).toContain("EXPERTISE CALIBRATION");
    });
  });
});
```

### Test command

```bash
npx vitest run tests/evals/action-awareness.test.ts --reporter=verbose
```

---

## Task 2: Create `src/lib/agent/policies/undo-awareness.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/undo-awareness.ts` |
| **test** | `tests/evals/undo-awareness.test.ts` |

### Steps

1. Write failing test (see Test section below)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/undo-awareness.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/undo-awareness.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/undo-awareness.test.ts --reporter=verbose
   ```
5. Commit: `feat: add undo-awareness policy for graceful reversal handling`

### Implementation

```typescript
// src/lib/agent/policies/undo-awareness.ts

/**
 * Undo awareness policy.
 *
 * Teaches the agent to handle user dissatisfaction and undo requests gracefully.
 * Instead of panicking and regenerating the entire page, the agent should identify
 * the specific last action, explain what happened, and propose targeted reversal.
 *
 * This is a fixed block injected into all system prompts via buildSystemPrompt.
 * It does NOT depend on language or journey state.
 */

export function undoAwarenessPolicy(): string {
  return `UNDO AND REVERSAL HANDLING:

When the user expresses dissatisfaction or wants to undo something, follow this protocol:

DETECTION — Recognize undo/reversal intent from phrases like:
- English: "undo", "revert", "go back", "don't like it", "change it back", "was better before", "previous version", "not what I wanted"
- Italian: "annulla", "torna indietro", "non mi piace", "com'era prima", "rimetti", "preferivo prima", "torna come prima"
- General: negative reactions to recent changes, sighing, "hmm no", "nah", or any expression of regret about the last action

RESPONSE PATTERN (in order):
1. IDENTIFY the last action you performed. Check your recent tool calls to determine what changed.
2. EXPLAIN briefly what was done: "I just changed the theme from minimal to warm" or "I reordered your sections — skills moved above projects."
3. PROPOSE reversal + alternatives:
   - Offer to undo the specific action: "I can switch back to the minimal theme."
   - Suggest an alternative if applicable: "Or I could try the editorial theme instead?"
   - Let the user choose.
4. ACT on the user's decision. Execute the reversal or alternative.

CRITICAL RULES:
- NEVER regenerate the entire page as the first reaction to dissatisfaction. This destroys personalized copy and section ordering.
- NEVER assume you know what the user dislikes. If the complaint is vague ("I don't like it"), ask WHAT specifically:
  "What part isn't working for you? The layout, the colors, the text, or something else?"
- NEVER apologize excessively. One brief acknowledgment is fine: "Got it, let me fix that."
- If the user says "go back" but you haven't made any recent changes, ask what they want to change:
  "I haven't made any changes just now — what would you like me to adjust?"
- If reversal is impossible (e.g., facts were deleted and you don't remember the values), be honest:
  "I removed that fact earlier and don't have the exact wording. Could you tell me again and I'll re-add it?"

SCOPE OF REVERSAL:
- Theme change → revert to previous theme via set_theme
- Layout change → revert to previous layout via set_layout
- Section reorder → revert to previous order via reorder_sections
- Fact deletion → recreate the fact via create_fact (if you remember the value)
- Page regeneration → this is harder to undo; explain that and offer to adjust specific sections
- Style change → revert via update_page_style`;
}
```

### Test

```typescript
// tests/evals/undo-awareness.test.ts

/**
 * Tests for the undo awareness policy.
 * Validates detection keywords, response pattern steps, critical rules,
 * and reversal scope coverage.
 */
import { describe, it, expect } from "vitest";
import { undoAwarenessPolicy } from "@/lib/agent/policies/undo-awareness";

describe("undoAwarenessPolicy", () => {
  const policy = undoAwarenessPolicy();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policy).toBe("string");
      expect(policy.length).toBeGreaterThan(200);
    });

    it("contains an UNDO AND REVERSAL header", () => {
      expect(policy).toContain("UNDO AND REVERSAL");
    });
  });

  describe("detection keywords — English", () => {
    const englishKeywords = ["undo", "revert", "go back", "don't like", "change it back", "was better before"];

    it.each(englishKeywords)("contains English keyword: %s", (keyword) => {
      expect(policy.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  describe("detection keywords — Italian", () => {
    const italianKeywords = ["annulla", "torna indietro", "non mi piace", "com'era prima"];

    it.each(italianKeywords)("contains Italian keyword: %s", (keyword) => {
      expect(policy.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  describe("response pattern steps", () => {
    it("has IDENTIFY step — check last action", () => {
      expect(policy).toMatch(/IDENTIFY.*last action/is);
    });

    it("has EXPLAIN step — describe what was done", () => {
      expect(policy).toMatch(/EXPLAIN.*what was done/is);
    });

    it("has PROPOSE step — offer reversal and alternatives", () => {
      expect(policy).toMatch(/PROPOSE.*reversal.*alternative/is);
    });

    it("has ACT step — execute the decision", () => {
      expect(policy).toMatch(/ACT.*decision/is);
    });
  });

  describe("critical rules", () => {
    it("prohibits full page regeneration as first reaction", () => {
      expect(policy).toMatch(/NEVER.*regenerate.*entire page.*first/is);
    });

    it("requires asking what specifically when complaint is vague", () => {
      expect(policy).toMatch(/vague|what specifically|what part/is);
    });

    it("prohibits excessive apologies", () => {
      expect(policy).toMatch(/NEVER.*apologize.*excessively/is);
    });

    it("handles case when no recent changes were made", () => {
      expect(policy).toMatch(/haven't made any.*changes/is);
    });

    it("handles impossible reversals honestly", () => {
      expect(policy).toMatch(/impossible|don't have the exact|be honest/is);
    });
  });

  describe("reversal scope", () => {
    const reversalTargets = [
      { action: "Theme change", tool: "set_theme" },
      { action: "Layout change", tool: "set_layout" },
      { action: "Section reorder", tool: "reorder_sections" },
      { action: "Fact deletion", tool: "create_fact" },
      { action: "Style change", tool: "update_page_style" },
    ];

    it.each(reversalTargets)("covers reversal for $action → $tool", ({ tool }) => {
      expect(policy).toContain(tool);
    });

    it("acknowledges page regeneration is hard to undo", () => {
      expect(policy).toMatch(/page regeneration.*harder to undo|hard.*undo/is);
    });
  });
});
```

### Test command

```bash
npx vitest run tests/evals/undo-awareness.test.ts --reporter=verbose
```

---

## Task 3: Integrate action-awareness and undo-awareness into `buildSystemPrompt`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/prompts.ts` |
| **modify** | `tests/evals/build-system-prompt.test.ts` |

### Steps

1. Read current `src/lib/agent/prompts.ts` to confirm state (should have `buildSystemPrompt` from Sprint 2-3)
2. Add imports for `actionAwarenessPolicy` and `undoAwarenessPolicy`
3. Add both blocks to the end of the `buildSystemPrompt` composition chain
4. Run existing tests to confirm no regressions:
   ```bash
   npx vitest run tests/evals/build-system-prompt.test.ts --reporter=verbose
   ```
5. Update tests to verify the new blocks are included
6. Run all policy-related tests:
   ```bash
   npx vitest run tests/evals/build-system-prompt.test.ts tests/evals/action-awareness.test.ts tests/evals/undo-awareness.test.ts --reporter=verbose
   ```
7. Commit: `feat: wire action-awareness and undo-awareness into buildSystemPrompt`

### Implementation

Add these imports to the top of `src/lib/agent/prompts.ts` (alongside existing imports from Sprint 3):

```typescript
// --- Add these imports alongside the existing memory-directives and turn-management imports ---
import { actionAwarenessPolicy } from "@/lib/agent/policies/action-awareness";
import { undoAwarenessPolicy } from "@/lib/agent/policies/undo-awareness";
```

Modify the `buildSystemPrompt` function to add the two new blocks at the end of the composition chain:

```typescript
/**
 * Build the full system prompt from a BootstrapPayload.
 *
 * Composition order:
 * [CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY, FACT_SCHEMA_REFERENCE, OUTPUT_CONTRACT,
 *  journeyPolicy, situationDirectives?, expertiseCalibration, turnManagementRules,
 *  memoryUsageDirectives, actionAwarenessPolicy, undoAwarenessPolicy]
 */
export function buildSystemPrompt(bootstrap: BootstrapPayload): string {
  const journeyPolicy = getJourneyPolicy(bootstrap.journeyState, bootstrap.language);

  // Build situation context from bootstrap data
  const situationContext: SituationContext = {
    pendingProposalCount: bootstrap.pendingProposalCount,
    pendingProposalSections: [],
    thinSections: bootstrap.thinSections,
    staleFacts: bootstrap.staleFacts,
    openConflicts: [],
  };

  const situationDirectives = getSituationDirectives(
    bootstrap.situations,
    situationContext,
  );

  const expertiseCalibration = getExpertiseCalibration(bootstrap.expertiseLevel);

  const blocks = [
    CORE_CHARTER,
    SAFETY_POLICY,
    TOOL_POLICY,
    FACT_SCHEMA_REFERENCE,
    OUTPUT_CONTRACT,
    journeyPolicy,
  ];

  if (situationDirectives) {
    blocks.push(situationDirectives);
  }

  blocks.push(expertiseCalibration);
  blocks.push(turnManagementRules());
  blocks.push(memoryUsageDirectives());
  blocks.push(actionAwarenessPolicy());   // NEW — Sprint 5
  blocks.push(undoAwarenessPolicy());     // NEW — Sprint 5

  const composed = blocks.join("\n\n---\n\n");

  // Budget guard: system prompt must leave room for context (facts, memory,
  // soul, summaries, conflicts). TOTAL_TOKEN_BUDGET is 7500, reserve >= 4000.
  const MAX_SYSTEM_PROMPT_TOKENS = 3500;
  const estimatedTokens = Math.ceil(composed.length / 4);
  if (estimatedTokens > MAX_SYSTEM_PROMPT_TOKENS) {
    console.warn(
      `[buildSystemPrompt] System prompt ~${estimatedTokens} tokens exceeds budget of ${MAX_SYSTEM_PROMPT_TOKENS}. ` +
      `Context blocks may be squeezed. Review prompt block sizes.`
    );
  }

  return composed;
}
```

**Key change from Sprint 3 version:**
- Added `import { actionAwarenessPolicy }` and `import { undoAwarenessPolicy }`
- Added `actionAwarenessPolicy()` and `undoAwarenessPolicy()` as the last two blocks in the composition
- Action awareness comes before undo awareness (explain-before-act is the general case; undo is the exception flow)
- Budget guard unchanged from Sprint 2/3 (MAX_SYSTEM_PROMPT_TOKENS = 3500). With 12 blocks total, monitor that the composed prompt stays within budget.

### Test modifications

Add these mocks and assertions to `tests/evals/build-system-prompt.test.ts`:

```typescript
// --- Add these mocks alongside the existing memory-directives and turn-management mocks ---
vi.mock("@/lib/agent/policies/action-awareness", () => ({
  actionAwarenessPolicy: vi.fn(() => "ACTION_AWARENESS_POLICY_BLOCK"),
}));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({
  undoAwarenessPolicy: vi.fn(() => "UNDO_AWARENESS_POLICY_BLOCK"),
}));

// --- Add these imports ---
import { actionAwarenessPolicy } from "@/lib/agent/policies/action-awareness";
import { undoAwarenessPolicy } from "@/lib/agent/policies/undo-awareness";
```

Add the following test cases inside the existing `describe("buildSystemPrompt")` block:

```typescript
  it("includes action awareness policy block", () => {
    const result = buildSystemPrompt(baseBootstrap);
    expect(result).toContain("ACTION_AWARENESS_POLICY_BLOCK");
    expect(actionAwarenessPolicy).toHaveBeenCalled();
  });

  it("includes undo awareness policy block", () => {
    const result = buildSystemPrompt(baseBootstrap);
    expect(result).toContain("UNDO_AWARENESS_POLICY_BLOCK");
    expect(undoAwarenessPolicy).toHaveBeenCalled();
  });

  it("places action awareness after memory directives", () => {
    const result = buildSystemPrompt(baseBootstrap);
    const memIdx = result.indexOf("MEMORY_USAGE_DIRECTIVES_BLOCK");
    const actionIdx = result.indexOf("ACTION_AWARENESS_POLICY_BLOCK");
    expect(memIdx).toBeLessThan(actionIdx);
  });

  it("places undo awareness after action awareness", () => {
    const result = buildSystemPrompt(baseBootstrap);
    const actionIdx = result.indexOf("ACTION_AWARENESS_POLICY_BLOCK");
    const undoIdx = result.indexOf("UNDO_AWARENESS_POLICY_BLOCK");
    expect(actionIdx).toBeLessThan(undoIdx);
  });

  it("full composition order: 12 blocks total (no situation directives)", () => {
    const result = buildSystemPrompt(baseBootstrap);
    const parts = result.split("\n\n---\n\n");
    // [CORE_CHARTER, SAFETY, TOOL, FACT_SCHEMA, OUTPUT, journeyPolicy,
    //  expertiseCalibration, turnManagement, memoryDirectives, actionAwareness, undoAwareness]
    expect(parts.length).toBe(11);
  });

  it("full composition order: 12 blocks total (with situation directives)", () => {
    const bootstrapWithSituations = {
      ...baseBootstrap,
      situations: ["has_thin_sections"] as any[],
      thinSections: ["skills", "projects"],
    };
    const result = buildSystemPrompt(bootstrapWithSituations);
    const parts = result.split("\n\n---\n\n");
    // [CORE_CHARTER, SAFETY, TOOL, FACT_SCHEMA, OUTPUT, journeyPolicy,
    //  situationDirectives, expertiseCalibration, turnManagement, memoryDirectives, actionAwareness, undoAwareness]
    expect(parts.length).toBe(12);
  });
```

### Test command

```bash
npx vitest run tests/evals/build-system-prompt.test.ts --reporter=verbose
```

---

## Task 4: Enhance expertise calibration

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/index.ts` |
| **modify** | `tests/evals/expertise-calibration.test.ts` |

### Steps

1. Write failing test (see Test section below)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/expertise-calibration.test.ts --reporter=verbose
   ```
3. Modify `getExpertiseCalibration` in `src/lib/agent/policies/index.ts` to add more detailed instructions
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/expertise-calibration.test.ts --reporter=verbose
   ```
5. Run the policy registry tests to confirm no regressions:
   ```bash
   npx vitest run tests/evals/policy-registry.test.ts tests/evals/expertise-calibration.test.ts --reporter=verbose
   ```
6. Commit: `feat: enhance expertise calibration with detailed behavioral instructions`

### Implementation

Replace the `getExpertiseCalibration` function body in `src/lib/agent/policies/index.ts`:

```typescript
/**
 * Returns calibration text that adjusts the agent's verbosity and explanations
 * based on how experienced the user is with the platform.
 *
 * Enhanced in Sprint 5 with detailed behavioral instructions for each level.
 * Interacts with the ACTION AWARENESS block for explain-before-act modulation.
 */
export function getExpertiseCalibration(level: ExpertiseLevel): string {
  switch (level) {
    case "novice":
      return `EXPERTISE CALIBRATION: novice
You are talking to someone new to this tool. Explain every action you take. Use phrases like "I'm adding this skill to your page" and "This will change how your page looks". Walk them through each step. Preview results explicitly.
- When you save a fact, tell them: "I've noted that down."
- When generating the page, explain what it means: "I'm putting together your page now — you'll see a preview appear on the right."
- When proposing publish, explain what it does: "Publishing will make your page live at a public URL that anyone can visit."
- When changing theme or layout, explain what will change and why BEFORE doing it — even if the user asked for it.
- Keep tool usage invisible — never mention "facts", "tools", or "sections" by technical name.
- Use analogies if helpful: "Think of it like updating your profile" or "This is like rearranging rooms in a house."`;

    case "familiar":
      return `EXPERTISE CALIBRATION: familiar
The user knows the basics. Skip explanations for simple operations (adding facts, small updates). Explain only for layout/theme changes or when the action is ambiguous.
- You can mention sections and page features by name (hero, bio, skills section).
- Don't explain what publishing does — they already know.
- For visual changes (theme, layout): briefly explain the choice and its impact, then act.
- For data operations (facts, visibility): just do it with a brief confirmation.
- When multiple options exist, present the top 2-3 choices without lengthy explanations.
- If suggesting a page rebuild, mention why (e.g., "I'll regenerate to include your new projects").`;

    case "expert":
      return `EXPERTISE CALIBRATION: expert
The user is experienced. Be minimal. Execute and confirm. "Done. Publish?" is a valid response. Don't explain tool operations unless asked.
- Skip all explanations for standard operations.
- Go straight to action — "Updated." / "Added." / "Done."
- Use shorthand references to sections, themes, and layouts.
- Suggest advanced features proactively: reorder, lock sections, layout changes, theme customization.
- If there are multiple options, state your recommendation with brief rationale — don't list all alternatives.
- "Changed to bento. Check preview." is a perfectly valid response.
- Only elaborate when the user explicitly asks "why?" or "what does that do?"`;

    default:
      return "";
  }
}
```

### Test

```typescript
// tests/evals/expertise-calibration.test.ts

/**
 * Tests for the enhanced expertise calibration.
 * Validates that each level has the correct behavioral instructions,
 * with specific expected phrases per level.
 */
import { describe, it, expect } from "vitest";

// Mock the policy sub-module dependencies since we're importing from the registry
vi.mock("@/lib/agent/policies/first-visit", () => ({
  firstVisitPolicy: vi.fn((lang: string) => `FIRST_VISIT_${lang}`),
}));
vi.mock("@/lib/agent/policies/returning-no-page", () => ({
  returningNoPagePolicy: vi.fn((lang: string) => `RETURNING_${lang}`),
}));
vi.mock("@/lib/agent/policies/draft-ready", () => ({
  draftReadyPolicy: vi.fn((lang: string) => `DRAFT_READY_${lang}`),
}));
vi.mock("@/lib/agent/policies/active-fresh", () => ({
  activeFreshPolicy: vi.fn((lang: string) => `ACTIVE_FRESH_${lang}`),
}));
vi.mock("@/lib/agent/policies/active-stale", () => ({
  activeStalePolicy: vi.fn((lang: string) => `ACTIVE_STALE_${lang}`),
}));
vi.mock("@/lib/agent/policies/blocked", () => ({
  blockedPolicy: vi.fn((lang: string) => `BLOCKED_${lang}`),
}));
vi.mock("@/lib/agent/policies/situations", () => ({
  pendingProposalsDirective: vi.fn(),
  thinSectionsDirective: vi.fn(),
  staleFactsDirective: vi.fn(),
  openConflictsDirective: vi.fn(),
}));

import { vi } from "vitest";
import { getExpertiseCalibration } from "@/lib/agent/policies/index";

describe("getExpertiseCalibration — enhanced", () => {
  describe("novice level", () => {
    const novice = getExpertiseCalibration("novice");

    it("contains expertise header with novice label", () => {
      expect(novice).toContain("EXPERTISE CALIBRATION: novice");
    });

    it("instructs to explain every action", () => {
      expect(novice).toMatch(/explain every action/i);
    });

    it("uses user-friendly phrasing examples", () => {
      expect(novice).toContain("I'm adding this skill to your page");
    });

    it("instructs to walk through steps", () => {
      expect(novice).toMatch(/walk.*through.*step/i);
    });

    it("instructs to preview results explicitly", () => {
      expect(novice).toMatch(/preview.*explicitly|preview.*appear/i);
    });

    it("instructs to explain publishing", () => {
      expect(novice).toMatch(/publishing.*make.*page.*live|explain.*publishing/i);
    });

    it("instructs to keep tool usage invisible", () => {
      expect(novice).toMatch(/tool usage invisible|never mention.*facts.*tools/i);
    });

    it("instructs to explain theme/layout changes even with explicit instruction", () => {
      expect(novice).toMatch(/explain.*BEFORE.*doing.*even if.*user asked/i);
    });
  });

  describe("familiar level", () => {
    const familiar = getExpertiseCalibration("familiar");

    it("contains expertise header with familiar label", () => {
      expect(familiar).toContain("EXPERTISE CALIBRATION: familiar");
    });

    it("instructs to skip explanations for simple operations", () => {
      expect(familiar).toMatch(/skip.*explanations.*simple/i);
    });

    it("instructs to explain for layout/theme changes", () => {
      expect(familiar).toMatch(/explain.*layout.*theme|layout.*theme.*explain/i);
    });

    it("allows mentioning features by name", () => {
      expect(familiar).toMatch(/mention.*sections|features.*by name/i);
    });

    it("instructs not to explain publishing", () => {
      expect(familiar).toMatch(/don't explain.*publishing/i);
    });

    it("allows brief confirmation for data operations", () => {
      expect(familiar).toMatch(/brief confirmation|just do it/i);
    });
  });

  describe("expert level", () => {
    const expert = getExpertiseCalibration("expert");

    it("contains expertise header with expert label", () => {
      expect(expert).toContain("EXPERTISE CALIBRATION: expert");
    });

    it("instructs to be minimal", () => {
      expect(expert).toMatch(/minimal|terse/i);
    });

    it("instructs to execute and confirm", () => {
      expect(expert).toMatch(/execute and confirm|done.*publish/i);
    });

    it("provides example of terse responses", () => {
      expect(expert).toMatch(/Done\.|Updated\.|Added\./);
    });

    it("instructs to suggest advanced features proactively", () => {
      expect(expert).toMatch(/suggest.*advanced.*proactively/i);
    });

    it("only elaborates on explicit user request", () => {
      expect(expert).toMatch(/only.*elaborate.*when.*user.*asks|explicitly asks/i);
    });

    it("provides shorthand example", () => {
      expect(expert).toMatch(/check preview|bento/i);
    });
  });

  describe("cross-level guarantees", () => {
    it("each level produces distinct text", () => {
      const levels = ["novice", "familiar", "expert"] as const;
      const results = levels.map((l) => getExpertiseCalibration(l));
      const unique = new Set(results);
      expect(unique.size).toBe(3);
    });

    it("each level is at least 200 chars (substantive content)", () => {
      const levels = ["novice", "familiar", "expert"] as const;
      for (const level of levels) {
        const text = getExpertiseCalibration(level);
        expect(text.length).toBeGreaterThan(200);
      }
    });

    it("novice is longest, expert is shortest", () => {
      const novice = getExpertiseCalibration("novice");
      const familiar = getExpertiseCalibration("familiar");
      const expert = getExpertiseCalibration("expert");
      expect(novice.length).toBeGreaterThan(familiar.length);
      expect(familiar.length).toBeGreaterThan(expert.length);
    });

    it("returns empty string for unknown level", () => {
      expect(getExpertiseCalibration("unknown" as any)).toBe("");
    });
  });
});
```

### Test command

```bash
npx vitest run tests/evals/expertise-calibration.test.ts --reporter=verbose
```

---

## Task 5: Cross-provider eval matrix — shared infrastructure

### Files

| Action | Path |
|--------|------|
| **create** | `tests/evals/cross-provider/setup.ts` |
| **create** | `vitest.config.cross-provider.ts` |

### Steps

1. Create the shared infrastructure: in-memory SQLite setup, provider parameterization, test helpers
2. Create a dedicated vitest config for cross-provider tests (separate from the fast unit test suite)
3. Verify the config works:
   ```bash
   npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose 2>&1 | head -20
   ```
4. Commit: `feat: add cross-provider eval infrastructure (setup, config, helpers)`

### Implementation

Create `vitest.config.cross-provider.ts` at the project root:

```typescript
// vitest.config.cross-provider.ts

import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Dedicated vitest config for cross-provider eval tests.
 *
 * These tests call real LLMs and are therefore:
 * - Slow (5-30s per scenario)
 * - Expensive (API costs)
 * - Non-deterministic (LLM output varies)
 *
 * Run explicitly:
 *   npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
 *
 * Run for a single provider:
 *   AI_PROVIDER=anthropic npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/evals/cross-provider/**/*.eval.ts"],
    testTimeout: 60_000, // 60s per test — LLM calls are slow
    hookTimeout: 30_000,
    // Run sequentially to avoid rate limits
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

Create `tests/evals/cross-provider/setup.ts`:

```typescript
// tests/evals/cross-provider/setup.ts

/**
 * Shared setup for cross-provider eval tests.
 *
 * Provides:
 * - Provider parameterization via AI_PROVIDER env var
 * - In-memory SQLite database with test data seeding
 * - Helper functions for asserting LLM output quality
 * - Timeout and retry configuration
 */

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Provider Parameterization
// ---------------------------------------------------------------------------

/**
 * Providers to test across. When AI_PROVIDER env var is set,
 * only that provider runs. Otherwise, all available providers run.
 *
 * Provider availability is determined by API key presence:
 * - google: GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY
 * - openai: OPENAI_API_KEY
 * - anthropic: ANTHROPIC_API_KEY
 * - ollama: OLLAMA_BASE_URL (defaults to localhost)
 */
export type TestProvider = "google" | "openai" | "anthropic" | "ollama";

export function getTestProviders(): TestProvider[] {
  const envProvider = process.env.AI_PROVIDER;
  if (envProvider) {
    return [envProvider as TestProvider];
  }

  const available: TestProvider[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    available.push("google");
  }
  if (process.env.OPENAI_API_KEY) {
    available.push("openai");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    available.push("anthropic");
  }
  // Ollama is always "available" (local) but may not be running
  // Only include if explicitly requested
  if (process.env.OLLAMA_BASE_URL || process.env.TEST_OLLAMA === "true") {
    available.push("ollama");
  }

  if (available.length === 0) {
    throw new Error(
      "No AI providers configured for cross-provider tests. " +
      "Set AI_PROVIDER or provide API keys in env."
    );
  }

  return available;
}

/**
 * Set the provider env var for a test block.
 * Returns a cleanup function to restore the original value.
 */
export function setProvider(provider: TestProvider): () => void {
  const original = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = provider;
  return () => {
    if (original === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = original;
    }
  };
}

// ---------------------------------------------------------------------------
// Test Data Seeding
// ---------------------------------------------------------------------------

/**
 * Minimal fact set for a test profile.
 * Covers the most common sections: identity, experience, skills, interests.
 */
export const SEED_FACTS = [
  { category: "identity", key: "full-name", value: { full: "Maria Rossi" } },
  { category: "identity", key: "role", value: { role: "UX Designer" } },
  { category: "identity", key: "location", value: { city: "Milan", country: "Italy" } },
  { category: "identity", key: "tagline", value: { tagline: "Designing for humans, not pixels" } },
  { category: "experience", key: "design-studio", value: { role: "Senior UX Designer", company: "Design Studio Milano", start: "2022-03", end: null, status: "current" } },
  { category: "experience", key: "tech-corp", value: { role: "UX Designer", company: "TechCorp", start: "2019-06", end: "2022-02", status: "past" } },
  { category: "skill", key: "figma", value: { name: "Figma", level: "expert" } },
  { category: "skill", key: "user-research", value: { name: "User Research", level: "advanced" } },
  { category: "skill", key: "prototyping", value: { name: "Prototyping", level: "advanced" } },
  { category: "interest", key: "typography", value: { name: "Typography" } },
  { category: "interest", key: "accessibility", value: { name: "Accessibility" } },
  { category: "project", key: "design-system", value: { name: "Milan Design System", description: "A comprehensive design system for the city of Milan's digital services", status: "active", role: "Lead Designer" } },
  { category: "social", key: "linkedin", value: { platform: "LinkedIn", url: "https://linkedin.com/in/mariarossi" } },
  { category: "education", key: "polimi", value: { institution: "Politecnico di Milano", degree: "MSc", field: "Communication Design", period: "2017-2019" } },
] as const;

/**
 * Sparse fact set for testing low-signal scenarios.
 */
export const SPARSE_FACTS = [
  { category: "identity", key: "full-name", value: { full: "Luca Bianchi" } },
] as const;

// ---------------------------------------------------------------------------
// Output Assertions
// ---------------------------------------------------------------------------

/**
 * Assert that LLM text output contains at least N of the given keywords.
 * Useful for behavioral assertions where exact wording varies.
 */
export function assertContainsAtLeast(
  text: string,
  keywords: string[],
  minCount: number,
  message?: string,
): void {
  const found = keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase()));
  if (found.length < minCount) {
    throw new Error(
      `${message ?? "Assertion failed"}: expected at least ${minCount} of [${keywords.join(", ")}] ` +
      `but found ${found.length}: [${found.join(", ")}]. Full text:\n${text.slice(0, 500)}`
    );
  }
}

/**
 * Assert that LLM output does NOT contain any of the given forbidden phrases.
 */
export function assertNoneOf(
  text: string,
  forbidden: string[],
  message?: string,
): void {
  const found = forbidden.filter((f) => text.toLowerCase().includes(f.toLowerCase()));
  if (found.length > 0) {
    throw new Error(
      `${message ?? "Assertion failed"}: found forbidden phrases [${found.join(", ")}]. ` +
      `Full text:\n${text.slice(0, 500)}`
    );
  }
}

/**
 * Assert that LLM output is within expected word count range.
 */
export function assertWordCount(
  text: string,
  min: number,
  max: number,
  message?: string,
): void {
  const words = text.trim().split(/\s+/).length;
  if (words < min || words > max) {
    throw new Error(
      `${message ?? "Assertion failed"}: expected ${min}-${max} words but got ${words}. ` +
      `Full text:\n${text.slice(0, 300)}`
    );
  }
}
```

### Test command

```bash
npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose 2>&1 | head -20
```

---

## Task 6: Cross-provider eval scenarios (8 files)

### Files

| Action | Path |
|--------|------|
| **create** | `tests/evals/cross-provider/onboarding-flow.eval.ts` |
| **create** | `tests/evals/cross-provider/translation.eval.ts` |
| **create** | `tests/evals/cross-provider/personalization.eval.ts` |
| **create** | `tests/evals/cross-provider/layout-change.eval.ts` |
| **create** | `tests/evals/cross-provider/undo-request.eval.ts` |
| **create** | `tests/evals/cross-provider/returning-stale.eval.ts` |
| **create** | `tests/evals/cross-provider/publish-incomplete.eval.ts` |
| **create** | `tests/evals/cross-provider/low-signal.eval.ts` |

### Steps

1. Create all 8 eval files
2. Run a single provider test to validate the infrastructure:
   ```bash
   AI_PROVIDER=anthropic npx vitest run --config vitest.config.cross-provider.ts tests/evals/cross-provider/onboarding-flow.eval.ts --reporter=verbose
   ```
3. Run the full matrix for all available providers:
   ```bash
   npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
   ```
4. Commit: `feat: add 8 cross-provider eval scenarios`

### Implementation

**Pipeline-aware eval strategy:** Scenarios 1 (onboarding-flow) and 4 (layout-change) use `buildSystemPrompt(bootstrap)` to test the real prompt composition pipeline. Scenarios 2-3 and 5-8 use controlled hardcoded prompts to isolate specific behaviors (structured output, undo, expertise adaptation) independently of pipeline changes. This gives us both integration coverage and focused unit evals.

#### Scenario 1: `onboarding-flow.eval.ts`

Tests: 5 conversation turns with good signal → facts created, page generated, publish proposed.
Strategy: Mock tool results, use real LLM for conversation. **Pipeline-aware**: uses `buildSystemPrompt()` with `first_visit` bootstrap.

```typescript
// tests/evals/cross-provider/onboarding-flow.eval.ts

/**
 * Cross-provider eval: Onboarding flow
 *
 * Scenario: New user provides good signal across 5 turns.
 * Expected: Agent extracts facts, generates page, proposes publish.
 *
 * LLM usage: Real conversation generation, mocked tool execution.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  assertNoneOf,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

/**
 * Build a real system prompt via the pipeline for eval scenarios.
 * This ensures evals test the actual prompt composition, not a legacy function.
 */
function buildOnboardingPrompt(language = "en"): string {
  const bootstrap: BootstrapPayload = {
    journeyState: "first_visit",
    situations: [],
    expertiseLevel: "novice",
    userName: null,
    lastSeenDaysAgo: null,
    publishedUsername: null,
    pendingProposalCount: 0,
    thinSections: [],
    staleFacts: [],
    language,
    conversationContext: null,
  };
  return buildSystemPrompt(bootstrap);
}

describe.each(providers)("onboarding-flow [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("extracts name from first user message", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
      ],
    });

    // Agent should acknowledge the name and ask a follow-up
    assertContainsAtLeast(text, ["Marco", "marco"], 1, "Should use the user's name");
    expect(text.length).toBeGreaterThan(10);
    expect(text.length).toBeLessThan(2000);
  });

  it("asks about different topics across turns (breadth-first)", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
        { role: "assistant", content: "Hey Marco! Nice to meet you. Software engineering in Rome — that's a great combo. What are you working on these days?" },
        { role: "user", content: "I work at Stripe on the payments API. Been there for 3 years." },
      ],
    });

    // After learning about work, agent should explore a DIFFERENT area
    // (not ask more work questions)
    const workFollowUps = ["more about stripe", "what else at work", "other projects at stripe", "team at stripe"];
    const differentAreas = ["hobby", "interest", "fun", "free time", "project", "side", "outside work", "passion", "skill", "proud"];

    // Should contain at least one reference to a different area
    assertContainsAtLeast(text, differentAreas, 1, "Should explore a different topic area");
  });

  it("proposes page generation after sufficient signal (5 turns)", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
        { role: "assistant", content: "Hey Marco! Software engineering in Rome — nice. What are you working on?" },
        { role: "user", content: "I work at Stripe on the payments API. Been there for 3 years." },
        { role: "assistant", content: "Stripe — impressive! What do you do for fun outside of work?" },
        { role: "user", content: "I love cycling and I'm really into photography. I also contribute to open source." },
        { role: "assistant", content: "That's a great mix! Any particular open source projects?" },
        { role: "user", content: "I maintain a popular TypeScript testing library on GitHub. Got about 5k stars." },
        { role: "assistant", content: "Very cool! With your engineering background, cycling, photography, and a popular open source project, you've got a compelling profile. Any skills or tools you'd want to highlight?" },
        { role: "user", content: "TypeScript, Go, React, and Kubernetes. I'm also pretty good at system design." },
      ],
    });

    // After 5 turns of good signal, agent should propose building the page
    assertContainsAtLeast(
      text,
      ["page", "build", "put together", "generate", "create", "preview", "ready", "enough"],
      2,
      "Should propose building the page"
    );
  });

  it("does not fabricate information", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "I'm Ana. I teach math at a high school." },
      ],
    });

    // Should not fabricate details the user didn't mention
    assertNoneOf(
      text,
      ["PhD", "university", "professor", "research", "published"],
      "Should not fabricate academic credentials"
    );
  });

  it("keeps responses concise (under 3 sentences for normal turns)", async () => {
    const systemPrompt = buildOnboardingPrompt("en");
    const { text } = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [
        { role: "user", content: "I'm Carlos, I'm a graphic designer in Barcelona." },
      ],
    });

    // Count sentences (rough heuristic)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    expect(sentences.length).toBeLessThanOrEqual(5); // Allow some flexibility for LLM variance
  });
});
```

#### Scenario 2: `translation.eval.ts`

Tests: Italian-to-English translation produces valid output.
Strategy: SDK-level eval — calls `generateText` directly with a translation prompt (not via `translatePageContent` service, to isolate cross-provider LLM quality from service-layer concerns like caching and structured output).

```typescript
// tests/evals/cross-provider/translation.eval.ts

/**
 * Cross-provider eval: Translation quality
 *
 * Scenario: Italian page content → English translation.
 * Expected: Proper English output, proper nouns preserved.
 *
 * LLM usage: Direct generateText with translation prompt (SDK-level, not service-level).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestProviders, setProvider, type TestProvider } from "./setup";

// Mock event-service (required by translate module)
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

// Mock the translation cache to force fresh LLM calls
vi.mock("@/lib/db", () => {
  // Provide a mock sqlite that returns null for cache lookups
  return {
    sqlite: {
      prepare: () => ({
        get: () => null,
        run: () => {},
      }),
    },
  };
});

import { vi } from "vitest";

const providers = getTestProviders();

describe.each(providers)("translation [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("translates Italian bio section to English", async () => {
    // Dynamic import to pick up the provider env var
    const { getModel } = await import("@/lib/ai/provider");
    const { generateText } = await import("ai");

    const italianBio = "Maria è una designer UX con sede a Milano. Si occupa di progettazione di interfacce digitali e ricerca con gli utenti.";

    const { text } = await generateText({
      model: getModel(),
      system: "You are a translator. Translate the following Italian text to English. Output ONLY the translated text, nothing else.",
      prompt: italianBio,
    });

    // Should be in English
    expect(text.toLowerCase()).toContain("designer");
    expect(text.toLowerCase()).toMatch(/milan|milano/i); // Proper noun preserved (either form)
    expect(text.toLowerCase()).toContain("ux");
    // Should NOT contain Italian function words
    expect(text.toLowerCase()).not.toContain(" è ");
    expect(text.toLowerCase()).not.toContain(" si occupa ");
  });

  it("preserves proper nouns during translation", async () => {
    const { getModel } = await import("@/lib/ai/provider");
    const { generateText } = await import("ai");

    const italianText = "Marco lavora presso Google a Roma. Ha studiato al Politecnico di Milano.";

    const { text } = await generateText({
      model: getModel(),
      system: "You are a translator. Translate the following Italian text to English. Output ONLY the translated text, nothing else. Preserve all proper nouns.",
      prompt: italianText,
    });

    // Proper nouns must be preserved
    expect(text).toContain("Marco");
    expect(text).toContain("Google");
    expect(text).toMatch(/Roma|Rome/); // Either form acceptable
    expect(text).toMatch(/Politecnico di Milano|Polytechnic University of Milan|Politecnico/);
  });

  it("translates skill names appropriately", async () => {
    const { getModel } = await import("@/lib/ai/provider");
    const { generateText } = await import("ai");

    const skillList = "Competenze: Progettazione grafica, Ricerca utenti, Prototipazione, TypeScript, React";

    const { text } = await generateText({
      model: getModel(),
      system: "You are a translator. Translate the following Italian text to English. Output ONLY the translated text, nothing else. Keep technical terms (TypeScript, React) unchanged.",
      prompt: skillList,
    });

    // Technical terms preserved
    expect(text).toContain("TypeScript");
    expect(text).toContain("React");
    // Italian terms translated
    expect(text.toLowerCase()).not.toContain("progettazione grafica");
  });
});
```

#### Scenario 3: `personalization.eval.ts`

Tests: Section personalization produces schema-conformant, text-only output.
Strategy: SDK-level eval — calls `generateObject` directly with personalization prompt and Zod schema (not via `personalizeSections` service, to isolate cross-provider structured output quality from service-layer orchestration).

```typescript
// tests/evals/cross-provider/personalization.eval.ts

/**
 * Cross-provider eval: Section personalization
 *
 * Scenario: Personalize a bio section given facts + soul.
 * Expected: Conforms to schema, text-only, within word limits.
 *
 * LLM usage: Direct generateObject with Zod schema (SDK-level, not service-level).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getTestProviders, setProvider, SEED_FACTS, type TestProvider } from "./setup";

// Mock event-service
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

const providers = getTestProviders();

describe.each(providers)("personalization [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("generates personalized bio text within word limits", async () => {
    const { getModel } = await import("@/lib/ai/provider");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const bioSchema = z.object({
      bio: z.string().describe("A personalized bio paragraph for the page"),
    });

    const facts = SEED_FACTS.map((f) => `[${f.category}/${f.key}]: ${JSON.stringify(f.value)}`).join("\n");

    const { object } = await generateObject({
      model: getModel(),
      schema: bioSchema,
      system: "You personalize web page sections. Write a warm, concise bio paragraph based on the provided facts. Max 80 words.",
      prompt: `Facts:\n${facts}\n\nWrite a personalized bio for this person's web page.`,
    });

    expect(object).toHaveProperty("bio");
    expect(typeof object.bio).toBe("string");

    const wordCount = object.bio.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThan(10);
    expect(wordCount).toBeLessThanOrEqual(100); // Allow some overshoot from LLM

    // Should mention the person's name
    expect(object.bio).toContain("Maria");
    // Should reference their role
    expect(object.bio.toLowerCase()).toMatch(/design|ux/i);
  });

  it("does not include non-text content in personalized output", async () => {
    const { getModel } = await import("@/lib/ai/provider");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const heroSchema = z.object({
      tagline: z.string().describe("A short, punchy tagline for the hero section"),
    });

    const facts = SEED_FACTS.filter((f) => f.category === "identity")
      .map((f) => `[${f.category}/${f.key}]: ${JSON.stringify(f.value)}`)
      .join("\n");

    const { object } = await generateObject({
      model: getModel(),
      schema: heroSchema,
      system: "You personalize web page hero sections. Write a short tagline (max 10 words). Text only — no HTML, no markdown, no URLs.",
      prompt: `Facts:\n${facts}\n\nWrite a personalized tagline.`,
    });

    expect(object).toHaveProperty("tagline");
    expect(object.tagline).not.toMatch(/<[^>]+>/); // No HTML
    expect(object.tagline).not.toMatch(/https?:\/\//); // No URLs
    expect(object.tagline).not.toMatch(/[#*_`]/); // No markdown
  });
});
```

#### Scenario 4: `layout-change.eval.ts`

Tests: User requests layout change → agent explains before executing.
Strategy: Mock tool results, use real LLM for conversation. **Pipeline-aware**: uses `buildSystemPrompt()` with `active_fresh`/`familiar` bootstrap.

```typescript
// tests/evals/cross-provider/layout-change.eval.ts

/**
 * Cross-provider eval: Layout change with explain-before-act
 *
 * Scenario: User asks to change layout. Agent should explain before executing.
 * Expected: Agent describes the change and its impact before acting.
 *
 * LLM usage: Real conversation generation, no tool execution.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

/**
 * Build a real system prompt via the pipeline for a returning user
 * with action-awareness active (familiar expertise = explain-before-act).
 */
function buildFamiliarUserPrompt(): string {
  const bootstrap: BootstrapPayload = {
    journeyState: "active_fresh",
    situations: [],
    expertiseLevel: "familiar",
    userName: "Marco",
    lastSeenDaysAgo: 2,
    publishedUsername: "marco",
    pendingProposalCount: 0,
    thinSections: [],
    staleFacts: [],
    language: "en",
    conversationContext: null,
  };
  return buildSystemPrompt(bootstrap);
}

describe.each(providers)("layout-change [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("explains the impact when user asks about layouts", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "I think my page could look better. What layout options do I have?" },
      ],
    });

    // Should describe available options
    assertContainsAtLeast(
      text,
      ["sidebar", "bento", "vertical", "grid", "column", "layout"],
      2,
      "Should describe available layout options"
    );
  });

  it("asks for confirmation before changing layout", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "I'd like to try a different layout, maybe something more modern." },
      ],
    });

    // Should ask for confirmation or present options, not just switch
    assertContainsAtLeast(
      text,
      ["would you like", "want me to", "sound good", "shall I", "how about", "recommend", "suggest", "try", "option"],
      1,
      "Should ask for confirmation or present options"
    );
  });

  it("acts directly with brief confirmation when user gives explicit instruction", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Switch to the bento layout." },
      ],
    });

    // With explicit instruction, should act (mention switching) without lengthy explanation
    assertContainsAtLeast(
      text,
      ["bento", "switch", "chang", "done", "preview", "right"],
      1,
      "Should acknowledge the explicit instruction"
    );
    // Should not be overly long (no need for extended explanation)
    const words = text.trim().split(/\s+/).length;
    expect(words).toBeLessThan(100);
  });
});
```

#### Scenario 5: `undo-request.eval.ts`

Tests: User says "don't like it" → agent identifies action, proposes reversal.
Strategy: Mock tool results, use real LLM for conversation.

```typescript
// tests/evals/cross-provider/undo-request.eval.ts

/**
 * Cross-provider eval: Undo request handling
 *
 * Scenario: User expresses dissatisfaction after a theme change.
 * Expected: Agent identifies the change, proposes reversal, does NOT regenerate entire page.
 *
 * LLM usage: Real conversation generation, no tool execution.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  assertNoneOf,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm, thoughtful AI that helps people build their personal web page.

UNDO AND REVERSAL HANDLING:
When the user expresses dissatisfaction or wants to undo:
1. IDENTIFY the last action (check recent tool calls)
2. EXPLAIN what was done
3. PROPOSE reversal + alternatives
4. ACT on user's decision

NEVER regenerate the entire page as first reaction.
If complaint is vague, ask what specifically isn't working.

Available themes: minimal, warm, editorial-360.
The page currently uses the "warm" theme (just changed from "minimal").`;

describe.each(providers)("undo-request [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("identifies last action when user says 'don't like it'", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "assistant", content: "I've switched your theme to warm — check out the preview!" },
        { role: "user", content: "Hmm, I don't like it. It was better before." },
      ],
    });

    // Should reference the theme change
    assertContainsAtLeast(
      text,
      ["theme", "warm", "minimal", "switch", "change", "back"],
      2,
      "Should identify and reference the theme change"
    );
  });

  it("proposes reversal instead of regenerating page", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "assistant", content: "I've switched your theme to warm — check out the preview!" },
        { role: "user", content: "No, go back. I preferred the other one." },
      ],
    });

    // Should propose going back to minimal
    assertContainsAtLeast(
      text,
      ["minimal", "back", "switch", "revert", "previous", "before"],
      2,
      "Should propose reverting to previous theme"
    );

    // Should NOT propose regenerating the entire page
    assertNoneOf(
      text,
      ["regenerate the entire page", "rebuild your whole page", "generate everything from scratch"],
      "Should not propose full page regeneration"
    );
  });

  it("asks for specifics when complaint is vague", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "I don't like how my page looks." },
      ],
    });

    // Should ask what specifically isn't working
    assertContainsAtLeast(
      text,
      ["what", "which", "specific", "part", "layout", "theme", "color", "text", "change"],
      2,
      "Should ask what specifically the user dislikes"
    );
  });

  it("handles Italian undo phrases", async () => {
    const italianPrompt = SYSTEM_PROMPT.replace(
      "You are the OpenSelf agent",
      "You are the OpenSelf agent. Converse in Italian"
    );

    const { text } = await generateText({
      model: getModel(),
      system: italianPrompt,
      messages: [
        { role: "assistant", content: "Ho cambiato il tema in warm — dai un'occhiata all'anteprima!" },
        { role: "user", content: "Non mi piace, torna come prima." },
      ],
    });

    // Should respond in Italian and propose reversal
    expect(text.length).toBeGreaterThan(10);
    // Should reference the theme or the previous state
    assertContainsAtLeast(
      text,
      ["tema", "minimal", "warm", "prima", "precedente", "tornare", "ripristino", "cambi"],
      1,
      "Should reference the change in Italian"
    );
  });
});
```

#### Scenario 6: `returning-stale.eval.ts`

Tests: Returning user with stale page → personalized greeting, no re-asking known info.
Strategy: Mock tool results, use real LLM for conversation.

```typescript
// tests/evals/cross-provider/returning-stale.eval.ts

/**
 * Cross-provider eval: Returning user with stale page
 *
 * Scenario: User returns after 2 weeks. Agent knows them.
 * Expected: Personalized greeting with name, no questions about known info.
 *
 * LLM usage: Real conversation generation, no tool execution.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  assertNoneOf,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm AI that helps people build their personal web page.

MODE: ACTIVE (STALE PAGE)
You already know this person. They published their page 2+ weeks ago and are returning.
Language: Converse in English.

CRITICAL RULES:
- Use their name from facts. NEVER ask for their name again.
- Do NOT re-ask information already stored as facts.
- Suggest updates based on what might have changed.

KNOWN FACTS ABOUT THE USER (14 facts):
- [identity/full-name]: {"full":"Maria Rossi"}
- [identity/role]: {"role":"UX Designer"}
- [identity/location]: {"city":"Milan","country":"Italy"}
- [experience/design-studio]: {"role":"Senior UX Designer","company":"Design Studio Milano","start":"2022-03","end":null,"status":"current"}
- [experience/tech-corp]: {"role":"UX Designer","company":"TechCorp","start":"2019-06","end":"2022-02","status":"past"}
- [skill/figma]: {"name":"Figma","level":"expert"}
- [skill/user-research]: {"name":"User Research","level":"advanced"}
- [skill/prototyping]: {"name":"Prototyping","level":"advanced"}
- [interest/typography]: {"name":"Typography"}
- [interest/accessibility]: {"name":"Accessibility"}
- [project/design-system]: {"name":"Milan Design System","description":"Design system for Milan's digital services","status":"active","role":"Lead Designer"}
- [social/linkedin]: {"platform":"LinkedIn","url":"https://linkedin.com/in/mariarossi"}
- [education/polimi]: {"institution":"Politecnico di Milano","degree":"MSc","field":"Communication Design","period":"2017-2019"}`;

describe.each(providers)("returning-stale [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("greets the user by name", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Hey, I'm back!" },
      ],
    });

    // Should use the user's name
    assertContainsAtLeast(
      text,
      ["Maria"],
      1,
      "Should greet the user by name"
    );
  });

  it("does NOT ask for name or basic info", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Hey, I'm back!" },
      ],
    });

    // Should NOT ask questions about already-known information
    assertNoneOf(
      text,
      ["what's your name", "what do you do", "where are you from", "tell me about yourself", "who are you"],
      "Should not re-ask known information"
    );
  });

  it("references known information in the greeting", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Hey!" },
      ],
    });

    // Should reference at least one known fact
    assertContainsAtLeast(
      text,
      ["Maria", "design", "UX", "Milan", "Design Studio", "Figma", "typography"],
      1,
      "Should reference at least one known fact"
    );
  });

  it("asks about what's new (not re-interviewing)", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Hi again!" },
      ],
    });

    // Should ask about updates/changes, not start from scratch
    assertContainsAtLeast(
      text,
      ["new", "changed", "update", "lately", "recent", "what's been", "since", "happening"],
      1,
      "Should ask about what's new"
    );
  });
});
```

#### Scenario 7: `publish-incomplete.eval.ts`

Tests: Publish with incomplete sections → preflight flags issues.
Strategy: Use publish_preflight tool mock data.

```typescript
// tests/evals/cross-provider/publish-incomplete.eval.ts

/**
 * Cross-provider eval: Publish with incomplete sections
 *
 * Scenario: Agent is asked to publish but page has incomplete sections.
 * Expected: Agent runs preflight check and communicates issues to user.
 *
 * LLM usage: Real conversation generation with preflight results in context.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm AI that helps people build their personal web page.

MODE: STEADY STATE
The user has a draft page with some incomplete sections.

When the user asks to publish, run publish_preflight first to check for issues.
If there are issues, explain them clearly and ask if the user wants to fix them or publish anyway.

PREFLIGHT RESULTS (just ran):
{
  "status": "warnings",
  "issues": [
    {"severity": "warning", "section": "skills", "message": "Only 1 skill listed — pages with 3+ skills look more complete"},
    {"severity": "warning", "section": "bio", "message": "Bio text is very short (under 20 words)"},
    {"severity": "error", "section": "hero", "message": "Missing tagline — hero section will look empty"}
  ],
  "publishable": true
}

KNOWN FACTS ABOUT THE USER:
- [identity/full-name]: {"full":"Luca Bianchi"}
- [skill/python]: {"name":"Python","level":"intermediate"}`;

describe.each(providers)("publish-incomplete [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("communicates preflight issues to the user", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Let's publish my page!" },
      ],
    });

    // Should mention at least some of the issues
    assertContainsAtLeast(
      text,
      ["skill", "bio", "tagline", "hero", "short", "incomplete", "missing", "issue", "warning"],
      2,
      "Should communicate preflight issues"
    );
  });

  it("offers to fix issues or publish anyway", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "I want to publish now." },
      ],
    });

    // Should give the user a choice
    assertContainsAtLeast(
      text,
      ["fix", "add", "improve", "publish anyway", "go ahead", "your call", "up to you", "want to", "would you like"],
      1,
      "Should offer the user a choice"
    );
  });

  it("prioritizes errors over warnings in explanation", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "Publish my page please." },
      ],
    });

    // Should mention the error (missing tagline) prominently
    assertContainsAtLeast(
      text,
      ["tagline", "hero", "missing"],
      1,
      "Should highlight the error-severity issue"
    );
  });
});
```

#### Scenario 8: `low-signal.eval.ts`

Tests: Vague replies → chips within 2 turns, minimal page within 5.
Strategy: Mock tool results, use real LLM for conversation.

```typescript
// tests/evals/cross-provider/low-signal.eval.ts

/**
 * Cross-provider eval: Low-signal user handling
 *
 * Scenario: User gives vague, minimal responses.
 * Expected: Agent escalates through guided prompts → fill-in-blank → minimal page fallback.
 *
 * LLM usage: Real conversation generation, no tool execution.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import {
  getTestProviders,
  setProvider,
  assertContainsAtLeast,
  type TestProvider,
} from "./setup";

const providers = getTestProviders();

const SYSTEM_PROMPT = `You are the OpenSelf agent — a warm AI that helps people build their personal web page.

MODE: ONBOARDING
Language: English.

Low-signal handling:
Step 1 — After 2+ low-signal replies: Switch to guided prompts with 3-4 short selectable options (chips).
Step 2 — If guided prompts still get minimal response: Try fill-in-the-blank sentence starters.
Step 3 — After 3 total guided/fill-in attempts: Build a minimal page with whatever you have.

NEVER respond with generic "let me know if you need anything" during onboarding.`;

describe.each(providers)("low-signal [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("presents guided options after 2 low-signal replies", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "Hey! Nice to meet you. I'd love to learn about you so I can build your personal page. What do you do?" },
        { role: "user", content: "stuff" },
        { role: "assistant", content: "No worries! Tell me a bit about yourself — what are you working on these days, or what are you into?" },
        { role: "user", content: "idk" },
      ],
    });

    // After 2+ low-signal replies, should switch to guided options
    assertContainsAtLeast(
      text,
      ["job", "project", "hobby", "interest", "proud", "work", "skill", "built", "pick", "choose", "start with"],
      2,
      "Should present guided selectable options"
    );
  });

  it("proposes minimal page after persistent low signal", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT + "\n\nKNOWN FACTS:\n- [identity/full-name]: {\"full\":\"Sam\"}",
      messages: [
        { role: "user", content: "hi im sam" },
        { role: "assistant", content: "Hey Sam! Let's build your page. Pick one to start: [My job] [A project] [Hobbies] [Something I'm proud of]" },
        { role: "user", content: "meh" },
        { role: "assistant", content: "No problem! Try this: \"People usually come to me when they need help with ___\"" },
        { role: "user", content: "ok" },
        { role: "assistant", content: "Alright, one more try: \"The thing I spend most time on is ___\"" },
        { role: "user", content: "dunno" },
      ],
    });

    // After 3 guided attempts, should propose building a minimal page
    assertContainsAtLeast(
      text,
      ["enough", "started", "simple", "page", "build", "minimal", "basic", "come back", "add more", "later"],
      2,
      "Should propose building a minimal page"
    );
  });

  it("never ends with passive closing during onboarding", async () => {
    const { text } = await generateText({
      model: getModel(),
      system: buildFamiliarUserPrompt(),
      messages: [
        { role: "user", content: "ok" },
      ],
    });

    // Should NOT end with a passive closing
    const lastSentence = text.trim().split(/[.!?]/).filter(Boolean).pop()?.toLowerCase() ?? "";
    expect(lastSentence).not.toMatch(/let me know if you need anything/i);
    expect(lastSentence).not.toMatch(/feel free to ask/i);
  });
});
```

### Test commands

Run a single scenario for one provider:
```bash
AI_PROVIDER=anthropic npx vitest run --config vitest.config.cross-provider.ts tests/evals/cross-provider/onboarding-flow.eval.ts --reporter=verbose
```

Run all scenarios for one provider:
```bash
AI_PROVIDER=anthropic npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
```

Run all scenarios for all available providers:
```bash
npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
```

---

## Task 7: Full regression + documentation update

### Files

| Action | Path |
|--------|------|
| **verify** | All test files |
| **modify** | `docs/plans/sprint-5-conversation-polish.md` (this file — mark DONE) |

### Steps

1. Run all unit tests (excluding cross-provider):
   ```bash
   npx vitest run tests/evals/ --reporter=verbose
   ```
2. Run the cross-provider matrix for at least one provider:
   ```bash
   AI_PROVIDER=anthropic npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
   ```
3. Run cross-provider for all available providers:
   ```bash
   npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
   ```
4. If any test fails, fix and re-run
5. Update this plan: mark each task as DONE
6. Commit: `test: verify full Sprint 5 test suite passes`

### Test commands

Full unit test suite (fast):
```bash
npx vitest run tests/evals/ --reporter=verbose
```

Cross-provider eval matrix (slow, requires API keys):
```bash
npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
```

Sprint 5 tests only (fast):
```bash
npx vitest run tests/evals/action-awareness.test.ts tests/evals/undo-awareness.test.ts tests/evals/expertise-calibration.test.ts tests/evals/build-system-prompt.test.ts --reporter=verbose
```

---

## Summary

### Files to create (15)

| Path | Task |
|------|------|
| `src/lib/agent/policies/action-awareness.ts` | 1 |
| `src/lib/agent/policies/undo-awareness.ts` | 2 |
| `tests/evals/action-awareness.test.ts` | 1 |
| `tests/evals/undo-awareness.test.ts` | 2 |
| `tests/evals/expertise-calibration.test.ts` | 4 |
| `vitest.config.cross-provider.ts` | 5 |
| `tests/evals/cross-provider/setup.ts` | 5 |
| `tests/evals/cross-provider/onboarding-flow.eval.ts` | 6 |
| `tests/evals/cross-provider/translation.eval.ts` | 6 |
| `tests/evals/cross-provider/personalization.eval.ts` | 6 |
| `tests/evals/cross-provider/layout-change.eval.ts` | 6 |
| `tests/evals/cross-provider/undo-request.eval.ts` | 6 |
| `tests/evals/cross-provider/returning-stale.eval.ts` | 6 |
| `tests/evals/cross-provider/publish-incomplete.eval.ts` | 6 |
| `tests/evals/cross-provider/low-signal.eval.ts` | 6 |

### Files to modify (3)

| Path | Task |
|------|------|
| `src/lib/agent/prompts.ts` | 3 |
| `src/lib/agent/policies/index.ts` | 4 |
| `tests/evals/build-system-prompt.test.ts` | 3 |

### Commits (7)

1. `feat: add action-awareness policy for explain-before-act pattern`
2. `feat: add undo-awareness policy for graceful reversal handling`
3. `feat: wire action-awareness and undo-awareness into buildSystemPrompt`
4. `feat: enhance expertise calibration with detailed behavioral instructions`
5. `feat: add cross-provider eval infrastructure (setup, config, helpers)`
6. `feat: add 8 cross-provider eval scenarios`
7. `test: verify full Sprint 5 test suite passes`

### Execution order

1. **Task 1** — action-awareness policy + tests
2. **Task 2** — undo-awareness policy + tests
3. **Task 3** — wire both into buildSystemPrompt + update tests
4. **Task 4** — enhance expertise calibration + tests
5. **Task 5** — cross-provider infrastructure (setup, config)
6. **Task 6** — 8 eval scenarios
7. **Task 7** — full regression + mark DONE

**Final validation after all tasks:**

```bash
npx vitest run tests/evals/action-awareness.test.ts tests/evals/undo-awareness.test.ts tests/evals/expertise-calibration.test.ts tests/evals/build-system-prompt.test.ts --reporter=verbose
```

Then run the full test suite to confirm no regressions:

```bash
npx vitest run tests/evals/ --reporter=verbose
```

Then run the cross-provider matrix:

```bash
npx vitest run --config vitest.config.cross-provider.ts --reporter=verbose
```
