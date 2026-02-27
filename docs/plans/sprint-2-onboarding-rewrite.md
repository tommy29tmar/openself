# Sprint 2: Onboarding Rewrite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the onboarding experience so new users are asked their name on turn 1, explored breadth-first, and guided to a published page within 8 turns.

**Architecture:** Replace monolithic onboardingPolicy/steadyStatePolicy with a composable policy system: per-state policy + situation directives + expertise calibration. Dynamic welcome message from bootstrap endpoint.

**Tech Stack:** TypeScript, Next.js App Router, Vercel AI SDK, vitest

**Dependency:** Sprint 1 (Journey Intelligence) must be complete. This plan assumes `src/lib/agent/journey.ts` exists and exports `JourneyState`, `Situation`, `ExpertiseLevel`, `BootstrapPayload`, `assembleBootstrapPayload()`. It also assumes `GET /api/chat/bootstrap` is live.

---

## Task 1: Create policy registry `src/lib/agent/policies/index.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/index.ts` |
| **test** | `tests/evals/policy-registry.test.ts` |

### Steps

1. Write failing test (step 3 below has the test code)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/policy-registry.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/index.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/policy-registry.test.ts --reporter=verbose
   ```
5. Commit: `feat: add policy registry for journey-based prompt composition`

### Implementation

```typescript
// src/lib/agent/policies/index.ts

import type { JourneyState, Situation, ExpertiseLevel } from "@/lib/agent/journey";
import { firstVisitPolicy } from "./first-visit";
import { returningNoPagePolicy } from "./returning-no-page";
import { draftReadyPolicy } from "./draft-ready";
import { activeFreshPolicy } from "./active-fresh";
import { activeStalePolicy } from "./active-stale";
import { blockedPolicy } from "./blocked";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SituationContext = {
  pendingProposalCount: number;
  pendingProposalSections: string[];
  thinSections: string[];
  staleFacts: string[];
  openConflicts: string[];
};

// ---------------------------------------------------------------------------
// Journey Policy
// ---------------------------------------------------------------------------

const POLICY_MAP: Record<JourneyState, (language: string) => string> = {
  first_visit: firstVisitPolicy,
  returning_no_page: returningNoPagePolicy,
  draft_ready: draftReadyPolicy,
  active_fresh: activeFreshPolicy,
  active_stale: activeStalePolicy,
  blocked: blockedPolicy,
};

/**
 * Returns the prompt policy text for the given journey state.
 * This is the primary mode-specific block in the system prompt.
 */
export function getJourneyPolicy(state: JourneyState, language: string): string {
  const policyFn = POLICY_MAP[state];
  if (!policyFn) {
    // Defensive: fall back to first_visit if state is unknown
    return firstVisitPolicy(language);
  }
  return policyFn(language);
}

// ---------------------------------------------------------------------------
// Situation Directives
// ---------------------------------------------------------------------------

/**
 * Composes situation-specific directives from active situations + context data.
 * Returns empty string if no situations are active.
 */
export function getSituationDirectives(
  situations: Situation[],
  context: SituationContext,
): string {
  const directives: string[] = [];

  if (situations.includes("has_pending_proposals") && context.pendingProposalCount > 0) {
    directives.push(pendingProposalsDirective(context.pendingProposalCount, context.pendingProposalSections));
  }

  if (situations.includes("has_thin_sections") && context.thinSections.length > 0) {
    directives.push(thinSectionsDirective(context.thinSections));
  }

  if (situations.includes("has_stale_facts") && context.staleFacts.length > 0) {
    directives.push(staleFactsDirective(context.staleFacts));
  }

  if (situations.includes("has_open_conflicts") && context.openConflicts.length > 0) {
    directives.push(openConflictsDirective(context.openConflicts));
  }

  if (directives.length === 0) return "";

  return `SITUATION DIRECTIVES:\n${directives.join("\n\n")}`;
}

// Individual directive functions (re-exported from situations.ts in Task 4)
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
} from "./situations";

// ---------------------------------------------------------------------------
// Expertise Calibration
// ---------------------------------------------------------------------------

/**
 * Returns calibration text that adjusts the agent's verbosity and explanations
 * based on how experienced the user is with the platform.
 */
export function getExpertiseCalibration(level: ExpertiseLevel): string {
  switch (level) {
    case "novice":
      return `EXPERTISE CALIBRATION: novice
- This is a new or very new user. Explain features briefly when you use them.
- When generating the page, tell them to look at the preview panel on the right.
- When proposing publish, explain what publishing means (live public page at a URL).
- Keep tool usage invisible — never mention "facts" or "tools" by name.`;

    case "familiar":
      return `EXPERTISE CALIBRATION: familiar
- This user has used OpenSelf a few times. Skip basic explanations.
- You can mention sections and page features by name.
- Don't explain what publishing does — they already know.`;

    case "expert":
      return `EXPERTISE CALIBRATION: expert
- Power user. Be terse and efficient.
- Skip all explanations. Go straight to action.
- Use shorthand references to sections, themes, and layouts.
- Suggest advanced features (reorder, lock, layout changes) proactively.`;

    default:
      return "";
  }
}
```

### Test

```typescript
// tests/evals/policy-registry.test.ts

