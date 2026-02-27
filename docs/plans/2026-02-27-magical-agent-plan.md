# OpenSelf — The Magical Agent Plan

Last updated: 2026-02-27
Status: approved design
Supersedes: `2026-02-27-model-agnostic-control-plane-implementation-plan.md`

## 1) Vision

The user never thinks about how the tool works. They talk, and the agent
understands where they are, knows what to do next, and does it right.
Three pillars:

1. **Knows who you are** — first message proves it (name, page state, what changed)
2. **Knows what to do** — proposes the right action, never asks "what do you want?"
3. **Does it well** — operations work first try on any LLM. High-impact changes are explained before execution. If you don't like it, just say so.

## 2) Architecture: Three Layers

```
┌─────────────────────────────────────────────┐
│  Layer 1: JOURNEY INTELLIGENCE              │
│  User state + situations + bootstrap        │
│  (deterministic, zero LLM)                  │
├─────────────────────────────────────────────┤
│  Layer 2: CONVERSATION POLICY               │
│  Prompt policies per state, turn mgmt,      │
│  expertise progression, explain-before-act  │
│  (prompt engineering, zero runtime code)     │
├─────────────────────────────────────────────┤
│  Layer 3: RELIABLE EXECUTION                │
│  Structured output, cross-model quality,    │
│  publish preflight, inspect tools           │
│  (code + eval)                              │
└─────────────────────────────────────────────┘
```

- Layer 1 is pure deterministic code (no LLM). Detects state from DB.
- Layer 2 is prompt engineering (guides the LLM). No new runtime code.
- Layer 3 is code + eval (guarantees quality). New tools and output hardening.

## 3) Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model switching | Deploy-time (env var) | User never sees which model is behind. Fewer combinations to test. |
| Undo mechanism | Conversational (no stack) | Agent explains what it did, proposes reversal. More natural, zero infrastructure. |
| GitHub connector | Out of scope | Focus entirely on agent quality. Connectors in a future plan. |
| Layout simulation | No formal simulator | Agent reasons on structured state (inspect tool) + prompt policy. Enough for explain-before-act. |
| Skills as files | No | State-specific prompt policies achieve the same effect without indirection. |
| Feature flags | None | Incremental release by sprint. Single server, single user in prod. |

---

## 4) Layer 1 — Journey Intelligence

### 4.1 Journey States (6, mutually exclusive)

| State | Condition | The user is... |
|-------|-----------|----------------|
| `first_visit` | 0 facts, no prior session | Unknown |
| `returning_no_page` | Has facts, no draft/published | Talked before, no page |
| `draft_ready` | Has draft, never published | Page ready, not live |
| `active_fresh` | Published ≤ 7 days ago | Satisfied, might want tweaks |
| `active_stale` | Published > 7 days ago | Needs re-engagement |
| `blocked` | Quota exhausted or auth missing | Needs unblock |

Detection is deterministic:

```
if (factCount === 0 && !hasAnySummary) → first_visit
if (factCount > 0 && !hasDraft && !hasPublished) → returning_no_page
if (hasDraft && !hasPublished) → draft_ready
if (hasPublished && daysSincePublish <= 7) → active_fresh
if (hasPublished && daysSincePublish > 7) → active_stale
if (quotaExhausted || authBlocked) → blocked
```

### 4.2 Situation Overlays (non-exclusive, additive)

| Situation | Condition | Impact on conversation |
|-----------|-----------|----------------------|
| `has_pending_proposals` | proposal count > 0 | Mention in first 2 turns |
| `has_thin_sections` | richness classifier → thin/empty | Guide drill-down |
| `has_stale_facts` | facts not updated > 30 days | Ask confirmation |
| `has_open_conflicts` | conflict count > 0 | Propose resolution |
| `has_name` | identity/first_name fact exists | Use name in greeting |
| `has_soul` | active soul profile | Respect tone/voice |
| `expertise_level` | session count: novice(1-2) / familiar(3-5) / expert(6+) | Calibrate verbosity |

