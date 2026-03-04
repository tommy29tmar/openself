# Natural Conversation Flow Implementation Plan (v15)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the OpenSelf agent feel like a warm, curious friend rather than a mechanical interviewer — by replacing rigid breadth-forcing rules with natural topic clusters, and eliminating verbose fact-save announcements.

**Architecture:** Targeted prompt/policy edits + test updates. No changes to tools, DB, or API. All changes in `src/lib/agent/`.

**Tech Stack:** TypeScript, Vitest (`tests/evals/`)

---

## Background: Root Causes

**Root cause 1 — R1 forces topic switch every turn**
`turn-management.ts` R1 and `first-visit.ts` Phase B both say "Never ask 2 consecutive questions about the same area."

**Root cause 2 — Novice calibration narrates every fact save**
`policies/index.ts` novice: "Explain every action you take. Use phrases like 'I'm adding this skill...'" and "When you save a fact, tell them: 'I've noted that down.'"
`planning-protocol.ts`: "novice: always verbalize, even for SIMPLE."

**Root cause 3 — No bridge sentence guidance**
No instruction on HOW to transition topics naturally.

**Root cause 4 — Legacy fallback path has old behavior**
`prompts.ts` `onboardingPolicy()` (called from `getSystemPromptText()` at `context.ts:254` when bootstrap absent) has THREE outdated elements:
- Conversation flow item 4: "After ~5 exchanges with good signal, suggest building the page"
- Key behaviors: "Cover BREADTH first..."
- Key behaviors: "After ~5 exchanges with good signal, call generate_page..."
All three need updating to the cluster model.

---

## Canonical Cluster Model

| Concept | Rule |
|---------|------|
| Cluster depth | Target ~2 exchanges (opener + one follow-up). Can end at 1 (very short answer). Can extend to 3 max (user actively developing). |
| Max clusters Phase B | 2 primary. If user volunteers a third area while still under 6-exchange cap, handle it briefly (1 exchange only). |
| Hard cap | 6 total exchanges (R2). Move to Phase C immediately at exchange 6. |
| Phase C gate | Unconditional: before any `generate_page`, if name or role/work is missing, ask ONE direct question. After exactly one attempt (answered or declined), generate immediately with available facts. Never loop. |
| Token regression gate | Baseline ~7709 tokens. Fail if new total > 8109 (baseline + 400). |

---

## ⚠️ Token Budget Mandate

The prompt is already over the advisory cap (6000 tokens). This PR must not grow it by more than 400 tokens.

**Rules for all new prompt text in Tasks 1-5:**
- Use 1 bridge example per section — do not repeat examples across sections.
- In novice calibration (Task 4), reference the OUTPUT_CONTRACT exception list instead of repeating it verbatim.
- Prefer bullets over prose.
- The token gate in Task 6 will catch violations — do not skip it.

---

## Note on eval files

`tests/evals/cross-provider/onboarding-flow.eval.ts` is an LLM eval (uses real model calls). It is excluded from Vitest's `include: ["tests/**/*.test.ts"]` and does NOT run in the standard `npx vitest --run` suite. The plan updates this file for correctness (so it passes when run manually), but does NOT claim it is validated by standard CI. Behavioral contracts are covered by unit tests in `onboarding-policy.test.ts` and `turn-management.test.ts`.

---

## Task 1: Fix OUTPUT_CONTRACT — silent fact-saving rule with exceptions

**Files:**
- Modify: `src/lib/agent/prompts.ts` (OUTPUT_CONTRACT, lines 175-181)
- Modify: `tests/evals/prompt-contracts.test.ts`

**Scope of silence:** Proactive announcements only. If user explicitly asks what was saved, agent must answer. All 4 error exceptions required: success:false, REQUIRES_CONFIRMATION, pageVisible:false, recomposeOk:false.

**Step 1: Replace last bullet in OUTPUT_CONTRACT**

Find (lines 175-181):
```typescript
const OUTPUT_CONTRACT = `Output rules:
- Respond in natural language to the user
- Tool calls happen silently — the user should not see JSON or technical details
- When generating page content, output valid JSON matching the PageConfig schema
- Never output raw HTML — only structured JSON that the renderer will display
- Keep conversational responses under 3 sentences unless the user asks for detail
- NEVER repeat the same sentence pattern across turns. Vary acknowledgments. Avoid formulaic patterns like "Ho aggiunto X" or "Ecco la tua pagina" every time.`;
```