/**
 * Tests for the policy registry module.
 * Covers: getJourneyPolicy, getSituationDirectives, getExpertiseCalibration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all policy modules before import
vi.mock("@/lib/agent/policies/first-visit", () => ({
  firstVisitPolicy: vi.fn((lang: string) => `FIRST_VISIT_POLICY_${lang}`),
}));
vi.mock("@/lib/agent/policies/returning-no-page", () => ({
  returningNoPagePolicy: vi.fn((lang: string) => `RETURNING_NO_PAGE_${lang}`),
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
  pendingProposalsDirective: vi.fn(
    (count: number, sections: string[]) =>
      `PROPOSALS: ${count} pending in [${sections.join(", ")}]`,
  ),
  thinSectionsDirective: vi.fn(
    (sections: string[]) => `THIN: [${sections.join(", ")}]`,
  ),
  staleFactsDirective: vi.fn(
    (facts: string[]) => `STALE: [${facts.join(", ")}]`,
  ),
  openConflictsDirective: vi.fn(
    (conflicts: string[]) => `CONFLICTS: [${conflicts.join(", ")}]`,
  ),
}));

import {
  getJourneyPolicy,
  getSituationDirectives,
  getExpertiseCalibration,
} from "@/lib/agent/policies/index";
import type { SituationContext } from "@/lib/agent/policies/index";
import type { Situation } from "@/lib/agent/journey";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getJourneyPolicy
// ---------------------------------------------------------------------------
describe("getJourneyPolicy", () => {
  it("returns first_visit policy for first_visit state", () => {
    const result = getJourneyPolicy("first_visit", "en");
    expect(result).toBe("FIRST_VISIT_POLICY_en");
  });

  it("returns returning_no_page policy for returning_no_page state", () => {
    const result = getJourneyPolicy("returning_no_page", "it");
    expect(result).toBe("RETURNING_NO_PAGE_it");
  });

  it("returns draft_ready policy for draft_ready state", () => {
    const result = getJourneyPolicy("draft_ready", "en");
    expect(result).toBe("DRAFT_READY_en");
  });

  it("returns active_fresh policy for active_fresh state", () => {
    const result = getJourneyPolicy("active_fresh", "fr");
    expect(result).toBe("ACTIVE_FRESH_fr");
  });

  it("returns active_stale policy for active_stale state", () => {
    const result = getJourneyPolicy("active_stale", "de");
    expect(result).toBe("ACTIVE_STALE_de");
  });

  it("returns blocked policy for blocked state", () => {
    const result = getJourneyPolicy("blocked", "es");
    expect(result).toBe("BLOCKED_es");
  });

  it("maps every JourneyState to a distinct policy function", () => {
    const states = [
      "first_visit",
      "returning_no_page",
      "draft_ready",
      "active_fresh",
      "active_stale",
      "blocked",
    ] as const;
    const results = states.map((s) => getJourneyPolicy(s, "en"));
    const unique = new Set(results);
    expect(unique.size).toBe(states.length);
  });
});

// ---------------------------------------------------------------------------
// getSituationDirectives
// ---------------------------------------------------------------------------
describe("getSituationDirectives", () => {
  const emptyContext: SituationContext = {
    pendingProposalCount: 0,
    pendingProposalSections: [],
    thinSections: [],
    staleFacts: [],
    openConflicts: [],
  };

  it("returns empty string when no situations active", () => {
    const result = getSituationDirectives([], emptyContext);
    expect(result).toBe("");
  });

  it("includes pending proposals directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      pendingProposalCount: 3,
      pendingProposalSections: ["bio", "skills"],
    };
    const result = getSituationDirectives(["has_pending_proposals"], ctx);
    expect(result).toContain("SITUATION DIRECTIVES:");
    expect(result).toContain("PROPOSALS: 3 pending");
    expect(result).toContain("bio");
    expect(result).toContain("skills");
  });

  it("includes thin sections directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      thinSections: ["projects", "achievements"],
    };
    const result = getSituationDirectives(["has_thin_sections"], ctx);
    expect(result).toContain("THIN:");
    expect(result).toContain("projects");
    expect(result).toContain("achievements");
  });

  it("includes stale facts directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      staleFacts: ["skill/typescript", "experience/acme"],
    };
    const result = getSituationDirectives(["has_stale_facts"], ctx);
    expect(result).toContain("STALE:");
    expect(result).toContain("skill/typescript");
  });

  it("includes open conflicts directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      openConflicts: ["identity/name: chat vs github"],
    };
    const result = getSituationDirectives(["has_open_conflicts"], ctx);
    expect(result).toContain("CONFLICTS:");
    expect(result).toContain("identity/name");
  });

  it("composes multiple directives when multiple situations active", () => {
    const situations: Situation[] = [
      "has_pending_proposals",
      "has_thin_sections",
      "has_stale_facts",
    ];
    const ctx: SituationContext = {
      ...emptyContext,
      pendingProposalCount: 1,
      pendingProposalSections: ["bio"],
      thinSections: ["skills"],
      staleFacts: ["experience/old-job"],
    };
    const result = getSituationDirectives(situations, ctx);
    expect(result).toContain("PROPOSALS:");
    expect(result).toContain("THIN:");
    expect(result).toContain("STALE:");
  });

  it("skips proposals directive when situation flag is set but count is 0", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      pendingProposalCount: 0,
      pendingProposalSections: [],
    };
    const result = getSituationDirectives(["has_pending_proposals"], ctx);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getExpertiseCalibration
// ---------------------------------------------------------------------------
describe("getExpertiseCalibration", () => {
  it("returns novice calibration with explanation hints", () => {
    const result = getExpertiseCalibration("novice");
    expect(result).toContain("novice");
    expect(result).toContain("preview panel");
    expect(result).toContain("publishing means");
  });

  it("returns familiar calibration with skip-basics hint", () => {
    const result = getExpertiseCalibration("familiar");
    expect(result).toContain("familiar");
    expect(result).toContain("Skip basic explanations");
  });

  it("returns expert calibration with terse hint", () => {
    const result = getExpertiseCalibration("expert");
    expect(result).toContain("expert");
    expect(result).toContain("terse");
  });

  it("each level produces distinct text", () => {
    const levels = ["novice", "familiar", "expert"] as const;
    const results = levels.map((l) => getExpertiseCalibration(l));
    const unique = new Set(results);
    expect(unique.size).toBe(3);
  });
});
```

### Test command

```bash
npx vitest run tests/evals/policy-registry.test.ts --reporter=verbose
```

---

## Task 2: Create `src/lib/agent/policies/first-visit.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/first-visit.ts` |
| **test** | `tests/evals/onboarding-policy.test.ts` |

### Steps

1. Write failing test (step 3 below has the test code)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/onboarding-policy.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/first-visit.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/onboarding-policy.test.ts --reporter=verbose
   ```
5. Commit: `feat: add first-visit onboarding policy with 3-phase turn structure`

### Implementation

```typescript
// src/lib/agent/policies/first-visit.ts

/**
 * First-visit onboarding policy.
 *
 * Three phases:
 * - Phase A: Identity (turns 1-2) — ask name, ask what they do
 * - Phase B: Breadth-first exploration (turns 3-6) — skills, projects, interests, achievements
 * - Phase C: Generate + publish (turns 7-8) — build page, propose publish
 *
 * Replaces the monolithic onboardingPolicy() in prompts.ts.
 */

export function firstVisitPolicy(language: string): string {
  return `MODE: FIRST VISIT (ONBOARDING)
You are meeting this person for the first time. Your goal is to learn enough about them to build a beautiful personal page within ~8 conversational turns.

Language: Converse in ${language || "the user's language"}. All page content should be in the same language.

PHASE A — Identity (turns 1-2):
- Turn 1: The welcome message already asked their name. When they respond, immediately create_fact(category: "identity", key: "name", value: {full: "<name>"}).
  Then ask what they do for work or study — a single focused question.
- Turn 2: Record their role/profession as a fact. Ask one follow-up to clarify (e.g., company, specialty, or what excites them about it).
  After turn 2 you MUST have: name + role/occupation. If missing, ask directly before moving on.

PHASE B — Breadth-first exploration (turns 3-6):
- Cover as many DIFFERENT areas as possible. Target at least 3 distinct areas from: skills, projects, interests/hobbies, achievements, education, activities.
- RULE: Never ask 2 consecutive questions about the same area. If turn 3 was about projects, turn 4 MUST be about a different area.
- Ask exactly ONE question per turn. Do not stack questions.
- If the user volunteers information about a different area, follow their lead but ensure breadth.
- Record EVERY piece of information as a fact immediately — do not wait. Use create_fact after every user message.
- Use natural transitions between areas: "Cool! And outside of work, what do you enjoy doing?" not "Now let's talk about your hobbies."

PHASE C — Generate + publish (turns 7-8):
- Turn 7: Call generate_page to build the page. Tell the user: "Here's your page! Take a look on the right."
  Wait for their feedback. If they want changes, make them.
- Turn 8: Once the user is happy (or after one round of edits), propose publishing:
  Suggest a username based on their name (lowercase, hyphenated) and call request_publish.
  Tell them a publish button will appear to confirm.
- If the user says they're done earlier (turn 5-6 with good signal), skip ahead to Phase C.

LOW-SIGNAL HANDLING:
When the user gives very short or vague replies ("ok", "yes", "I don't know", single words, emojis):

Step 1 — Guided prompts (after 2+ low-signal replies in a row):
  Switch to concrete, selectable options. Present 3-4 short choices as chips:
  "Pick one to start with: [My job] [A project I built] [Hobbies & interests] [Something I'm proud of]"

Step 2 — Fill-in-the-blank (if guided prompts still get minimal response):
  Try sentence starters: "People usually come to me when they need help with ___"

Step 3 — Minimal page fallback (after 3 total guided/fill-in attempts with low signal):
  Stop pushing. Say: "No worries! Let me build a simple page with what I have — you can always add more later."
  Then generate a minimal page and propose publish.

CRITICAL RULES:
- Record EVERY piece of information as a fact IMMEDIATELY via create_fact. Do not batch or delay.
- NEVER end a turn with "let me know if you need anything" or similar passive closings.
- NEVER ask more than one question per turn.
- After generating the page, ALWAYS move toward publishing. Never leave the user hanging.
- If the user seems done at any point, generate the page and propose publish.`;
}
```

### Test

```typescript
// tests/evals/onboarding-policy.test.ts

