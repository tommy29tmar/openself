# Sprint 3: Returning User Policies + Strategic Memory — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every returning user state has a concrete, actionable policy. Memory is used strategically (not passively). Turn management prevents common agent failures.

**Architecture:** Replace 5 stub policies with detailed prompt content. Add two cross-cutting prompt blocks (memory directives, turn management) injected into all system prompts.

**Tech Stack:** TypeScript, vitest

**Dependency:** Sprint 1 (Journey Intelligence) and Sprint 2 (policy registry, first-visit, situations, buildSystemPrompt) must be complete. This plan assumes:
- `src/lib/agent/journey.ts` exists and exports `JourneyState`, `Situation`, `ExpertiseLevel`, `BootstrapPayload`
- `src/lib/agent/policies/index.ts` exports `getJourneyPolicy`, `getSituationDirectives`, `getExpertiseCalibration`
- `src/lib/agent/policies/first-visit.ts` is the reference policy (fully fleshed out)
- 5 stub policies exist: `returning-no-page.ts`, `draft-ready.ts`, `active-fresh.ts`, `active-stale.ts`, `blocked.ts`
- `src/lib/agent/prompts.ts` exports `buildSystemPrompt(bootstrap)` which composes: `[CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY, FACT_SCHEMA_REFERENCE, OUTPUT_CONTRACT, journeyPolicy, situationDirectives?, expertiseCalibration]`

---

## Task 1: Flesh out `returning-no-page.ts`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/returning-no-page.ts` |
| **test** | `tests/evals/returning-policies.test.ts` |

### Steps

1. Write failing test (the test file is shared across Tasks 1-5; create it now with all returning policy tests)
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/returning-no-page.ts`
4. Run tests — confirm the `returningNoPagePolicy` tests pass (others will still fail):
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose
   ```
5. Commit: `feat: flesh out returning-no-page policy with continuity and fast-path`

### Implementation

```typescript
// src/lib/agent/policies/returning-no-page.ts

/**
 * Policy for returning users who have facts but no draft or published page.
 *
 * Key insight: the user already invested time. Don't re-interview them.
 * Summarize what you know, ask what changed, fast-path to page generation.
 *
 * Flow:
 * - Turn 1: Greet by name, summarize known info, ask what changed
 * - Turn 2-3: Fill gaps or update changed facts
 * - Turn 4: Generate page and propose publish
 */

export function returningNoPagePolicy(language: string): string {
  return `MODE: RETURNING (NO PAGE YET)
You have talked to this person before. You have facts about them, and possibly a conversation summary, but their page has NOT been generated yet.

Language: Converse in ${language || "the user's language"}. All page content should be in the same language.

GREETING (turn 1):
- Use their name from facts (identity/name). NEVER ask for their name again.
- Summarize what you know in 1-2 sentences: "Last time you told me about [role] at [company] and your interest in [topic]."
  Use search_facts to pull specifics — do NOT guess or hallucinate details.
- Ask ONE focused question: "Has anything changed since we last talked?" or "Anything new you'd like to add?"
- Do NOT recite all facts back — pick the 2-3 most defining ones for the summary.

FACT HYGIENE (turns 2-3):
- Use search_facts BEFORE every question to check what you already know.
- NEVER re-ask information already stored as facts. This is the #1 rule for returning users.
- If the user says something changed, use update_fact (not create_fact) to correct existing facts.
- If the user adds new information, use create_fact as usual.
- If facts are sparse (< 5 facts), ask about 1-2 missing areas (work, projects, interests) — but frame it as "Tell me more about..." not "What are your skills?"
- If facts are adequate (5+), skip straight to page generation.

FAST-PATH TO PAGE (turn 3-4):
- After 2-3 exchanges (or earlier if user has 5+ facts and no updates), propose generating the page:
  "I think I have enough to build your page. Let me put it together!"
- Call generate_page. Then tell the user to check the preview on the right.
- After generating, IMMEDIATELY move to publishing. Suggest a username based on their name.
- Call request_publish with the suggested or user-chosen username.

CRITICAL RULES:
- NEVER start a fresh interview. This person already invested time — respect it.
- NEVER ask "What's your name?" or "What do you do?" if those facts already exist.
- NEVER ask more than one question per turn.
- NEVER end a turn with "let me know if you need anything" or similar passive closings.
- After generating the page, ALWAYS propose publishing. Never leave the user hanging.
- If the user just wants their page built with no changes, do it in 1 turn: generate + propose publish.`;
}
```

### Test

See Task 6 for the complete shared test file `tests/evals/returning-policies.test.ts` which covers all 5 policies.

### Test command

```bash
npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "returningNoPagePolicy"
```

---

## Task 2: Flesh out `draft-ready.ts`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/draft-ready.ts` |
| **test** | `tests/evals/returning-policies.test.ts` (already created in Task 1) |

### Steps

1. Tests already exist from Task 1 — run to confirm draft-ready tests fail:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "draftReadyPolicy"
   ```
2. Implement `src/lib/agent/policies/draft-ready.ts`
3. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "draftReadyPolicy"
   ```
4. Commit: `feat: flesh out draft-ready policy with review-and-publish fast path`

### Implementation

```typescript
// src/lib/agent/policies/draft-ready.ts

/**
 * Policy for users who have a draft page but haven't published yet.
 *
 * Key insight: the page is ALREADY built. Don't reopen the interview.
 * Fast path: review -> tweak -> publish.
 *
 * Flow:
 * - Turn 1: Point to the preview, ask if changes needed
 * - Turn 2 (optional): Make requested changes
 * - Turn 3: Propose publish with username
 */

export function draftReadyPolicy(language: string): string {
  return `MODE: DRAFT READY (UNPUBLISHED PAGE)
This person already has a draft page built from a previous conversation. It has NOT been published yet.

Language: Converse in ${language || "the user's language"}. All page content should be in the same language.

GREETING (turn 1):
- Use their name from facts (identity/name). NEVER ask for their name.
- Lead with the page: "Welcome back, [name]! Your page is ready — take a look at the preview on the right."
- Ask a single, direct question: "Want to change anything, or shall we publish it?"
- Do NOT summarize what's on the page. They can see it.
- Do NOT reopen the interview or ask exploratory questions.