States determine tone and greeting. Situations determine suggested actions.

### 4.3 Bootstrap Payload

New endpoint: `GET /api/chat/bootstrap`

```typescript
interface BootstrapPayload {
  journeyState: JourneyState;
  situations: Situation[];
  expertiseLevel: 'novice' | 'familiar' | 'expert';

  // For greeting
  userName: string | null;
  lastSeenDaysAgo: number | null;
  publishedUsername: string | null;

  // For suggested actions
  pendingProposalCount: number;
  thinSections: string[];
  staleFacts: string[];

  // Language
  language: string;

  // Memory: last Tier 2 summary condensed
  conversationContext: string | null;
}
```

Assembled from DB reads only. No LLM. Target latency: < 50ms.

### 4.4 Onboarding Redesign (first_visit)

Current flow (broken): "Tell me about yourself and what you're into" — never asks name.

New flow — 3 phases with clear objectives:

**Phase A: Identity (turns 1-2)**
- Turn 1: Greet + ask name. "Hi! I build personal pages from a conversation. What's your name?"
- Turn 2: After name, ask what they do. "Nice to meet you [Name]! What do you do — work, study, personal project?"
- Immediately `create_fact` for name and role. The agent *proves* it listens.

**Phase B: Breadth-first exploration (turns 3-6)**
- Agent has name and role. Explores 3-4 different areas, one question per turn:
  - Skills/tools
  - Recent projects/work
  - Interests/passions
  - Achievements or what makes them unique
- **Rule**: never 2 consecutive questions on the same area.
- **Rule**: after each answer, `create_fact` + brief acknowledgment.

**Phase C: Generate + publish (turns 7-8)**
- "I have enough for a first version! Want me to generate it?" → `generate_page`
- Preview + "Like it? Want to change anything or shall we publish?"
- If ok → ask for username → `request_publish`
- **Never** close with "let me know if you need anything." Always propose next step.

**Low-signal fallback:**
- 2+ empty replies → switch to chips/choices
- 3+ → fill-in-the-blank
- After 3 guided attempts → generate minimal page with whatever facts exist

### 4.5 Returning Users with Memory

The 3-tier memory becomes a conversational superpower:

| Tier | Data | How the agent uses it |
|------|------|-----------------------|
| **Tier 1 (Facts)** | Name, role, skills, projects | Personalized greeting. Never re-ask known info. |
| **Tier 2 (Summary)** | Last conversations summary | "Last time we were talking about X" |
| **Tier 3 (Meta-memories)** | Patterns, preferences, insights | "I know you prefer a formal tone" / "You tend to undervalue achievements" |

**Greeting examples by state:**

| State | Example |
|-------|---------|
| `returning_no_page` | "Welcome back [Name]. Last time we collected some info but didn't generate the page. Pick up from there?" |
| `draft_ready` | "Hi [Name]! Your draft is ready. Want to review it or publish directly?" |
| `active_fresh` | "Hey [Name], page went live recently. All good? Want to update anything?" |
| `active_stale` | "Been a while, [Name]. Has anything changed — work, projects, interests?" |
| `blocked` | "[Name], last time publish didn't go through. [specific reason]. Let's fix it." |

**With situation overlays:**
- `active_stale` + `has_pending_proposals`: "Been a while. Meanwhile I worked on some improvements — I have 2 proposals ready. Want to see them?"
- `active_fresh` + `has_thin_sections`: "Page is live! I noticed the projects section is a bit empty. Want to tell me about a recent project?"

### 4.6 Expertise Progression

The agent adapts to how well the user knows the tool:

| Level | Sessions | Behavior |
|-------|----------|----------|
| `novice` | 1-2 | Explains every action. Step-by-step guidance. |
| `familiar` | 3-5 | Less explanation, more direct action. "Updating role and regenerating." |
| `expert` | 6+ | Minimal. Executes and confirms. "Done. Publish?" |

---

## 5) Layer 2 — Conversation Policy

### 5.1 Prompt Architecture (refactor)