/**
 * Tests for the first-visit onboarding policy.
 * Validates that the policy text contains the required structural elements:
 * turn phases, fact recording mandate, breadth-first rule, generate/publish flow,
 * and banned patterns.
 */
import { describe, it, expect } from "vitest";
import { firstVisitPolicy } from "@/lib/agent/policies/first-visit";

describe("firstVisitPolicy", () => {
  const policyEn = firstVisitPolicy("en");
  const policyIt = firstVisitPolicy("it");

  // -------------------------------------------------------------------------
  // Phase structure
  // -------------------------------------------------------------------------
  describe("phase structure", () => {
    it("contains Phase A — Identity with turns 1-2", () => {
      expect(policyEn).toContain("PHASE A");
      expect(policyEn).toMatch(/Identity.*turn.*1.*2/is);
    });

    it("contains Phase B — Breadth-first exploration with turns 3-6", () => {
      expect(policyEn).toContain("PHASE B");
      expect(policyEn).toMatch(/exploration.*turn.*3.*6/is);
    });

    it("contains Phase C — Generate + publish with turns 7-8", () => {
      expect(policyEn).toContain("PHASE C");
      expect(policyEn).toMatch(/publish.*turn.*7.*8/is);
    });
  });

  // -------------------------------------------------------------------------
  // Phase A: Identity (name + role)
  // -------------------------------------------------------------------------
  describe("Phase A: Identity", () => {
    it("instructs to record name as fact on turn 1", () => {
      expect(policyEn).toMatch(/turn\s*1.*create_fact.*identity.*name/is);
    });

    it("instructs to ask about work/role after name", () => {
      expect(policyEn).toMatch(/ask.*what they do|work|role|profession/i);
    });

    it("requires name + role by end of turn 2", () => {
      expect(policyEn).toMatch(/turn\s*2.*name.*role|must have.*name.*role/is);
    });
  });

  // -------------------------------------------------------------------------
  // Phase B: Breadth-first rule
  // -------------------------------------------------------------------------
  describe("Phase B: Breadth-first exploration", () => {
    it("explicitly forbids consecutive questions on the same area", () => {
      expect(policyEn).toMatch(/never.*2\s*consecutive.*same\s*area/i);
    });

    it("lists at least 3 distinct exploration areas", () => {
      // The policy should mention skills, projects, interests, achievements, education, or activities
      const areas = ["skills", "projects", "interests", "achievements", "education", "activities"];
      const mentionedAreas = areas.filter((a) => policyEn.toLowerCase().includes(a));
      expect(mentionedAreas.length).toBeGreaterThanOrEqual(3);
    });

    it("requires exactly one question per turn", () => {
      expect(policyEn).toMatch(/one\s*question\s*per\s*turn/i);
    });
  });

  // -------------------------------------------------------------------------
  // Phase C: Generate + publish
  // -------------------------------------------------------------------------
  describe("Phase C: Generate + publish", () => {
    it("mentions generate_page tool", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("mentions request_publish tool", () => {
      expect(policyEn).toContain("request_publish");
    });

    it("instructs to suggest a username", () => {
      expect(policyEn).toMatch(/suggest.*username/i);
    });

    it("allows skipping to Phase C early with good signal", () => {
      expect(policyEn).toMatch(/skip.*ahead|earlier.*phase\s*c/is);
    });
  });

  // -------------------------------------------------------------------------
  // Fact recording mandate
  // -------------------------------------------------------------------------
  describe("fact recording", () => {
    it("demands EVERY piece of information be recorded as fact", () => {
      expect(policyEn).toMatch(/every.*piece.*information.*fact/i);
    });

    it("demands IMMEDIATE fact recording via create_fact", () => {
      expect(policyEn).toMatch(/immediately|immediate/i);
      expect(policyEn).toContain("create_fact");
    });

    it("forbids batching or delaying fact recording", () => {
      expect(policyEn).toMatch(/not\s*(batch|delay)|never.*wait/i);
    });
  });

  // -------------------------------------------------------------------------
  // Low-signal handling
  // -------------------------------------------------------------------------
  describe("low-signal handling", () => {
    it("defines 3 escalation steps", () => {
      expect(policyEn).toContain("Step 1");
      expect(policyEn).toContain("Step 2");
      expect(policyEn).toContain("Step 3");
    });

    it("step 1 triggers after 2+ low-signal replies", () => {
      expect(policyEn).toMatch(/2\+\s*low-signal/i);
    });

    it("step 2 uses fill-in-the-blank technique", () => {
      expect(policyEn).toMatch(/fill.*blank|sentence\s*starters?/i);
    });

    it("step 3 generates minimal page fallback", () => {
      expect(policyEn).toMatch(/minimal\s*page/i);
    });
  });

  // -------------------------------------------------------------------------
  // Banned patterns
  // -------------------------------------------------------------------------
  describe("banned patterns", () => {
    it("explicitly bans 'let me know if you need anything'", () => {
      expect(policyEn).toMatch(/never.*let me know/i);
    });

    it("bans passive closings", () => {
      expect(policyEn).toMatch(/never.*passive|never.*let me know.*anything/i);
    });
  });

  // -------------------------------------------------------------------------
  // Language embedding
  // -------------------------------------------------------------------------
  describe("language embedding", () => {
    it("embeds the language parameter in the policy text (en)", () => {
      expect(policyEn).toContain("en");
    });

    it("embeds the language parameter in the policy text (it)", () => {
      expect(policyIt).toContain("it");
    });
  });

  // -------------------------------------------------------------------------
  // Return type
  // -------------------------------------------------------------------------
  it("returns a non-empty string", () => {
    expect(typeof policyEn).toBe("string");
    expect(policyEn.length).toBeGreaterThan(100);
  });
});
```

### Test command

```bash
npx vitest run tests/evals/onboarding-policy.test.ts --reporter=verbose
```

---

## Task 3: Create stub policies for other journey states

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/returning-no-page.ts` |
| **create** | `src/lib/agent/policies/draft-ready.ts` |
| **create** | `src/lib/agent/policies/active-fresh.ts` |
| **create** | `src/lib/agent/policies/active-stale.ts` |
| **create** | `src/lib/agent/policies/blocked.ts` |

### Steps

1. Create all 5 stub policy files
2. Run the policy registry test from Task 1 to confirm stubs satisfy imports:
   ```bash
   npx vitest run tests/evals/policy-registry.test.ts --reporter=verbose
   ```
3. Commit: `feat: add stub policies for non-onboarding journey states`

### Implementation

```typescript
// src/lib/agent/policies/returning-no-page.ts

/**
 * Policy for returning users who have facts but no draft or published page.
 * Stub — will be fully fleshed out in Sprint 3.
 */
export function returningNoPagePolicy(language: string): string {
  return `MODE: RETURNING (NO PAGE YET)
Welcome back! You've talked to this person before, and you have some facts about them, but their page hasn't been generated yet.

Language: Converse in ${language || "the user's language"}.

Conversation flow:
1. Greet them warmly and acknowledge you remember them. Reference something specific you know about them.
2. Ask if they'd like to pick up where they left off and build their page.
3. Check existing facts with search_facts before asking questions they've already answered.
4. If they have enough facts (5+), suggest generating the page right away.
5. If facts are sparse, resume the breadth-first exploration from the first-visit flow.

Key behaviors:
- Use search_facts before every question to avoid repetition.
- Record any new information as facts immediately.
- Guide toward page generation — this user has already invested time.
- If they seem ready, call generate_page and then propose publishing.
- NEVER ask for information you already have stored as facts.`;
}
```

```typescript
// src/lib/agent/policies/draft-ready.ts

/**
 * Policy for users who have a draft page but haven't published yet.
 * Stub — will be fully fleshed out in Sprint 3.
 */
export function draftReadyPolicy(language: string): string {
  return `MODE: DRAFT READY
This person has a draft page already built but hasn't published it yet.

Language: Converse in ${language || "the user's language"}.

Conversation flow:
1. Remind them their page is ready for review. Tell them to check the preview on the right.
2. Ask if they'd like to make any changes or if they're ready to publish.
3. If they want changes, make the edits and regenerate.
4. If they're happy, suggest a username and call request_publish.

Key behaviors:
- Lead with the page preview — don't restart the conversation from scratch.
- Be concise — this user is close to publishing.
- Suggest a username based on their name (lowercase, hyphenated).
- If they add new info, record as facts, regenerate page, then re-offer publish.
- NEVER leave the conversation without offering to publish.`;
}
```

```typescript
// src/lib/agent/policies/active-fresh.ts

/**
 * Policy for users with a recently published page (updated within 7 days).
 * Stub — will be fully fleshed out in Sprint 3.
 */
export function activeFreshPolicy(language: string): string {
  return `MODE: ACTIVE (FRESH)
This person has a published page that was recently updated. They're returning to make changes or add new info.

Language: Converse in ${language || "the user's language"}.

Conversation flow:
1. Welcome back briefly. Ask what's new or what they'd like to update.
2. Update facts based on new information. Use update_fact for changes, create_fact for new info.
3. Regenerate the page when changes warrant it.
4. Be brief — returning users want quick updates, not interviews.

Key behaviors:
- Check existing facts before asking questions (use search_facts).
- Use update_fact when information changes — don't create duplicates.
- Only regenerate the page when changes are significant.
- If authenticated, use their existing username with request_publish — do NOT ask for a username.
- The user can also publish directly from the navigation bar in the builder.
- Proactively ask about thin or empty sections to collect more facts.`;
}
```

```typescript
// src/lib/agent/policies/active-stale.ts

/**
 * Policy for users with a published page that hasn't been updated in 7+ days.
 * Stub — will be fully fleshed out in Sprint 3.
 */
export function activeStalePolicy(language: string): string {
  return `MODE: ACTIVE (STALE)
This person has a published page but it hasn't been updated recently. Time for a refresh.

Language: Converse in ${language || "the user's language"}.

Conversation flow:
1. Welcome back. Gently note it's been a while and ask what's changed.
2. Proactively suggest areas to update based on stale facts.
3. Focus on what's NEW — new projects, new role, new interests.
4. After collecting updates, regenerate the page.

Key behaviors:
- Encourage updates by asking about specific areas: "Still working at [company]?" or "Any new projects since [last project]?"
- Prioritize updating stale facts over creating new ones.
- If the page has thin sections, ask about those areas.
- Use update_fact for corrections, create_fact for new things, delete_fact for outdated things the user confirms are gone.
- Regenerate and offer to re-publish after significant updates.
- If authenticated, use their existing username — do NOT ask for a new one.`;
}
```

```typescript
// src/lib/agent/policies/blocked.ts

/**
 * Policy for users who have exhausted their message quota.
 * Stub — will be fully fleshed out in Sprint 3.
 */
export function blockedPolicy(language: string): string {
  return `MODE: BLOCKED (QUOTA EXHAUSTED)
This person has used all their messages for this session.

Language: Converse in ${language || "the user's language"}.

You have very limited ability to help. Your response should:
1. Acknowledge the limit warmly — don't be apologetic, just matter-of-fact.
2. If they have a draft page, suggest publishing it.
3. If they're authenticated, remind them of their published page URL.
4. Suggest they can come back tomorrow when the quota resets.

Keep it to 1-2 sentences maximum. Do not ask follow-up questions.`;
}
```

### Test command

```bash
npx vitest run tests/evals/policy-registry.test.ts --reporter=verbose
```

---

## Task 4: Create `src/lib/agent/policies/situations.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/situations.ts` |
| **test** | `tests/evals/situation-directives.test.ts` |

### Steps

1. Write failing test (step 3 below has the test code)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/situation-directives.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/situations.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/situation-directives.test.ts --reporter=verbose
   ```
5. Commit: `feat: add situation directive generators for contextual prompt injection`

### Implementation

```typescript
// src/lib/agent/policies/situations.ts

/**
 * Situation-specific directive generators.
 *
 * Each function returns a self-contained paragraph that can be injected into the
 * system prompt to give the agent awareness of a specific real-time situation.
 *
 * These are composed by getSituationDirectives() in the registry.
 */

/**
 * Directive: pending proposals from the heartbeat that need user review.
 */
export function pendingProposalsDirective(count: number, sections: string[]): string {
  const sectionList = sections.length > 0 ? ` in sections: ${sections.join(", ")}` : "";
  return `PENDING PROPOSALS: You have ${count} content proposal${count !== 1 ? "s" : ""} waiting for user review${sectionList}.
When appropriate, mention to the user that there are suggestions ready for review.
Do not push — just mention it naturally if the conversation allows.
The user can review proposals via the proposal banner in the builder.`;
}

/**
 * Directive: sections that are thin or empty and need more facts.
 */
export function thinSectionsDirective(sections: string[]): string {
  if (sections.length === 0) return "";
  const sectionList = sections.join(", ");
  return `THIN SECTIONS: The following page sections need more content: ${sectionList}.
When the conversation naturally allows, guide the user toward topics that would fill these sections.
Pick the 1-2 most relevant thin sections based on conversation context — don't list all of them at once.
Frame questions naturally, not as "I need data for your skills section."`;
}

/**
 * Directive: facts that haven't been updated in 30+ days.
 */
export function staleFactsDirective(facts: string[]): string {
  if (facts.length === 0) return "";
  const topStale = facts.slice(0, 5); // Limit to 5 to avoid prompt bloat
  const factList = topStale.join(", ");
  const moreNote = facts.length > 5 ? ` (and ${facts.length - 5} more)` : "";
  return `STALE FACTS: These facts haven't been updated in over 30 days: ${factList}${moreNote}.
When natural, ask the user if any of these are still accurate.
Prioritize facts that seem most likely to have changed (job roles, projects, current activities).
Use update_fact if the user confirms a change, delete_fact if something is no longer relevant.`;
}

/**
 * Directive: open fact conflicts needing resolution.
 */
export function openConflictsDirective(conflicts: string[]): string {
  if (conflicts.length === 0) return "";
  const conflictList = conflicts.join("; ");
  return `OPEN CONFLICTS: There are conflicting facts that need resolution: ${conflictList}.
Ask the user to clarify which version is correct.
Use resolve_conflict once the user makes a choice.
Do not present conflicts as errors — frame them as "I noticed two different pieces of info about X, which one is current?"`;
}
```

### Test

```typescript
// tests/evals/situation-directives.test.ts

/**
 * Tests for the situation directive generators.
 * Each directive should produce well-formed prompt text with the expected content.
 */
import { describe, it, expect } from "vitest";
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
} from "@/lib/agent/policies/situations";

