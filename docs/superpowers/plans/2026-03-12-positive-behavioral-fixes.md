# Positive Behavioral Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two LLM behavioral issues that cost -7 points in UAT: (1) stale greeting doesn't acknowledge time gap, (2) passive deferrals like "c'è altro?" instead of proactive next steps.

**Architecture:** Three changes. Fix 0 (prerequisite): add stale-transition logic so `active_fresh` pins are re-evaluated when the detected state differs from the cached pin — without this, returning users stay pinned `active_fresh` and never reach the new greeting path. Fix 1: inject the already-computed `lastSeenDaysAgo` into the active-stale policy with three-branch handling (null → neutral greeting, 0-1 → recent return, 2+ → mandatory time reference). Fix 2: replace the negative ban list in `sharedBehavioralRules()` with a positive closing rule (compact multilingual bad examples retained), and fix a conflicting example in `active-fresh.ts`.

**Tech Stack:** TypeScript (prompt engineering + one targeted runtime fix)

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/lib/agent/journey.ts` | Journey state detection | Modify: add stale-transition for `active_fresh` pin |
| `src/lib/agent/policies/active-stale.ts` | Active-stale journey policy | Modify: add `lastSeenDaysAgo` param, rewrite GREETING |
| `src/lib/agent/policies/index.ts` | Policy registry | Modify: thread `lastSeenDaysAgo` through |
| `src/lib/agent/prompts.ts` | System prompt builder | Modify: pass `bootstrap.lastSeenDaysAgo` |
| `src/lib/agent/policies/shared-rules.ts` | Universal behavioral rules | Modify: replace ban list with positive closing rule |
| `src/lib/agent/policies/active-fresh.ts` | Active-fresh policy | Modify: fix conflicting passive deferral example |
| `tests/evals/returning-policies.test.ts` | Policy eval tests | Modify: update call sites + time-gap tests + active-fresh check |
| `tests/evals/shared-rules.test.ts` | Shared rules eval tests | Modify: update deferral test |
| `tests/evals/build-system-prompt.test.ts` | Prompt builder tests | Modify: update mock + plumbing test |
| `tests/evals/journey-state-pin.test.ts` | Journey state pin tests | Modify: add stale-transition test |

---

## Chunk 1: All Tasks

### Task 0: Fix active_fresh → active_stale transition (prerequisite)

- [ ] **Step 1: Add stale-transition logic in `getOrDetectJourneyState`**

In `src/lib/agent/journey.ts`, inside `getOrDetectJourneyState()`, after the pre-publish invalidation block (after line 304, before the `return state;` at line 306), add:

```typescript
    // Re-detect if active_fresh has gone stale (page aged, or no updated_at)
    if (state === "active_fresh") {
      const detected = detectJourneyState(scope, authInfo);
      if (detected !== state) {
        updateJourneyStatePin(anchorId, detected);
        return detected;
      }
    }
```

**Why this is needed:** `getOrDetectJourneyState()` caches journey state pins and only re-detects for pre-publish states (`first_visit`, `returning_no_page`, `draft_ready`). Users pinned `active_fresh` after publish stay there permanently — even weeks later. Without this fix, returning users never reach `active_stale` and never see the temporal greeting from Task 1.

**What it does:** When the cached pin is `active_fresh`, call the existing `detectJourneyState()` and repin if the detected state differs. This covers ALL transition paths including the "no `updated_at`" path that treats the page as stale. No age-check duplication — delegates entirely to the canonical detector.

**Performance note:** `detectJourneyState()` runs a few lightweight SQLite queries (published page lookup, message count). This only fires for `active_fresh` pins, which is a small fraction of all requests.

- [ ] **Step 2: Add test for stale transition**

In `tests/evals/journey-state-pin.test.ts`, add a test in the appropriate describe block:

```typescript
    it("transitions active_fresh → active_stale when page ages past freshness window", () => {
      // Setup: pin active_fresh, then age the published page past FRESH_PAGE_DAYS
      // This verifies the new re-detection path
      // (Exact test structure depends on existing test fixtures in this file)
    });