IF CHANGES REQUESTED (turn 2):
- Make the requested changes: update facts, then call generate_page to rebuild.
- After regenerating, immediately ask: "How's that look? Ready to publish?"
- If they request another round of changes, do it — but after each round, re-offer publish.
- Maximum 2 edit rounds before firmly suggesting publish.

PUBLISH FLOW (turn 2-3):
- Suggest a username based on their name (lowercase, hyphenated). Example: "marco-rossi"
- Call request_publish with the suggested or user-chosen username.
- Tell them a publish button will appear to confirm.
- If authenticated, use their existing username — do NOT ask for a new one.

CRITICAL RULES:
- Do NOT ask "What do you do?" or any exploratory/interview questions. The page is built.
- Do NOT offer to "add more sections" proactively. Only modify what the user asks to change.
- NEVER end a turn with "let me know if you need anything" or similar passive closings.
- Every turn must move toward publishing. This is a review session, not an interview.
- Keep responses under 2 sentences unless the user asks for detail.
- If the user says "looks good" or "I'm happy" — that means PUBLISH NOW. Do not ask "are you sure?"`;
}
```

### Test command

```bash
npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "draftReadyPolicy"
```

---

## Task 3: Flesh out `active-fresh.ts`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/active-fresh.ts` |
| **test** | `tests/evals/returning-policies.test.ts` (already created in Task 1) |

### Steps

1. Tests already exist — run to confirm active-fresh tests fail:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "activeFreshPolicy"
   ```
2. Implement `src/lib/agent/policies/active-fresh.ts`
3. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "activeFreshPolicy"
   ```
4. Commit: `feat: flesh out active-fresh policy with operational update flow`

### Implementation

```typescript
// src/lib/agent/policies/active-fresh.ts

/**
 * Policy for users with a recently published page (updated within 7 days).
 *
 * Key insight: they probably want a quick tweak, not an interview.
 * Brief, operational, task-oriented.
 *
 * Flow:
 * - Turn 1: Brief greeting, ask what to update
 * - Turn 2-3: Make the updates
 * - Turn 4: Regenerate impacted sections and propose re-publish
 */

export function activeFreshPolicy(language: string): string {
  return `MODE: ACTIVE (RECENTLY UPDATED)
This person has a published page that was updated within the last 7 days. They are returning for a quick update, not an interview.

Language: Converse in ${language || "the user's language"}. All page content should be in the same language.

GREETING (turn 1):
- Use their name from facts (identity/name). Keep it brief.
- Be operational: "Hey [name]! What would you like to update?"
- Do NOT summarize their page or recap their profile. They know what's on it.
- Do NOT ask exploratory questions like "What's new in your life?"
- Do NOT suggest areas to improve unless the user specifically asks for suggestions.

UPDATE FLOW (turns 2-3):
- Listen to what the user wants to change.
- Use update_fact for corrections, create_fact for additions, delete_fact for removals.
- Use search_facts to find the existing fact before updating — confirm the right fact ID.
- After each update, briefly confirm: "Done! Anything else?"
- Keep responses to 1-2 sentences per update.

REGENERATE AND PUBLISH (after updates):
- When the user is done updating, call generate_page to rebuild the page.
- Propose re-publishing: "Page updated! Want to publish the changes?"
- If authenticated, use their existing username with request_publish — do NOT ask for a new username.
- The user can also publish directly from the navigation bar — mention this as an option.

CRITICAL RULES:
- Be BRIEF. This is a quick-update session, not a conversation.
- Response length must be proportional to the user's message. Short message = short response.
- Do NOT reopen exploration. Do NOT ask "tell me more about your projects."
- NEVER end a turn with "let me know if you need anything" or similar passive closings.
- NEVER ask more than one question per turn.
- If the user says "that's all" or similar, immediately regenerate and propose publish.
- If the user asks for suggestions, check section richness and suggest filling thin sections — but only when explicitly asked.`;
}
```

### Test command

```bash
npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "activeFreshPolicy"
```

---

## Task 4: Flesh out `active-stale.ts`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/active-stale.ts` |
| **test** | `tests/evals/returning-policies.test.ts` (already created in Task 1) |

### Steps

1. Tests already exist — run to confirm active-stale tests fail:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "activeStalePolicy"
   ```
2. Implement `src/lib/agent/policies/active-stale.ts`
3. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "activeStalePolicy"
   ```
4. Commit: `feat: flesh out active-stale policy with re-engagement and targeted updates`

### Implementation

```typescript
// src/lib/agent/policies/active-stale.ts

/**
 * Policy for users with a published page that hasn't been updated in 7+ days.
 *
 * Key insight: time has passed. Things may have changed.
 * Re-engage warmly, check for updates in key areas, update impacted sections (not everything).
 *
 * Flow:
 * - Turn 1: Greet by name, acknowledge time passed, ask what changed
 * - Turns 2-4: Update facts for changed areas
 * - Turn 5: Regenerate impacted sections, propose re-publish
 */

export function activeStalePolicy(language: string): string {
  return `MODE: ACTIVE (STALE — NEEDS REFRESH)
This person has a published page, but it hasn't been updated in over 7 days. They may have new things to share.

Language: Converse in ${language || "the user's language"}. All page content should be in the same language.

GREETING (turn 1):
- Use their name from facts (identity/name). NEVER ask for their name.
- Acknowledge the time gap warmly (not apologetically): "Hey [name], it's been a while! What's new?"
- Ask ONE focused question about likely changes. Pick from:
  - Work: "Still at [company]?" or "Any new projects?"
  - Interests: "Picked up any new hobbies lately?"
  - General: "Anything you'd like to update on your page?"
- Use search_facts to reference something specific from their profile — shows you remember them.

TARGETED UPDATE FLOW (turns 2-4):
- Focus on what's CHANGED, not what's the same. Don't re-explore areas that are still current.
- Use update_fact when information changes (new role, completed project, etc.).
- Use create_fact for genuinely new information (new project, new skill, new interest).
- Use delete_fact when the user confirms something is no longer relevant.
- Check 2-3 areas maximum. Do NOT try to review their entire profile.
- Prioritize: work/role changes > new projects > new interests > stale details.
- If the user says "nothing changed," accept it and move to re-publish.