// ---------------------------------------------------------------------------
// pendingProposalsDirective
// ---------------------------------------------------------------------------
describe("pendingProposalsDirective", () => {
  it("includes the count in the output", () => {
    const result = pendingProposalsDirective(3, ["bio", "skills"]);
    expect(result).toContain("3");
  });

  it("includes section names in the output", () => {
    const result = pendingProposalsDirective(2, ["bio", "skills"]);
    expect(result).toContain("bio");
    expect(result).toContain("skills");
  });

  it("uses singular 'proposal' for count=1", () => {
    const result = pendingProposalsDirective(1, ["bio"]);
    expect(result).toContain("1 content proposal ");
    expect(result).not.toContain("proposals ");
  });

  it("uses plural 'proposals' for count > 1", () => {
    const result = pendingProposalsDirective(5, []);
    expect(result).toContain("proposals");
  });

  it("works with empty sections list", () => {
    const result = pendingProposalsDirective(2, []);
    expect(result).toContain("PENDING PROPOSALS:");
    expect(result).not.toContain("in sections:");
  });

  it("mentions the proposal banner", () => {
    const result = pendingProposalsDirective(1, []);
    expect(result).toMatch(/proposal\s*banner/i);
  });
});

// ---------------------------------------------------------------------------
// thinSectionsDirective
// ---------------------------------------------------------------------------
describe("thinSectionsDirective", () => {
  it("returns empty string when sections list is empty", () => {
    expect(thinSectionsDirective([])).toBe("");
  });

  it("includes all section names in the output", () => {
    const result = thinSectionsDirective(["skills", "projects", "achievements"]);
    expect(result).toContain("skills");
    expect(result).toContain("projects");
    expect(result).toContain("achievements");
  });

  it("starts with THIN SECTIONS header", () => {
    const result = thinSectionsDirective(["skills"]);
    expect(result).toContain("THIN SECTIONS:");
  });

  it("instructs to pick 1-2 most relevant sections", () => {
    const result = thinSectionsDirective(["skills"]);
    expect(result).toMatch(/1-2\s*most\s*relevant/i);
  });

  it("advises against listing all sections at once", () => {
    const result = thinSectionsDirective(["a", "b", "c"]);
    expect(result).toMatch(/don't\s*list\s*all|not.*all.*at\s*once/i);
  });
});

// ---------------------------------------------------------------------------
// staleFactsDirective
// ---------------------------------------------------------------------------
describe("staleFactsDirective", () => {
  it("returns empty string when facts list is empty", () => {
    expect(staleFactsDirective([])).toBe("");
  });

  it("includes fact keys in the output", () => {
    const result = staleFactsDirective(["skill/typescript", "experience/acme"]);
    expect(result).toContain("skill/typescript");
    expect(result).toContain("experience/acme");
  });

  it("caps displayed facts at 5 and notes extras", () => {
    const facts = Array.from({ length: 8 }, (_, i) => `category/fact-${i}`);
    const result = staleFactsDirective(facts);
    expect(result).toContain("fact-0");
    expect(result).toContain("fact-4");
    // Should NOT include fact-5 through fact-7 inline
    expect(result).not.toContain("fact-5");
    // Should note the overflow count
    expect(result).toContain("3 more");
  });

  it("starts with STALE FACTS header", () => {
    const result = staleFactsDirective(["skill/old"]);
    expect(result).toContain("STALE FACTS:");
  });

  it("mentions update_fact and delete_fact tools", () => {
    const result = staleFactsDirective(["skill/old"]);
    expect(result).toContain("update_fact");
    expect(result).toContain("delete_fact");
  });

  it("does not show overflow note when 5 or fewer facts", () => {
    const facts = ["a", "b", "c", "d", "e"];
    const result = staleFactsDirective(facts);
    expect(result).not.toContain("more");
  });
});

// ---------------------------------------------------------------------------
// openConflictsDirective
// ---------------------------------------------------------------------------
describe("openConflictsDirective", () => {
  it("returns empty string when conflicts list is empty", () => {
    expect(openConflictsDirective([])).toBe("");
  });

  it("includes conflict descriptions in the output", () => {
    const result = openConflictsDirective([
      "identity/name: chat vs github",
      "skill/python: old vs new",
    ]);
    expect(result).toContain("identity/name: chat vs github");
    expect(result).toContain("skill/python: old vs new");
  });

  it("starts with OPEN CONFLICTS header", () => {
    const result = openConflictsDirective(["identity/name: conflict"]);
    expect(result).toContain("OPEN CONFLICTS:");
  });

  it("mentions resolve_conflict tool", () => {
    const result = openConflictsDirective(["x"]);
    expect(result).toContain("resolve_conflict");
  });

  it("advises against framing conflicts as errors", () => {
    const result = openConflictsDirective(["x"]);
    expect(result).toMatch(/not.*error|don't.*present.*error/i);
  });
});
```

### Test command

```bash
npx vitest run tests/evals/situation-directives.test.ts --reporter=verbose
```

---

## Task 5: Refactor `getSystemPromptText` to use new policy system

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/prompts.ts` |
| **test** | `tests/evals/policy-registry.test.ts` (already exists from Task 1) |

### Steps

1. Read the current `src/lib/agent/prompts.ts` to confirm state
2. Add the new `buildSystemPrompt` function
3. Mark `getSystemPromptText`, `onboardingPolicy`, `steadyStatePolicy` as deprecated but keep them working
4. Run all existing tests to confirm no regressions:
   ```bash
   npx vitest run tests/evals/context-assembler.test.ts tests/evals/policy-registry.test.ts --reporter=verbose
   ```
5. Commit: `feat: add buildSystemPrompt using composable policy system`

### Implementation

Add the following to `src/lib/agent/prompts.ts`, keeping ALL existing exports unchanged:

```typescript
// --- Add these imports at the top of prompts.ts ---
import type { BootstrapPayload } from "@/lib/agent/journey";
import {
  getJourneyPolicy,
  getSituationDirectives,
  getExpertiseCalibration,
} from "@/lib/agent/policies/index";
import type { SituationContext } from "@/lib/agent/policies/index";

// --- Add this new function AFTER the existing getSystemPromptText ---

/**
 * Build the full system prompt from a BootstrapPayload.
 *
 * This is the new composable prompt builder that replaces the monolithic
 * getSystemPromptText for bootstrap-aware code paths.
 *
 * Composition order:
 * [CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY, FACT_SCHEMA_REFERENCE, OUTPUT_CONTRACT,
 *  journeyPolicy, situationDirectives?, expertiseCalibration]
 */
export function buildSystemPrompt(bootstrap: BootstrapPayload): string {
  const journeyPolicy = getJourneyPolicy(bootstrap.journeyState, bootstrap.language);

  // Build situation context from bootstrap data
  const situationContext: SituationContext = {
    pendingProposalCount: bootstrap.pendingProposalCount,
    pendingProposalSections: [], // Will be populated when proposals carry section info
    thinSections: bootstrap.thinSections,
    staleFacts: bootstrap.staleFacts,
    openConflicts: [], // Will be populated from conflict service in context assembler
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

  const composed = blocks.join("\n\n---\n\n");

  // Budget guard: the system prompt must leave room for context (facts, memory,
  // soul, summaries, conflicts) which lives in contextParts assembled separately.
  // TOTAL_TOKEN_BUDGET in context.ts is 7500. Reserve at least 4000 for context.
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

Also add `@deprecated` JSDoc to the existing functions (but do NOT change their implementation):

```typescript
/**
 * @deprecated Use buildSystemPrompt(bootstrap) instead. Kept for backward compatibility
 * during the transition period (Sprint 2).
 */
export function getSystemPromptText(
  mode: PromptMode,
  language: string = "en",
): string {
  // ... existing implementation unchanged ...
}
```

**Important:** The `CORE_CHARTER`, `SAFETY_POLICY`, `TOOL_POLICY`, `FACT_SCHEMA_REFERENCE`, and `OUTPUT_CONTRACT` constants must NOT be changed. Only `buildSystemPrompt` is new. The existing `onboardingPolicy`, `steadyStatePolicy`, `getPromptContent`, and `getSystemPromptText` functions remain exactly as they are.

### Test command

```bash
npx vitest run tests/evals/context-assembler.test.ts tests/evals/policy-registry.test.ts --reporter=verbose
```

---

## Task 6: Refactor `assembleContext` to use `buildSystemPrompt`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/context.ts` |
| **modify** | `tests/evals/context-assembler.test.ts` |

### Steps

1. Read current `src/lib/agent/context.ts` to confirm state
2. Add `bootstrap` optional parameter to `assembleContext`
3. When bootstrap is provided: use `buildSystemPrompt(bootstrap)` instead of `getSystemPromptText(mode, language)`, and use `bootstrap.journeyState` to derive mode
4. When no bootstrap: use the old `getSystemPromptText(mode, language)` path (backward compat)
5. Add new tests for the bootstrap path
6. Run all tests:
   ```bash
   npx vitest run tests/evals/context-assembler.test.ts --reporter=verbose
   ```
7. Commit: `feat: wire assembleContext to buildSystemPrompt when bootstrap provided`

### Implementation

Modify `assembleContext` signature and early logic:

```typescript
// In src/lib/agent/context.ts

// Add import at top:
import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

// Change the function signature:
export function assembleContext(
  scope: OwnerScope,
  language: string,
  clientMessages: Array<{ role: string; content: string }>,
  authInfo?: AuthInfo,
  bootstrap?: BootstrapPayload,  // NEW optional parameter
): ContextResult {
  // Determine mode — prefer bootstrap if provided
  const mode: PromptMode = bootstrap
    ? journeyStateToPromptMode(bootstrap.journeyState)
    : detectMode(scope.knowledgeReadKeys);

  // ... existing context block assembly (facts, soul, summary, memories, conflicts) — unchanged ...

  // Base system prompt — use new path when bootstrap available
  const basePrompt = bootstrap
    ? buildSystemPrompt(bootstrap)
    : getSystemPromptText(mode, language);

  // ... rest of function unchanged (contextParts, truncation, message trimming) ...
}

/**
 * Map JourneyState to the legacy PromptMode for backward-compatible code paths.
 *
 * CONTRACT (frozen — must match Sprint 1 mapJourneyStateToMode):
 *   onboarding:    first_visit, returning_no_page
 *   steady_state:  draft_ready, active_fresh, active_stale, blocked
 */
function journeyStateToPromptMode(state: string): PromptMode {
  switch (state) {
    case "first_visit":
    case "returning_no_page":
      return "onboarding";
    case "blocked":
    case "draft_ready":
    case "active_fresh":
    case "active_stale":
      return "steady_state";
    default:
      return "onboarding";
  }
}
```

### Test additions

Add these tests to `tests/evals/context-assembler.test.ts`:

```typescript
// --- Add to the existing mocks at the top of the file ---
vi.mock("@/lib/agent/prompts", () => ({
  getSystemPromptText: vi.fn(() => "BASE_PROMPT"),
  buildSystemPrompt: vi.fn(() => "BOOTSTRAP_PROMPT"),
}));

// Import the new mock
import { buildSystemPrompt } from "@/lib/agent/prompts";

// --- Add this new describe block ---

describe("assembleContext with bootstrap", () => {
  const mockBootstrap = {
    journeyState: "first_visit" as const,
    situations: [],
    expertiseLevel: "novice" as const,
    userName: null,
    lastSeenDaysAgo: null,
    publishedUsername: null,
    pendingProposalCount: 0,
    thinSections: [],
    staleFacts: [],
    language: "en",
    conversationContext: null,
  };

  it("uses buildSystemPrompt when bootstrap is provided", () => {
    const result = assembleContext(SCOPE, "en", [], undefined, mockBootstrap);
    expect(buildSystemPrompt).toHaveBeenCalledWith(mockBootstrap);
    expect(result.systemPrompt).toContain("BOOTSTRAP_PROMPT");
  });

  it("uses getSystemPromptText when no bootstrap provided", () => {
    const result = assembleContext(SCOPE, "en", []);
    expect(buildSystemPrompt).not.toHaveBeenCalled();
    expect(result.systemPrompt).toContain("BASE_PROMPT");
  });

  it("maps first_visit to onboarding mode", () => {
    const result = assembleContext(SCOPE, "en", [], undefined, {
      ...mockBootstrap,
      journeyState: "first_visit",
    });
    expect(result.mode).toBe("onboarding");
  });

  it("maps returning_no_page to onboarding mode", () => {
    const result = assembleContext(SCOPE, "en", [], undefined, {
      ...mockBootstrap,
      journeyState: "returning_no_page",
    });
    expect(result.mode).toBe("onboarding");
  });

  it("maps active_fresh to steady_state mode", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    const result = assembleContext(SCOPE, "en", [], undefined, {
      ...mockBootstrap,
      journeyState: "active_fresh",
    });
    expect(result.mode).toBe("steady_state");
  });

  it("maps draft_ready to steady_state mode", () => {
    const result = assembleContext(SCOPE, "en", [], undefined, {
      ...mockBootstrap,
      journeyState: "draft_ready",
    });
    expect(result.mode).toBe("steady_state");
  });

  it("maps blocked to steady_state mode", () => {
    const result = assembleContext(SCOPE, "en", [], undefined, {
      ...mockBootstrap,
      journeyState: "blocked",
    });
    expect(result.mode).toBe("steady_state");
  });
});
```

**Important:** The existing mock for `@/lib/agent/prompts` must be updated to also export `buildSystemPrompt`. Replace the existing mock:

```typescript
// REPLACE this existing mock:
vi.mock("@/lib/agent/prompts", () => ({
  getSystemPromptText: vi.fn(() => "BASE_PROMPT"),
}));

// WITH:
vi.mock("@/lib/agent/prompts", () => ({
  getSystemPromptText: vi.fn(() => "BASE_PROMPT"),
  buildSystemPrompt: vi.fn(() => "BOOTSTRAP_PROMPT"),
}));
```

### Test command

```bash
npx vitest run tests/evals/context-assembler.test.ts --reporter=verbose
```

---

## Task 7: Dynamic welcome message in ChatPanel

### Files

| Action | Path |
|--------|------|
| **modify** | `src/components/chat/ChatPanel.tsx` |

### Steps

1. Read current `src/components/chat/ChatPanel.tsx` to confirm state
2. Add bootstrap fetch on mount
3. Replace static welcome message with dynamic message based on journey state
4. Keep `WELCOME_MESSAGES` as fallback
5. Manually test in browser at `http://localhost:3000/builder`:
   - Clear cookies / new session -> should see "Hi! I create personal pages..." (name-asking welcome)
   - Returning session with facts -> should see personalized greeting
6. Commit: `feat: dynamic welcome message from bootstrap endpoint`

### Implementation

Add these new welcome messages for `first_visit`:

```typescript
// Add ABOVE the existing WELCOME_MESSAGES constant:

/**
 * Welcome messages for first-time visitors.
 * These ask the user's name as the very first interaction.
 */
const FIRST_VISIT_WELCOME: Record<string, string> = {
  en: "Hi! I create personal pages from a conversation. What's your name?",
  it: "Ciao! Creo pagine personali partendo da una conversazione. Come ti chiami?",
  de: "Hallo! Ich erstelle persönliche Seiten aus einem Gespräch. Wie heißt du?",
  fr: "Salut\u00a0! Je crée des pages personnelles à partir d'une conversation. Comment tu t'appelles\u00a0?",
  es: "¡Hola! Creo páginas personales a partir de una conversación. ¿Cómo te llamas?",
  pt: "Olá! Crio páginas pessoais a partir de uma conversa. Como te chamas?",
  ja: "こんにちは！会話からパーソナルページを作ります。お名前は？",
  zh: "你好！我通过对话创建个人页面。你叫什么名字？",
};

/**
 * Welcome messages for returning users with no page yet.
 * These acknowledge the return and offer to continue.
 */
const RETURNING_WELCOME: Record<string, string> = {
  en: "Welcome back! Ready to pick up where we left off?",
  it: "Bentornato! Riprendiamo da dove eravamo rimasti?",
  de: "Willkommen zurück! Sollen wir weitermachen, wo wir aufgehört haben?",
  fr: "Re-bonjour\u00a0! On reprend là où on en était\u00a0?",
  es: "¡Bienvenido de nuevo! ¿Seguimos donde lo dejamos?",
  pt: "Bem-vindo de volta! Continuamos de onde parámos?",
  ja: "おかえりなさい！前回の続きから始めましょうか？",
  zh: "欢迎回来！我们继续之前的对话吧？",
};

/**
 * Welcome messages for users with a draft page ready.
 */
const DRAFT_READY_WELCOME: Record<string, string> = {
  en: "Welcome back! Your page is ready for review — take a look on the right. Want to make any changes?",
  it: "Bentornato! La tua pagina è pronta — dai un'occhiata a destra. Vuoi modificare qualcosa?",
  de: "Willkommen zurück! Deine Seite ist fertig — schau rechts. Möchtest du etwas ändern?",
  fr: "Re-bonjour\u00a0! Ta page est prête — jette un œil à droite. Tu veux modifier quelque chose\u00a0?",
  es: "¡Bienvenido! Tu página está lista — mira a la derecha. ¿Quieres cambiar algo?",
  pt: "Bem-vindo! A tua página está pronta — vê à direita. Queres mudar alguma coisa?",
  ja: "おかえりなさい！ページの準備ができています — 右側をご覧ください。変更はありますか？",
  zh: "欢迎回来！你的页面已准备好——看看右边。想做什么修改吗？",
};
```

Then modify the `ChatPanel` component to fetch bootstrap and select the right welcome:

```typescript
// Inside the ChatPanel component, REPLACE the useEffect that loads history
// with an enhanced version that also fetches bootstrap:

type BootstrapResponse = {
  journeyState?: string;
  userName?: string | null;
  publishedUsername?: string | null;
  language?: string;
};

function getSmartWelcomeMessage(
  language: string,
  bootstrap: BootstrapResponse | null,
): { id: string; role: "assistant"; content: string } {
  const lang = language || "en";

  if (!bootstrap) {
    // Fallback to legacy welcome
    return {
      id: "welcome",
      role: "assistant",
      content: WELCOME_MESSAGES[lang] ?? WELCOME_MESSAGES.en,
    };
  }

  let content: string;

  switch (bootstrap.journeyState) {
    case "first_visit":
      content = FIRST_VISIT_WELCOME[lang] ?? FIRST_VISIT_WELCOME.en;
      break;
    case "returning_no_page":
      content = RETURNING_WELCOME[lang] ?? RETURNING_WELCOME.en;
      break;
    case "draft_ready":
      content = DRAFT_READY_WELCOME[lang] ?? DRAFT_READY_WELCOME.en;
      break;
    case "active_fresh":
    case "active_stale": {
      // For returning active users, greet by name if known
      const name = bootstrap.userName;
      if (name) {
        const templates: Record<string, string> = {
          en: `Hey ${name}! What's new?`,
          it: `Ciao ${name}! Cosa c'è di nuovo?`,
          de: `Hey ${name}! Was gibt's Neues?`,
          fr: `Salut ${name}\u00a0! Quoi de neuf\u00a0?`,
          es: `¡Hola ${name}! ¿Qué hay de nuevo?`,
          pt: `Olá ${name}! Novidades?`,
          ja: `${name}さん、お久しぶりです！何か新しいことはありますか？`,
          zh: `${name}，你好！有什么新动态吗？`,
        };
        content = templates[lang] ?? templates.en;
      } else {
        content = WELCOME_MESSAGES[lang] ?? WELCOME_MESSAGES.en;
      }
      break;
    }
    case "blocked":
      // Shouldn't normally reach here (blocked users can't chat much)
      content = WELCOME_MESSAGES[lang] ?? WELCOME_MESSAGES.en;
      break;
    default:
      content = WELCOME_MESSAGES[lang] ?? WELCOME_MESSAGES.en;
  }

  return { id: "welcome", role: "assistant", content };
}