Replace (keep all lines above, change last bullet only):
```typescript
const OUTPUT_CONTRACT = `Output rules:
- Respond in natural language to the user
- Tool calls happen silently — the user should not see JSON or technical details
- When generating page content, output valid JSON matching the PageConfig schema
- Never output raw HTML — only structured JSON that the renderer will display
- Keep conversational responses under 3 sentences unless the user asks for detail
- NEVER repeat the same sentence pattern across turns. Vary acknowledgments.
- SAVE FACTS SILENTLY: Do not proactively announce or enumerate saved facts. At most use a 1-3 word acknowledgment then continue. If user explicitly asks what was saved, provide a concise recap. Exceptions: always surface tool errors (success:false), confirmation gates (REQUIRES_CONFIRMATION), visibility issues (pageVisible:false), and recompose failures (recomposeOk:false).`;
```

**Step 2: Add regression test — extract OUTPUT_CONTRACT block specifically**

The test file reads `prompts.ts` as `src`. Extract the OUTPUT_CONTRACT block to avoid false positives from terms already in TOOL_POLICY:

```typescript
it("OUTPUT_CONTRACT includes silent fact-saving rule with all 4 error exceptions", () => {
  // Extract OUTPUT_CONTRACT specifically — avoid false positives from TOOL_POLICY
  const outputContractMatch = src.match(/OUTPUT_CONTRACT\s*=\s*`([\s\S]*?)`/);
  expect(outputContractMatch).not.toBeNull();
  const outputContract = outputContractMatch![1];

  expect(outputContract).toMatch(/save\s*facts\s*silently|do\s*not.*proactively.*announce/i);
  expect(outputContract).toMatch(/explicitly\s*asks.*recap|user.*asks.*what.*saved/i);
  // All 4 exceptions must be in OUTPUT_CONTRACT itself
  expect(outputContract).toMatch(/success.*false/i);
  expect(outputContract).toMatch(/REQUIRES_CONFIRMATION/);
  expect(outputContract).toMatch(/pageVisible.*false/i);
  expect(outputContract).toMatch(/recomposeOk.*false/i);
});
```

**Step 3: Run tests**
```bash
cd /home/tommaso/dev/repos/openself
npx vitest tests/evals/prompt-contracts.test.ts --run
```
Expected: all pass.

**Step 4: Commit**
```bash
git add src/lib/agent/prompts.ts tests/evals/prompt-contracts.test.ts
git commit -m "feat(agent): OUTPUT_CONTRACT silent fact saves — proactive receipts removed"
```

---

## Task 2: Rewrite R1 — flexible topic clusters with exploration/edit scoping

**Files:**
- Modify: `src/lib/agent/policies/turn-management.ts`
- Modify: `tests/evals/turn-management.test.ts`
- Modify: `tests/evals/cross-provider/onboarding-flow.eval.ts` (update LLM eval for correctness — NOT run in standard CI)

**Step 1: Replace R1 block**

Old:
```
R1 — No consecutive same-area questions:
Never ask 2 or more consecutive questions about the same topic area.
If your last question was about work/experience, your next must be about a different area (projects, interests, skills, etc.).
This ensures breadth and prevents the user from feeling interrogated.
```

New (keep concise — 1 bridge example only):
```
R1 — Topic clusters with natural bridges:
WHEN EXPLORING (onboarding, first visit, open-ended conversation):
Target ~2 exchanges per topic before moving on. One exchange = your question + user's reply.
- Open a topic, listen to the reply, ask one follow-up. That's one cluster (~2 exchanges).
- A cluster can end earlier (very short answer) or extend to 3 max (user still developing). Never force a switch mid-thought.
- If user volunteers a new area while under the 6-exchange cap, handle it briefly (1 exchange only).
- When a cluster feels complete, transition with a bridge sentence: "Bello! E al di fuori del lavoro, c'è qualcosa che ti appassiona?" — never cold-switch topics.
- Target 2 primary clusters. Hard cap: 6 exchanges total (R2 applies — at 6 exchanges, move to action immediately).

WHEN EDITING (returning user making a specific update):
Skip the cluster approach. Make the requested change, confirm briefly, and move on.
```

**Step 1b: Update R2 to add Phase C gate exception**

Also in `turn-management.ts`, update R2's "call generate_page" bullet to add the gate exception:

Old:
```
R2 — Max 6 fact-gathering exchanges:
After 6 exchanges focused on gathering information, you MUST propose an action:
- If no page exists: call generate_page.
- If page exists: offer to regenerate or publish.
- If user seems done: propose publish.
Do NOT keep asking questions beyond 6 exchanges without offering a concrete next step.
```

New (add gate exception only):
```
R2 — Max 6 fact-gathering exchanges:
After 6 exchanges focused on gathering information, you MUST propose an action:
- If no page exists: call generate_page. Exception: if name or role/work is still missing, ask ONE direct question to collect all missing fields ("What's your name and what do you do?"), then generate immediately after (answered or declined).
- If page exists: offer to regenerate or publish.
- If user seems done: propose publish.
Do NOT keep asking questions beyond 6 exchanges without offering a concrete next step.
```