Current: 2 monolithic policy functions (`onboardingPolicy`, `steadyStatePolicy`).

New: composite prompt from independent blocks:

```
System prompt =
  IDENTITY                    (fixed: who you are)
  + JOURNEY POLICY            (1 of 6, from journeyState)
  + SITUATION DIRECTIVES      (0-N, from active situations)
  + EXPERTISE CALIBRATION     (1 of 3, from level)
  + TURN MANAGEMENT RULES     (fixed)
  + ACTION AWARENESS          (fixed)
  + MEMORY USAGE DIRECTIVES   (fixed)
  + TOOL POLICY               (fixed, existing)
  + SAFETY POLICY             (fixed, existing)
```

Each block is a function that produces text. `assembleContext()` composes them.
Testable in isolation, combinable freely.

### 5.2 Turn Management Rules

Injected as a fixed block in all policies:

**R1 — Topic budget**: never more than 2 consecutive questions on the same area
(work, projects, skills, interests, education, personal). After 2, switch.

**R2 — Collect → act**: don't exceed 6 fact-gathering exchanges without proposing
a concrete action (generate page, publish, regenerate section).

**R3 — Never close passively**: every agent turn ends with an action proposal or
specific question. Forbidden:
- "Let me know if you need anything"
- "I'm here if you want to change something"
- "Don't hesitate to ask"

Instead:
- "Publish now or add projects first?"
- "Move to skills section or work on layout?"
- "Page is updated. Change the theme or good as is?"

**R4 — Detect stall**: if user gives 2 short/vague replies in a row, don't insist.
Offer concrete choices (chips) or act with what you have.

**R5 — Proportionality**: agent response length matches user message length.
Short user message → short agent response. User writes 3 words, agent doesn't
reply with a paragraph.

### 5.3 Explain-Before-Act (visual operations)

Some operations have unpredictable visual results from the chat.
The agent must explain before acting.

**Operations requiring explain-before-act:**
- `set_layout` — template change
- `set_theme` — theme change
- `reorder_sections` — significant reorder (3+ sections)
- `generate_page` in steady_state — full regeneration

**Operations that don't require it** (low impact, reversible):
- `create_fact`, `update_fact`, `delete_fact`
- `set_fact_visibility`
- `update_page_style`
- `reorder_sections` with 1-2 sections

**Pattern:**
```
For layout, theme, and full regeneration:
1. Explain what you're about to do and the expected visual effect
2. Ask for confirmation
3. Only after confirmation, call the tool
4. After execution: "Done — check the preview on the right"

Exception: if user gave explicit instruction ("switch to bento layout"),
brief confirmation and act. Don't ask permission for what was already requested.
```

**Calibrated by expertise:**
- `novice`: always explain, even with explicit instruction
- `familiar`: explain only when action is ambiguous
- `expert`: act and confirm. "Done, bento active."

### 5.4 Conversational Undo

No new infrastructure. The agent has conversation context (previous tool calls).

**Rule**: when user expresses dissatisfaction ("don't like it", "go back",
"was better before", "undo"):

1. **Identify** the last relevant action from chat context
2. **Explain** what was done: "I changed layout from vertical to bento"
3. **Propose** restoration + alternatives: "Back to vertical, or try sidebar-left?"
4. **Act** on user choice

If user is vague ("don't like the page"), ask what specifically — don't undo everything.

```
When user expresses dissatisfaction:
- Do NOT regenerate the entire page as first reaction
- Identify the specific action they don't like
- Propose reversal of that specific action + alternatives
- If you can't identify the action: "What specifically isn't working?"
```

### 5.5 Journey State Policies

6 functions, one per state. Each produces a concrete, actionable prompt block.

**`first_visit`:**
```
PHASE: first encounter.
GOAL: know the user and generate first page in ~8 turns.

Turn 1: ask name. Introduce yourself briefly. Don't ask anything else.
Turn 2: after name, ask what they do (work/study/project).
Turns 3-6: explore 3-4 different areas. One question per turn.
  Never 2 questions on the same area in a row.
  After each answer: create facts + brief acknowledgment.
Turn 7: "I have enough for a first version, generate it?"
Turn 8: after generation → propose publish with username.

If short answers: turn 4 → switch to concrete choices.
If very short answers: turn 5 → generate minimal page.

IMPORTANT: record EVERY piece of information as a fact immediately.
The user must feel that everything they say is captured.
```