// In the ChatPanel component, modify the useEffect:
export function ChatPanel({ language = "en", authV2 = false, authState }: ChatPanelProps) {
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>(() => [
    getWelcomeMessage(language),  // Immediate static fallback
  ]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Fetch bootstrap and history in parallel
      let bootstrap: BootstrapResponse | null = null;
      try {
        const bootstrapRes = await fetch("/api/chat/bootstrap", { cache: "no-store" });
        if (bootstrapRes.ok) {
          bootstrap = await bootstrapRes.json();
        }
      } catch {
        // Bootstrap fetch failed — will use static fallback
      }

      // Compute smart welcome based on bootstrap
      const smartWelcome = getSmartWelcomeMessage(language, bootstrap);

      try {
        const res = await fetch("/api/messages", { cache: "no-store" });
        if (res.status === 401) {
          window.location.href = "/invite";
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setInitialMessages([smartWelcome]);
            setHistoryLoaded(true);
          }
          return;
        }

        const data = (await res.json()) as MessagesResponse;
        if (!data.success || !Array.isArray(data.messages)) {
          if (!cancelled) {
            setInitialMessages([smartWelcome]);
            setHistoryLoaded(true);
          }
          return;
        }

        const restoredMessages: StoredMessage[] = data.messages
          .filter(
            (m): m is { id: string; role: string; content: string } =>
              typeof m.id === "string" &&
              typeof m.role === "string" &&
              typeof m.content === "string",
          )
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as StoredMessage["role"],
            content: m.content,
          }));

        if (cancelled) return;

        setInitialMessages(() => {
          if (restoredMessages.length === 0) return [smartWelcome];

          // Check if any existing message matches the smart welcome
          const welcomeAlreadyStored = restoredMessages.some(
            (message) =>
              message.role === "assistant" && message.content === smartWelcome.content,
          );

          // Also check legacy welcome messages
          const legacyWelcome = WELCOME_MESSAGES[language] ?? WELCOME_MESSAGES.en;
          const legacyAlreadyStored = restoredMessages.some(
            (message) =>
              message.role === "assistant" && message.content === legacyWelcome,
          );

          if (welcomeAlreadyStored || legacyAlreadyStored) {
            return restoredMessages;
          }

          return [smartWelcome, ...restoredMessages];
        });
      } catch {
        if (!cancelled) {
          setInitialMessages([smartWelcome]);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [language]);

  // ... rest of component unchanged ...
}
```

**Keep the existing `WELCOME_MESSAGES` and `getWelcomeMessage` function** — they serve as the fallback and are still used in the static initial render before the bootstrap response arrives.

### Test command

Manual browser testing:
```bash
# Terminal 1: start dev server
npm run dev