**Step 1c: Update R4 low-signal path to reference Phase C gate**

Also in `turn-management.ts`, add gate cross-reference to R4's fallback:

Old:
```
- If 3+ low-signal replies in a row: stop pushing, work with what you have, propose generating the page.
```

New:
```
- If 3+ low-signal replies in a row: stop pushing, work with what you have, propose generating the page (apply Phase C gate: if name or role/work is missing, ask one direct question to collect all missing fields, then generate immediately).
```

**Step 2: Replace R1 describe block in turn-management.test.ts**

```typescript
describe("R1 — Topic clusters with natural bridges", () => {
  it("targets ~2 exchanges per cluster in exploration mode", () => {
    expect(rules).toMatch(/~2\s*exchange|target.*2\s*exchange/i);
  });

  it("allows flexible cluster end (short answer) or extension (still developing)", () => {
    expect(rules).toMatch(/end\s*earlier|extend.*3|still\s*developing/i);
  });

  it("handles user-volunteered third area briefly (1 exchange, not a full cluster)", () => {
    expect(rules).toMatch(/user.*volunteers.*new.*area|brief.*1\s*exchange|handle.*briefly/i);
  });

  it("requires a bridge sentence when transitioning", () => {
    expect(rules).toMatch(/bridge\s*sentence/i);
  });

  it("explicitly forbids cold topic switches", () => {
    expect(rules).toMatch(/cold.{0,20}switch|never.*cold.{0,20}topic/i);
  });

  it("targets 2 primary clusters with R2 hard cap at 6 exchanges", () => {
    expect(rules).toMatch(/2.*cluster|cluster.*2/i);
    expect(rules).toMatch(/6\s*exchange|R2/i);
  });

  it("scopes cluster approach to exploration, excludes edit sessions", () => {
    expect(rules).toMatch(/exploring|onboarding|exploration/i);
    expect(rules).toMatch(/editing|edit.*session|returning\s*user/i);
  });

  it("hard cap at 6 exchanges with immediate action", () => {
    expect(rules).toMatch(/6\s*exchange.*R2|R2.*6\s*exchange/i);
  });
});

describe("R2 — gate exception", () => {
  it("R2 generate_page includes one-question gate exception for missing name/role", () => {
    expect(rules).toMatch(/exception.*name.*role.*missing|ONE.*direct.*question.*collect/i);
  });
});

describe("R4 — low-signal gate reference", () => {
  it("R4 low-signal fallback includes Phase C gate before generation", () => {
    expect(rules).toMatch(/Phase\s*C\s*gate|missing.*name.*role.*gate|ask.*one.*direct.*question.*generate/i);
  });
});
```

**Step 3: Update cross-provider eval at onboarding-flow.eval.ts:71 (LLM eval — correctness only, not CI)**

This eval uses real model calls and is excluded from standard Vitest. Update it so it passes when run manually. Extend the conversation to 3 work exchanges (the allowed max) to match R1 flexibility, then assert the topic bridge. Use only unambiguous off-topic keywords.

Replace the `"asks about different topics across turns (breadth-first)"` test:

```typescript
it("bridges to a different topic after completing a work cluster (max 3 exchanges)", async () => {
  const systemPrompt = buildOnboardingPrompt("en");
  const { text } = await generateText({
    model: getModel(),
    system: systemPrompt,
    messages: [
      { role: "user", content: "Hi! I'm Marco, I'm a software engineer based in Rome." },
      { role: "assistant", content: "Hey Marco! Software engineering in Rome — great combo. What are you working on these days?" },
      { role: "user", content: "I work at Stripe on the payments API. Been there for 3 years." },
      { role: "assistant", content: "Nice! What's the most interesting challenge you've tackled there?" },
      { role: "user", content: "Mainly reliability across different payment providers in different countries." },
      { role: "assistant", content: "That sounds complex! How did you handle the fallback logic?" },
      { role: "user", content: "We built a retry system and a per-provider fallback chain." },
    ],
  });

  // After 3 work exchanges (max cluster depth), agent must bridge to a second cluster
  // Accepts either: outside-work/personal cluster OR background/education cluster
  // Avoid ambiguous terms (project, skill, passion, enjoy, fun, activity)
  const offTopicMarkers = [
    "hobby", "hobbies", "free time", "outside work", "outside of work", "sport", "leisure", "personal life",
    "education", "study", "studied", "background", "how did you get into", "career path", "university", "school", "degree",
  ];
  assertContainsAtLeast(text, offTopicMarkers, 1, "Should bridge to second cluster (outside-work or background/education) after work cluster");
});
```