**`returning_no_page`:**
```
User has come before but never generated a page.
You have prior facts and a conversation summary.

Do NOT request information already in facts (check them).
Briefly summarize what you know: "Last time you told me [role] and [project]."
Ask what changed and if there's new info.
After 2-3 exchanges: propose generating the page.
```

**`draft_ready`:**
```
User has a draft ready but never published.
Fast path: review → publish.

Show what's in the draft. Ask if they want changes.
If ok: propose publish + username.
Don't reopen the interview — the page is already built.
```

**`active_fresh`:**
```
Page published recently. User probably wants a tweak.
Be brief and operational. Don't reopen exploration.
Ask what they want to update. Do the update. Propose re-publish.
```

**`active_stale`:**
```
Page published over a week ago. Re-engage.

Greet by name. Acknowledge the time passed.
Ask what changed (work, projects, interests).
After answers: update facts, regenerate impacted sections.
Do NOT regenerate entire page — only changed sections.
Propose publish when update is done.
```

**`blocked`:**
```
User is blocked (quota or auth). Don't waste time.
Explain block in 1 sentence.
Give solution in 1 sentence.
If quota: "You've reached the message limit. Publish your page for now,
  come back tomorrow for updates."
If auth: "Publishing requires an account. [signup link]"
```

### 5.6 Situation Directives (overlay blocks)

Short prompt blocks injected when a situation is active:

**`has_pending_proposals`:**
```
You have [N] improvement proposals ready (text rewrites from heartbeat).
Mention in first 2 turns: "I have [N] proposals to improve [sections]. Want to see them?"
If user accepts: present each with before/after comparison.
```

**`has_thin_sections`:**
```
Sections with sparse content: [list].
After handling user's main request, propose enriching the most
relevant section. One at a time, not all at once.
```

**`has_stale_facts`:**
```
Some facts haven't been updated in 30+ days: [list].
Ask for confirmation: "Is your role still [X]? Still working on [Y]?"
Update or confirm.
```

**`has_open_conflicts`:**
```
There are conflicts to resolve: [list].
Present clearly: "I have two conflicting pieces of info about [topic].
Which is correct: [A] or [B]?"
```

### 5.7 Memory as Conversational Superpower

Explicit directives on *how* to use memory (injected in all prompts):

```
HOW TO USE YOUR KNOWLEDGE ABOUT THE USER:

Facts (Tier 1): current truth. Never ask something that's in facts.
If name is in facts, use it from the first message.
If role is in facts, don't ask "what do you do?"

Summary (Tier 2): summary of past conversations.
Use for continuity: "Last time we were talking about [topic from summary]."
Do NOT recite the summary — use it for context.

Meta-memories (Tier 3): long-term patterns and insights.
Use for deep personalization:
- "prefers informal tone" → adapt tone
- "undervalues achievements" → push harder on achievements
- recurring topic → reconnect naturally

GOLDEN RULE: every conversation must enrich memory.
At the end of significant sessions (5+ exchanges), use save_memory
to note patterns, preferences, or insights useful next time.
```

---

## 6) Layer 3 — Reliable Execution

### 6.1 Structured Output Hardening

**Problem**: `translatePageContent()` uses `generateText()` + `stripCodeFences()` +
`JSON.parse()`. If the model wraps JSON in markdown or adds a comment, translation
fails silently and user sees the page in the wrong language.

**Fix**: migrate to `generateObject()` with Zod schema. Vercel AI SDK handles
structured parsing natively per provider (tool-use for Anthropic, JSON mode for
OpenAI, etc.).

Current state of LLM calls for structured output:

| Service | Today | Action |
|---------|-------|--------|
| `translate.ts` | `generateText` + `JSON.parse(stripCodeFences())` | Migrate to `generateObject` + Zod |
| `summary-service.ts` | `generateText` (free text) | Keep (free text is fine). Fix `recordUsage` hardcode. |
| `section-personalizer.ts` | `generateObject` + Zod | Already correct. No change. |
| `conformity-analyzer.ts` | `generateObject` + Zod | Already correct. No change. |

Optional helper:
```typescript
async function structuredGenerate<T>(opts: {
  schema: ZodSchema<T>;
  prompt: string;
  tier: ModelTier;
  operationName: string;
}): Promise<T>
```

Thin wrapper around `generateObject` that adds standardized logging
(token usage, model, provider, success/failure). 20-30 lines, not a framework.

### 6.2 Model Tier Cleanup

Existing: `cheap` / `medium`. Add `capable` for complex reasoning tasks.

| Tier | Usage | Default models |
|------|-------|----------------|
| `cheap` | Chat, fact extraction, translation | gemini-2.0-flash, gpt-4o-mini, haiku |
| `medium` | Summary, soul proposals, personalizer | gemini-2.5-flash, gpt-4o-mini, haiku |
| `capable` | Conformity analysis, deep heartbeat | gemini-2.5-pro, gpt-4o, sonnet |

`capable` is only used by the worker (heartbeat deep, conformity).
Never in the user's real-time path — no latency impact.

Fixes:
- Add `CAPABLE_MODELS` map + env var `AI_MODEL_CAPABLE` in `provider.ts`
- Fix `recordUsage("anthropic", ...)` → `recordUsage(getProviderName(), ...)` in summary service
- Migrate conformity analyzer and deep heartbeat to tier `capable`

### 6.3 New Tool: publish_preflight

Checks everything *before* attempting publish. The agent calls it when about to
suggest publish and uses the result to guide the user.

```typescript
publish_preflight: tool({
  description: "Check if the page is ready to publish. Call before request_publish.",
  parameters: z.object({
    username: z.string()
  }),
  execute: async ({ username }) => {
    return {
      // Gate checks (blocking)
      hasAuth: boolean,
      hasUsername: boolean,
      hashValid: boolean,

      // Quality checks (warnings)
      incompleteSections: string[],
      proposedFacts: number,
      thinSections: string[],
      missingContact: boolean,

      // Info
      sectionCount: number,
      factCount: number,
      readyToPublish: boolean,

      // Suggested message for user
      summary: string
    };
  }
})
```

Prompt policy for usage:
```
Before proposing publish, ALWAYS call publish_preflight.
If readyToPublish = true: propose publish directly.
If readyToPublish = false (gate failure): explain block and how to fix.
If readyToPublish = true but quality warnings exist:
  present warnings, let user decide.
  "Page is publishable, but skills section only has 2 items
   and you have 3 facts still in draft. Publish now or improve first?"
```

Implementation reuses existing logic: `isSectionComplete()`,
`filterPublishableFacts()`, auth check, hash check. No new business logic.

`request_publish` is extended to call preflight internally and refuse if
gates fail — belt and suspenders.

### 6.4 New Tool: inspect_page_state

Gives the agent a structured, compact view of the current page. Used before
layout/theme changes so the agent can reason and explain.

```typescript
inspect_page_state: tool({
  description: "Get a structured view of the current page state.",
  parameters: z.object({
    username: z.string()
  }),
  execute: async ({ username }) => {
    return {
      layout: {
        template: "bento-standard",
        theme: "warm",
        style: { ... }
      },
      sections: [
        {
          id: "hero",
          type: "hero",
          slot: "banner",
          widget: "hero-cover",
          locked: false,
          complete: true,
          richness: "rich"
        },
        // ...
      ],
      availableSlots: ["banner", "main", "sidebar", "footer"],
      warnings: ["skills section is thin", "no contact section"]
    };
  }
})
```

No formal simulator needed — the structured payload + LLM reasoning ability
is sufficient to describe impact:

> "Your page uses vertical layout with 8 sections. If I switch to bento,
>  sections will distribute in a grid: hero on top banner, bio and skills
>  in main column, interests and projects in sidebar. Proceed?"

### 6.5 Cross-Provider Eval Matrix

8 critical scenarios tested per provider. The mechanism that guarantees
equivalent experience regardless of which LLM is behind.

| # | Scenario | Verifies |
|---|----------|----------|
| 1 | Onboarding: 5 turns → generate page | Facts created, page generated, publish proposed |
| 2 | Translation IT → EN | Valid JSON output, all sections translated, proper nouns unchanged |
| 3 | Section personalization | Output conforms to Zod schema, text-only fields, within MAX_WORDS |
| 4 | Layout change requested | Agent explains before, executes after confirmation |
| 5 | User says "don't like it" | Agent identifies action, proposes reversal |
| 6 | Returning user (stale) | Personalized greeting with name, no questions about known info |
| 7 | Publish with incomplete sections | Preflight flags issues, agent presents warnings |
| 8 | Low-signal user (vague replies) | Switch to chips within 2 turns, minimal page within 5 |

Implementation: parameterized test suite in `tests/evals/cross-provider/`.

```typescript
describe.each(['anthropic', 'google', 'openai'])('scenario [%s]', (provider) => {
  // same logic, different provider
});
```

**Gate**: all 8 pass on Anthropic + Google.
**Best-effort**: OpenAI, Ollama.

### 6.6 Tool Changes Summary

| Tool | Action |
|------|--------|
| `publish_preflight` | **New** — structured pre-publish check |
| `inspect_page_state` | **New** — page snapshot for the agent |
| `request_publish` | **Extended** — calls preflight internally |
| All others | **Unchanged** |

2 new tools. 0 removed. No DSL. Complexity lives in prompts (Layer 2), not code.

---

## 7) Execution Plan

### 7.1 Dependency Graph

```
Sprint 1: Journey Intelligence     ← foundation, everything depends on this
    ↓
Sprint 2: Onboarding Rewrite       ← first visible user impact
    ↓
Sprint 3: Returning User Policies   ← second impact, requires memory
    ↓                    ↓
Sprint 4: Reliable        Sprint 5: Conversation
Execution                 Polish + Eval
(structured output,       (turn mgmt, expertise,
 tools, tier cleanup)      undo, eval matrix)
```

Sprints 4 and 5 are independent — parallelizable.
All depend on 1-2-3 completed.

### 7.2 Sprint 1 — Journey Intelligence Foundation

**Goal**: the system knows exactly who the user is and what situation they're in,
before the LLM sees a single token.

**Deliverables:**
1. `src/lib/agent/journey.ts` — JourneyState enum, Situation type, ExpertiseLevel,
   `detectJourneyState()`, `detectSituations()`, `detectExpertiseLevel()`.
   All deterministic, zero LLM.
2. `GET /api/chat/bootstrap` endpoint — calls detection functions, returns BootstrapPayload.
3. `ChatPanel.tsx` — calls bootstrap at mount, passes to first chat call,
   removes static welcome assumption.
4. `context.ts` refactor — accepts BootstrapPayload, replaces internal `detectMode()`,
   composes prompt from blocks.

**Tests:**
- `tests/evals/journey-state-detection.test.ts`
- `tests/evals/bootstrap-endpoint.test.ts`

**Acceptance**: given a scenario (facts, auth, page status, session count), payload
is deterministic and 100% correct.

### 7.3 Sprint 2 — Onboarding Rewrite

**Goal**: new user arrives, in 8 turns they have a published page. Agent asks name
on turn 1, explores breadth-first, generates, publishes. Zero dead moments.

**Deliverables:**
1. `src/lib/agent/policies/first-visit.ts` — structured prompt in phases
   (Identity → Exploration → Generation), low-signal escalation, never close passively.
2. `src/lib/agent/policies/index.ts` — policy registry:
   `getJourneyPolicy()`, `getSituationDirectives()`, `getExpertiseCalibration()`.