REGENERATE AND PUBLISH (turn 4-5):
- After collecting updates, call generate_page to rebuild the page.
- Only impacted sections will be regenerated — explain this: "I've updated the sections that changed."
- Propose re-publishing: "Your page is refreshed! Want to publish the update?"
- If authenticated, use their existing username — do NOT ask for a new one.

MAX 6 EXCHANGES RULE:
- Do NOT spend more than 6 fact-gathering exchanges. If you haven't moved to page generation by exchange 6, do it now.
- After 3 exchanges, if you have updates, offer to regenerate: "I've got a few updates. Want me to refresh the page?"

CRITICAL RULES:
- NEVER re-ask information already stored as facts. Use search_facts first.
- NEVER ask "What's your name?" or "What do you do?" — you already know.
- NEVER end a turn with "let me know if you need anything" or similar passive closings.
- NEVER ask more than one question per turn.
- Do NOT try to review every section. Focus on what the user cares about.
- After regenerating, ALWAYS propose publish. Never leave the user without a next step.
- If the user seems disengaged after 2 turns, offer to regenerate and publish immediately.`;
}
```

### Test command

```bash
npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "activeStalePolicy"
```

---

## Task 5: Flesh out `blocked.ts`

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/blocked.ts` |
| **test** | `tests/evals/returning-policies.test.ts` (already created in Task 1) |

### Steps

1. Tests already exist — run to confirm blocked tests fail:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "blockedPolicy"
   ```
2. Implement `src/lib/agent/policies/blocked.ts`
3. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "blockedPolicy"
   ```
4. Commit: `feat: flesh out blocked policy with concise block explanation and resolution`

### Implementation

```typescript
// src/lib/agent/policies/blocked.ts

/**
 * Policy for blocked users (quota exhausted or auth required).
 *
 * Key insight: don't waste the user's time. Explain the block in 1 sentence,
 * give the solution in 1 sentence. That's it.
 *
 * No exploration, no questions, no follow-ups.
 */

export function blockedPolicy(language: string): string {
  return `MODE: BLOCKED
This person cannot continue because they have hit a limit (message quota or authentication requirement).

Language: Converse in ${language || "the user's language"}.

YOUR RESPONSE MUST BE EXACTLY 2 PARTS:
1. Explain the block in ONE sentence.
2. Give the solution in ONE sentence.

QUOTA BLOCK (message limit reached):
- Say: "You've reached the message limit for today."
- If they have a draft: "You can still publish your page using the Publish button, and come back tomorrow to continue."
- If they have a published page: "Your page at /[username] is live. Come back tomorrow to make updates."
- If no page yet: "Come back tomorrow to continue building your page."

AUTH BLOCK (publishing requires authentication):
- Say: "Publishing requires an account."
- Give the solution: "Click 'Sign up' to create one — it takes 10 seconds."

ABSOLUTE RULES:
- Maximum 2 sentences total. No exceptions.
- Do NOT ask any questions. The user cannot meaningfully respond.
- Do NOT offer alternatives or workarounds beyond the solution.
- Do NOT apologize or be overly sympathetic. Be matter-of-fact and helpful.
- Do NOT say "let me know if you need anything" — they can't message you.
- Do NOT use phrases like "unfortunately" or "I'm sorry." Just state the fact and the fix.
- NEVER suggest the user try again later in vague terms — be specific: "come back tomorrow."`;
}
```

### Test command

```bash
npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose -t "blockedPolicy"
```

---

## Task 6: Create tests for all 5 returning policies

### Files

| Action | Path |
|--------|------|
| **create** | `tests/evals/returning-policies.test.ts` |

### Steps

1. Create the shared test file with tests for all 5 policies
2. Run tests — confirm the ones for already-implemented policies pass, stubs fail:
   ```bash
   npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose
   ```
3. Commit: `test: add returning policy tests for all 5 journey states`

**Note:** This task should be implemented BEFORE Tasks 1-5. The tests are listed here for clarity, but in practice, create this file first, then implement each policy to make its section pass.

### Implementation

```typescript
// tests/evals/returning-policies.test.ts

/**
 * Tests for the 5 returning-user policies (Sprint 3).
 * Each policy is tested for:
 * - Required structural elements (mode header, language embedding)
 * - Key behavioral directives (what the agent MUST do)
 * - Banned patterns (what the agent must NEVER do)
 * - Tool references (which tools the policy mentions)
 */
import { describe, it, expect } from "vitest";
import { returningNoPagePolicy } from "@/lib/agent/policies/returning-no-page";
import { draftReadyPolicy } from "@/lib/agent/policies/draft-ready";
import { activeFreshPolicy } from "@/lib/agent/policies/active-fresh";
import { activeStalePolicy } from "@/lib/agent/policies/active-stale";
import { blockedPolicy } from "@/lib/agent/policies/blocked";

// ---------------------------------------------------------------------------
// Shared banned phrases — all policies must forbid these
// ---------------------------------------------------------------------------
const UNIVERSAL_BANNED_PHRASES = [
  "let me know if you need anything",
];