Also update the `"proposes page generation after sufficient signal (5 turns)"` test at line 87 — rename it to reflect the condition-based model:

```typescript
it("proposes page generation after completing 2 clusters", async () => {
  // conversation unchanged — already shows 2+ clusters (work + outside-work)
  // only rename the test to reflect condition-based trigger, not fixed turn count
  ...existing conversation messages unchanged...
  assertContainsAtLeast(
    text,
    ["page", "build", "put together", "generate", "create", "preview", "ready", "enough"],
    2,
    "Should propose building the page after 2 clusters"
  );
});
```

**Step 4: Run unit tests**
```bash
npx vitest tests/evals/turn-management.test.ts --run
```
Expected: all pass. (Eval is not run here — it uses real LLM calls.)

**Step 5: Commit**
```bash
git add src/lib/agent/policies/turn-management.ts tests/evals/turn-management.test.ts tests/evals/cross-provider/onboarding-flow.eval.ts
git commit -m "feat(agent): R1 flexible topic clusters — ~2 exchanges, bridge sentences, edit excluded"
```

---

## Task 3: Rewrite first-visit.ts Phase B+C + fully update legacy onboardingPolicy()

**Files:**
- Modify: `src/lib/agent/policies/first-visit.ts` (Phase B + Phase C)
- Modify: `src/lib/agent/prompts.ts` (legacy `onboardingPolicy()` — THREE changes)
- Modify: `tests/evals/onboarding-policy.test.ts`

**Critical: preserve Phase C's "register to claim URL" instruction (line 39 of first-visit.ts).**

**Critical: update ALL THREE outdated elements of onboardingPolicy():**
1. Conversation flow item 4: "After ~5 exchanges with good signal, suggest building the page"
2. Key behaviors: "Cover BREADTH first..."
3. Key behaviors: "After ~5 exchanges with good signal, call generate_page..."

**Critical: Phase C gate is unconditional — applies on any trigger (early, cap, or 2-cluster completion).**

**Note on Phase A:** Phase A's "MUST have name + role by turn 2" is intentionally preserved — it's a 2-turn warmup, NOT an interrogation loop. Phase A asks name (turn 1) and role (turn 2) — exactly one question each. The Phase C gate handles edge cases where Phase A still failed to collect name+role (low-signal conversations). No Phase A changes are needed.

**Note on theme/layout SIMPLE classification:** `planning-protocol.ts` lists "change theme" as SIMPLE. This is intentionally NOT changed in this PR — the novice expertise calibration already mandates "explain what will change and why BEFORE doing it" for theme/layout changes (Task 4). The expertise calibration layer overrides the SIMPLE classification for novices. No reclassification needed.

**Step 0: Soften Phase A exit condition in first-visit.ts**

Phase A currently says "After turn 2 you MUST have: name + role... If they don't give you one of these, ask for it directly before moving on to Phase B." This can imply looping. Soften to a single-ask then proceed:

Find and replace in Phase A (around line 21-23 of first-visit.ts):
```
After turn 2 you MUST have: name + role. If they don't give you one of these, ask for it directly before moving on to Phase B.
```
With:
```
By turn 2, aim to have: name + role. If one is missing, ask for it once more before Phase B. Then proceed regardless — Phase C gate will handle it if still missing.
```

**Step 1: Replace Phase B in first-visit.ts**

Old (lines 24-30):
```
PHASE B — Breadth-first exploration (turns 3-6):
- Cover as many DIFFERENT areas as possible. Target at least 3 distinct areas from: skills, projects, interests/hobbies, achievements, education, activities.
- RULE: Never ask 2 consecutive questions about the same area. If turn 3 was about projects, turn 4 MUST be about a different area.
- Ask exactly ONE question per turn. Do not stack questions.
- If the user volunteers information about a different area, follow their lead but ensure breadth.
- Record EVERY piece of information as a fact immediately — do not wait. Use create_fact after every user message.
- Use natural transitions between areas: "Cool! And outside of work, what do you enjoy doing?" not "Now let's talk about your hobbies."
```

New (1 bridge example only — see token mandate):
```
PHASE B — Cluster exploration (exchanges 3-6):
Target 2 topic clusters, ~2 exchanges each. Total Phase B budget: ~4 exchanges. Hard cap: exchange 6.

Suggested clusters (adapt to what the user opens up about):
1. Work depth cluster: What do they do day-to-day? → one follow-up (project they're proud of, what drives them).
2. Background or outside-work cluster: Education/how they got into the field, OR personal projects, OR hobbies/activities.

Rules:
- Follow the user's lead. If they mention a topic, start that cluster first.
- Each cluster ends naturally: short user answer = done, user still expanding = stay 1 more exchange (max 3 per cluster).
- If user volunteers a third area while under the exchange cap, handle it briefly (1 exchange only) before Phase C.
- BRIDGE SENTENCES are mandatory between clusters: "Bello! E al di fuori del lavoro, cosa ti appassiona?"
- Ask exactly ONE question per turn. Do not stack questions.
- Record EVERY piece of information as a fact immediately via create_fact.
```