```

Note: the implementer should follow the existing test patterns in `journey-state-pin.test.ts` for mock setup. The key assertion is: given a cached `active_fresh` pin and a published page older than 7 days, `getOrDetectJourneyState()` returns `active_stale` and updates the pin.

---

### Task 1: Inject temporal data into active-stale greeting

- [ ] **Step 1: Update `activeStalePolicy` signature and GREETING**

In `src/lib/agent/policies/active-stale.ts`, change signature:

From:
```typescript
export function activeStalePolicy(language: string): string {
```
To:
```typescript
export function activeStalePolicy(language: string, lastSeenDaysAgo?: number | null): string {
```

Add before the template literal return:
```typescript
  // Three-branch greeting:
  //   null       → no chat history, neutral greeting, ban time-gap language
  //   0-1        → recent return, no false gap framing
  //   2+         → inject concrete time data
  // Labels are language-neutral — the LLM translates to session language
  const timeLabel = lastSeenDaysAgo != null && lastSeenDaysAgo >= 2
    ? (lastSeenDaysAgo <= 6
        ? "a few days"
        : lastSeenDaysAgo <= 13
          ? "about a week"
          : lastSeenDaysAgo <= 29
            ? "a couple of weeks"
            : "a while")
    : null;
```

Replace GREETING section (lines 21-32):

From:
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

To:
```
GREETING (turn 1):
- Use their name from facts (identity/name). NEVER ask for their name.
${lastSeenDaysAgo == null
  ? `- Greet warmly. Use their name and be direct about what they can do with their page.
  Do NOT mention elapsed time or imply a time gap — there is no prior chat history to reference.`
  : lastSeenDaysAgo <= 1
    ? `- This is a recent return (last seen today/yesterday). Greet warmly and pick up where you left off.
  Do NOT frame the greeting around a time gap — they were just here.`
    : `- LAST CONTACT: ${lastSeenDaysAgo} days ago (~${timeLabel}). Your FIRST sentence MUST reference this time gap naturally in the conversation language.
  Do NOT skip this — the user needs to feel recognized as a returning visitor.`}
- Ask ONE focused question about likely changes. Pick from:
  - Work: "Still at [company]?" or "Any new projects?"
  - Interests: "Picked up any new hobbies lately?"
  - General: "Anything you'd like to update on your page?"
- Use search_facts to reference something specific from their profile — shows you remember them.
```

**Three branches:**

| `lastSeenDaysAgo` | `timeLabel` | Greeting instruction |
|---|---|---|
| `null` | `null` | Warm greeting, no "returning visitor" claim, explicit ban on time-gap language |
| `0` or `1` | `null` | Recent return, pick up where left off, no false gap framing |
| `2-6` | `"a few days"` | "LAST CONTACT: 3 days ago (~a few days)" |
| `7-13` | `"about a week"` | "LAST CONTACT: 8 days ago (~about a week)" |
| `14-29` | `"a couple of weeks"` | "LAST CONTACT: 18 days ago (~a couple of weeks)" |
| `30+` | `"a while"` | "LAST CONTACT: 45 days ago (~a while)" |

**Design decisions:**
- `timeLabel` uses English labels — language-neutral seeds that the LLM adapts to session language naturally ("about a week" → "circa una settimana" in Italian, "ungefähr eine Woche" in German)
- Three distinct prompt branches: null (no chat history → neutral greeting, ban time claims), 0-1 (recent → no false gap), 2+ (inject data → mandatory reference)
- Null branch avoids "returning visitor" framing because `active_stale` with `lastSeenDaysAgo=null` can mean a legacy/imported page with no chat history — the user may never have chatted before
- `lastSeenDaysAgo` comes from message timestamps, not page age. For null edge cases the explicit ban prevents false claims; for 0-1 the "pick up where you left off" framing is contextually accurate

- [ ] **Step 2: Update policy registry**

In `src/lib/agent/policies/index.ts`:

Change POLICY_MAP type (line 30):
```typescript
const POLICY_MAP: Record<JourneyState, (language: string, lastSeenDaysAgo?: number | null) => string> = {
```

Change `getJourneyPolicy` (lines 43-49):
```typescript
export function getJourneyPolicy(state: JourneyState, language: string, lastSeenDaysAgo?: number | null): string {
  const policyFn = POLICY_MAP[state];
  if (!policyFn) {
    return firstVisitPolicy(language);
  }
  return policyFn(language, lastSeenDaysAgo);
}
```

- [ ] **Step 3: Pass from `buildSystemPrompt`**

In `src/lib/agent/prompts.ts`, change line 338:
```typescript
  const journeyPolicy = getJourneyPolicy(bootstrap.journeyState, bootstrap.language, bootstrap.lastSeenDaysAgo);
```

- [ ] **Step 4: Update tests for Task 1**

**4a. `tests/evals/returning-policies.test.ts`**

Update call sites (lines 291-292):
```typescript
  const policyEn = activeStalePolicy("en", 8);
  const policyIt = activeStalePolicy("it", 8);
```

Replace time-gap test (lines 319-322) with table-driven boundary tests:
```typescript
    it("injects last-contact data when lastSeenDaysAgo >= 2", () => {
      expect(policyEn).toMatch(/LAST CONTACT.*8 days/i);
      expect(policyEn).toMatch(/MUST.*reference.*time/i);
    });

    it("does NOT claim time gap when lastSeenDaysAgo is null", () => {
      const policyNull = activeStalePolicy("en", null);
      expect(policyNull).not.toMatch(/LAST CONTACT/i);
      expect(policyNull).not.toMatch(/returning visitor/i);
      expect(policyNull).toMatch(/do not.*mention.*elapsed.*time/i);
    });

    it("treats 0-1 as recent return without time gap", () => {
      const policy0 = activeStalePolicy("en", 0);
      const policy1 = activeStalePolicy("en", 1);
      expect(policy0).not.toMatch(/LAST CONTACT/i);
      expect(policy0).toMatch(/recent return/i);
      expect(policy0).toMatch(/just here/i);
      expect(policy1).not.toMatch(/LAST CONTACT/i);
      expect(policy1).toMatch(/recent return/i);
    });

    it.each([
      { days: 2, label: "a few days" },
      { days: 6, label: "a few days" },
      { days: 7, label: "about a week" },
      { days: 13, label: "about a week" },
      { days: 14, label: "a couple of weeks" },
      { days: 29, label: "a couple of weeks" },
      { days: 30, label: "a while" },
    ])("maps $days days to ~$label", ({ days, label }) => {
      const policy = activeStalePolicy("en", days);
      expect(policy).toMatch(new RegExp(`LAST CONTACT.*${days} days`, "i"));
      expect(policy).toMatch(new RegExp(`~${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
    });
```

Update cross-policy call (line 457):
```typescript
    { name: "activeStale", fn: (lang: string) => activeStalePolicy(lang, 10) },
```

**4b. `tests/evals/build-system-prompt.test.ts`**

Update mock (line 22):
```typescript
vi.mock("@/lib/agent/policies/active-stale", () => ({
  activeStalePolicy: vi.fn((lang: string, _days?: number | null) => `ACTIVE_STALE_${lang}`),
}));
```

Add plumbing test after line 222:
```typescript
    it("passes lastSeenDaysAgo to activeStalePolicy", async () => {
      const { activeStalePolicy: mockFn } = await import("@/lib/agent/policies/active-stale");
      vi.mocked(mockFn).mockClear();
      buildSystemPrompt(makeBootstrap({ journeyState: "active_stale", lastSeenDaysAgo: 12 }));
      expect(mockFn).toHaveBeenCalledWith("en", 12);
    });
```

---

### Task 2: Replace passive deferral ban list with positive closing rule

- [ ] **Step 1: Replace rule in shared-rules.ts**

In `src/lib/agent/policies/shared-rules.ts`, replace lines 13-25:

From:
```
- NEVER end a turn with passive deferrals. Banned phrases (all languages):
  EN: "let me know if you need anything", "feel free to ask", "I'm here if you need me",
      "is there anything else?", "just let me know", "anything else?"
  IT: "fammi sapere se", "sentiti libero/a", "sono qui se", "c'è altro?",
      "hai bisogno di altro?", "se hai bisogno"
  DE: "lass mich wissen", "melde dich", "gibt es noch etwas?", "sonst noch etwas?"
  FR: "n'hésite pas", "fais-moi signe", "autre chose?", "y a-t-il autre chose?"
  ES: "no dudes en", "avísame si", "¿algo más?", "¿necesitas algo más?"
  PT: "me avise se", "fique à vontade", "mais alguma coisa?", "precisa de algo mais?"
  JA: "何かあれば", "お気軽に", "他に何か？"
  ZH: "随时告诉我", "还有什么需要的吗？", "有其他问题吗？"
  End with a concrete anchor instead (a completion confirmation,
  a suggestion, or a direct question).
```

To:
```
- TURN CLOSING — end every turn with a concrete anchor. Valid anchors:
  a brief confirmation, a specific follow-up question about the current topic,
  a bounded choice for the next step, or a short confirmation + one targeted question.
  NEVER end with open-ended deferrals. Banned patterns (all languages):
  EN: "anything else?" / "let me know" / "feel free to ask"
  IT: "c'è altro?" / "fammi sapere" / "se hai bisogno"
  DE: "sonst noch etwas?" / "lass mich wissen"
  FR: "autre chose?" / "n'hésite pas"
  ES: "¿algo más?" / "avísame si"
  PT: "mais alguma coisa?" / "fique à vontade"
  JA: "何かあれば" / "他に何か？"
  ZH: "还有什么需要的吗？" / "随时告诉我"
```

**Design decisions:**
- Rule is fully unconditional — no state branching. Respects `sharedBehavioralRules()` zero-conditional-branching invariant.
- "Concrete anchor" is defined broadly with four valid forms: (1) bare confirmation ("Updated."), (2) follow-up question ("What section should we work on?"), (3) bounded choice ("Want to change anything, or shall we publish?"), (4) short confirmation + one targeted question ("Done. Publish?"). This explicitly allows the `confirm + question` pattern used across multiple policies (`draft-ready.ts:31`, `active-fresh.ts:33`, expert calibration in `index.ts:97`) without conflict.
- Compact multilingual banned patterns retained from the original — trimmed to 2-3 key phrases per language to reduce prompt size while keeping broad language coverage. This prevents regressions in the 8 supported languages.
- No "Good" phrase examples because any specific phrase either assumes a tool was called (conflicting with completion-claim guard), assumes a specific journey state (violating zero-conditional-branching), or implies exploration (conflicting with anti-exploration rules). Journey-specific policies already have appropriate examples in their own files.

- [ ] **Step 2: Fix conflicting example in active-fresh.ts**

In `src/lib/agent/policies/active-fresh.ts`, change line 33:

From:
```
- After each successful update, briefly confirm: "Done — visible in preview. Anything else to update?"
```

To:
```
- After each successful update, briefly confirm and steer: "Done — visible in preview. Want to update another section?"
```

**What changed:** Replaced passive "Anything else to update?" (open-ended, burden on user) with "Want to update another section?" — a bounded question scoped to the edit workflow. This does NOT mention `generate_page` because fact mutations already auto-recompose the draft (edits are visible in preview immediately via `recomposeAfterMutation()`). The planning protocol handles when to regenerate/publish at the end of compound edits.

- [ ] **Step 3: Update tests for Task 2**

**3a. `tests/evals/shared-rules.test.ts`**

Replace lines 24-29:
```typescript
  it("has positive TURN CLOSING rule with anchor guidance", () => {
    expect(rules).toMatch(/TURN CLOSING/i);
    expect(rules).toMatch(/concrete anchor/i);
    expect(rules).toMatch(/confirmation/i);
  });

  it("bans open-ended deferrals with multilingual coverage", () => {
    expect(rules).toMatch(/NEVER.*open-ended.*deferral/i);
    // Verify key language coverage
    expect(rules).toMatch(/anything else/i);
    expect(rules).toMatch(/c'è altro/i);
    expect(rules).toMatch(/sonst noch etwas/i);
    expect(rules).toMatch(/何かあれば/);
  });
```

**3b. `tests/evals/returning-policies.test.ts`**

Add test in `activeFreshPolicy` describe block:
```typescript
  it("does NOT use passive deferral in update confirmation example", () => {
    const policy = activeFreshPolicy("en");
    expect(policy).not.toMatch(/anything else\??/i);
  });
```

- [ ] **Step 4: Run verification**

Run: `npx tsc --noEmit`
Expected: no new errors in touched files

Run: `npx vitest run tests/evals/returning-policies.test.ts tests/evals/shared-rules.test.ts tests/evals/build-system-prompt.test.ts tests/evals/journey-state-pin.test.ts`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/journey.ts src/lib/agent/policies/active-stale.ts src/lib/agent/policies/index.ts src/lib/agent/prompts.ts src/lib/agent/policies/shared-rules.ts src/lib/agent/policies/active-fresh.ts tests/evals/returning-policies.test.ts tests/evals/shared-rules.test.ts tests/evals/build-system-prompt.test.ts tests/evals/journey-state-pin.test.ts
git commit -m "fix: positive behavioral rules — inject temporal data in greeting, proactive turn closing

- Add active_fresh → active_stale transition when detected state differs from pin
- Inject lastSeenDaysAgo into active-stale greeting with 3-branch handling
- Replace passive deferral ban list with positive TURN CLOSING rule (multilingual)
- Fix conflicting passive deferral example in active-fresh policy"
```