3. Remove `onboardingPolicy()` and `steadyStatePolicy()` from `prompts.ts`.
4. Dynamic welcome message in ChatPanel from bootstrap payload.

**Tests:**
- `tests/evals/onboarding-flow.test.ts` — 8 turns to generated+publish-proposed
- `tests/evals/onboarding-low-signal.test.ts` — chips at turn 4, minimal page at turn 6
- `tests/evals/onboarding-name-capture.test.ts` — name in facts after turn 1

**Acceptance:**
- Name asked on turn 1 in 100% of cases
- After 8 turns with normal replies: page generated, publish suggested
- After 6 turns with vague replies: minimal page generated
- "let me know if you need anything" never appears

### 7.4 Sprint 3 — Returning User Policies + Strategic Memory

**Goal**: returning user is recognized, greeted by name, receives the right
proposal on first turn. 3-tier memory is actively used.

**Deliverables:**
1. 5 policy files for remaining journey states:
   `returning-no-page.ts`, `draft-ready.ts`, `active-fresh.ts`,
   `active-stale.ts`, `blocked.ts`.
2. Situation directive templates in `policies/situations.ts`.
3. Memory usage directives — new prompt block (section 5.7).
4. Enhanced `save_memory` directive: at end of significant sessions (5+ turns),
   agent saves meta-memory with observed patterns/preferences/insights.

**Tests:**
- `tests/evals/returning-user-greeting.test.ts` — correct greeting with name per state
- `tests/evals/returning-user-no-repeat.test.ts` — no re-asking known facts
- `tests/evals/memory-continuity.test.ts` — agent references previous conversation summary
- `tests/evals/situation-overlay.test.ts` — proposals/conflicts/thin sections mentioned in first 2 turns

**Acceptance:**
- User with name in facts receives greeting with name 100% of the time
- User with summary receives contextual reference 80%+ of the time
- Zero questions about information already present in facts
- Pending proposals mentioned within turn 2

### 7.5 Sprint 4 — Reliable Execution

**Goal**: LLM operations work first try on any provider. Agent has tools to
inspect and validate before acting.

**Deliverables:**
1. `translatePageContent()` → `generateObject` with Zod schema. Remove `stripCodeFences()`.
2. Tier cleanup: add `capable`, fix `recordUsage` hardcode, migrate conformity/heartbeat.
3. New tool `publish_preflight`.
4. New tool `inspect_page_state`.
5. `request_publish` extended to call preflight internally.

**Tests:**
- `tests/evals/translate-structured.test.ts`
- `tests/evals/publish-preflight.test.ts`
- `tests/evals/inspect-page-state.test.ts`

**Acceptance:**
- Zero manual `JSON.parse` on LLM output
- Preflight catches all known issues before publish
- Inspect returns complete, correct payload

### 7.6 Sprint 5 — Conversation Polish + Eval Matrix

**Goal**: agent converses naturally, adapts to user expertise, handles
dissatisfaction gracefully, all of this works on every provider.

**Deliverables:**
1. Turn management rules (R1-R5) injected in all policies.
2. Explain-before-act rules for visual operations, calibrated by expertise.
3. Conversational undo directive.
4. Expertise calibration in policies (novice/familiar/expert).
5. Cross-provider eval matrix: 8 scenarios × N providers.

**Tests:**
- `tests/evals/turn-management.test.ts`
- `tests/evals/explain-before-act.test.ts`
- `tests/evals/conversational-undo.test.ts`
- `tests/evals/expertise-calibration.test.ts`
- `tests/evals/cross-provider/` — 8 scenarios parameterized by provider

**Acceptance:**
- Agent never asks 3+ consecutive questions on same area
- Agent never closes passively
- On undo request, agent identifies action and proposes alternatives
- 8 eval scenarios pass on Anthropic and Google

---

## 8) New and Modified Files

### New files