**Step 2: Replace Phase C in first-visit.ts — unconditional gate, condition-based trigger, preserve register instruction**

Old (lines 32-39):
```
PHASE C — Generate + publish (turns 7-8):
- Turn 7: Call generate_page with username="draft" to build the page. Tell the user: "Here's your page! Take a look on the right."
  Wait for their feedback. If they want changes, make them.
- Turn 8: Once the user is happy (or after one round of edits), propose publishing:
  Suggest a username based on their name (lowercase, hyphenated) and call request_publish.
  Tell them a publish button will appear to confirm.
- If the user says they're done earlier (turn 5-6 with good signal), skip ahead to Phase C.
- After generating the page, ALWAYS mention that the user can register to claim their URL and keep their page. Frame it positively: "Register to get your own URL like openself.dev/yourname!"
```

New:
```
PHASE C — Generate + publish (when Phase B is complete):
Phase C starts as soon as: 2 clusters are done, OR the 6-exchange cap is reached, OR the user seems done early with good signal.
GATE (unconditional): Before calling generate_page, if name or role/work is missing, ask ONE direct question that collects all missing fields (e.g., "Before I build it — what's your name and what do you do?"). After exactly one attempt — answered or declined — generate immediately with available facts. Never loop on the gate.
- Call generate_page with username="draft" to build the page. Tell the user: "Here's your page! Take a look on the right."
- Wait for their feedback. If they want changes, make them. After one round of edits, move on.
- Once the user is happy, propose publishing: if name is known, suggest a username based on their name (lowercase, hyphenated); if name is missing, ask for their preferred username directly. Call request_publish. Tell them a publish button will appear to confirm.
- ALWAYS mention that the user can register to claim their URL and keep their page. Frame it positively: "Register to get your own URL like openself.dev/yourname!"
```

**Step 3: Measure legacy baseline (before any edits)**

Before editing `onboardingPolicy()`, capture the baseline token count:
```bash
npx tsx -e "
import { getSystemPromptText } from './src/lib/agent/prompts.ts';
const text = getSystemPromptText('onboarding', 'en');
const tokens = Math.ceil(text.length / 4);
console.log('LEGACY BASELINE tokens:', tokens);
"
```
Note the output — you will compare against it in Task 6.

**Step 3b: Update legacy onboardingPolicy() in prompts.ts — FOUR changes**

**Change A:** In Conversation flow section (around line 193), replace:
```
4. After ~5 exchanges with good signal, suggest building the page
```
With:
```
4. After 2 topic clusters (~4 exchanges) or when the 6-exchange cap is reached, generate the page
```

**Change B:** In Key behaviors section (around line 199), replace:
```
- Cover BREADTH first: ask about different areas (work, interests, projects, skills) before going deep on any one topic
```
With:
```
- Use topic clusters: stay ~2 exchanges on one area (opener + one follow-up), then bridge naturally to the next. Do NOT switch areas after every question.
- Bridge when transitioning: "Bello! E al di fuori del lavoro..." — never cold-switch topics.
```

**Change C:** In Key behaviors section (around line 201), replace:
```
- After ~5 exchanges with good signal, call generate_page with username="draft" to build the page
```
With:
```
- After 2 clusters or 6 exchanges, call generate_page with username="draft" to build the page
```

**Change D:** In Key behaviors section (immediately after Change C), add a new bullet:
```
- Before calling generate_page, if name or role/work is missing, ask ONE direct question to collect all missing fields ("What's your name and what do you do?"). After one attempt, generate immediately. Never loop.
```

**Step 4: Update tests/evals/onboarding-policy.test.ts**

Update Phase B structure test:
```typescript
// OLD:
it("contains Phase B — Breadth-first exploration with turns 3-6", () => {
  expect(policyEn).toContain("PHASE B");
  expect(policyEn).toMatch(/exploration.*turn.*3.*6/is);
});

// NEW:
it("contains Phase B — Cluster exploration", () => {
  expect(policyEn).toContain("PHASE B");
  expect(policyEn).toMatch(/Cluster\s*exploration/i);
  expect(policyEn).toMatch(/exchange.*3.*6|exchanges.*3.*6/i);
});
```