# Terminal 2: test in browser
# 1. Clear cookies, visit http://localhost:3000/builder
#    -> Expect: "Hi! I create personal pages from a conversation. What's your name?"
# 2. Have a conversation, create some facts, close tab
# 3. Re-open http://localhost:3000/builder
#    -> Expect: personalized welcome (NOT the "what's your name" message)
```

---

## Task 8: Tests

### Files

| Action | Path |
|--------|------|
| **verify** | `tests/evals/onboarding-policy.test.ts` (created in Task 2) |
| **verify** | `tests/evals/policy-registry.test.ts` (created in Task 1) |
| **verify** | `tests/evals/situation-directives.test.ts` (created in Task 4) |
| **verify** | `tests/evals/context-assembler.test.ts` (modified in Task 6) |

### Steps

1. Run ALL Sprint 2 tests together:
   ```bash
   npx vitest run tests/evals/onboarding-policy.test.ts tests/evals/policy-registry.test.ts tests/evals/situation-directives.test.ts tests/evals/context-assembler.test.ts --reporter=verbose
   ```
2. Verify all pass (0 failures)
3. Run the full test suite to confirm no regressions:
   ```bash
   npx vitest run --reporter=verbose
   ```
4. Commit: `test: verify full Sprint 2 test suite passes`

### Expected test counts

| File | Tests |
|------|-------|
| `tests/evals/onboarding-policy.test.ts` | ~18 |
| `tests/evals/policy-registry.test.ts` | ~17 |
| `tests/evals/situation-directives.test.ts` | ~18 |
| `tests/evals/context-assembler.test.ts` | ~22 (existing 14 + new 5-8) |
| **Total new/modified** | **~75** |

### Test command

```bash
npx vitest run tests/evals/onboarding-policy.test.ts tests/evals/policy-registry.test.ts tests/evals/situation-directives.test.ts tests/evals/context-assembler.test.ts --reporter=verbose
```

---

## Execution Order & Dependencies

```
Task 2 (first-visit.ts)  ─┐
Task 3 (stub policies)   ─┼─> Task 1 (registry) ─> Task 5 (prompts.ts) ─> Task 6 (context.ts)
Task 4 (situations.ts)   ─┘                                                      │
                                                                                  v
                                                                           Task 7 (ChatPanel)
                                                                                  │
                                                                                  v
                                                                           Task 8 (final verify)