| File | Sprint |
|------|--------|
| `src/lib/agent/journey.ts` | 1 |
| `src/app/api/chat/bootstrap/route.ts` | 1 |
| `src/lib/agent/policies/first-visit.ts` | 2 |
| `src/lib/agent/policies/index.ts` | 2 |
| `src/lib/agent/policies/returning-no-page.ts` | 3 |
| `src/lib/agent/policies/draft-ready.ts` | 3 |
| `src/lib/agent/policies/active-fresh.ts` | 3 |
| `src/lib/agent/policies/active-stale.ts` | 3 |
| `src/lib/agent/policies/blocked.ts` | 3 |
| `src/lib/agent/policies/situations.ts` | 3 |

### Modified files

| File | Sprint | Change |
|------|--------|--------|
| `src/lib/agent/context.ts` | 1 | Accept BootstrapPayload, block composition |
| `src/lib/agent/prompts.ts` | 2 | Remove monolithic policies, hook into policies/ |
| `src/components/chat/ChatPanel.tsx` | 1-2 | Bootstrap call, dynamic welcome |
| `src/lib/ai/provider.ts` | 4 | `capable` tier, `CAPABLE_MODELS` |
| `src/lib/ai/translate.ts` | 4 | `generateObject` + Zod schema |
| `src/lib/agent/tools.ts` | 4 | + `publish_preflight`, + `inspect_page_state` |
| `src/lib/services/summary-service.ts` | 4 | Fix `recordUsage` hardcode |

---

## 9) Success Metrics

| Metric | Today | Target | Measurement |
|--------|-------|--------|-------------|
| Generic greeting for known users | ~100% | 0% | Eval: returning user scenarios |
| Name asked on turn 1 (onboarding) | 0% | 100% | Eval: onboarding flow |
| Turns to first generated page | ~10-12 | ≤8 | Eval: onboarding complete |
| Passive closings ("let me know...") | Frequent | 0% | Eval: grep on output |
| Silent translation failure | Unknown | 0% | Eval: structured output |
| Publish with unreported issues | Possible | 0% | Eval: preflight coverage |
| Equivalent cross-provider behavior | Untested | 8/8 on 2 providers | Eval matrix |

---

## 10) Explicitly Out of Scope

| Excluded | Why |
|----------|-----|
| GitHub/MCP connector | Separate plan, focus on agent quality |
| Runtime model switch (UI dropdown) | Deploy-time config is sufficient |
| Formal undo stack | Conversational undo is more natural |
| Layout patch DSL | Inspect + prompt policy covers the case |
| Layout simulator tool | LLM reasons on state, no dry-run needed |
| Fact inspect/simulate/apply | Atomic operations, already work |
| Skills as separate files | Per-state policies achieve same effect |
| Feature flags (7 in original plan) | No flags, incremental release by sprint |
| Canary rollout | Single server, not needed |
| MCP gateway framework | No connector in scope |

---

## 11) Risks

| Risk | Mitigation |
|------|------------|
| Prompt policies are long and LLM partially ignores them | Specific eval test per rule. If a rule isn't respected, strengthen or move to deterministic logic. |
| Bootstrap adds latency to first message | Endpoint is pure DB read, no LLM. Target < 50ms. |
| Expertise detection (session count) is crude | Start simple, refine with meta-memories if needed. |
| Cross-provider eval is expensive in tokens | Run only pre-release, not continuous CI. Parameterize with mocks for CI. |
| Turn management rules conflict with natural conversation | Rules are guardrails, not scripts. Agent keeps conversational freedom within bounds. |

---

## 12) Definition of Done

All of these must be true:

1. Returning known users always receive contextual, personalized first message.
2. New users are asked their name on the first turn, every time.
3. Agent proposes clear next step in first 2 turns for all journey states.
4. No provider hardcodes outside AI adapter/pricing tables.
5. Layout/theme changes are explained before execution (novice/familiar levels).
6. Structured output utility adopted in translation.
7. Publish preflight catches all known issues before publish attempt.
8. 3-tier memory is actively used (not just passively injected).
9. Cross-provider eval matrix green on Anthropic + Google.
10. Agent never closes with passive "let me know" — always proposes next step.