Update Phase C structure test (condition-based + unconditional gate — extract PHASE C block to avoid matching Phase A text):
```typescript
// OLD:
it("contains Phase C — Generate + publish with turns 7-8", () => {
  expect(policyEn).toContain("PHASE C");
  expect(policyEn).toMatch(/publish.*turn.*7.*8/is);
});

// NEW:
it("contains Phase C — condition-based generate + publish with unconditional name+role gate", () => {
  expect(policyEn).toContain("PHASE C");
  // Extract only the PHASE C block to avoid false matches from Phase A text
  const phaseCBlock = policyEn.match(/PHASE C[\s\S]*?(?=PHASE [^C]|$)/)?.[0] ?? "";
  expect(phaseCBlock).toMatch(/generate_page/);
  expect(phaseCBlock).toMatch(/request_publish/);
  // Trigger is condition-based, not fixed turn numbers
  expect(phaseCBlock).toMatch(/2\s*cluster.*done|Phase\s*B.*complete|6-exchange.*cap/i);
  // Gate: one direct question if name/role missing, then generate regardless
  expect(phaseCBlock).toMatch(/GATE|one.*attempt|one.*direct.*question/i);
  // Critical: register/claim URL instruction must be preserved in Phase C
  expect(phaseCBlock).toMatch(/register.*claim.*URL|claim.*URL|openself\.dev\/yourname/i);
});
```

Replace "Phase B: Breadth-first exploration" describe block:
```typescript
describe("Phase B: Cluster exploration", () => {
  it("describes cluster-based exploration", () => {
    expect(policyEn).toMatch(/cluster/i);
  });

  it("targets ~2 exchanges per cluster", () => {
    expect(policyEn).toMatch(/~2\s*exchange|target.*2\s*exchange/i);
  });

  it("targets 2 primary clusters", () => {
    expect(policyEn).toMatch(/2\s*(topic\s*)?cluster/i);
  });

  it("requires bridge sentences between clusters", () => {
    expect(policyEn).toMatch(/bridge\s*sentence/i);
  });

  it("does NOT contain old 'never 2 consecutive same area' rule", () => {
    expect(policyEn).not.toMatch(/never.*2\s*consecutive.*same\s*area/i);
  });

  it("handles user-volunteered third area briefly", () => {
    expect(policyEn).toMatch(/third\s*area|1\s*exchange.*before.*Phase\s*C/i);
  });

  it("covers at least 3 exploration area types", () => {
    const areas = ["work", "skills", "projects", "interests", "education", "activities", "hobbies"];
    const count = areas.filter((a) => policyEn.toLowerCase().includes(a)).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("requires exactly one question per turn", () => {
    expect(policyEn).toMatch(/one\s*question\s*per\s*turn/i);
  });

  it("hard cap at exchange 6", () => {
    expect(policyEn).toMatch(/exchange.*6|6.*exchange/i);
  });
});
```

Add test block for legacy onboardingPolicy() via runtime output — import `getSystemPromptText`:

```typescript
import { getSystemPromptText } from "@/lib/agent/prompts";

describe("legacy onboardingPolicy() via getSystemPromptText('onboarding')", () => {
  const legacyPrompt = getSystemPromptText("onboarding", "en");

  it("contains cluster approach guidance", () => {
    expect(legacyPrompt).toMatch(/topic.*cluster|cluster.*topic|~2\s*exchange/i);
  });

  it("does NOT contain old 'Cover BREADTH first' directive", () => {
    expect(legacyPrompt).not.toMatch(/Cover BREADTH first.*before going deep/i);
  });

  it("does NOT use old '~5 exchanges' trigger for generate_page", () => {
    expect(legacyPrompt).not.toMatch(/~5\s*exchanges.*call.*generate_page|~5\s*exchanges.*suggest building/i);
  });

  it("contains bridge sentence guidance", () => {
    expect(legacyPrompt).toMatch(/bridge.*sentence|fuori del lavoro/i);
  });

  it("contains unconditional gate (one attempt then generate) before generate_page", () => {
    expect(legacyPrompt).toMatch(/one.*attempt|one.*direct.*question|one.*attempt.*answered.*declined/i);
  });
});
```

**Step 5: Run tests**
```bash
npx vitest tests/evals/onboarding-policy.test.ts --run
```
Expected: all pass.

**Step 6: Commit**
```bash
git add src/lib/agent/policies/first-visit.ts src/lib/agent/prompts.ts tests/evals/onboarding-policy.test.ts
git commit -m "feat(agent): Phase B cluster exploration — condition-based Phase C + unconditional gate, full legacy update"
```

---

## Task 4: Fix expertise calibration novice — rewrite + update existing tests

**Files:**
- Modify: `src/lib/agent/policies/index.ts`
- Modify: `tests/evals/expertise-calibration.test.ts` (3 old tests removed, 4 new added)