// ---------------------------------------------------------------------------
// returningNoPagePolicy
// ---------------------------------------------------------------------------
describe("returningNoPagePolicy", () => {
  const policyEn = returningNoPagePolicy("en");
  const policyIt = returningNoPagePolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*RETURNING/i);
    });

    it("embeds language parameter (en)", () => {
      expect(policyEn).toContain("en");
    });

    it("embeds language parameter (it)", () => {
      expect(policyIt).toContain("it");
    });
  });

  describe("continuity behavior", () => {
    it("instructs to use name from facts", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name/i);
    });

    it("instructs to summarize known info", () => {
      expect(policyEn).toMatch(/summarize|last time.*told me/i);
    });

    it("instructs to ask what changed", () => {
      expect(policyEn).toMatch(/what\s*(has\s*)?changed|anything\s*new/i);
    });

    it("forbids re-asking known information", () => {
      expect(policyEn).toMatch(/never.*re-?ask|never.*ask.*name.*again/i);
    });
  });

  describe("tools", () => {
    it("references search_facts for checking existing knowledge", () => {
      expect(policyEn).toContain("search_facts");
    });

    it("references generate_page", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("references request_publish", () => {
      expect(policyEn).toContain("request_publish");
    });

    it("references update_fact for corrections", () => {
      expect(policyEn).toContain("update_fact");
    });
  });

  describe("fast-path to page", () => {
    it("mentions fast path or early page generation for 5+ facts", () => {
      expect(policyEn).toMatch(/5\+?\s*facts|facts.*5|adequate|fast.?path/i);
    });

    it("instructs to propose publishing after generating", () => {
      expect(policyEn).toMatch(/after.*generat.*publish|immediately.*publish/i);
    });
  });

  describe("banned patterns", () => {
    for (const phrase of UNIVERSAL_BANNED_PHRASES) {
      it(`bans "${phrase}"`, () => {
        expect(policyEn.toLowerCase()).toMatch(
          new RegExp(`never.*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      });
    }

    it("bans passive closings", () => {
      expect(policyEn).toMatch(/never.*passive|never.*let me know/i);
    });

    it("bans fresh interview", () => {
      expect(policyEn).toMatch(/never.*fresh\s*interview|never.*start.*interview/i);
    });
  });
});

// ---------------------------------------------------------------------------
// draftReadyPolicy
// ---------------------------------------------------------------------------
describe("draftReadyPolicy", () => {
  const policyEn = draftReadyPolicy("en");
  const policyIt = draftReadyPolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*DRAFT/i);
    });

    it("embeds language parameter (en)", () => {
      expect(policyEn).toContain("en");
    });

    it("embeds language parameter (it)", () => {
      expect(policyIt).toContain("it");
    });
  });

  describe("review-first behavior", () => {
    it("instructs to lead with the page preview", () => {
      expect(policyEn).toMatch(/preview|take a look|look.*right/i);
    });

    it("instructs to use name from facts", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name|never.*ask.*name/i);
    });

    it("asks if changes needed or ready to publish", () => {
      expect(policyEn).toMatch(/change.*publish|want.*change|ready.*publish/i);
    });
  });

  describe("publish flow", () => {
    it("references request_publish", () => {
      expect(policyEn).toContain("request_publish");
    });

    it("instructs to suggest username", () => {
      expect(policyEn).toMatch(/suggest.*username/i);
    });

    it("instructs to use existing username if authenticated", () => {
      expect(policyEn).toMatch(/authenticated.*existing\s*username|existing\s*username.*authenticated/i);
    });
  });

  describe("banned patterns", () => {
    for (const phrase of UNIVERSAL_BANNED_PHRASES) {
      it(`bans "${phrase}"`, () => {
        expect(policyEn.toLowerCase()).toMatch(
          new RegExp(`never.*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      });
    }

    it("bans reopening the interview", () => {
      expect(policyEn).toMatch(/not.*interview|not.*exploratory|not.*ask.*what.*do/i);
    });

    it("bans proactive section suggestions", () => {
      expect(policyEn).toMatch(/not.*add.*section.*proactiv|not.*offer.*add/i);
    });
  });
});

// ---------------------------------------------------------------------------
// activeFreshPolicy
// ---------------------------------------------------------------------------
describe("activeFreshPolicy", () => {
  const policyEn = activeFreshPolicy("en");
  const policyIt = activeFreshPolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*ACTIVE/i);
    });

    it("mentions 7 days freshness window", () => {
      expect(policyEn).toMatch(/7\s*days?|within.*last.*7/i);
    });

    it("embeds language parameter", () => {
      expect(policyEn).toContain("en");
      expect(policyIt).toContain("it");
    });
  });

  describe("operational behavior", () => {
    it("instructs to be brief", () => {
      expect(policyEn).toMatch(/brief|concise|short/i);
    });

    it("instructs to ask what to update", () => {
      expect(policyEn).toMatch(/what.*update|what.*change/i);
    });

    it("instructs to use name from facts", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name/i);
    });

    it("mentions proportional response length", () => {
      expect(policyEn).toMatch(/proportional|short.*message.*short.*response/i);
    });
  });

  describe("tools", () => {
    it("references update_fact", () => {
      expect(policyEn).toContain("update_fact");
    });

    it("references create_fact", () => {
      expect(policyEn).toContain("create_fact");
    });

    it("references delete_fact", () => {
      expect(policyEn).toContain("delete_fact");
    });

    it("references generate_page", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("references search_facts", () => {
      expect(policyEn).toContain("search_facts");
    });
  });

  describe("publish flow", () => {
    it("instructs to use existing username if authenticated", () => {
      expect(policyEn).toMatch(/existing\s*username|do\s*not\s*ask.*username/i);
    });

    it("mentions navigation bar as publish alternative", () => {
      expect(policyEn).toMatch(/navigation\s*bar|publish.*button/i);
    });
  });

  describe("banned patterns", () => {
    for (const phrase of UNIVERSAL_BANNED_PHRASES) {
      it(`bans "${phrase}"`, () => {
        expect(policyEn.toLowerCase()).toMatch(
          new RegExp(`never.*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      });
    }

    it("bans reopening exploration", () => {
      expect(policyEn).toMatch(/not.*reopen.*explor|not.*ask.*tell.*more/i);
    });
  });
});

// ---------------------------------------------------------------------------
// activeStalePolicy
// ---------------------------------------------------------------------------
describe("activeStalePolicy", () => {
  const policyEn = activeStalePolicy("en");
  const policyIt = activeStalePolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*ACTIVE.*STALE/i);
    });

    it("mentions 7+ days staleness window", () => {
      expect(policyEn).toMatch(/7\s*days?|over\s*7|hasn't\s*been\s*updated/i);
    });

    it("embeds language parameter", () => {
      expect(policyEn).toContain("en");
      expect(policyIt).toContain("it");
    });
  });

  describe("re-engagement behavior", () => {
    it("instructs to greet by name", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name|never.*ask.*name/i);
    });

    it("instructs to acknowledge time passed", () => {
      expect(policyEn).toMatch(/acknowledge.*time|been\s*a\s*while|time\s*gap/i);
    });

    it("instructs to ask what changed", () => {
      expect(policyEn).toMatch(/what's\s*new|what.*changed|any\s*new/i);
    });

    it("references specific areas to check (work, projects, interests)", () => {
      expect(policyEn).toMatch(/work|projects?|interests?/i);
    });
  });

  describe("targeted updates", () => {
    it("instructs to focus on what changed, not what stayed the same", () => {
      expect(policyEn).toMatch(/focus.*changed|not.*re-?explore|what's\s*changed/i);
    });

    it("references update_fact for corrections", () => {
      expect(policyEn).toContain("update_fact");
    });

    it("references create_fact for new info", () => {
      expect(policyEn).toContain("create_fact");
    });

    it("references delete_fact for removals", () => {
      expect(policyEn).toContain("delete_fact");
    });

    it("limits fact-gathering to max 6 exchanges", () => {
      expect(policyEn).toMatch(/6\s*exchange|max.*6|exchange\s*6/i);
    });
  });

  describe("publish flow", () => {
    it("references generate_page", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("instructs to use existing username if authenticated", () => {
      expect(policyEn).toMatch(/existing\s*username|do\s*not\s*ask.*username/i);
    });
  });

  describe("banned patterns", () => {
    for (const phrase of UNIVERSAL_BANNED_PHRASES) {
      it(`bans "${phrase}"`, () => {
        expect(policyEn.toLowerCase()).toMatch(
          new RegExp(`never.*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      });
    }

    it("forbids re-asking known facts", () => {
      expect(policyEn).toMatch(/never.*re-?ask|never.*ask.*name/i);
    });
  });
});

// ---------------------------------------------------------------------------
// blockedPolicy
// ---------------------------------------------------------------------------
describe("blockedPolicy", () => {
  const policyEn = blockedPolicy("en");
  const policyIt = blockedPolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(100);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*BLOCKED/i);
    });

    it("embeds language parameter", () => {
      expect(policyEn).toContain("en");
      expect(policyIt).toContain("it");
    });
  });

  describe("quota block handling", () => {
    it("mentions message limit", () => {
      expect(policyEn).toMatch(/message\s*limit|quota/i);
    });

    it("mentions coming back tomorrow", () => {
      expect(policyEn).toMatch(/come\s*back\s*tomorrow/i);
    });

    it("mentions the Publish button for draft users", () => {
      expect(policyEn).toMatch(/publish.*button|publish.*page/i);
    });
  });

  describe("auth block handling", () => {
    it("mentions authentication requirement", () => {
      expect(policyEn).toMatch(/account|authentication|sign\s*up/i);
    });
  });

  describe("brevity enforcement", () => {
    it("enforces maximum 2 sentences", () => {
      expect(policyEn).toMatch(/2\s*sentences?|maximum.*2|one\s*sentence/i);
    });

    it("forbids asking questions", () => {
      expect(policyEn).toMatch(/not.*ask.*question|do\s*not\s*ask/i);
    });
  });

  describe("banned patterns", () => {
    for (const phrase of UNIVERSAL_BANNED_PHRASES) {
      it(`bans "${phrase}"`, () => {
        expect(policyEn.toLowerCase()).toMatch(
          new RegExp(`never.*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|do\s*not.*${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      });
    }

    it("bans apologetic language", () => {
      expect(policyEn).toMatch(/not.*apologize|not.*unfortunately|not.*sorry/i);
    });

    it("bans vague 'try again later' phrasing", () => {
      expect(policyEn).toMatch(/never.*vague|specific.*tomorrow/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-policy invariants
// ---------------------------------------------------------------------------
describe("cross-policy invariants", () => {
  const allPolicies = [
    { name: "returningNoPage", fn: returningNoPagePolicy },
    { name: "draftReady", fn: draftReadyPolicy },
    { name: "activeFresh", fn: activeFreshPolicy },
    { name: "activeStale", fn: activeStalePolicy },
    { name: "blocked", fn: blockedPolicy },
  ];

  it("every policy produces distinct text", () => {
    const results = allPolicies.map((p) => p.fn("en"));
    const unique = new Set(results);
    expect(unique.size).toBe(allPolicies.length);
  });

  it("every policy embeds the language parameter", () => {
    for (const p of allPolicies) {
      expect(p.fn("fr")).toContain("fr");
      expect(p.fn("de")).toContain("de");
    }
  });

  it("every policy contains a MODE: header", () => {
    for (const p of allPolicies) {
      expect(p.fn("en")).toMatch(/^MODE:/m);
    }
  });

  it("no non-blocked policy asks fewer than 200 chars", () => {
    for (const p of allPolicies.filter((p) => p.name !== "blocked")) {
      expect(p.fn("en").length).toBeGreaterThan(200);
    }
  });
});
```

### Test command

```bash
npx vitest run tests/evals/returning-policies.test.ts --reporter=verbose
```

---

## Task 7: Create memory usage directives

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/memory-directives.ts` |
| **create** | `tests/evals/memory-directives.test.ts` |

### Steps

1. Write failing test
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/memory-directives.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/memory-directives.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/memory-directives.test.ts --reporter=verbose
   ```
5. Commit: `feat: add memory usage directives for strategic 3-tier memory consumption`

### Implementation

```typescript
// src/lib/agent/policies/memory-directives.ts

/**
 * Memory usage directives.
 *
 * Teaches the agent HOW to use each memory tier strategically.
 * This is a fixed block injected into all system prompts (via buildSystemPrompt).
 * It does NOT depend on language or journey state.
 */

export function memoryUsageDirectives(): string {
  return `MEMORY USAGE DIRECTIVES:

TIER 1 — Facts (knowledge base):
- Facts are the current source of truth about the user. They are structured, categorized, and searchable.
- ALWAYS use search_facts before asking a question — if the answer is already in facts, do NOT ask.
- Use the user's name from facts (identity/name) in your very first response. Never open with "What's your name?" if you have it.
- When the user shares new information, record it immediately via create_fact. Do not batch or delay.
- When information changes, use update_fact on the existing fact. Do not create duplicates.
- When something is no longer true, use delete_fact after user confirmation.

TIER 2 — Conversation Summary:
- The summary captures the narrative arc of past conversations (not individual facts).
- Use it for CONTINUITY: "Last time we talked about [topic from summary]" — shows you remember.
- Do NOT recite the summary back to the user. Extract 1-2 key points to reference naturally.
- The summary is read-only for you — it is generated automatically between conversations.

TIER 3 — Meta-Memories (agent observations):
- Meta-memories store YOUR observations about the user: communication patterns, tone preferences, recurring themes, decision-making style.
- Read these at conversation start to calibrate your approach (e.g., "user prefers bullet points over paragraphs", "user is self-deprecating about achievements — encourage them").
- GOLDEN RULE: At the end of every significant session, call save_memory with at least one meta-observation.
  Good meta-memories: "User prefers minimal, clean design", "User downplays achievements — needs encouragement", "User responds better to concrete options than open questions", "User is highly technical — skip explanations."
  Bad meta-memories: "User's name is Marco" (this belongs in facts), "User has 3 projects" (also facts).
- Meta-memories are about HOW to interact with the user, not WHAT you know about them.
- Use memoryType: "preference" for style/tone preferences, "insight" for behavioral patterns, "observation" for general notes.

CROSS-TIER RULES:
- Tier 1 (facts) = WHAT you know. Tier 2 (summary) = CONTEXT of past conversations. Tier 3 (memories) = HOW to behave.
- Never confuse the tiers: factual information goes in facts, not memories. Interaction patterns go in memories, not facts.
- When you notice a pattern across multiple turns (e.g., user always asks about mobile view, user likes humor), save it as a meta-memory immediately.
- Never store sensitive personal information in meta-memories — that belongs in private facts.`;
}
```

### Test

```typescript
// tests/evals/memory-directives.test.ts

/**
 * Tests for the memory usage directives.
 * Validates that all three tiers are documented, the golden rule is present,
 * and cross-tier rules are defined.
 */
import { describe, it, expect } from "vitest";
import { memoryUsageDirectives } from "@/lib/agent/policies/memory-directives";

describe("memoryUsageDirectives", () => {
  const directives = memoryUsageDirectives();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof directives).toBe("string");
      expect(directives.length).toBeGreaterThan(200);
    });

    it("contains a MEMORY USAGE header", () => {
      expect(directives).toMatch(/MEMORY\s*USAGE/i);
    });
  });

  describe("Tier 1 — Facts", () => {
    it("references Tier 1 or facts as source of truth", () => {
      expect(directives).toMatch(/tier\s*1|facts.*source\s*of\s*truth/i);
    });

    it("instructs to use search_facts before asking questions", () => {
      expect(directives).toContain("search_facts");
      expect(directives).toMatch(/search_facts.*before.*ask|before.*question.*search_facts/i);
    });

    it("instructs to use name from facts on first response", () => {
      expect(directives).toMatch(/name\s*from\s*facts|identity\/name/i);
    });

    it("references create_fact for new info", () => {
      expect(directives).toContain("create_fact");
    });

    it("references update_fact for changes", () => {
      expect(directives).toContain("update_fact");
    });

    it("references delete_fact for removals", () => {
      expect(directives).toContain("delete_fact");
    });
  });

  describe("Tier 2 — Summary", () => {
    it("references Tier 2 or conversation summary", () => {
      expect(directives).toMatch(/tier\s*2|conversation\s*summary/i);
    });

    it("instructs to use summary for continuity", () => {
      expect(directives).toMatch(/continuity|last\s*time/i);
    });

    it("instructs not to recite the summary", () => {
      expect(directives).toMatch(/not.*recite|do\s*not.*recite/i);
    });
  });

  describe("Tier 3 — Meta-Memories", () => {
    it("references Tier 3 or meta-memories", () => {
      expect(directives).toMatch(/tier\s*3|meta.?memor/i);
    });

    it("references save_memory tool", () => {
      expect(directives).toContain("save_memory");
    });

    it("contains the golden rule about saving at end of significant sessions", () => {
      expect(directives).toMatch(/golden\s*rule/i);
      expect(directives).toMatch(/save_memory.*session|session.*save_memory/i);
    });

    it("gives examples of good meta-memories", () => {
      expect(directives).toMatch(/good\s*meta.?memor/i);
    });

    it("gives examples of bad meta-memories", () => {
      expect(directives).toMatch(/bad\s*meta.?memor/i);
    });

    it("references memoryType values", () => {
      expect(directives).toContain("preference");
      expect(directives).toContain("insight");
      expect(directives).toContain("observation");
    });
  });

  describe("cross-tier rules", () => {
    it("contains cross-tier rules section", () => {
      expect(directives).toMatch(/cross.?tier/i);
    });

    it("distinguishes WHAT (facts) from HOW (memories)", () => {
      expect(directives).toMatch(/what.*know.*how.*behave|tier\s*1.*what.*tier\s*3.*how/i);
    });
  });
});
```

### Test command

```bash
npx vitest run tests/evals/memory-directives.test.ts --reporter=verbose
```

---

## Task 8: Create turn management rules

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/policies/turn-management.ts` |
| **create** | `tests/evals/turn-management.test.ts` |

### Steps

1. Write failing test
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/turn-management.test.ts --reporter=verbose
   ```
3. Implement `src/lib/agent/policies/turn-management.ts`
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/turn-management.test.ts --reporter=verbose
   ```
5. Commit: `feat: add turn management rules to prevent common agent failures`

### Implementation

```typescript
// src/lib/agent/policies/turn-management.ts

/**
 * Turn management rules.
 *
 * Fixed block injected into all system prompts.
 * Prevents common agent failure modes:
 * - Drilling down too deep on one topic
 * - Endless fact-gathering without action
 * - Passive closings that kill momentum
 * - Stalling when the user gives low-signal responses
 * - Disproportionate response lengths
 */

export function turnManagementRules(): string {
  return `TURN MANAGEMENT RULES:

R1 — No consecutive same-area questions:
Never ask 2 or more consecutive questions about the same topic area.
If your last question was about work/experience, your next must be about a different area (projects, interests, skills, etc.).
This ensures breadth and prevents the user from feeling interrogated.

R2 — Max 6 fact-gathering exchanges:
After 6 exchanges focused on gathering information, you MUST propose an action:
- If no page exists: call generate_page.
- If page exists: offer to regenerate or publish.
- If user seems done: propose publish.
Do NOT keep asking questions beyond 6 exchanges without offering a concrete next step.

R3 — No passive closings:
BANNED PHRASES (never use these to end a turn):
- "Let me know if you need anything"
- "Feel free to ask if you have questions"
- "I'm here if you need me"
- "Don't hesitate to reach out"
- "Is there anything else I can help with?"
- "Just let me know"
Instead, always end with a SPECIFIC next step: a question, an action proposal, or a publish suggestion.

R4 — Stall detection and recovery:
If the user gives 2+ consecutive low-signal replies (single words, "ok", "sure", emojis, "I don't know"):
- Switch from open questions to concrete options: "Pick one: [Option A] [Option B] [Option C]"
- If options don't work, try fill-in-the-blank: "The thing I enjoy most outside work is ___"
- If 3+ low-signal replies in a row: stop pushing, work with what you have, propose generating the page.

R5 — Proportional response length:
Match your response length to the user's message length.
- User sends 1-2 words → respond in 1-2 sentences max.
- User sends a paragraph → you may respond with a longer message.
- User sends a list → respond point by point, briefly.
- NEVER write a wall of text in response to a short message.
- Exception: when generating or explaining the page for the first time, you may be slightly longer.`;
}
```

### Test

```typescript
// tests/evals/turn-management.test.ts

/**
 * Tests for the turn management rules.
 * Validates that all 5 rules (R1-R5) are present with their key directives.
 */
import { describe, it, expect } from "vitest";
import { turnManagementRules } from "@/lib/agent/policies/turn-management";

describe("turnManagementRules", () => {
  const rules = turnManagementRules();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof rules).toBe("string");
      expect(rules.length).toBeGreaterThan(200);
    });

    it("contains a TURN MANAGEMENT header", () => {
      expect(rules).toMatch(/TURN\s*MANAGEMENT/i);
    });

    it("contains all 5 rules (R1 through R5)", () => {
      expect(rules).toContain("R1");
      expect(rules).toContain("R2");
      expect(rules).toContain("R3");
      expect(rules).toContain("R4");
      expect(rules).toContain("R5");
    });
  });

  describe("R1 — No consecutive same-area questions", () => {
    it("forbids consecutive questions on the same area", () => {
      expect(rules).toMatch(/never.*2.*consecutive.*same|no\s*consecutive.*same/i);
    });

    it("mentions breadth as the goal", () => {
      expect(rules).toMatch(/breadth/i);
    });
  });

  describe("R2 — Max 6 fact-gathering exchanges", () => {
    it("specifies the 6-exchange limit", () => {
      expect(rules).toMatch(/6\s*exchange/i);
    });

    it("instructs to propose action after limit", () => {
      expect(rules).toMatch(/propose.*action|generate_page|publish/i);
    });

    it("references generate_page as an action option", () => {
      expect(rules).toContain("generate_page");
    });
  });

  describe("R3 — No passive closings", () => {
    it("lists banned phrases", () => {
      expect(rules).toMatch(/banned\s*phrases/i);
    });

    it("bans 'let me know if you need anything'", () => {
      expect(rules).toMatch(/let me know if you need anything/i);
    });

    it("bans 'feel free to ask'", () => {
      expect(rules).toMatch(/feel free to ask/i);
    });

    it("bans 'don't hesitate to reach out'", () => {
      expect(rules).toMatch(/don't hesitate to reach out/i);
    });

    it("bans 'is there anything else'", () => {
      expect(rules).toMatch(/is there anything else/i);
    });

    it("bans 'just let me know'", () => {
      expect(rules).toMatch(/just let me know/i);
    });

    it("requires specific next step instead", () => {
      expect(rules).toMatch(/specific\s*next\s*step/i);
    });
  });

  describe("R4 — Stall detection and recovery", () => {
    it("triggers after 2+ low-signal replies", () => {
      expect(rules).toMatch(/2\+?\s*consecutive\s*low.?signal/i);
    });

    it("offers concrete options as first recovery step", () => {
      expect(rules).toMatch(/option|pick\s*one|concrete/i);
    });

    it("offers fill-in-the-blank as second recovery step", () => {
      expect(rules).toMatch(/fill.?in.?the.?blank/i);
    });

    it("proposes generating page after 3+ low-signal replies", () => {
      expect(rules).toMatch(/3\+?\s*low.?signal.*generat|generat.*page/i);
    });
  });

  describe("R5 — Proportional response length", () => {
    it("instructs to match response length to user message length", () => {
      expect(rules).toMatch(/match.*response.*length|proportional.*response/i);
    });

    it("gives short-message guidance (1-2 sentences)", () => {
      expect(rules).toMatch(/1-2\s*sentence/i);
    });

    it("bans walls of text for short messages", () => {
      expect(rules).toMatch(/never.*wall.*text|never.*long.*response.*short/i);
    });
  });
});
```

### Test command

```bash
npx vitest run tests/evals/turn-management.test.ts --reporter=verbose
```

---

## Task 9: Integrate memory directives and turn management into buildSystemPrompt

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/prompts.ts` |
| **create** | `tests/evals/build-system-prompt.test.ts` |

### Steps

1. Write failing test
2. Run tests — confirm they fail:
   ```bash
   npx vitest run tests/evals/build-system-prompt.test.ts --reporter=verbose
   ```
3. Modify `buildSystemPrompt` in `src/lib/agent/prompts.ts` to include the two new blocks
4. Run tests — confirm they pass:
   ```bash
   npx vitest run tests/evals/build-system-prompt.test.ts --reporter=verbose
   ```
5. Run all existing tests to confirm no regressions:
   ```bash
   npx vitest run tests/evals/ --reporter=verbose
   ```
6. Commit: `feat: wire memory directives and turn management into buildSystemPrompt`

### Implementation

Modify `buildSystemPrompt` in `src/lib/agent/prompts.ts`:

```typescript
// --- Add these imports at the top of prompts.ts (alongside existing imports) ---
import { memoryUsageDirectives } from "@/lib/agent/policies/memory-directives";
import { turnManagementRules } from "@/lib/agent/policies/turn-management";

// --- Modify the existing buildSystemPrompt function ---

/**
 * Build the full system prompt from a BootstrapPayload.
 *
 * Composition order:
 * [CORE_CHARTER, SAFETY_POLICY, TOOL_POLICY, FACT_SCHEMA_REFERENCE, OUTPUT_CONTRACT,
 *  journeyPolicy, situationDirectives?, expertiseCalibration, turnManagementRules, memoryUsageDirectives]
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
  blocks.push(turnManagementRules());
  blocks.push(memoryUsageDirectives());

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

**Key changes from Sprint 2 version:**
- Added `import { memoryUsageDirectives }` and `import { turnManagementRules }`
- Added `turnManagementRules()` and `memoryUsageDirectives()` as the last two blocks in the composition
- Turn management comes before memory directives (more immediately actionable)
- Budget guard unchanged from Sprint 2 (same MAX_SYSTEM_PROMPT_TOKENS = 3500)

### Test

```typescript
// tests/evals/build-system-prompt.test.ts

/**
 * Tests for buildSystemPrompt composition.
 * Validates that the prompt includes all expected blocks in the right order,
 * including the new memory directives and turn management rules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all policy modules
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
vi.mock("@/lib/agent/policies/memory-directives", () => ({
  memoryUsageDirectives: vi.fn(() => "MEMORY_USAGE_DIRECTIVES_BLOCK"),
}));
vi.mock("@/lib/agent/policies/turn-management", () => ({
  turnManagementRules: vi.fn(() => "TURN_MANAGEMENT_RULES_BLOCK"),
}));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

beforeEach(() => {
  vi.clearAllMocks();
});

const makeBootstrap = (overrides?: Partial<BootstrapPayload>): BootstrapPayload => ({
  journeyState: "first_visit",
  situations: [],
  expertiseLevel: "novice",
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  language: "en",
  conversationContext: null,
  ...overrides,
});

describe("buildSystemPrompt", () => {
  describe("composition", () => {
    it("includes core charter block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("OpenSelf agent");
    });

    it("includes safety policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/safety|privacy/i);
    });

    it("includes tool policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("create_fact");
    });

    it("includes fact schema reference block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/fact.*schema|category.*key.*value/i);
    });

    it("includes output contract block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/output.*rule/i);
    });

    it("includes the journey policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("FIRST_VISIT_POLICY_en");
    });

    it("includes expertise calibration block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/EXPERTISE\s*CALIBRATION|novice/i);
    });

    it("includes turn management rules block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("TURN_MANAGEMENT_RULES_BLOCK");
    });

    it("includes memory usage directives block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("MEMORY_USAGE_DIRECTIVES_BLOCK");
    });
  });

  describe("block ordering", () => {
    it("journey policy comes after output contract", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const outputIdx = result.indexOf("Output rules");
      const policyIdx = result.indexOf("FIRST_VISIT_POLICY_en");
      expect(policyIdx).toBeGreaterThan(outputIdx);
    });

    it("turn management comes after expertise calibration", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const expertiseIdx = result.indexOf("EXPERTISE CALIBRATION");
      const turnIdx = result.indexOf("TURN_MANAGEMENT_RULES_BLOCK");
      expect(turnIdx).toBeGreaterThan(expertiseIdx);
    });

    it("memory directives come after turn management", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const turnIdx = result.indexOf("TURN_MANAGEMENT_RULES_BLOCK");
      const memoryIdx = result.indexOf("MEMORY_USAGE_DIRECTIVES_BLOCK");
      expect(memoryIdx).toBeGreaterThan(turnIdx);
    });
  });

  describe("situation directives", () => {
    it("omits situation directives when no situations are active", () => {
      const result = buildSystemPrompt(makeBootstrap({ situations: [] }));
      expect(result).not.toContain("SITUATION DIRECTIVES:");
    });

    it("includes situation directives when situations are active", () => {
      const result = buildSystemPrompt(
        makeBootstrap({
          situations: ["has_thin_sections"],
          thinSections: ["skills", "projects"],
        }),
      );
      expect(result).toContain("THIN:");
    });
  });

  describe("journey state routing", () => {
    it("routes first_visit to firstVisitPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "first_visit" }));
      expect(result).toContain("FIRST_VISIT_POLICY_en");
    });

    it("routes returning_no_page to returningNoPagePolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "returning_no_page" }));
      expect(result).toContain("RETURNING_NO_PAGE_en");
    });

    it("routes draft_ready to draftReadyPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "draft_ready" }));
      expect(result).toContain("DRAFT_READY_en");
    });

    it("routes active_fresh to activeFreshPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "active_fresh" }));
      expect(result).toContain("ACTIVE_FRESH_en");
    });

    it("routes active_stale to activeStalePolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "active_stale" }));
      expect(result).toContain("ACTIVE_STALE_en");
    });

    it("routes blocked to blockedPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "blocked" }));
      expect(result).toContain("BLOCKED_en");
    });
  });

  describe("language passthrough", () => {
    it("passes language to journey policy", () => {
      const result = buildSystemPrompt(makeBootstrap({ language: "it" }));
      expect(result).toContain("FIRST_VISIT_POLICY_it");
    });
  });
});
```

### Test command

```bash
npx vitest run tests/evals/build-system-prompt.test.ts --reporter=verbose
```

---

## Execution Order

The tasks should be implemented in this order:

1. **Task 6** — Create the shared test file `tests/evals/returning-policies.test.ts` (all tests will initially fail against stubs)
2. **Task 1** — Flesh out `returning-no-page.ts` (tests pass for this policy)
3. **Task 2** — Flesh out `draft-ready.ts` (tests pass for this policy)
4. **Task 3** — Flesh out `active-fresh.ts` (tests pass for this policy)
5. **Task 4** — Flesh out `active-stale.ts` (tests pass for this policy)
6. **Task 5** — Flesh out `blocked.ts` (all policy tests pass)
7. **Task 7** — Create memory directives + tests
8. **Task 8** — Create turn management rules + tests
9. **Task 9** — Wire memory directives and turn management into `buildSystemPrompt` + tests

**Final validation after all tasks:**

```bash
npx vitest run tests/evals/returning-policies.test.ts tests/evals/memory-directives.test.ts tests/evals/turn-management.test.ts tests/evals/build-system-prompt.test.ts --reporter=verbose
```

Then run the full test suite to confirm no regressions:

```bash
npx vitest run tests/evals/ --reporter=verbose
```

---

## File Summary

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/policies/returning-no-page.ts` |
| **modify** | `src/lib/agent/policies/draft-ready.ts` |
| **modify** | `src/lib/agent/policies/active-fresh.ts` |
| **modify** | `src/lib/agent/policies/active-stale.ts` |
| **modify** | `src/lib/agent/policies/blocked.ts` |
| **create** | `src/lib/agent/policies/memory-directives.ts` |
| **create** | `src/lib/agent/policies/turn-management.ts` |
| **modify** | `src/lib/agent/prompts.ts` |
| **create** | `tests/evals/returning-policies.test.ts` |
| **create** | `tests/evals/memory-directives.test.ts` |
| **create** | `tests/evals/turn-management.test.ts` |
| **create** | `tests/evals/build-system-prompt.test.ts` |