```

**Recommended implementation order:**

1. Task 2 — `first-visit.ts` (leaf, no deps)
2. Task 4 — `situations.ts` (leaf, no deps)
3. Task 3 — stub policies (leaf, no deps — can be parallel with 2 and 4)
4. Task 1 — policy registry (depends on 2, 3, 4)
5. Task 5 — refactor `prompts.ts` (depends on 1)
6. Task 6 — refactor `context.ts` (depends on 5)
7. Task 7 — dynamic ChatPanel welcome (depends on bootstrap endpoint from Sprint 1)
8. Task 8 — final verification (depends on all)

---

## File Summary

### Created (8 files)
| Path | Task |
|------|------|
| `src/lib/agent/policies/index.ts` | 1 |
| `src/lib/agent/policies/first-visit.ts` | 2 |
| `src/lib/agent/policies/returning-no-page.ts` | 3 |
| `src/lib/agent/policies/draft-ready.ts` | 3 |
| `src/lib/agent/policies/active-fresh.ts` | 3 |
| `src/lib/agent/policies/active-stale.ts` | 3 |
| `src/lib/agent/policies/blocked.ts` | 3 |
| `src/lib/agent/policies/situations.ts` | 4 |

### Modified (3 files)
| Path | Task |
|------|------|
| `src/lib/agent/prompts.ts` | 5 |
| `src/lib/agent/context.ts` | 6 |
| `src/components/chat/ChatPanel.tsx` | 7 |

### Test files (3 new, 1 modified)
| Path | Task |
|------|------|
| `tests/evals/onboarding-policy.test.ts` | 2 |
| `tests/evals/policy-registry.test.ts` | 1 |
| `tests/evals/situation-directives.test.ts` | 4 |
| `tests/evals/context-assembler.test.ts` (modified) | 6 |

### Commits (8)
1. `feat: add first-visit onboarding policy with 3-phase turn structure`
2. `feat: add situation directive generators for contextual prompt injection`
3. `feat: add stub policies for non-onboarding journey states`
4. `feat: add policy registry for journey-based prompt composition`
5. `feat: add buildSystemPrompt using composable policy system`
6. `feat: wire assembleContext to buildSystemPrompt when bootstrap provided`
7. `feat: dynamic welcome message from bootstrap endpoint`
8. `test: verify full Sprint 2 test suite passes`