**Step 1: Replace novice calibration return in index.ts**

Old:
```typescript
return `EXPERTISE CALIBRATION: novice
You are talking to someone new to this tool. Explain every action you take. Use phrases like "I'm adding this skill to your page" and "This will change how your page looks". Walk them through each step. Preview results explicitly.
- When you save a fact, tell them: "I've noted that down."
- When generating the page, explain what it means: "I'm putting together your page now — you'll see a preview appear on the right."
- When proposing publish, explain what it does: "Publishing will make your page live at a public URL that anyone can visit."
- When changing theme or layout, explain what will change and why BEFORE doing it — even if the user asked for it.
- Keep tool usage invisible — never mention "facts", "tools", or "sections" by technical name.
- Use analogies if helpful: "Think of it like updating your profile" or "This is like rearranging rooms in a house."`;
```

New (exception list abbreviated to reference OUTPUT_CONTRACT — see token mandate):
```typescript
return `EXPERTISE CALIBRATION: novice
You are talking to someone new to this tool. Explain structural and visual actions (page generation, publishing, layout/theme changes). Save facts silently — only explain actions that visibly change what the user sees. This expertise calibration takes precedence over planning-protocol verbalization rules for fact saves: even COMPOUND fact-save sequences should be done silently.
- Do not proactively announce saved facts. A brief acknowledgment is fine ("Capito!", "Perfetto!") but do not enumerate what was saved unprompted. If user explicitly asks what was saved, provide a concise recap. Exceptions: see OUTPUT_CONTRACT error exceptions (success:false, REQUIRES_CONFIRMATION, pageVisible:false, recomposeOk:false).
- When generating the page, explain what it means: "I'm putting together your page now — you'll see a preview appear on the right."
- When proposing publish, explain what it does: "Publishing will make your page live at a public URL that anyone can visit."
- When changing theme or layout, explain what will change and why BEFORE doing it — even if the user asked for it.
- Keep tool usage invisible — never mention "facts", "tools", or "sections" by technical name.
- Use analogies if helpful: "Think of it like updating your profile" or "This is like rearranging rooms in a house."`;
```

**Step 2: Update expertise-calibration.test.ts novice block**

Remove 3 tests:
- `it("instructs to explain every action", ...)`
- `it("uses user-friendly phrasing examples", ...)` — the "I'm adding this skill..." example
- `it("instructs to walk through steps", ...)`

Add 4 tests:
```typescript
it("instructs NOT to proactively announce saved facts", () => {
  expect(novice).toMatch(/do\s*not.*proactively.*announce|not.*enumerate.*unprompted/i);
});

it("allows recap if user explicitly asks", () => {
  expect(novice).toMatch(/explicitly\s*asks.*recap|user.*asks.*what.*saved/i);
});

it("explains structural and visual actions only", () => {
  expect(novice).toMatch(/structural.*visual|visual.*actions/i);
});

it("includes all 4 required error exceptions", () => {
  expect(novice).toMatch(/success.*false/i);
  expect(novice).toMatch(/REQUIRES_CONFIRMATION/);
  expect(novice).toMatch(/pageVisible.*false/i);
  expect(novice).toMatch(/recomposeOk.*false/i);
});
```

Keep all other novice tests (previewing page, explaining publishing, analogies, tool invisibility) and all familiar/expert/cross-level tests unchanged.

**Step 3: Run tests**
```bash
npx vitest tests/evals/expertise-calibration.test.ts --run
```
Expected: all pass, including "novice is longest" cross-level test.

**Step 4: Commit**
```bash
git add src/lib/agent/policies/index.ts tests/evals/expertise-calibration.test.ts
git commit -m "feat(agent): novice calibration — silent fact saves with all error exceptions"
```

---

## Task 5: Fix planning-protocol.ts — SIMPLE fact saves silent + add test

**Files:**
- Modify: `src/lib/agent/policies/planning-protocol.ts`
- Modify: `tests/evals/planning-protocol.test.ts`

**Step 1: Edit novice verbalization rule**

Find:
```
- novice: always verbalize your plan, even for SIMPLE
```
Replace:
```
- novice: verbalize your plan for COMPOUND and STRUCTURAL operations. For SIMPLE fact saves, save silently and move forward — no verbalization needed even for novice. Exception: always surface OUTPUT_CONTRACT errors (success:false, REQUIRES_CONFIRMATION, pageVisible:false, recomposeOk:false).
```

**Step 2: Add test in planning-protocol.test.ts**

Inside the `planningProtocol` describe block, add after the expertise modulation test:
```typescript
it("exempts SIMPLE fact saves from novice verbalization", () => {
  expect(text).toMatch(/SIMPLE.*fact.*save.*silent|novice.*fact.*save.*no\s*verbalization/i);
});

it("SIMPLE fact save silence preserves all 4 OUTPUT_CONTRACT error exceptions", () => {
  // One assertion per exception — no OR to mask missing exceptions
  expect(text).toMatch(/success.*false/i);
  expect(text).toMatch(/REQUIRES_CONFIRMATION/);
  expect(text).toMatch(/pageVisible.*false/i);
  expect(text).toMatch(/recomposeOk.*false/i);
});
```

**Step 3: Run tests**
```bash
npx vitest tests/evals/planning-protocol.test.ts --run
```
Expected: all pass.

**Step 4: Commit**
```bash
git add src/lib/agent/policies/planning-protocol.ts tests/evals/planning-protocol.test.ts
git commit -m "feat(agent): planning protocol — SIMPLE fact saves always silent"
```

---

## Task 6: Full test run + strict non-regression token check

**Step 1: Full suite**
```bash
cd /home/tommaso/dev/repos/openself
npx vitest --run
```
Expected: all tests pass.

**Step 2: Non-regression token check — fail on growth from baseline 7709**
```bash
npx tsx -e "
import { buildSystemPrompt } from './src/lib/agent/prompts.ts';
const dummy = { journeyState: 'first_visit', language: 'it', situations: [], expertiseLevel: 'novice', pendingProposalCount: 0, thinSections: [], staleFacts: [], openConflicts: [], archivableFacts: [] } as any;
const prompt = buildSystemPrompt(dummy);
const tokens = Math.ceil(prompt.length / 4);
console.log('Estimated tokens:', tokens, '(pre-PR baseline: 7709)');
if (tokens > 8109) {
  console.error('REGRESSION: prompt grew > 400 tokens from baseline 7709. Review prompt additions and apply token mandate (condense duplicates, shorten examples).');
  process.exit(1);
}
console.log('OK — within 400-token growth budget.');
"
```
Expected: tokens ≤ 8109. Note: the code-level advisory cap (6000 tokens) is a pre-existing over-budget condition not introduced by this PR — do not fix it here.

**Step 3: Legacy path token check**

Use the baseline measured in Task 3 Step 3. Replace `<LEGACY_BASELINE>` with the value you noted:
```bash
npx tsx -e "
import { getSystemPromptText } from './src/lib/agent/prompts.ts';
const text = getSystemPromptText('onboarding', 'en');
const tokens = Math.ceil(text.length / 4);
const baseline = <LEGACY_BASELINE>;
console.log('Legacy path tokens:', tokens, '(baseline:', baseline + ')');
if (tokens > baseline + 200) {
  console.error('REGRESSION: legacy onboardingPolicy() grew > 200 tokens from baseline. Condense Change B/C/D text.');
  process.exit(1);
}
console.log('OK — legacy path within 200-token growth budget.');
"
```
Expected: tokens ≤ baseline + 200.

---

## Summary Table

| File | Change |
|------|--------|
| `src/lib/agent/prompts.ts` | OUTPUT_CONTRACT last bullet → silent facts rule. Legacy `onboardingPolicy()` → 4 changes: Conversation flow item 4, Key behavior breadth→cluster, Key behavior ~5 exchanges→cluster trigger, new unconditional gate bullet |
| `src/lib/agent/policies/turn-management.ts` | R1 → flexible ~2 exchanges (max 3), bridge sentences, brief third-area handling, edit scope. R2 cap includes gate exception for missing name/role |
| `src/lib/agent/policies/first-visit.ts` | Phase B → cluster exploration (max 3 per cluster). Phase C → condition-based trigger + unconditional name+role gate, register instruction preserved |
| `src/lib/agent/policies/index.ts` | Novice calibration → silent fact saves, references OUTPUT_CONTRACT exceptions |
| `src/lib/agent/policies/planning-protocol.ts` | SIMPLE fact saves silent for novice |
| `tests/evals/prompt-contracts.test.ts` | +1 test (OUTPUT_CONTRACT extracted, all 4 exceptions) |
| `tests/evals/turn-management.test.ts` | R1 block replaced |
| `tests/evals/cross-provider/onboarding-flow.eval.ts` | LLM eval updated for correctness: 3-exchange conversation, unambiguous off-topic keywords. NOT run in standard CI. |
| `tests/evals/onboarding-policy.test.ts` | Phase B + Phase C structure replaced (PHASE C block extracted). +4 legacy onboardingPolicy() tests via getSystemPromptText |
| `tests/evals/expertise-calibration.test.ts` | 3 old novice tests removed, 4 new added |
| `tests/evals/planning-protocol.test.ts` | +1 test |
