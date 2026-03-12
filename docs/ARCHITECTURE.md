# OpenSelf — Architecture

> Talk for 5 minutes. Get a living personal page.

This document is the **source of truth for target architecture**: what OpenSelf is,
how it works, and how it should be built.

Operational tracking lives in:
- `docs/STATUS.md` for current implementation reality
- `docs/ROADMAP.md` for execution priorities
- `docs/decisions/` for ADRs (durable decision rationale)

---

## Table of Contents

1. [What Is OpenSelf](#1-what-is-openself)
2. [How It Works](#2-how-it-works)
3. [System Architecture](#3-system-architecture)
4. [The Agent](#4-the-agent)
5. [Knowledge Base](#5-knowledge-base)
6. [Page Engine](#6-page-engine)
7. [Connectors](#7-connectors)
8. [Data Model](#8-data-model)
9. [UX Principles](#9-ux-principles)
10. [Technical Stack](#10-technical-stack)
11. [Deployment](#11-deployment)
12. [Security & Privacy](#12-security--privacy)
13. [Roadmap](#13-roadmap)
14. [Design Decisions](#14-design-decisions)
15. [Execution Spec](#15-execution-spec)

---

## 1. What Is OpenSelf

OpenSelf is an open-source tool that builds and maintains your personal web page
through conversation. You talk to an AI for 5 minutes. It creates a beautiful page about
you. As your life changes, you tell it (or it learns from connected services), and the
page evolves with you.

It is not a social network. It is not a website builder. It is a **living page** — one
that grows, adapts, and stays current without you having to think about it.

**For everyone.** Not just developers. Not just professionals. Anyone who wants a personal
page that actually represents who they are today.

### Core Promise

You should never have to manually update your online presence again. Talk to your agent
like you would talk to a friend. It handles the rest.

### What Makes It Different

| Traditional profiles | OpenSelf |
|---|---|
| You fill out forms | You have a conversation |
| Static until you manually update | Evolves autonomously |
| One format fits all | Your page, your way |
| Platform owns your data | You own everything |
| Closed, proprietary | Open-source, AGPL-3.0 |

### The Bigger Vision

OpenSelf is not just a page builder. It is the beginning of a **user-owned digital
identity infrastructure**.

1. **Identity Infrastructure** — Today people scatter their identity across CMS, LinkedIn,
   Instagram, GitHub. OpenSelf is the unified layer that represents who you are, under
   your control.
2. **User-Owned Digital Twin** — Not a profile. Not a social. A digital twin controlled
   by its owner, that evolves as you evolve.
3. **AI Aligned With the User** — Every existing AI-powered platform optimizes for
   engagement, ads, or retention. OpenSelf optimizes for identity coherence, personal
   growth, and privacy. This is a philosophical shift.

What OpenSelf is **not**:
- No feed, no likes, no followers, no algorithmic ranking
- No engagement metrics, no competition, no advertising
- No "others are watching you" notifications
- No public comparisons or vanity leaderboards

The model is: **personal assistant**, not social platform.

### Market Positioning

The market is moving toward personal AI agents with persistent memory. Generic
workbots (like OpenClaw) give you an assistant that can do anything but knows
nothing about you. OpenSelf is the opposite: a vertical agent with a single mission.

> **Generic assistants know what you ask. OpenSelf knows who you are — and
> communicates it to the world for you.**

This is not a feature difference. It is a category difference. Generic agents
are tools. OpenSelf is an identity layer.

---

## 2. How It Works

### First Time (~5 minutes)

```
1. Open openself.com (or your self-hosted instance)
2. Animated landing: "Welcome to OpenSelf" cycles through languages
3. Click "Start your experience"

4. Quick guided setup (~30 seconds, no AI):
   a. Language selection (auto-detected + manual override)
   b. "What's your name?" → first + last name
   c. Optional: age range, gender (for grammatical agreement in gendered languages)
   d. "What brings you here?" → work / personal / both / career transition
   e. Optional: choose agent persona (Phase 1+)

5. Chat opens. The agent already knows your name and intent:

   "Ciao Tommaso! You want a professional page.
    Tell me — what do you do and what are you passionate about?"

6. You talk naturally for 3-5 minutes. The agent guides you:
   - "What are you working on these days?"
   - "Anything you're particularly proud of?"
   - "What do people come to you for?"

7. After ~5 exchanges, the agent says:

   "Got it! Let me build your page — watch this →"

8. Split view: chat on the left, live page preview on the right.
   The page builds itself in front of your eyes.

9. "Here's your page! Want to change anything?"
   - "Make it darker"
   - "The bio sounds too formal"
   - "Put my projects before the bio"
   - "Add my Instagram link"

10. The agent adjusts in real time.

11. One publish checkpoint (single confirmation):
    "I drafted this page with these facts as public. Publish?"
    - Approve all
    - Edit and approve
    - Keep as draft (nothing public)

12. Signup modal (multi-user mode):
    - Username (live preview: openself.dev/yourname)
    - Email + password
    - Single endpoint: signup + publish atomically

13. Redirected to openself.dev/yourname. Live. Done. Under 5 minutes.
```

### Returning (~2 minutes)

```
1. Open the app
2. Agent: "Hey! What's new?"
3. You: "I changed jobs" / "I ran a marathon" / "Nothing much"
4. Agent updates the knowledge base, regenerates relevant sections
5. "Done! Updated your work section. Take a look."
```

### Passive Updates (with connectors)

```
1. You connected GitHub weeks ago
2. You push a new open-source project
3. The agent detects it via the GitHub connector
4. Agent: "I see you published 'cool-project' on GitHub.
   Want me to add it to your page?"
5. You: "Yes" (or it auto-approves based on your preferences)
6. Page updated. You did nothing.
```

### The Rule

The agent proposes. You approve. Nothing goes live without your consent.

In onboarding, approval is batched into one final publish checkpoint to preserve flow.
After onboarding, approvals are per change category (unless you enable auto-approve).

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          OPENSELF                          │
│                                                                  │
│  ┌───────────┐     ┌──────────────────┐     ┌────────────────┐  │
│  │           │     │                  │     │                │  │
│  │   CHAT    │────▶│   AGENT CORE     │────▶│  PAGE ENGINE   │  │
│  │   (UI)    │     │                  │     │                │  │
│  │           │◀────│  - Conversation  │     │  - Page Config │  │
│  │  Text /   │     │  - Fact extract  │     │  - Renderer    │  │
│  │  Voice    │     │  - KB management │     │  - Themes      │  │
│  │           │     │  - Page compose  │     │  - Components  │  │
│  └───────────┘     │  - Memory (3-tier)│    │                │  │
│                    │  - Soul profiles │     └───────┬────────┘  │
│                    └────────┬─────────┘             │           │
│                             │         ┌─────────────┘           │
│                             ▼         ▼                         │
│                    ┌──────────────────┐     ┌────────────────┐  │
│                    │                  │     │                │  │
│                    │  KNOWLEDGE BASE  │     │  PUBLIC PAGE   │  │
│                    │                  │     │                │  │
│                    │  - Facts         │     │  /username     │  │
│                    │  - Agent config  │     │                │  │
│                    │  - Preferences   │     │  Accessible    │  │
│                    │  - History       │     │  by anyone     │  │
│                    │  - Summaries     │     │                │  │
│                    │  - Conflicts     │     │                │  │
│                    └────────▲─────────┘     └────────────────┘  │
│                             │                                   │
│               ┌─────────────┼─────────────┐                     │
│               │             │             │                     │
│      ┌────────┴─────────┐  │  ┌──────────┴───────┐             │
│      │                  │  │  │                   │             │
│      │   CONNECTORS     │  │  │     WORKER        │             │
│      │                  │  │  │                   │             │
│      │  GitHub, Strava  │  │  │  - Heartbeat      │             │
│      │  Spotify, Books  │  │  │    (light/deep)   │             │
│      │  Scholar, etc.   │  │  │  - Jobs (9 types) │             │
│      │                  │  │  │  - Memory summary │             │
│      └──────────────────┘  │  │  - Soul review    │             │
│                            │  │                   │             │
│                            │  └───────────────────┘             │
│                            │          │                         │
│                            └──────────┘                         │
│                        (reads/writes KB)                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Data flows one way**: information enters through the chat or connectors, gets stored in
the knowledge base as facts, and flows out through the page engine as a public page.

### 3.1 Chat/Preview State and Persistence Contract

The onboarding builder chat has two state layers:

1. **Ephemeral UI state** (`useChat` in React)
2. **Durable history** (`messages` table, exposed via `GET /api/messages`)

To avoid chat resets and keep behavior consistent across devices:

- On mobile, switching tabs (`Chat / Preview / Publish`) must **not** unmount `ChatPanel`.
- Mobile tab panes use `absolute inset-0` + `hidden` toggling (not Radix Tabs) so all
  panes remain mounted and inactive panes are hidden with `className="hidden"`.
- On component mount (including full page refresh), `ChatPanel` hydrates history from
  `GET /api/messages` before initializing `useChat`.
- The localized welcome message is a fallback for empty history, and must not be
  duplicated if the same assistant message already exists in stored history.
- In multi-user mode, a `401` on history fetch redirects to `/invite`.
- **Error recovery**: On stream error, the error banner offers two actions: "Retry"
  (retries last AI request via `reload()`) and "Refresh chat" (re-syncs all messages
  from `/api/messages` via `refreshChat()` to restore DB-consistent state).
- **Error extraction**: `extractErrorMessage()` (`src/lib/services/errors.ts`) robustly
  parses unknown error types: handles `Error` objects, plain strings, JSON-wrapped
  messages, and mixed content with embedded JSON. Falls back to a user-friendly message.
- **Data prefetch dedup**: `SplitView.tsx` fetches `/api/chat/bootstrap` and
  `/api/messages` once on mount (and re-fetches on language change), passing results
  to `ChatPanel` via `initialBootstrap`/`initialMessages` props with
  `disableInitialFetch={true}` to prevent duplicate requests from dual ChatPanel
  instances (desktop + mobile). On 401, redirects to `/invite`.
- **Markdown rendering**: Assistant messages are rendered as HTML via `markdown-it`
  (`breaks: true`, `linkify: true`, `html: false`). User messages remain plain text.
  The `html: false` default is a security invariant — prevents XSS from AI content.

This contract guarantees:
- no reset on mobile tab switch (same mounted component instance)
- no reset after browser refresh (history restored from DB)

---

## 4. The Agent

The agent is the heart of OpenSelf. Inspired by OpenClaw's living agent architecture,
it is not a stateless chatbot — it is an entity that knows you, remembers you, and evolves
its understanding of you over time.

### 4.1 Agent Identity

Every instance of OpenSelf has an agent with a defined identity. This is stored in a
configuration file (similar to OpenClaw's SOUL.md) that shapes how the agent behaves:

```yaml
# agent.yaml — The agent's identity and behavior

personality:
  tone: "warm-casual"          # How the agent talks (warm-casual, professional, playful, minimal)
  language: "it"               # Set explicitly at onboarding (language picker), required before first message
  humor: true                  # Light humor when appropriate
  verbosity: "concise"         # concise | balanced | detailed
  emoji: false                 # Use emoji in responses

behavior:
  proactivity: "medium"        # How often the agent suggests things (low, medium, high)
  auto_approve: []             # Categories of updates that don't need user approval
  check_in_frequency: "weekly" # How often the agent prompts for updates
  focus_areas: []              # Auto-learned: what the user cares about most

page_voice:
  perspective: "third-person"  # How the page is written (first-person, third-person)
  formality: "casual"          # casual, balanced, professional
  highlight: []                # What to emphasize (auto-learned)
```

**This file evolves.** The agent updates it based on interactions:
- If you always reject formal bio drafts, it learns to write casually
- If you never want to talk about work, it stops asking
- If you get excited about running, it prioritizes sport content

The agent **tells you** when it changes its own configuration:
> "I noticed you prefer a more casual tone. I've adjusted — let me know if that feels right."

### 4.2 Conversation Engine

The conversation is the primary interface. The agent uses the LLM to:

1. **Understand** what you're saying (extract meaning, not just keywords)
2. **Extract facts** autonomously via tool calling (see Knowledge Base)
3. **Guide** the conversation toward useful information (without being pushy)
4. **Generate** page content (bios, descriptions, section text)
5. **Modify** the page config based on your instructions

The agent has retrieval access to the full knowledge base, but only a relevant subset is
loaded in each turn context. It avoids re-asking known information, builds on prior
conversations, and connects new information to existing facts.

**Context assembly** (per conversation turn):
```
System prompt (agent identity + instructions)
+ Recent conversation history
+ Relevant facts from KB (semantic search)
+ Current page config (when page intent is detected)
+ Connected services status (when connector intent is detected)
= Full context sent to LLM
```

### 4.2.1 System Prompt Architecture

The system prompt is assembled by `src/lib/agent/context.ts` from deterministic blocks
via `buildSystemPrompt()`. The legacy `getSystemPromptText` path and `promptAssembler.ts`
have been deleted; `PromptMode` is `@deprecated`. The legacy fallback in `context.ts` now
calls `buildSystemPrompt()` with `first_visit` defaults.

**Composable path** (`buildSystemPrompt`):

1. **Core charter** — Identity, instructions, product goal, non-goals, persona boundaries. Includes: REGISTER (always informal — tu/du/vous non-formal, overridable by explicit user preference), OPENING BANS (list of banned filler openers such as "Certamente!", "Of course!"), EMOJI POLICY (only if user uses first, max 1/msg), LANGUAGE HANDLING (switch seamlessly without mentioning), RESPONSE LENGTH rules (1–2 sentences for confirmations, 3–5 max for explanations)
2. **Safety & privacy policy** — Visibility constraints, sensitive-data rules, no silent publication
3. **Tool policy** — 24 tools (see Section 4.3), when to call, required arguments, retry/error behavior. Facts are IMMUTABLE — no update tool exposed; to correct, agent must delete+create. Includes unified FACT RECORDING block: record facts immediately as encountered, batch_facts for 3+ creates only, individual tool calls for deletes/identity changes (confirmation gates, different failure semantics). PAGE REGENERATION rule: call generate_page only after all fact mutations for the turn are complete.
4. **Fact schema reference** — Controlled by `schemaMode: "full" | "minimal" | "none"` (per journey state). `full` injects ~1800 tokens (complete category→value shape table). `minimal` injects ~300 tokens via `buildMinimalSchemaForOnboarding()` (first_visit) or `buildMinimalSchemaForEditing()` (active states — edit workflow with object-notation tool signatures and common value shapes). `none` injects nothing. Per-state assignment: `first_visit=minimal`, `returning_no_page=full`, `draft_ready=minimal`, `active_fresh=minimal`, `active_stale=minimal`, `blocked=none`. Estimated ~1500–1800 token savings per turn in none/minimal states.
4a. **Data model reference** — Bio composition model (auto-composed from facts, no "bio" fact), available themes, step-by-step workflows (modify/remove/add content), full value object schemas per category, commitment tracking instruction
5. **Output contracts** — JSON/schema requirements for tool payloads and page content generation. Includes PATTERN VARIATION block: no same acknowledgment on consecutive turns, don't always close with a question, no 3 consecutive turns opening the same way, never start two consecutive messages with the same word.
6. **Journey policy** — Per-journey-state policy from the policy registry (see Section 4.2.4). Slimmed to contain only state-specific phases/flow/caps; universal behavioral rules delegated to block 10a.
7. **Situation directives** — Contextual instructions based on detected situations (optional, only when situations are active)
8. **Expertise calibration** — Verbosity/depth calibration based on user expertise level (novice/familiar/expert)
9. **Turn management rules** — 3 rules (R1/R2/R4) preventing common agent failures: topic exploration with flexible exchange targets (R1), max exchanges before action with default 6 overridable by journey policies (R2), stall detection/recovery (R4). Rules R3 (passive closings), R5 (response length), R6 (clarification expiry) moved to block 10a. (see Section 4.2.5)
10a. **Shared behavioral rules** (`src/lib/agent/policies/shared-rules.ts`) — NEW. Universal rules applying to ALL 6 journey states with zero conditional branching: one question per turn, banned passive closings, clarification expiry. TS string constants (`IMMEDIATE_EXECUTION_RULE`) are interpolated into specific journey policies for semi-universal rules. Response length calibration remains in CORE_CHARTER (block 1) as single source of truth.
10. **Memory usage directives** — Strategic 3-tier memory consumption guide: Tier 1 (facts = WHAT), Tier 2 (summary = CONTEXT), Tier 3 (meta-memories = HOW). Golden rule for meta-observation persistence. Cross-references FACT RECORDING in Tool Policy for batch vs. individual guidance. (see Section 4.2.5)
11. **Action awareness** — Explain-before-act policy classifying tools as high-impact (set_layout, set_theme, update_page_style, reorder_sections, generate_page in steady_state → explain and confirm before executing) or low-impact (fact CRUD, visibility, memory, soul → execute silently). Modulated by expertise calibration level.
12. **Undo awareness** — Graceful reversal handling: detection keywords (EN + IT), 4-step response pattern (IDENTIFY → EXPLAIN → PROPOSE → ACT), reversal scope per tool, critical rules (never regenerate entire page as first reaction, ask specifics for vague complaints).
13. **Step exhaustion fallback** — `STEP_EXHAUSTION_FALLBACK` in `src/lib/agent/step-exhaustion-fallback.ts`, journey-state-keyed, 8 languages, R3-compliant (no passive closings). Moved out of `route.ts` because Next.js rejects non-standard route exports.

Token budget guard: journey policy + directives + calibration + turn management + shared behavioral rules + memory directives + action awareness + undo awareness block is capped at 3500 tokens.

Dynamic context blocks are then appended by `assembleContext()`:

**Mutable blocks** (shrunk by truncation guard if total budget is exceeded):
- **Known facts** — Top 120 facts, relevance-sorted with guaranteed recency quota (see §4.2.2), 17000 token budget
- **Soul profile** — Compiled identity overlay (voice, tone, values, selfDescription, communicationStyle), 13000 token budget
- **Conversation summary** — Tier 2 rolling summary, 7000 token budget
- **Agent memories** — Tier 3 observations/preferences/insights, 3500 token budget
- **Pending conflicts** — Open fact contradictions awaiting resolution, 1500 token budget
- **Page state** — Current draft layout/presence/sections (steady-state profiles only), 1500 token budget

**Static blocks** (shrinkable as last resort — see §4.2.2):
- **Auth context** — Authenticated username + publish guidance (steady_state only)
- **Exploration priorities** — Archetype-weighted section richness + layout intelligence
- **Pending operations** — Incomplete operation from previous turn (resume injection). Session-scoped: reads/writes to `conversationSessionId` (active conversation), not the profile anchor, so multi-session users don't cross-pollinate pending state
- **Coherence issues** — Active coherence warnings/infos (circuit D1, steady_state only)
- **Message quota warning** — Nudge to register when ≤3 anonymous messages remain
- **Magic paste hint** — Detected connector URLs from latest user message

Total context budget: 75000 tokens with a post-assembly iterative guard (see Section 4.2.2).

Prompt assembly is code-driven (no prompt text embedded in UI files). Each block has a
version id for reproducibility and A/B testing.

### 4.2.2 Context Budget Policy

Context is budgeted explicitly to avoid window overflows. Token estimation uses
`estimateTokens = ceil(chars / 4)`.

```
Total budget: 75000 tokens

Per-block allocation (mutable — shrinkable):
  Facts:              17000 tokens max (top 120, truncated if over)
  Soul (compiled):    13000 tokens max
  Summary (Tier 2):    7000 tokens max
  Memories (Tier 3):   5500 tokens max (scored by recency × provenance × usageBoost)
  Episodic (Tier 4):   5000 tokens max (last 30 days, per-source caps)
  Pending conflicts:   1500 tokens max
  Page state:          1500 tokens max (steady-state profiles only)

Recent turns:         22000 tokens max (last 20, reduce if over)
Static blocks:        shrinkable as last resort (PromptBlock type, 20 iterations)
```

Post-assembly guard: if total exceeds 75000, iteratively shrink the largest block (up to
20 iterations). Mutable blocks are shrunk first; static blocks (auth, exploration,
pending ops, coherence, quota, magic paste) are shrunk only as a last resort when no
mutable blocks remain. Static blocks use `PromptBlock` type (`{ name, content }`) and
`shrinkBlockContent()` (trim to 80% + "...", or empty if ≤64 chars). Final safety:
`truncateToTokenBudget()` if still over after all iterations.

**Profile archetype detection** (steady_state only):
`detectArchetype()` (`src/lib/agent/context.ts`) classifies the user's profile from facts:
designer, executive, student, creator, developer, or generalist. The detected archetype
is injected into the system prompt as a "PAGE LAYOUT INTELLIGENCE" block with per-archetype
reordering guidance (e.g., designer = portfolio-first, student = education before experience).

Archetype detection is TTL-gated (14 days) and identity-invalidated. `shouldRedetectArchetype()`
(exported from `journey.ts`) re-detects when: (1) archetype was never detected, (2) the TTL
has expired, or (3) a role or title fact was updated after the last detection timestamp.
Detection is owner-scoped (not session-scoped), so it survives multi-session correctly.

**Fact relevance sorting:**
`sortFactsForContext()` (exported from `context.ts`) applies a relevance sort with a guaranteed
recency quota: the top 5 most-recently-updated facts are always included, then up to 115 more
facts are scored and sorted by relevance (cap: 120 total). `childCountMap` (pre-computed parent→child
count map) is part of `BootstrapData` and passed to `assembleContext()` to inform relevance scoring.

**Page state block:**
For steady-state profiles (`draft_ready`, `active_fresh`, `active_stale`), `assembleContext()`
injects a `CURRENT DRAFT PAGE:` block showing the current draft's `layoutTemplate`,
`surface`/`voice`/`light` presence values, and the sections list (type, slot, widgetId).
Built from `getDraft(scope.knowledgePrimaryKey)` — skipped if no draft exists.

**Turn cap:**
Recent turns are capped at 20 (was 12) within a 22000-token budget.

### 4.2.3 Journey Intelligence

Before the LLM sees anything, a deterministic (zero-LLM) detection layer runs to
understand where the user is in their journey. This pre-computed context shapes the
system prompt, mode selection, and UI behavior.

**Implementation:** `src/lib/agent/journey.ts`

**Journey States** — priority chain (highest wins):

| State | Condition |
|---|---|
| `blocked` | Authenticated user at/over message quota (`AUTH_MESSAGE_LIMIT`) |
| `active_fresh` | Published page updated ≤ 7 days ago |
| `active_stale` | Published page updated > 7 days ago |
| `draft_ready` | Draft exists but no published page |
| `returning_no_page` | Has facts or prior sessions, but no draft/published |
| `first_visit` | No facts, no messages, no draft, no published page |

**Situations** — 11 additive flags detected from current data:

- `has_pending_proposals` — unapplied section copy proposals exist
- `has_thin_sections` — at least one section classified as thin/empty
- `has_stale_facts` — facts older than 30 days
- `has_open_conflicts` — unresolved fact conflicts
- `has_name` — identity name or full-name fact exists
- `has_soul` — active soul profile exists
- `has_archivable_facts` — facts older than 90 days with low confidence (detected in `active_stale` only — suggest archiving)
- `has_recent_import` — connector import processed in the last 24h (detected in returning/active states — acknowledge import and prompt gap review)
- `has_pending_soul_proposals` — pending soul change proposals await user review (all states including `first_visit`; detected post-Circuit-A in `assembleBootstrapPayload` so same-turn auto-created proposals are captured; surfaced via natural conversation, resolved via `review_soul_proposal` tool)
- `has_sparse_profile` — publishable fact count < 10 (threshold: `SPARSE_PROFILE_FACT_THRESHOLD`); orthogonal to journey state; keeps AI in data-collection mode regardless of elapsed time since last publish (eligible in `returning_no_page`, `draft_ready`, `active_fresh`, `active_stale`; incompatible with `has_archivable_facts`, `has_recent_import`, `has_thin_sections`)
- `has_pending_episodic_patterns` — pending episodic pattern proposals from the Dream Cycle (consolidation worker) await user review; surfaced via natural conversation; resolved via `confirm_episodic_pattern` tool (all states except `first_visit` and `blocked`; priority 2; incompatible with none)

**Expertise Level** — based on distinct session count:

| Sessions | Level |
|---|---|
| 0–2 | `novice` |
| 3–5 | `familiar` |
| 6+ | `expert` |

**Bootstrap Payload** (`BootstrapPayload`):
Assembled by `assembleBootstrapPayload()` and exposed via `GET /api/chat/bootstrap`.
Contains all detection results plus derived data (userName, lastSeenDaysAgo,
publishedUsername, pendingProposalCount, thinSections list, staleFacts list, language).
Also includes `childCountMap: Map<string, number>` — pre-computed parent→child count map
for relevance scoring, passed to `assembleContext()`. Optional `pendingSoulProposals?`
field is set only when pending soul proposals exist (omitted otherwise to keep payload lean).

**Soul proposal cooldown:**
Soul proposals are gated by a 30-day owner-scoped cooldown. `getSoulProposalCooldownStatus()`
(exported from `journey.ts`) queries the `soul_change_proposals` DB table directly (not session
meta), so the cooldown survives multi-session correctly.

**Shared constant:** `AUTH_MESSAGE_LIMIT` lives in `src/lib/constants.ts` and is
imported by both the chat route (quota enforcement) and journey detection (blocked state).

### 4.2.4 Composable Policy System

The composable policy registry is the only prompt-building system. The legacy monolithic
`onboardingPolicy()`/`steadyStatePolicy()` functions and `promptAssembler.ts` have been
deleted. `PromptMode` is `@deprecated`. The registry maps journey states to fine-grained
prompt policies composed from the bootstrap payload.

**Implementation:** `src/lib/agent/policies/`

**Policy Registry** (`src/lib/agent/policies/index.ts`):
- `getJourneyPolicy(state, language)` — maps journey state to per-state policy text
- `getSituationDirectives(situations, context)` — composes contextual directives from active situations
- `getExpertiseCalibration(level)` — returns verbosity/depth calibration text

**Directive Policy Matrix** (`src/lib/agent/policies/directive-registry.ts`):
`DIRECTIVE_POLICY` is the single source of truth for situation behavior. Each entry has:
- `eligibleStates: JourneyState[]` — whitelist of states in which this situation can appear (impossible by construction for ineligible situations to be injected)
- `priority: number` — lower number = higher priority in the composed output
- `incompatibleWith: Situation[]` — mutually exclusive situations (symmetric)
- `build(ctx)` — produces the directive text for injection

`getSituationDirectives()` filters by eligibility (per-situation `eligibleStates`), sorts by
priority, and resolves incompatibilities before composing. There is no blanket per-journey-state
guard — eligibility is declared per situation in `DIRECTIVE_POLICY`. `validateDirectivePolicy()`
runs at startup and in CI — enforces no self-conflicts, symmetric incompatibilities, and valid
state references.

**Per-Journey-State Policies:**

| State | File | Key Behaviors |
|---|---|---|
| `first_visit` | `first-visit.ts` | 3-phase onboarding (A: identity, B: breadth-first, C: generate+publish), low-signal handling with 3-step escalation |
| `returning_no_page` | `returning-no-page.ts` | Greet by name, summarize known info, ask what changed, fast-path to page (5+ facts = skip to generate), respect prior investment |
| `draft_ready` | `draft-ready.ts` | Lead with page preview, review-and-publish fast path, max 2 edit rounds, no interview reopening |
| `active_fresh` | `active-fresh.ts` | Brief operational greeting, quick-update session, proportional responses, immediate regenerate+publish on "that's all" |
| `active_stale` | `active-stale.ts` | Warm re-engagement, acknowledge time gap, targeted updates (2-3 areas max), max 6 exchanges rule |
| `blocked` | `blocked.ts` | Exactly 2 sentences: explain block + give solution. No questions, no apologies, specific "come back tomorrow" |

**Situation Directives** (`src/lib/agent/policies/situations.ts`):
When situations are detected by the bootstrap layer, targeted directives are injected:
- `has_pending_proposals` — Mention pending proposals, suggest reviewing
- `has_thin_sections` — List thin sections, probe for more detail
- `has_stale_facts` — List stale facts (capped at 5), verify still current
- `has_open_conflicts` — Mention conflicts, offer to resolve
- `has_archivable_facts` — `active_stale` only — suggest archiving facts older than 90 days with low confidence
- `has_recent_import` — returning/active states only — acknowledge the connector import, prompt the user to review any gaps
- `has_pending_soul_proposals` — all states including `first_visit` — bring up the pending soul change proposal naturally in conversation; if user agrees call `review_soul_proposal` with `accept: true`, if disagrees call with `accept: false`; overlay keys capped at 5, all user-derived strings sanitized (control chars stripped, single-line enforced)
- `has_sparse_profile` — `returning_no_page`/`draft_ready`/`active_fresh`/`active_stale` — hard data-collection override: "MANDATORY: do NOT redirect to publishing, ask ONE focused question to fill a missing area." Fires when publishable facts < 10 regardless of journey state. Priority 1 (highest); wins over `has_archivable_facts` (p4), `has_recent_import` (p2), `has_thin_sections` (p3) via incompatibility resolution. Exception: user may override by explicitly requesting to publish.
- `has_pending_episodic_patterns` — all states except `first_visit` and `blocked` — bring up the pending episodic pattern proposal naturally; if user agrees call `confirm_episodic_pattern` with `accept: true`, if disagrees call with `accept: false`. Patterns detected by Dream Cycle worker (`consolidate_episodes` job). Proposals expire after 30 days; rejected action types enter 90-day cooldown. All user-derived strings sanitized.

**Expertise Calibration:**
- `novice` — Explain features, use step-by-step guidance
- `familiar` — Normal conversation depth
- `expert` — Be concise, skip explanations, power-user mode

**Dynamic Welcome Messages** (`ChatPanel.tsx`):
**`buildWelcomeMessage(language, bootstrap | null)`** — single function replacing the legacy
`getWelcomeMessage()`, `getSmartWelcomeMessage()`, and `WELCOME_MESSAGES` maps (all deleted).
Handles all 6 journey states. All welcome messages share `id: 'welcome'` — dedup is
id-based and language-agnostic. The `blocked` state uses `QUOTA_EXHAUSTED_MESSAGES` for
coherence with `LimitReachedUI`.

### 4.2.5 Cross-Cutting Prompt Blocks

Several fixed prompt blocks are injected into every system prompt regardless of journey state:

**Turn Management Rules** (`src/lib/agent/policies/turn-management.ts`):
- R1: Topic exploration — ~2 exchanges per topic, bridge sentences between clusters, separate EXPLORING vs EDITING modes
- R2: Max exchanges before action (default: 6, journey policies may override; first_visit defines its own cap of 8)
- R4: Stall detection and recovery (options → fill-in-the-blank → generate page)
- R3/R5/R6 moved to `shared-rules.ts` (passive closings, response length, clarification expiry)

**Shared Behavioral Rules** (`src/lib/agent/policies/shared-rules.ts`):
Universal rules applying to ALL 6 journey states with zero conditional branching:
- One question per turn (no stacking)
- Banned passive deferrals (specific phrase list: "let me know if you need anything", "feel free to ask", etc.)
- Clarification expiry (record new info immediately, max 1 follow-up, optional details don't block)
- `IMMEDIATE_EXECUTION_RULE` TS constant interpolated into active-fresh, active-stale, draft-ready, returning-no-page
- Response length calibration NOT here — lives in CORE_CHARTER as single source of truth

**Topic Signal Detector** (`src/lib/agent/policies/topic-signal-detector.ts`):
`isNewTopicSignal(message, language)` gates `INCOMPLETE_OPERATION` injection. If the user's
new message signals a new topic — via action verbs in 5 languages, or message length >30
characters — stale pending operations are cleared rather than re-surfaced. Continuation-first
logic: short, ambiguous messages are treated as continuation by default.

**Search Facts Rule** (`src/lib/agent/policies/search-facts-rule.ts`):
`SEARCH_FACTS_RULE` is a canonical constant injected only via `memoryUsageDirectives()` —
single source of truth for when to call `search_facts` vs read existing context. Previously
duplicated in 3 places (`returning-no-page.ts`, `planning-protocol.ts`, and inline); now
managed in one location.

**Memory Usage Directives** (`src/lib/agent/policies/memory-directives.ts`):
- Tier 1 (Facts) = WHAT you know — search before asking, record as encountered (cross-references FACT RECORDING in Tool Policy for batch vs. individual guidance)
- Tier 2 (Summary) = CONTEXT of past conversations — use for continuity, never recite
- Tier 3 (Meta-Memories) = HOW to behave — communication patterns, tone preferences
- Tier 4 (Episodic) = WHAT HAPPENED — if a RECENT EVENTS block is present, reference recent activity naturally
- Golden rule: call `save_memory` with at least one meta-observation per **significant** session. "Significant" is defined explicitly in the directive with good/bad examples embedded to prevent misapplication.
- Cross-tier discipline: factual info in facts, interaction patterns in memories

### 4.3 Tool Calling (Autonomous Actions)

During conversation, the agent calls tools silently to manage the knowledge base, page,
and cognitive state. The user sees a natural conversation. Under the hood, the agent is
performing structured actions:

```
Available tools (26):

Knowledge Base management:
  create_fact({ category, key, value, confidence? })          # Learn something new (duplicate detection: same value = idempotent, diff value = blocked)
  batch_facts({ facts[] })                                    # Create/delete multiple facts atomically (no updates — facts are immutable)
  delete_fact({ factId })                                     # Remove a fact (accepts UUID or category/key format like "education/dams")
  search_facts({ query })                                     # Free-text search the KB
  set_fact_visibility({ factId, visibility })                 # Change fact visibility (proposed/private only)
  archive_fact({ factId })                                    # Soft-archive a fact
  unarchive_fact({ factId })                                  # Restore archived fact
  reorder_items({ sectionType, factIds })                     # Reorder items within a section

Page management:
  update_page_style({ username, surface?, voice?, light?, layoutTemplate? })  # Modify page presence/layout metadata
  set_theme({ username, surface?, voice?, light? })           # Change presence (surface/voice/light axes)
  set_layout({ username, layoutTemplate })                    # Change layout template (lenient validation)
  reorder_sections({ username, sectionOrder })                # Rearrange page sections
  move_section({ username, sectionType, position })           # Move a section to a specific position
  generate_page({ username, language? })                      # Full page synthesis from facts
  inspect_page_state({ username })                            # Structured view of page layout/sections/warnings
  publish_preflight({ username })                             # Pre-publish gate + quality + layout checks
  request_publish({ username })                               # Request publish approval (async username validation)
  propose_lock({ sectionId, lockPosition?, ... })             # Propose locking a section

Cognitive management:
  save_memory({ content, memoryType?, category? })            # Save agent observation (Tier 3)
  propose_soul_change({ overlay, reason? })                   # Propose identity profile update
  review_soul_proposal({ proposalId, accept })                # Accept/reject pending soul proposal
  resolve_conflict({ conflictId, resolution, mergedValue? })  # Resolve a fact contradiction

Episodic memory:
  record_event({ actionType, eventAtHuman, summary, ... })    # Log a user activity event
  recall_episodes({ timeframe, actionType?, keywords? })      # Query past events with FTS5 search
  confirm_episodic_pattern({ proposalId, accept })            # Accept/reject Dream Cycle pattern proposal

Content curation:
  curate_content({ sectionType, factId?, fields, reason? })   # Polish page content (item-level or section-level)
```

**Example of what happens in a single exchange:**

User says: "I just started a new job at Acme Corp as a product manager"

The agent simultaneously:
1. Responds naturally: "Congrats! That's a big move. How are you liking it so far?"
2. Calls `create_fact(category="experience", key="acme-corp", value={role: "Product Manager", company: "Acme Corp", start: "2026-02", status: "current"})`
3. Calls `delete_fact(factId="experience/prev-job")` then `create_fact(...)` with updated status (facts are immutable — delete+create replaces update)
4. Calls `generate_page(username)` to rebuild the page from updated facts
5. Calls `save_memory(content="User transitioned to product management — significant career shift", memoryType="insight")` if this seems like a core identity shift

All invisible to the user. They just had a conversation.

### 4.3.1 Tool Call Reliability

Two mechanisms ensure the agent calls tools correctly despite the growing complexity of
24 tools × 18 section types × 14 fact categories:

1. **Structured fact schema reference** (prevention): The system prompt includes a
   category→value shape lookup table so the LLM has the exact structure for every
   `create_fact` call. Also includes immutable-facts rules
   (delete+create to correct, never leave incorrect facts active). This is the primary defense.

2. **`experimental_repairToolCall`** (recovery): If the LLM still sends invalid tool
   arguments (Zod validation fails before execution), the AI SDK intercepts the error
   and asks the same model to regenerate correct JSON using the original args + the
   tool's JSON Schema. The repaired call is retried transparently — the user never
   sees validation errors in the chat. If repair also fails, the error is logged but
   not surfaced to the user.

**Type safety:** Messages passed to `streamText()` are typed as `CoreMessage[]` (from the
Vercel AI SDK `ai` package). The role-whitelist filter produces `{ role: string }[]`, so
the result is cast to `CoreMessage[]` after filtering to satisfy the SDK's literal-union
type constraint.

**Auto-draft for style tools:** The `set_theme`, `update_page_style`, `set_layout`, and
`reorder_sections` tools use a shared `ensureDraft()` helper that auto-composes a draft
from facts if none exists. This lets users request style changes before explicitly
generating the page — the draft is created on-demand from the knowledge base.

**Auto-recompose after fact mutations:** The `create_fact`, `delete_fact`, and `batch_facts`
tools call `recomposeAfterMutation()` after each successful operation to keep the preview
in sync without requiring a separate `generate_page` call. The function uses
`projectCanonicalConfig()` — the same projection used by the preview/stream endpoint —
which preserves section order, lock metadata, and theme/style/layoutTemplate from the
existing draft (`DraftMeta`). An anti-loop flag (`_recomposing`) prevents re-entry.
Hash-based idempotency (`computeConfigHash`) skips the write if the composed config matches
the current draft. Each call is wrapped in try/catch so that recompose failures (e.g.,
missing draft) never mask the successful fact operation.

**Layout alias resolution:** The `set_layout` tool normalizes layout names via
`resolveLayoutAlias()` in `contracts.ts`. Case-insensitive, supports user-facing names
("The Monolith", "Cinematic", "The Curator", "The Architect") and legacy aliases
(`"bento"` → `"architect"`, `"sidebar"` → `"curator"`, `"vertical"` → `"monolith"`).
Unknown values pass through trimmed for error messages. Layout validation is **lenient**:
`missing_required` errors are ignored on `set_layout` and `/api/draft/style`, allowing
layout switches even with incomplete sections.

**Action Claim Guard** (`src/lib/agent/action-claim-guard.ts`):
A stream-level transform that detects and rewrites unbacked completion claims — text that
implies the agent performed an action (e.g., "Salvato.", "Added.", "Done.") when no
corresponding write tool actually succeeded in the current turn.

- `COMPLETION_CLAIM_BACKING_TOOL_NAMES`: Set of tools that actually complete actions
  (fact CRUD, generate_page, set_layout, record_event, resolve_conflict, etc.).
  Proposal-only tools (`request_publish`, `propose_soul_change`, `propose_lock`,
  `save_memory`) are explicitly excluded — they don't back completion claims.
- `didToolActuallyCompleteAction(toolName, success, opts?)`: Nuanced per-tool check.
  `review_soul_proposal` and `confirm_episodic_pattern` back claims only when
  `accept === true` (checked via args or result).
- `LEADING_FILLER_PREFIX`: Strips casual openers ("Ok,", "Certo,", "Va bene,",
  "Sure,") before claim detection so "Ok, aggiunto." is still caught.
- `createUnbackedActionClaimTransform(lang)`: `experimental_transform` for `streamText()`.
  Buffers text deltas, checks against journal of tool results in the same stream.
  If a risky claim has no backing tool call, rewrites to fallback: "Non l'ho ancora
  eseguito. Se vuoi, lo faccio adesso." (IT) / "I haven't done that yet." (EN).
- `sanitizeUnbackedActionClaim(text, journal, lang)`: Synchronous variant for message
  persistence — ensures stored assistant text is also honest.

**Immediate execution directives:** Active-state policies (`active-fresh`, `active-stale`,
`draft-ready`) include an explicit rule: "If the user asks for a concrete add/update/remove
and you already have enough info, execute the tool call in THIS turn. Do NOT just say you'll
do it." The planning protocol classifies single concrete edits as SIMPLE (immediate execution).

**Tool call persistence:** Assistant messages now persist the `toolCalls` array (operation
journal) alongside text content in the messages table, enabling chat replay, summary
generation from message-level data, and auditing.

`sessions.metadata.journal` is now only an operational buffer for the active turn
(resume/step-exhaustion state). Long-lived consumers such as summaries and heartbeat
journal-pattern analysis must read canonical message-level `toolCalls`, not session metadata.

Key files:
- `src/lib/agent/prompts.ts` — `FACT_SCHEMA_REFERENCE` (category→value table), `DATA_MODEL_REFERENCE` (bio composition, workflows, schemas, role/title priority), `buildMinimalSchemaForEditing()` (edit workflow for active states)
- `src/app/api/chat/route.ts` — `CoreMessage` typing, `experimental_repairToolCall` callback, `experimental_transform` (action claim guard) in `streamText()`
- `src/lib/agent/action-claim-guard.ts` — Stream-level unbacked action claim transform
- `src/lib/agent/tool-call-repair.ts` — `stringifyToolArgsForRepair()`, `stripMarkdownCodeFences()`
- `src/lib/layout/contracts.ts` — `resolveLayoutAlias()`, `LAYOUT_TEMPLATES`

### 4.4 Heartbeat (Periodic Self-Reflection)

Inspired by OpenClaw's heartbeat system. At configurable intervals, the agent "wakes up"
and performs autonomous maintenance — without the user being present.

**Mission filter:** Every heartbeat cycle is guided by a single question:
*"Does this information change how the user should present themselves to the world?"*
This is the relevance filter. New Strava runs are noise unless the user positions
themselves as a runner. A new GitHub repo is signal only if it reflects a skill or
project the user wants to highlight. The heartbeat does not act on everything — it
acts on what matters for identity.

**Three-tier architecture:**

The heartbeat runs three complementary tiers at different cadences:

```
runGlobalHousekeeping (every scheduler tick — once, not per-owner):
  1. Expire stale soul change proposals (>48h pending)
  2. Cache TTL cleanup — remove expired section_copy_cache entries (>30 days)

heartbeat_light (daily — no LLM, deterministic):
  1. Conflict cleanup — dismiss old unresolved conflicts (>7 days)
  2. Stale proposal cleanup — mark proposals as stale when underlying state changed
  3. Journal pattern analysis — heuristic pattern detection + memory save

heartbeat_deep (weekly — LLM-dependent, gated by minimum fact count):
  1. Conformity check — analyze active personalized copies for style drift
  2. Page coherence review — does the page narrative hold together?
```

**Deep heartbeat fact gate:** Deep heartbeat only runs for owners with at least
`DEEP_HEARTBEAT_MIN_FACTS` (25) active facts. The gate is checked both at scheduling
time (in the scheduler) and at execution time (in the handler), using
`resolveOwnerScopeForWorker` to get the correct `cognitiveOwnerKey` for fact lookup.

**Deep heartbeat retry-friendly design:** Non-terminal outcomes (`below_threshold`,
`budget_exceeded`) do NOT record a `heartbeat_runs` row, keeping the weekly scheduling
window open for retry. Both LLM substeps (conformity + coherence) must complete
successfully for a run to be recorded; if either fails, no row is written.

**Language-aware conformity:** Deep-heartbeat conformity checks run against the owner's
preferred page language (fallback: fact language, then `en`). This keeps
`section_copy_state` lookup and generated proposals aligned with the active localized copy,
instead of assuming English.

**Per-owner daily budget (DST-safe):**

Each owner gets one heartbeat_light per calendar day and one heartbeat_deep per
calendar week. Day boundaries are computed via `computeOwnerDay()` using
`Intl.DateTimeFormat` with the owner's timezone, ensuring DST transitions do not
cause double-runs or missed runs.

Budget enforcement is two-tier:
- **Global budget**: `checkBudget()` guards total LLM spend across all owners
- **Per-owner budget**: `checkOwnerBudget()` ensures no single owner exceeds daily allocation

**Example heartbeat outcomes:**

- Detects 3 new Strava runs → queues: "You've been running a lot! Want me to update your sports section?"
- Detects a GitHub repo hasn't been updated in 6 months → queues: "Is 'old-project' still active? Should I archive it on your page?"
- Detects the bio mentions "learning Rust" but the user has 15 Rust repos now → auto-suggests: "You're not 'learning' Rust anymore — you're proficient. Want me to update?"
- Nothing changed → stays silent. No notification. Respect the user's attention.

**Heartbeat configuration:**
```yaml
heartbeat:
  enabled: true
  interval: "24h"              # How often (1h, 6h, 12h, 24h, 7d)
  active_hours:                # Only run during these hours
    start: "09:00"
    end: "22:00"
    timezone: "Europe/Berlin"
  quiet_mode: false            # If true, never notify — only auto-approve
  connector_check: true        # Check connected services
  kb_review: true              # Review knowledge base consistency
  page_review: true            # Review page freshness
```

**Worker execution:**

The heartbeat runs in a standalone worker process (`src/worker.ts`), built with
tsup and deployed as a separate service. See Section 11 for deployment details.

The worker uses a jobs table with atomic claim semantics (UPDATE WHERE status='queued')
and 3 retry attempts with exponential backoff. The **heartbeat scheduler**
(`src/lib/worker/scheduler.ts`) auto-enqueues heartbeat jobs for all active owners
every 15 minutes, with catch-up logic and anti-overlap protection.

**11 job handlers:**
- `page_synthesis` — Full page rebuild from facts
- `memory_summary` — Tier 2 conversation summary generation
- `heartbeat_light` — Daily lightweight maintenance
- `heartbeat_deep` — Weekly deep review
- `expire_proposals` — Clean up stale soul change proposals
- `soul_proposal` — Process pending soul profile changes
- `connector_sync` — Pull data from connected services
- `page_regen` — Targeted section regeneration
- `taxonomy_review` — Review pending category registrations
- `session_compaction` — Async chat-to-memory distillation (see §4.5)
- `consolidate_episodes` — Dream Cycle: detect recurring patterns in episodic events, create proposals (see §4.5.2)

**DB bootstrap coordination:**

Web and worker processes coordinate schema migrations via `DB_BOOTSTRAP_MODE`:
- `web` runs as leader (executes migrations on startup)
- `worker` runs as follower (polls `schema_meta` table until leader has completed migrations)

This prevents race conditions when both processes start simultaneously.

### 4.5 Memory Architecture

The agent's memory has three tiers (inspired by OpenClaw):

**Tier 1 — Short-Term: Conversation History (ephemeral)**
Raw chat messages from the current and recent sessions. Trimmed to last 20 turns
within a 22000-token budget during context assembly. After each chat turn, a
`session_compaction` job is enqueued to asynchronously distill messages into
structured memory (see Session Compaction below).

**Tier 2 — Medium-Term: Conversation Summaries (rolling)**
Compressed summaries of past conversations stored in the `conversation_summaries`
table (UNIQUE on `owner_key`). The agent does not re-read full transcripts — it
works from distilled summaries that capture essential information, emotional tone,
and unresolved threads.

Implementation details:
- **CAS (compare-and-swap) for race safety**: INSERT ON CONFLICT DO NOTHING + UPDATE
  WHERE cursor matches. This prevents concurrent summary jobs from overwriting each other.
- **Compound cursor**: `(cursor_created_at, cursor_message_id)` — survives cross-session
  message reads and ensures summaries are built incrementally without gaps.
- Generated via "medium" tier LLM call (see ADR-013).
- Enqueued as `memory_summary` job in the worker, not generated inline during chat.

**Tier 3 — Long-Term: Consolidated Knowledge (durable)**
Two sub-layers:

- **Knowledge Base** — Structured facts about the user. The source of truth for
  page generation. See Section 5.
- **Agent Memory** — The agent's own meta-observations about the user — not facts,
  but behavioral notes stored in the `agent_memory` table:
  - "User gets annoyed when I ask too many questions in a row"
  - "User prefers to talk about projects rather than skills"
  - "User's mood is usually better in evening conversations"

Agent memory implementation:
- **Expanded schema**: `owner_key`, `memory_type` (observation, preference, insight, pattern),
  `category`, `content_hash` (SHA-256), `confidence`, `is_active`, `user_feedback`,
  `deactivated_at`, `source` ('agent' or 'worker')
- **Dedup**: SHA-256 content hash prevents duplicate active memories
- **Quota & Eviction**: 50 active memories per owner. When the limit is reached,
  `evictLowestScoring()` deactivates the lowest-scored memory — but protects a floor
  of 5 agent-sourced memories (`AGENT_FLOOR=5`). This ensures human-observed behavioral
  notes survive even under heavy worker pattern generation.
- **Cooldown**: 5 writes per 60-second window (DB-based, survives restart). Cooldown applies
  only to agent-sourced writes (`COALESCE(source, 'agent') = 'agent'`).
- **Worker provenance**: `saveMemoryFromWorker()` bypasses cooldown with `source='worker'`
  provenance. Used by session compaction (up to 3 patterns per window) and heartbeat
  journal analysis. Same quota and dedup constraints apply.
- **User feedback**: "helpful" increases confidence by +0.1 (capped at 1.0);
  "wrong" immediately deactivates the memory
- **Memory types**: `observation` (behavioral notes), `preference` (user likes/dislikes),
  `insight` (inferred understanding), `pattern` (recurring behavior)
- **Relevance-scored retrieval**: `getActiveMemoriesScored()` ranks memories by a
  three-factor scoring formula:
  - `creationRecency = 0.5 ^ (ageDays / 14)` — 14-day half-life on creation date
  - `provenanceWeight` — agent: 1.0, worker: 0.6
  - `usageBoost` — tracks whether the memory was actually referenced in LLM context:
    - If referenced: `0.5 ^ (daysSinceLastRef / 28)` (28-day half-life)
    - If never referenced: fixed 0.5 penalty (`NEVER_REFERENCED_PENALTY`)
  - Final score: `creationRecency × provenanceWeight × usageBoost`
  - Returns top 15, sorted by score descending.
- **Async usage tracking**: `updateLastReferencedAt()` updates `last_referenced_at`
  for all memory IDs that survived context assembly (paired ID tracking through
  budget truncation). Called asynchronously in `onFinish` of chat route. Migration 0030
  adds `last_referenced_at TEXT` column to `agent_memory`.
- **Memory API**: Two REST endpoints for user-facing memory management:
  - `GET /api/memory` — returns scored active memories via `getActiveMemoriesScored(ownerKey, 50)`
  - `DELETE /api/memory/[id]` — soft-deactivates a memory (owner-scoped)

Agent memory is stored separately from the KB and used to improve conversation
quality over time. Like OpenClaw's MEMORY.md — curated, evolving meta-knowledge.

**Session Compaction** (`src/lib/services/session-compaction-service.ts`):

Asynchronous background process that distills raw chat history into structured
semantic memory. Enqueued after every chat turn via `session_compaction` worker job.

Design:
- **Incremental rowid cursor** — processes 40-message windows using SQLite `rowid`
  as a monotonic cursor. `getLastCompactionRowid()` orders by `cursor_rowid DESC`
  (not `created_at`) to handle sub-second multi-window runs correctly.
- **5-window backlog drainer** — worker handler loops up to 5 windows per job
  execution. If the last window was full (40 messages), a continuation job is
  enqueued to drain remaining backlog.
- **Anti-burn guard** — counts only *deterministic* failures
  (`json_parse_failure`, `schema_validation_failure`) toward the window limit.
  Transient errors (network, budget) do not count — they trigger retry via
  `executeJob` backoff. On the 3rd deterministic failure for a cursor window,
  `skipped:true` is returned (not thrown), cursor advances, bad window is skipped.
- **Strict JSON validation** — validates both array presence and element types
  (`isStringArray`) before any counting; validates `sessionMood` enum via `Set`.
- **Audit log** — `session_compaction_log` table with `cursor_rowid INTEGER` column,
  `error_code TEXT`, and `DESC` index on `(session_key, cursor_rowid)`.
- **Dedup** — per-session UNIQUE index on `(job_type, ownerKey, sessionKey)` WHERE
  `status='queued'` prevents duplicate queued compaction jobs while a running job
  can enqueue a continuation without conflict.
- **Output** — `CompactionSummary` (topics, factsChanged, patternsObserved,
  sessionMood, keyTakeaways). Pattern observations are saved as `type="pattern"`
  agent memories (up to 3 per window, via `saveMemoryFromWorker()`).
- **Few-shot prompt guidance** — `patternsObserved` must be behavioral observations
  (HOW user communicates), not facts or topics. Good/bad examples embedded in prompt.
  Compaction prompt demands behavioral synthesis and explicitly bans mechanical stats
  (e.g. "create_fact was called 5 times" is rejected).

**Context display format:**
Memories are displayed in the system prompt as `- [type|category] content` (e.g.,
`- [observation|layout-preferences] User prefers compact sidebar`). The `type|category`
prefix helps the LLM understand the nature and domain of each memory. During context
assembly, a paired ID map (`Map<line, id>`) tracks which memory IDs correspond to which
output lines through all truncation phases (per-block budget, overflow shrink, final hard
truncation). The surviving IDs are returned as `referencedMemoryIds: string[]` from
`assembleContext()` for async usage tracking.

**MEMORY SELF-MANAGEMENT policy:**
The system prompt includes a dedicated memory management policy block that guides the
agent on when to save meta-memories vs. when information belongs in other tiers:
- **Save**: preferences about page/communication style, recurring patterns, context
  that shapes future interactions
- **Don't save**: factual information (→ facts), one-time instructions, information
  already captured in facts or soul profiles, tool usage statistics

A CROSS-TIER AWARENESS instruction tells the agent to naturally connect RECENT EVENTS
(episodic Tier 4) with KNOWN FACTS (Tier 1) when both are relevant.

### 4.5.2 Episodic Memory (Tier 4)

Append-only event ledger for user activities and life events. While Tiers 1-3 capture
*what the agent knows*, Tier 4 captures *what happened* — timestamped, structured events
that the agent can query and analyze.

**Schema:** `episodic_events` table with FTS5 full-text search on `narrative_summary`
and `raw_input`. Events are append-only with correction via `superseded_by` (old event
points to its replacement). Soft-delete via `archived` flag for retention window cleanup.
Columns `source` ('chat', 'github', 'linkedin_zip', 'rss', 'spotify', 'strava') and
`external_id` (stable dedup key for connectors) enable multi-source event ingestion
with UNIQUE partial index for dedup.

**Agent tools:**
- `record_event` — logs a user activity (workout, meal, meeting, etc.) with ISO timestamp,
  summary, and optional details JSON. Enqueues `consolidate_episodes` job.
- `recall_episodes` — queries events by timeframe (last_24h, last_7_days, last_30_days,
  last_90_days, all_time), optional `actionType` filter, optional `keywords` FTS5 search
  with word-split AND semantics (multi-word queries split into terms, each term generates
  OR across fields, terms combined with AND). Returns up to 10 events + `countsByType`
  aggregate + `truncated` flag.
- `confirm_episodic_pattern` — accepts or rejects a pattern proposal. On accept:
  atomic transaction claims proposal, writes activity fact, triggers draft recomposition
  via `acceptEpisodicProposalAsActivity`.

**Dream Cycle** (`consolidate_episodes` worker job):
Background consolidation that detects recurring patterns and surfaces them as proposals.
1. Auto-expires stale pending proposals (julianday-safe)
2. `checkPatternThresholds` — deterministic: ≥3 events in 60 days, most recent within 30 days,
   not on cooldown, no pending/accepted proposal for same action_type
3. `evaluatePatternWithLLM` — fast-tier LLM judges if pattern is "worthy" (voluntary,
   recurring, meaningful — not commuting/groceries)
4. Creates `episodic_pattern_proposals` with 30-day TTL
5. Archives events older than 180 days

**Proposal lifecycle:**
- `pending` → `accepted` (creates activity fact, recomposes draft)
- `pending` → `rejected` (90-day cooldown on action_type)
- `pending` → `expired` (auto-expired by Dream Cycle or julianday guard)

**FTS5 safety:** `sanitizeFtsKeywords` wraps each token in double quotes to prevent
FTS5 syntax injection. Triggers maintain sync between `episodic_events` and
`episodic_events_fts` (INSERT, UPDATE, DELETE — all idempotent via DELETE-before-INSERT).

**Smart Context Injection** (`getRecentEventsForContext()`):
Episodic events are passively injected into the system prompt as a "RECENT EVENTS" block
(5000 token budget). Events from the last 30 days are selected with per-source caps:
- Chat events: max 10 (user-reported activities)
- Per-connector events: max 3 each (GitHub, LinkedIn, etc.)
- Total cap: 15 events

Per-source queries prevent chat events from starving connector events. Sorted by recency.
Included for `returning_no_page`, `draft_ready` (3k budget), `active_fresh`, `active_stale`.
Excluded for `first_visit` (no events yet) and `blocked`.

The Dream Cycle's `checkPatternThresholds()` filters to `source = 'chat'` only, preventing
machine-imported events from triggering habit proposals.

**Connector Dual-Write:**
Connectors write notable discrete events to episodic memory alongside their existing
fact extraction:

- **GitHub** (`src/lib/connectors/github/activity.ts`): Fetches user events via
  `fetchUserEvents()` with incremental pagination (boundary-based via `lastSeenEventId`,
  max 5 pages, rate-limit aware). `filterSignificantEvents()` keeps only merged PRs,
  releases, and new repos. `mapToEpisodicEvents()` produces `source: "github"` events
  with `externalId` for dedup. Cursor stored as JSON in `syncCursor` field (backward-
  compatible with legacy plain-timestamp format). Always-advance cursor strategy.

- **LinkedIn** (`src/lib/connectors/linkedin-zip/activity-mapper.ts`): Maps certifications
  and articles from ZIP import to episodic events with `source: "linkedin_zip"`. Uses
  `normalizeLinkedInDate()` for date parsing and `stableExternalId()` (SHA-256 hash)
  for deterministic dedup across re-imports. Activity extraction runs even if no profile
  facts are found (activity-only imports).

- **RSS** (`src/lib/connectors/rss/`): Blog post publication events with `source: "rss"`.
  First-sync seeds `connector_items` for dedup without emitting events.

- **Spotify** (`src/lib/connectors/spotify/`): Musical taste shift events with
  `source: "spotify"`. Detects taste shift when ≥3 of top 5 artists changed vs previous
  sync. Stale fact archival: `staleSinceSync` counter tracks consecutive absent syncs,
  archives `sp-artist-*`/`sp-track-*` facts after 3 absent syncs. Genre facts removed
  (genres embedded as artist `note` field).

- **Strava** (`src/lib/connectors/strava/`): Workout completion and PR milestone events
  with `source: "strava"`. Incremental sync via `syncCursor` unix timestamp.

All connectors use best-effort writes: UNIQUE constraint violations are silently swallowed
(expected on re-sync), all other failures are logged but non-fatal. GitHub has an explicit
first-sync guard (`hasActivityBaseline` check) to prevent event emission on initial sync;
cursor is seeded to establish the baseline.

**Intelligent forgetting (decay + relevance signals):**

Not all facts and memories have equal weight over time. The memory system must
support natural decay so the agent's understanding stays current:

- **Recency decay**: Facts that haven't been referenced or confirmed in a long
  time lose relevance. A freelancer who mentioned learning Rust 18 months ago but
  never brought it up again — that fact should fade, not dominate the page.
- **Relevance signals**: Some facts resist decay because the user keeps bringing
  them up, connectors keep confirming them, or they are core to identity (name,
  role, primary skills). These are "pinned" by evidence, not by a flag.
- **Stack change detection**: When a user shifts stack or career direction, this is
  a high-weight signal. The agent should recognize it and cascade updates, not
  wait for explicit instructions.
- **No deletion, just archival**: Decayed facts are archived (`visibility='archived'`),
  not deleted. They remain in the KB for history and can be reactivated if the
  user brings them up again.

Implementation: each fact carries `updated_at` and an implicit relevance score
derived from (recency × reference_count × source_weight). The heartbeat uses this
score to decide what to review and what to let fade. See ADR-012 for why this is
built in-house.

**Unified memory across contexts:**

The user may interact with OpenSelf via chat, but also through connectors (GitHub,
RSS, future integrations). All information — regardless of source — converges into
the same KB and memory layers. The agent does not have separate "chat knowledge"
and "connector knowledge". A GitHub contribution and a chat message both produce
facts in the same store, with `source` tracking origin for audit.

### 4.5.1 Fact Visibility Lifecycle

Every fact in the KB follows a four-state visibility lifecycle:

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌────────────┐
│ PRIVATE  │────▶│   PROPOSED   │────▶│  PUBLIC  │────▶│  ARCHIVED  │
│          │     │              │     │          │     │            │
│ Not on   │     │ Agent thinks │     │ Live on  │     │ Was active,│
│ page,    │     │ it could go  │     │ the page │     │ now hidden │
│ internal │     │ on the page  │     │          │     │ but kept   │
│ only     │     │              │     │          │     │            │
└──────────┘     └──────────────┘     └──────────┘     └────────────┘
      ▲                                     │
      └─────────────────────────────────────┘
                  (user revokes)
```

- **Private**: stored in KB, never shown on the page. Used by the agent for
  understanding context (e.g., salary, personal struggles).
- **Proposed**: the agent believes this fact could be on the page.
  Shown in draft preview. Requires user approval to go live.
- **Public**: live on the public page.
- **Archived**: was active, now removed from the page. Still stored in KB for
  history and potential future reactivation.

The agent manages these transitions through heartbeat cycles, optimizing for
relevance without wasting LLM calls on facts that haven't changed.

### 4.5.2 Owner Identity & Scoping

All cognitive and knowledge data is scoped through `OwnerScope`, which unifies
authenticated and anonymous access patterns:

```ts
type OwnerScope = {
  cognitiveOwnerKey: string;   // NEW tables: memory, soul, summaries, heartbeat, trust_ledger
  knowledgeReadKeys: string[]; // EXISTING tables reads: facts, page, messages
  knowledgePrimaryKey: string; // EXISTING tables writes: facts, page — stable anchor session
  currentSessionId: string;    // Current request's session (message writes, quota tracking)
};
```

**Authenticated users:**
- `cognitiveOwnerKey` = profileId (stable across sessions)
- `knowledgeReadKeys` = all session IDs for the profile (union of {currentSessionId})
- `knowledgePrimaryKey` = anchor session ID (oldest session for the profile — stable
  write key for facts/page/config)
- `currentSessionId` = from cookie

**Anonymous users:**
- All keys = sessionId (single session, no cross-session unification)

**Anchor session:** The oldest session associated with a profile. This provides a stable
write key for facts, page, and config tables, avoiding data fragmentation when users
have multiple sessions.

**Session backfill:** When a user registers or logs in via OAuth, all existing sessions
for that profile are backfilled with the `profile_id`, enabling cross-session reads.

**Multi-session awareness:** The `ownerKey` and `readKeys` are now threaded end-to-end
through the publish pipeline (`prepareAndPublish`), preview endpoints, worker page jobs
(`getPageJobContext` helper), and summary service (`expandSummaryMessageKeys`). This
ensures all pipelines read facts from the full session scope (not just one session) and
write drafts to the anchor session. Pending operations are **conversation-scoped** —
stored on `conversationSessionId` (the active chat session), not the profile anchor, so
multiple browser sessions don't cross-pollinate pending state.

**Connector route auth:** `resolveAuthenticatedConnectorScope()` in
`src/lib/connectors/route-auth.ts` provides unified auth for all connector API routes.
In multi-user mode, it validates `userId` or `username` before returning the scope.
Returns `null` for unauthenticated requests (route returns 401/403).

**Worker-side scope resolution:** `resolveOwnerScopeForWorker(ownerKey)` constructs an
`OwnerScope` for background jobs (heartbeat, summary, page synthesis, consolidation).
Workers receive `ownerKey` in the job payload and use this function to derive the full
scope (read keys, anchor session, etc.) for multi-session-aware processing.

**Profile-scoped media auth:** Profile-owned routes such as avatar upload/delete must follow
the same rule in multi-user mode: a bare session scope is not enough. They require a real
authenticated identity (`userId` or legacy `username`) so writes cannot fall back to the
shared `__default__` profile bucket.

**Username resolution:** `getAuthContext()` resolves the username through a two-step
lookup: `session.username` (legacy) → `profiles.username` (auth v2). This is necessary
because `createAuthSession` does not write username to the sessions table (UNIQUE
constraint). The profiles table fallback ensures auth indicators, ownership checks,
and publish flow all see the correct username after registration.

**Auth detection:** The preferences endpoint determines `authenticated` status via
`!!(authCtx?.userId || authCtx?.username)`. This covers both auth v2 sessions (which
set `userId`) and legacy signup sessions (which set `username` only).

**Message quota:**
- Authenticated: per-profile quota via `profile_message_usage` table (200 message limit)
- Anonymous: per-session quota (50 message limit)

### 4.5.3 Soul Profiles

Soul profiles capture the agent's evolving understanding of the user's identity
characteristics — voice, tone, values, and communication style.

**Table:** `soul_profiles` (versioned, UNIQUE active profile per owner)

**Overlay structure:**
```ts
{
  voice: string;              // e.g., "conversational, direct"
  tone: string;               // e.g., "warm but professional"
  values: string[];           // e.g., ["open source", "privacy", "craftsmanship"]
  selfDescription: string;    // How the user describes themselves
  communicationStyle: string; // e.g., "concise, avoids jargon"
}
```

The active soul profile is compiled into a prose string and injected into the system
prompt (block 7, 1500 token budget). This ensures the agent's responses and page copy
reflect the user's authentic voice.

**Change proposal flow:**
- The agent proposes changes via the `propose_soul_change` tool
- Proposals are stored in `soul_change_proposals` with status: pending/accepted/rejected/expired
- The user reviews proposals via `GET /api/soul/review` and `POST /api/soul/review`
- Proposals expire after 48 hours (cleaned up by `expire_proposals` heartbeat job)
- Accepted proposals create a new version of the soul profile (previous version deactivated)

### 4.5.4 Fact Conflicts

When the agent or a connector introduces information that contradicts an existing fact,
a conflict is created rather than silently overwriting.

**Table:** `fact_conflicts` (dedicated table, not stored on `agent_events`)

**Source precedence (highest to lowest):**
1. `user_explicit` (weight 4) — user directly stated or confirmed
2. `chat` (weight 3) — extracted from conversation
3. `connector` (weight 2) — imported from external service
4. `heartbeat` (weight 1) — inferred during maintenance

**Auto-skip rule:** When precedence difference is >= 2 (e.g., user_explicit vs. connector),
the higher-precedence value wins automatically without creating a conflict.

**3 resolution paths:**
1. **Agent tool**: `resolve_conflict(conflictId, resolution, mergedValue?)` — agent resolves
   during conversation
2. **User API**: `POST /api/conflicts/:id/resolve` — user resolves via UI
3. **Auto-expire**: unresolved conflicts are dismissed after 7 days (heartbeat_deep cleanup)

**Transactional resolution with reverse ops:** `resolveConflict()` wraps the entire
operation in a SQLite transaction. Before any fact mutation, it snapshots both facts via
`getFactSnapshot()`. The trust ledger entry includes `undo_payload.reverseOps[]` with
typed operations (`restore` — revert value, `recreate` — reinstate deleted fact,
`delete` — remove a fact). This enables full bidirectional undo via
`undo_conflict_resolution` in the trust ledger (see Section 4.5.5).

**System prompt injection:** Open conflicts are injected into the system prompt (block 10,
200 token budget) so the agent can proactively address contradictions in conversation.

### 4.5.5 Trust Ledger

Every cognitive action (memory, soul, conflict resolution) is logged in the `trust_ledger`
table with an `undo_payload` saved at write time. This provides full auditability and
reversibility of the agent's autonomous decisions.

**Table:** `trust_ledger` with columns: id, owner_key, action_type, entity_type, entity_id,
description, undo_payload, reversed_at, created_at

**Logged action types:**
- `memory_saved`, `memory_deactivated`
- `soul_accepted`, `soul_rejected`
- `conflict_resolved`, `conflict_dismissed`
- `fact_created`, `fact_updated`, `fact_deleted`
- `record_event`, `confirm_episodic_pattern`

**Reversibility:** Any trust ledger entry can be reversed via `reverseTrustAction()`, which
uses transactional CAS (compare-and-swap) to prevent double-undo and partial commits. The
`undo_payload` contains the exact state needed to restore the previous condition.

**Fact reverse operations:** `applyFactReverseOps(reverseOps[])` handles three operation
types: `delete` (remove fact), `restore` (update value to previous state), `recreate`
(reinstate deleted fact with full previous data). Used by both `undo_fact_mutations` and
`undo_conflict_resolution` cases. Conflict resolution captures snapshots before mutations
and stores typed reverse ops in the trust ledger for complete bidirectional undo.

**API:**
- `GET /api/trust-ledger` — List recent trust actions (filterable by action_type)
- `POST /api/trust-ledger/:id/reverse` — Reverse a specific action

This implements the "radical transparency" UX principle (Section 9.1, commandment 8): the
user can always see why the agent did something and undo it.

### 4.5.6 Heartbeat Cost Optimization

The heartbeat should be event-driven, not blindly periodic:

- If nothing has changed (no new connector data, no new conversations, no
  time-sensitive facts), the heartbeat skips LLM calls entirely.
- The heartbeat checks for change signals first (cheap), then invokes the LLM
  only when reasoning is needed (expensive).
- Batch processing: multiple pending changes are processed in a single LLM call
  rather than one call per change.

### 4.6 Agent Evolution Levels

The agent is designed to grow in capability over time. Each level builds on the
previous one. Level 1 is the MVP; higher levels are unlocked as the knowledge base
deepens and the user opts in.

**Level 1 — Smart Curator** (Phase 0-1)

The agent keeps your page up to date. It adapts tone and style, manages privacy,
asks for confirmations, and suggests small improvements.

Value: *"I never have to think about my online presence."*

**Level 2 — Identity Coach** (Phase 2+)

The agent goes beyond describing who you are — it helps you understand how you are
perceived and how you want to be perceived. This is not a motivational coach. It is
an operational identity coach based on your real data.

Capabilities:
- **Gap analysis** — "You want to reposition as an AI strategist, but 70% of your
  content still talks about data engineering. Want to rebalance?"
- **Trend alignment** — "In the last 6 months, these topics are growing in your
  field: X, Y, Z. Want to integrate them into your positioning?"
- **Narrative refinement** — "You talk a lot about what you do, but not why you
  do it. Want to work on your positioning?"
- **Targeted opportunities** — Not a feed. Only things filtered by your profile:
  "This open-source project aligns perfectly with your skills. Interested?"

This is not engagement. It is relevance.

**Level 3 — Career / Life Navigator** (Phase 3+)

Strategic repositioning mode. The user says: "I want to move into product management
in the next 12 months." The agent can:
- Analyze the current profile
- Highlight gaps
- Suggest what to develop
- Help rewrite the narrative
- Reorganize the page to support the new positioning
- Suggest coherent content and connections

Not a social network. A trajectory simulation system.

**Level 4 — Personal Knowledge Core** (Vision)

The page becomes just the public interface. Behind it lives a complete map of the
user's competencies, passions, goals, and evolution over time.

The agent can:
- Show evolution: "In the last 3 years you went from X to Y. Your focus is
  shifting toward..."
- Suggest growth cycles: "You are neglecting the creative side that used to
  motivate you a lot."
- Time Capsule: yearly review of identity evolution.

This is not a feature. It is a new product category:
**the operating system of your digital identity**.

**Anti-social boundary:** At every level, the agent remains a private assistant.
No public feed, no likes, no ranking, no comparison. Only private suggestions,
only with consent. Zero engagement mechanics.

### 4.6.1 Discovery Scout (Level 2 Capability)

A heartbeat-driven agent that actively searches the web for opportunities relevant
to the user's profile. Not a feed — a personal scout.

**How it works:**

1. During heartbeat, the scout builds search queries from the user's KB (skills,
   interests, role, location, goals).
2. Searches external sources (event platforms, news APIs, job boards, CFPs,
   open-source projects) via web search APIs (Serper, Tavily, or similar).
3. Scores each result against the user's profile for relevance.
4. Only results above a high confidence threshold are surfaced.
5. Delivers as a private suggestion in the next conversation or check-in.

**Anti-spam contract:**

- Hard cap on suggestions per week (default: 3). Zero is better than noise.
- The agent never surfaces a result it cannot explain ("I found this because
  you work in fintech and this conference covers AI in banking").
- User controls: category filters, frequency, snooze, disable entirely.
- No affiliate links, no sponsored content, no engagement incentives.

**Example outcomes:**

- "There's a call for speakers at ReactConf EU — your TypeScript + open-source
  profile is a strong fit. Interested?"
- "A new paper on federated identity systems was published this week — relevant
  to your work on OpenSelf."
- Nothing found → silence. The scout never fabricates relevance.

**Implementation dependency:** Requires heartbeat (Phase 1a) + web search API
integration. Scheduled for Phase 2 alongside the Identity Coach capabilities.

### 4.7 Voice Interaction Architecture

Voice is a first-class modality, not an accessory. The goal is an agent that
listens, reasons, and speaks.

**Speech-to-Text (input):**
- Browser: Web Speech API (real-time, no server round-trip)
- Server fallback: Whisper (open-source model via `faster-whisper`). Used on iOS
  Safari and other browsers where Web Speech API is unreliable. Critical for the
  language-agnostic promise.

**Language hint pipeline (server fallback):**
The UI language selection flows end-to-end to the Whisper model to ensure accurate
transcription of proper nouns in the correct language model:
1. `useSttProvider.ts` — appends `language` (ISO 639-1, e.g. `"it"`) to the `FormData`
   POSTed to `/api/transcribe`. `language` is also in the `useCallback` dependency
   array to prevent stale closures on language change.
2. `src/app/api/transcribe/route.ts` — extracts `language` from the incoming form
   and forwards it to the upstream Whisper server.
3. `docker/stt/server.py` — accepts `language` as an optional `Form` field, validates
   it against a 92-entry ISO 639-1 allowlist, and passes it to
   `model.transcribe(language=...)`, skipping auto-detection when a valid hint is
   provided.

**Text-to-Speech (output):**
- Open-source engines: eSpeak NG (lightweight, many languages, predefined voices),
  Piper (higher quality neural TTS, still open-source and local).
- Cloud fallback: provider TTS APIs (OpenAI, Google, ElevenLabs) for premium voice
  quality, opt-in only.

**Design principle:** The voice pipeline must work fully offline when using local
models (Whisper + eSpeak/Piper + Ollama). This preserves the privacy-first guarantee.

Voice data is ephemeral: audio is transcribed and discarded. Only the text
transcription enters the conversation and fact extraction pipeline.

---

## 5. Knowledge Base

The knowledge base (KB) is the structured memory of everything the agent knows about you.
It is the single source of truth from which the page is generated.

### 5.1 Design Principles

1. **Agent-managed**: The AI creates, updates, and deletes facts autonomously. The user
   never has to manually edit the KB (but can if they want to).
2. **Extensible categories**: Categories are strings, not a hardcoded enum. The agent can
   propose new categories when needed.
3. **Fact-based**: Each entry is an atomic fact. Complex information is broken into
   multiple facts.
4. **Source-tracked**: Every fact knows where it came from (chat, GitHub, Strava, manual).
5. **Overwritable**: When information changes, the fact is updated — not duplicated.
6. **Taxonomy guardrails**: Category aliases are normalized to canonical names at write time
   (e.g., `job`, `work`, `employment` → `experience`) to avoid KB drift.
7. **Experience key collision guardrail**: `createFact()` checks for existing experience
   facts with the same key but a different company. If found, it throws an error directing
   the agent to use a different key or delete+create with the correct key. This prevents accidental data loss
   when the agent reuses a key for a different employer. `getFactByKey()` is exported from
   `kb-service.ts` for exact triple-lookup (sessionId + category + key).

### 5.2 Fact Structure

```
┌──────────────────────────────────────────────────────────┐
│  FACT                                                     │
├──────────────────────────────────────────────────────────┤
│  id          TEXT PRIMARY KEY     (uuid)                  │
│  category    TEXT NOT NULL        (free-form string)      │
│  key         TEXT NOT NULL        (unique within category)│
│  value       JSON NOT NULL        (flexible structure)    │
│  source      TEXT DEFAULT 'chat'  (chat|github|strava|…) │
│  confidence  REAL DEFAULT 1.0     (0.0 to 1.0)           │
│  visibility  TEXT DEFAULT 'private' (private|proposed|public|archived)│
│  created_at  DATETIME                                     │
│  updated_at  DATETIME                                     │
├──────────────────────────────────────────────────────────┤
│  UNIQUE(category, key)                                    │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Example Facts

The agent creates these autonomously during conversations and from connectors:

```json
// Identity
{ "category": "identity", "key": "name", "value": { "full": "Tommaso Bianchi" } }
{ "category": "identity", "key": "location", "value": { "city": "Berlin", "country": "DE" } }
{ "category": "identity", "key": "tagline", "value": { "text": "Builder, runner, espresso addict" } }

// Skills (the agent decides the level based on evidence)
{ "category": "skill", "key": "typescript", "value": { "name": "TypeScript", "level": "advanced", "years": 5 } }
{ "category": "skill", "key": "cooking", "value": { "name": "Italian cooking", "level": "enthusiast", "detail": "Specializes in pasta from scratch" } }

// Interests
{ "category": "interest", "key": "running", "value": { "name": "Running", "detail": "Training for Berlin Marathon 2026", "since": "2024" } }
{ "category": "interest", "key": "jazz", "value": { "name": "Jazz music", "detail": "Plays piano, loves Coltrane" } }

// Projects
{ "category": "project", "key": "openself", "value": { "name": "OpenSelf", "description": "Open-source AI profile builder", "url": "https://github.com/...", "status": "active", "role": "Creator" } }

// Achievements
{ "category": "achievement", "key": "berlin-marathon-2025", "value": { "title": "Berlin Marathon 2025", "detail": "Finished in 3:45:00", "date": "2025-09-28" }, "source": "strava" }

// Experience
{ "category": "experience", "key": "acme-corp", "value": { "role": "Product Manager", "company": "Acme Corp", "start": "2026-02", "end": null, "status": "current" } }

// Activities (with geolocation)
{ "category": "activity", "key": "ai-conf-2026", "value": { "title": "Spoke at AI Conference 2026", "date": "2026-02-15", "location": { "name": "Palazzo delle Esposizioni", "city": "Rome", "country": "IT", "coords": [41.8992, 12.4892] }, "tags": ["conference", "AI", "speaking"] } }
{ "category": "activity", "key": "berlin-meetup-feb", "value": { "title": "Berlin TypeScript Meetup", "date": "2026-02-10", "location": { "name": "Factory Berlin", "city": "Berlin", "country": "DE" }, "tags": ["meetup", "TypeScript"] } }

// Education (Phase 1b)
{ "category": "education", "key": "mit-msc", "value": { "institution": "MIT", "degree": "MSc", "field": "Computer Science", "period": "2018-2020" } }

// Languages (Phase 1b)
{ "category": "language", "key": "spanish", "value": { "language": "Spanish", "proficiency": "fluent" } }

// Stats (Phase 1b)
{ "category": "stat", "key": "years-experience", "value": { "label": "Years Experience", "value": "10+" } }

// Music (Phase 1b)
{ "category": "music", "key": "bohemian-rhapsody", "value": { "title": "Bohemian Rhapsody", "artist": "Queen" } }

// Contact (Phase 1b — sensitive by default, requires explicit user approval)
{ "category": "contact", "key": "email", "value": { "type": "email", "value": "me@example.com" } }

// The agent can create any category it wants:
{ "category": "philosophy", "key": "open-source", "value": { "text": "Believes software should be free and open" } }
{ "category": "fun-fact", "key": "coffee", "value": { "text": "Cannot function before the first espresso" } }
{ "category": "life-motto", "key": "main", "value": { "text": "Build things that matter" } }
{ "category": "reading", "key": "current", "value": { "title": "Designing Data-Intensive Applications", "author": "Martin Kleppmann" }, "source": "manual" }
{ "category": "social", "key": "github", "value": { "platform": "GitHub", "url": "https://github.com/tommaso", "username": "tommaso" } }
```

### 5.4 Autonomous KB Management

The agent manages the KB like OpenClaw manages its skills and memory. It does not wait
for instructions. During every conversation, the agent:

1. **Listens** for new information and creates facts
2. **Detects changes** ("I left Acme" → updates experience fact, sets end date)
3. **Infers** connections ("You mentioned TypeScript and React → you're a frontend dev")
4. **Consolidates** when facts are redundant or contradictory
5. **Evolves categories** — if users keep mentioning travel, the agent creates a
   `travel` category and starts tracking destinations

The agent can also **ask** the user to confirm uncertain facts:
> "Last time you mentioned learning Rust — are you still at it, or has that changed?"

### 5.5 Semantic Search

The KB supports semantic search so the agent can find relevant facts during conversation
without loading everything into context.

**Implementation:**
- SQLite FTS5 for keyword search
- sqlite-vec for vector similarity search
- Hybrid scoring: `final = (0.7 * vector_score) + (0.3 * text_score)`
- Embeddings generated locally (e.g., nomic-embed-text via Ollama) or via API

This allows queries like:
- "What does the user know about programming?" → finds all tech skills, projects, experience
- "What are the user's hobbies?" → finds interests, sports, music, reading

**Foundation for Discovery Scout:** The same semantic search infrastructure powers
the Discovery Scout (Section 4.6.1). When matching user profile against external
opportunities, the scout builds embedding-based queries from the KB to find
semantically relevant results — not keyword matches. This is why the search layer
must understand *meaning*, not just text. Design the embedding pipeline with this
dual use in mind from the start.

### 5.6 Taxonomy Normalization (Execution)

Category normalization is performed by the application layer, not by the LLM.

Write path ownership:
1. The LLM may propose `category`, `key`, and `value`.
2. The tool runtime validates payload shape and policy.
3. `TaxonomyNormalizer` maps category aliases to canonical categories.
4. Only canonical categories are persisted to `facts.category`.

Normalization sources (in order):
1. Built-in alias map (system defaults such as `job|work|employment -> experience`)
2. Project alias table (`category_aliases`)
3. New canonical category creation (allowed, but registered in `category_registry`)

Rules:
- LLM output is advisory. It never writes directly to SQLite.
- Unknown categories can be created, but must pass slug and length validation.
- Alias resolution is deterministic and testable (`input -> canonical output`).
- The original raw label is preserved in tool-call logs for audit/debug.

### 5.7 Confidence Policy

`confidence` is operational (not decorative). It affects publication and follow-up.

Thresholds:
- `>= 0.80`: eligible for onboarding preview/public proposal
- `0.50 - 0.79`: store as private or proposed; require confirmation before public
- `< 0.50`: private only, never auto-proposed for publication

Rules:
- Public page rendering includes only facts with `visibility='public'`.
- Onboarding preview may include `visibility='proposed'` facts above threshold.
- Confirmations, connector corroboration, or repeated evidence can raise confidence.

---

## 6. Page Engine

The page engine turns the knowledge base into a beautiful, living web page. The agent
does not generate raw HTML — it composes a **page configuration** from pre-built
components.

### 6.1 Design System — Components

A curated set of pre-built, responsive, accessible React components. Every component
follows OpenSelf's visual identity.

```
┌──────────────────────────────────────────────────────────────┐
│  COMPONENT LIBRARY                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  hero          Name, tagline, avatar, ContactBar              │
│                Tagline: role > interests > empty (no name dup)│
│                ContactBar: social links, email, languages     │
│                Two-col layout (name left, tagline right) on md│
│                Variants: large, compact, minimal             │
│                                                              │
│  bio           Narrative text about the person               │
│                Variants: short, full, quote-style            │
│                                                              │
│  skills        Competencies and abilities                    │
│                Variants: chips, bars, list, cloud            │
│                                                              │
│  projects      Things built or worked on                     │
│                Variants: grid, list, featured                │
│                                                              │
│  timeline      Chronological experience/education (legacy)    │
│                Deprecated: use experience + education instead │
│                Kept for backward compat, never newly generated│
│                                                              │
│  experience    Work history, roles, companies                │
│                Optional type: employment|freelance|client    │
│                client-type items routed to projects section  │
│                Period from start/end dates (formatFactDate)  │
│                status: "current" → localized "Present" label │
│                Freelance/freelance company redundancy guard   │
│                Variants: timeline                            │
│                Phase 1b (gated by EXTENDED_SECTIONS flag)    │
│                                                              │
│  education     Degrees, institutions, study periods          │
│                Period is optional — entries shown w/o dates   │
│                Variants: cards                               │
│                Phase 1b (gated by EXTENDED_SECTIONS flag)    │
│                                                              │
│  interests     Hobbies, passions, curiosities                │
│                Variants: icons, cards, list                  │
│                                                              │
│  achievements  Milestones, awards, certifications            │
│                Variants: badges, cards, timeline             │
│                                                              │
│  gallery       Future (post-MVP, optional)                   │
│                Disabled in MVP (avatar-only uploads)         │
│                                                              │
│  stats         Numerical highlights                          │
│                Variants: counters, cards, inline             │
│                e.g., "5 years experience, 12 projects,       │
│                       1,200 km run this year"                │
│                                                              │
│  at-a-glance   Fused stats + grouped skills + interests       │
│                Replaces standalone skills/stats/interests      │
│                when EXTENDED_SECTIONS=true                     │
│                Skills grouped by SKILL_DOMAINS dictionary     │
│                Variants: full                                 │
│                                                              │
│  social        Links to other platforms                      │
│                Variants: icons, buttons, list                │
│                                                              │
│  custom        Free-form section (title + rich text)         │
│                For anything that doesn't fit above           │
│                                                              │
│  reading       Books, articles, recommendations              │
│                Variants: shelf, list, featured               │
│                                                              │
│  music         Listening habits, playlists                   │
│                Variants: player-style, list, grid            │
│                                                              │
│  languages     Spoken languages with proficiency levels       │
│                Proficiency localized via L10N (8 langs × 5)  │
│                Variants: list                                │
│                Phase 1b (gated by EXTENDED_SECTIONS flag)    │
│                                                              │
│  activities    Sports, volunteering, events, clubs, hobbies  │
│                Variants: list (wide/half), compact (third)   │
│                Phase 1b (gated by EXTENDED_SECTIONS flag)    │
│                                                              │
│  contact       Contact information (email, phone, location)  │
│                Variants: card                                │
│                User-controlled: public/proposed facts composed│
│                (removed from SENSITIVE_CATEGORIES)            │
│                                                              │
│  footer        "Made with OpenSelf" + meta info        │
│                Always present (subtle, non-intrusive)        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

New components can be added over time. The agent automatically uses new components
when they become available and relevant to the user's data.

### 6.1.1 Component Ownership Model

Component quality comes from clear ownership boundaries:

| Role | Responsibility |
|---|---|
| Core product/design team | Defines design tokens, layout shell, spacing rhythm, typography system, and official components |
| Frontend/runtime maintainers | Enforces schemas, variant contracts, and render safety |
| Community authors | Proposes new components/themes via SDK and review pipeline |
| Agent | Selects from registered components and fills content, never invents raw layout primitives |

### 6.1.2 Extension Model (Core + Community)

MVP uses a closed component set. Extensibility is introduced in Phase 2+ through a
registry without giving up deterministic rendering.

Rules:
1. Core components keep short IDs (`hero`, `bio`, `projects`, ...).
2. Community components use namespaced IDs (`x.<author>.<component>`).
3. Every community component must include:
   - declared variants
   - `content` JSON Schema
   - accessibility notes
   - reference screenshots for visual regression
4. Unknown or unregistered component types are rejected at validation time.
5. Deprecating a component requires a migration path for existing pages.

### 6.1.3 Component SDK Contract (Phase 2+)

```ts
interface PageComponentModule {
  meta: {
    type: `x.${string}.${string}`;
    version: string;
    owner: string;
  };
  variants: string[];
  contentSchema: Record<string, unknown>; // JSON Schema
  render: React.ComponentType<{
    content: Record<string, unknown>;
    variant?: string;
  }>;
}
```

SDK guardrails:
- Components consume OpenSelf design tokens from the theme API.
- No global CSS resets, no external font injection, no tracking scripts.
- SSR/SSG compatibility is mandatory.
- Static export mode fallback is mandatory.

### 6.1.4 Community Component Execution & Sandboxing Strategy

Loading third-party React code dynamically at runtime is high-risk in Next.js
(both server-side and client-side). Therefore execution modes are explicit:

1. **Phase 2 default (recommended): build-time installation only**
   - Community component packages are pinned in lockfile and installed before build.
   - No runtime download/execute of remote component code from registry.
   - Registry distributes metadata, schemas, and package references; not live code execution.
2. **Phase 2 safe path for most community contributions: declarative DSL/templates**
   - Contributors can publish schema-driven blocks rendered by the core engine.
   - No arbitrary React execution required for standard use cases.
3. **Future dynamic runtime path (advanced): iframe sandbox**
   - If dynamic loading is needed, render untrusted blocks in cross-origin sandboxed iframe.
   - Communicate only via structured `postMessage` payloads (`PageConfig` subset).

Security posture:
- Untrusted code must never run in the same privilege context as app server logic.
- Access to secrets (`process.env`, internal network, server FS) is forbidden to community render paths.
- Brand policy checks (Section 15.12) apply regardless of execution mode.

### 6.2 Page Config

The agent produces a JSON configuration that describes the page. The renderer turns
this config into HTML. Rendering is deterministic: same config = same page, always.

The upstream AI generation step is probabilistic. For reproducibility, we persist
model/provider metadata and the generated config version on each page update.

### 6.2.1 Page Config Contract (Formal Schema)

`PageConfig` is validated before persistence and before rendering.

Reference TypeScript shape:

```ts
type ComponentType =
  | "hero" | "bio" | "skills" | "projects" | "timeline" | "interests"
  | "achievements" | "activities" | "stats" | "social" | "custom" | "reading"
  | "music" | "contact" | "footer"
  | "experience" | "education" | "languages";  // Phase 1b

type StyleConfig = {
  layout: "centered" | "split" | "stack";   // legacy — canonicalized to "centered" when layoutTemplate present
};

type SectionLock = {
  position?: boolean;     // slot assignment locked
  widget?: boolean;       // widget choice locked
  content?: boolean;      // content locked
  lockedBy: "user" | "agent";
  lockedAt: string;       // ISO timestamp
  reason?: string;
};

type SectionLockProposal = {
  position?: boolean;
  widget?: boolean;
  content?: boolean;
  proposedBy: "agent";
  proposedAt: string;
  reason?: string;
};

type Section = {
  id: string;
  type: ComponentType;
  variant?: string;                    // legacy — kept for backward compat
  widgetId?: string;                   // source of truth (overrides variant)
  slot?: string;                       // slot in the layout template
  lock?: SectionLock;                  // effective lock (only via authenticated API)
  lockProposal?: SectionLockProposal;  // pending proposal (via agent tool)
  content: Record<string, unknown>;
};

type PageConfig = {
  version: number;
  username: string;
  sourceLanguage: string;     // ISO 639-1 code (e.g., "it", "en", "de") — set from onboarding
  theme: string;              // legacy — kept for backward compat during transition
  surface: "canvas" | "clay" | "archive";   // Presence axis 1: visual canvas character
  voice: "signal" | "narrative" | "terminal"; // Presence axis 2: typographic personality
  light: "day" | "night";                    // Presence axis 3: light vs dark mode
  layoutTemplate?: LayoutTemplateId;   // top-level — "monolith" | "cinematic" | "curator" | "architect"
  style: StyleConfig;
  sections: Section[];
};
```

Runtime rules:
- Zod/JSON Schema validation is mandatory at write time.
- Each `type` has its own `content` validator (discriminated by component type).
  Validators are lenient: check structural shape (required array field exists), not item-level content.
- Invalid configs are rejected and never reach the renderer.
- The LLM receives schema-aware generation instructions and must output valid JSON.
- MVP uses a closed `ComponentType` allowlist (18 types as of Phase 1b).
- Extended section types (`experience`, `education`, `languages`, `activities` + stub implementations)
  are gated by `EXTENDED_SECTIONS=true` env var (default OFF). When OFF, the composer generates
  only the original 8 types. When ON, it generates all 18 types from facts.
- `timeline` is deprecated when `EXTENDED_SECTIONS` is ON — replaced by `experience` + `education`.
  Existing `timeline` sections still render via `Timeline.tsx` (backward compat).
- Phase 2+ may extend types via a component registry, but only if registered and
  schema-validated.

```json
{
  "version": 1,
  "username": "tommaso",
  "theme": "minimal",
  "surface": "canvas",
  "voice": "signal",
  "light": "day",
  "style": {
    "layout": "centered"
  },
  "sections": [
    {
      "id": "hero-1",
      "type": "hero",
      "variant": "large",
      "content": {
        "name": "Tommaso Bianchi",
        "tagline": "Builder, runner, espresso addict",
        "avatarMediaId": "media-avatar-main"
      }
    },
    {
      "id": "bio-1",
      "type": "bio",
      "variant": "full",
      "content": {
        "text": "Software engineer by day, marathon trainee by weekend. Currently building open-source tools that help people express who they are online. Based in Berlin, powered by espresso."
      }
    },
    {
      "id": "projects-1",
      "type": "projects",
      "variant": "grid",
      "content": {
        "items": [
          {
            "factRef": "project:openself",
            "title": "OpenSelf",
            "description": "Open-source AI that builds your personal page",
            "url": "https://github.com/...",
            "tags": ["TypeScript", "AI", "Open Source"]
          }
        ]
      }
    },
    {
      "id": "skills-1",
      "type": "skills",
      "variant": "chips",
      "content": {
        "groups": [
          { "label": "Tech", "items": ["TypeScript", "React", "Node.js", "Python"] },
          { "label": "Other", "items": ["Product thinking", "Italian cooking", "Public speaking"] }
        ]
      }
    },
    {
      "id": "interests-1",
      "type": "interests",
      "variant": "icons",
      "content": {
        "items": [
          { "name": "Running", "detail": "Training for Berlin Marathon", "icon": "running" },
          { "name": "Jazz", "detail": "Piano player, Coltrane fan", "icon": "music" }
        ]
      }
    },
    {
      "id": "social-1",
      "type": "social",
      "variant": "icons",
      "content": {
        "links": [
          { "platform": "github", "url": "https://github.com/tommaso" },
          { "platform": "instagram", "url": "https://instagram.com/tommaso" }
        ]
      }
    }
  ]
}
```

`factRef` is provenance metadata only. The renderer never performs KB lookups at render
time; it renders inline `content` from `PageConfig` only.

### 6.3 How the Agent Composes the Page

Page composition evolves in two stages, matching the project's phase progression:

#### Stage 1 — Deterministic Skeleton (Phase 0, current)

The skeleton composer (`composeOptimisticPage`) maps facts directly to sections using
localized templates. No LLM call is needed for page structure or content — the
composer is purely deterministic.

**Privacy gate** (entry point): The composer's first action is a global visibility filter —
only facts with `visibility === "public" || "proposed"` pass through. Private facts are
excluded before any section building begins. This is enforced at the top of
`composeOptimisticPage()`, not per-section.

**Fact validation gate**: All facts are validated at write time by `validateFactValue()`
(`src/lib/services/fact-validation.ts`). Per-category rules enforce value shapes,
reject placeholders (e.g., "N/A", "example.com"), reject date-placeholder patterns in
period fields (e.g., "YYYY-YYYY"), and ensure URLs/emails are strings.
Invalid facts throw `FactValidationError` and are never persisted. Both `createFact`
and `updateFact` in `kb-service.ts` enforce this gate.

```
1. Filter facts: global visibility filter (public + proposed only, exclude private)
   Also exclude sensitive categories (compensation, health, mental-health, private-contact, personal-struggle)
2. Decide which components are relevant
   (no projects? skip the projects section)
   (user has achievements? add achievements section)
3. For each component:
   a. Select relevant facts
   b. Fill localized template strings (deterministic, no LLM)
   c. Choose variant based on amount of data
   d. Filter empty items (no placeholder URLs, no "—" stats, no empty bios)
4. Assemble the page config JSON
5. Validate against schema
6. Save to database
7. Renderer produces the HTML page
```

**Section ordering (`EXTENDED_SECTIONS=true`):**
When extended sections are enabled, `composeOptimisticPage()` follows the D5 order:
hero → bio → at-a-glance → experience → projects → education → achievements → reading → music → activities → footer.
Social, contact, and language facts are absorbed into the hero's ContactBar (no standalone sections).
Legacy mode (flag off) preserves the original order: hero → bio → timeline → skills → projects → interests → social → footer.

**CollapsibleList pattern:**
Long sections (experience, projects, achievements, education) use the `CollapsibleList` wrapper
(`src/components/page/CollapsibleList.tsx`) to show the first item fully, with a summary line
and expand/collapse button for the rest (threshold: 3+ items). Summary construction per section:
experience = "role @ company", projects = "title", achievements = "title", education = "institution".

**ContactBar in hero:**
When `EXTENDED_SECTIONS=true`, the hero section includes social links, a contact email, and languages
directly in its content. Data injected by `buildHeroSection()` from social/contact/language facts.
Email selection: visibility-priority (public > proposed), first match used. Graceful degradation
when no facts exist.

**At a Glance (fused section):**
`buildAtAGlanceSection()` combines stats, skills, and interests into a single `at-a-glance` section.
Skills are grouped by a deterministic `SKILL_DOMAINS` dictionary (Frontend, Backend, Infra, Languages,
AI/ML, Design + Other fallback). Domain labels are hidden when only 1-2 groups exist. Standalone
skills/stats/interests sections are suppressed when extended mode is on.

**Freelance detection and stripping:**
`buildBioSection()` detects freelance roles via `FREELANCE_MARKERS` (a set of 10 keywords
across 5 languages: "freelance", "self-employed", "libero professionista", etc.). When
matched, the bio uses `bioRoleFreelanceFirstPerson(role)` from the L10N table — a
first-person template avoiding gendered occupational suffixes (e.g., German uses
"Ich arbeite freiberuflich als ${role}" instead of "Ich bin freiberufliche/r ${role}").
`stripFreelanceFromRole(role)` removes freelance tokens from the role string before
passing it to the template, preventing "freelance freelance" redundancy. If stripping
leaves an empty string, the bio falls back to the non-freelance `bioRoleFirstPerson`
template. The same logic is applied in `buildExperienceSection()` — when both role and
company match `FREELANCE_MARKERS`, the company field is suppressed.

**Gender-neutral L10N templates:**
All page-composer L10N templates use gender-neutral phrasing. Italian uses masculine
default ("Appassionato di", not "Appassionato/a di"), French avoids parenthetical gender
marks ("Passionné de", not "Passionné(e) de"), Spanish uses masculine default
("Apasionado por", not "Apasionado/a por"). No `/(e)` or `/a` patterns in any template.

**Role casing (`lowerRole()`):**
Job titles are lowercased for use in bio prose, except in languages where common nouns
are capitalized (German). The function preserves all-uppercase words (e.g., "CEO", "UX")
by checking `w === w.toUpperCase() && w.length > 1` per word.

**Centralized UI localization (`getUiL10n()`):**
Section headers, labels, and UI strings are localized via `getUiL10n(lang)` in
`src/lib/i18n/ui-strings.ts`. The function returns a `UiStrings` object with ~60 keys
for 8 languages (en, it, de, fr, es, pt, ja, zh), with English fallback for unknown
languages. Used by `composeOptimisticPage()` for section headers and labels, activity
type localization, proficiency level localization, activity frequency localization,
skill domain labels, and platform display names.

**Activity type localization:**
Activity types (volunteering, sport, club, etc.) are localized at composition time via
`getUiL10n(lang)` lookup keys (`actVolunteering`, `actSport`, `actClub`). Unknown
activity types pass through unchanged.

**Activity frequency localization:**
Activity frequency strings (daily, weekly, monthly, etc.) are localized via `FREQ_L10N`
map in `buildActivitiesSection()`. Keys: `freqDaily`, `freqWeekly`, `freqMonthly`,
`freqBiweekly`, `freqFrequent`, `freqRegularly`, `freqOccasionally`. Lookup is
case-insensitive. Unknown frequencies pass through unchanged.

**Skill domain label localization:**
`groupSkillsByDomain()` accepts a `language` parameter and translates domain labels
(Frontend, Backend, Infra, Languages, AI/ML, Design, Other) via `DOMAIN_L10N_KEY` map.
Keys: `domainFrontend`, `domainBackend`, `domainInfra`, `domainLanguages`, `domainAiMl`,
`domainDesign`, `domainOther`.

**Music artist deduplication:**
When a music fact's artist name matches the track title (case-insensitive), the artist
field is omitted from the composed section to avoid visual redundancy.

**Date formatting (`formatFactDate()`):**
`src/lib/i18n/format-date.ts` provides locale-aware date formatting for sections like
achievements and experience. Year-only strings ("2024") pass through; ISO dates with
Jan 1 are treated as year-only; other dates are formatted as localized "month year".

**Website in hero:**
Contact facts with `type: "website"` and social facts with `platform: "website"` are
added to the hero's `socialLinks` array with automatic `https://` prepend. Each link
carries a canonical `platform` field (for icon lookup) and a localized `label` field
(for display text, e.g., "Sito Web" in Italian). The `platformWebsite` key in
`getUiL10n()` provides the translation.

Translation to other languages is handled separately via the LLM translation pipeline
(see Section 6.7). This keeps composition fast and predictable.

#### Stage 2 — Hybrid Live Compiler (Phase 1c, implemented)

> **Status:** Implemented. Per-section LLM personalizer with three-layer data model,
> projection bridge, conformity checks, and proposal-based review.

The agent has memory layers operational (Tier 1-3, see Section 4.5) and builds
a rich understanding of the user through conversation. Page composition uses a
hybrid model where:

1. **Structure** remains governed by schema and layout contracts (safety/maintainability)
2. **Content** (copy, descriptions, tone) is generated per-section by the LLM, grounded
   in facts and informed by the agent's accumulated understanding of the user
3. **The result** is more personalized — pages differ person-to-person in narrative,
   emphasis, and voice, not just in data

**Three-layer data model** (migration 0018):
- `section_copy_cache` — Pure LLM output cache, content-addressed by `(owner_key, section_type, facts_hash, soul_hash, language)`. TTL cleanup via deep heartbeat.
- `section_copy_state` — Active approved personalized copy, read by the projection bridge. One row per `(owner_key, section_type, language)`.
- `section_copy_proposals` — Heartbeat-generated proposals for user review. Created by conformity analyzer, accepted/rejected via API.

**Pipeline:**
```
1. Skeleton composer produces valid page structure (deterministic)
2. Impact detector selects sections where factsHash differs from stored state
3. For each impacted section:
   a. Check section_copy_cache (factsHash + soulHash key)
   b. Cache miss → LLM personalizer rewrites content via generateObject
   c. Output validated against Zod schemas (PERSONALIZABLE_FIELDS, MAX_WORDS)
   d. On failure: keep deterministic skeleton content (graceful fallback)
   e. Store in cache + update section_copy_state
4. mergeActiveSectionCopy() applies personalized copy after projectCanonicalConfig()
5. Hash guard: factsHash + soulHash must match for copy to be used; stale → fallback
```

**Projection bridge** (`mergeActiveSectionCopy`):
The bridge applies personalized copy AFTER `projectCanonicalConfig()` produces the
deterministic base. This respects ADR-0009: the deterministic skeleton is always truth,
personalization is an overlay. If the underlying facts change (hash mismatch), the
personalized copy is discarded and the deterministic version is served until
re-personalization occurs.

**Conformity checks** (deep heartbeat):
A two-phase LLM process runs during `heartbeat_deep`:
1. `analyzeConformity()` — Reviews all active personalized copies against the soul profile. Detects 4 issue types: `tone_mismatch`, `contradiction`, `narrative_incoherence`, `style_drift`. Max 3 issues per check.
2. `generateRewrite()` — Produces a fixed version for each detected issue.
3. Results are stored as proposals via `createProposal()` — never auto-applied.
4. User reviews proposals via `GET /api/proposals` + `ProposalBanner` UI in builder.

**Key design decisions:**

- **Per-section LLM calls, not whole-page**: The agent has memory layers
  that carry user tone, preferences, and behavioral observations across sessions.
  This context is injected into each per-section call, ensuring consistent voice
  without needing to regenerate every section at once.

- **Fire-and-forget**: The `generate_page` tool triggers personalization asynchronously
  in `steady_state` mode only. Onboarding uses only the deterministic skeleton.
  Personalization runs after the page is already visible.

- **Drill-down before update**: The agent deepens a topic before rewriting a
  section. `classifySectionRichness()` detects thin sections (below item-count thresholds).
  The agent context includes a richness block listing thin sections, plus drill-down
  instructions that guide follow-up questions. All additional facts go into KB/memory.

- **Text-only merge**: `mergePersonalized()` only replaces string fields in section
  content. Arrays, objects, and structural fields are always preserved from the
  deterministic skeleton. This prevents the LLM from corrupting data structures.

- **Cost control**: Only impacted sections are regenerated per turn. Cache per-section
  output (same facts hash + same soul hash = cache hit). Budget guardrails from
  `llm_limits` apply to personalizer calls as well.

- **Voice integration**: Per-user voice preferences (tone, formality, perspective) are
  part of the agent's memory/config system (Section 4.1 `page_voice`), not a separate
  service. The personalizer reads them from the soul profile when generating section copy.

**Key files:**
- `src/lib/services/section-personalizer.ts` — Core LLM personalizer (`personalizeSections`)
- `src/lib/services/section-cache-service.ts` — Pure LLM cache CRUD + TTL cleanup
- `src/lib/services/section-copy-state-service.ts` — Active copy state CRUD
- `src/lib/services/personalization-projection.ts` — `mergeActiveSectionCopy()` bridge
- `src/lib/services/personalization-hashing.ts` — `computeHash`, `computeSectionFactsHash`
- `src/lib/services/personalization-impact.ts` — `detectImpactedSections()`
- `src/lib/services/personalization-merge.ts` — `mergePersonalized()` text-only merge
- `src/lib/services/personalizer-schemas.ts` — `PERSONALIZABLE_FIELDS`, Zod schemas, `MAX_WORDS`
- `src/lib/services/section-richness.ts` — `classifySectionRichness()` classifier
- `src/lib/services/conformity-analyzer.ts` — `analyzeConformity()`, `generateRewrite()`
- `src/lib/services/proposal-service.ts` — Proposal CRUD, staleness detection, accept/reject (owner-scoped: `acceptProposal`/`rejectProposal` require `ownerKey` for multi-user isolation)
- `src/app/api/proposals/` — Proposal API routes (GET, accept, reject, accept-all)
- `src/components/builder/ProposalBanner.tsx` — Proposal review UI
- `src/lib/db/personalizer-schema.ts` — Drizzle schema for 3 new tables
- `src/lib/i18n/ui-strings.ts` — Centralized UI localization (`getUiL10n`, ~60 keys × 8 languages)
- `src/lib/i18n/format-date.ts` — Locale-aware date formatting (`formatFactDate`)
- `src/lib/services/errors.ts` — `PublishError`, `extractErrorMessage()` — shared error utilities

### 6.3.0 Content Curation Layer (ADR-0017)

> **Status:** Implemented. Two-layer curation architecture for polishing page presentation
> without modifying immutable facts.

Facts are immutable (ADR: no `update_fact` tool). But page presentation often needs polish —
fixing capitalization ("openself" → "OpenSelf"), improving wording, adjusting tone.
The Content Curation Layer separates presentation from data.

**Layer 1 — Fact Display Overrides (pre-composition):**
- `fact_display_overrides` table stores per-fact presentation adjustments.
- `applyFactDisplayOverrides()` merges display values in memory BEFORE the page composer runs.
- Per-fact hash guard (`factValueHash`): if the underlying fact changes, the override is invalidated.
- Adding a new fact does NOT invalidate other facts' overrides (per-item isolation).
- `ITEM_EDITABLE_FIELDS` per-category allowlist restricts overridable fields to text only
  (no dates, URLs, structural data).

**Layer 2 — Section Copy State (post-composition, extended):**
- `section_copy_state.source` extended with `"agent"` (highest priority: agent > proposal > live).
- LLM personalizer (`personalizeSections`) skips sections where `source === "agent"`.
- Agents can write section-level curations directly.

**Unified agent tool:** `curate_content` routes to the appropriate layer:
- With `factId` → Layer 1 (per-item override via `fact_display_overrides`)
- Without `factId` → Layer 2 (section-level via `section_copy_state` with source="agent")

**Worker "page curator"** (`curate_page` job, weekly in `heartbeat_deep`):
- Iterates `SECTION_FACT_CATEGORIES`, skips agent-curated sections.
- `analyzeSectionForCuration()` — fast-tier LLM suggests improvements.
- Creates proposals via existing proposal system (never auto-applies).
- MAX_PROPOSALS_PER_RUN = 10. Uses owner's language from preferences.
- Orphan cleanup runs in `runGlobalHousekeeping()`.

**Proposal acceptance routing:**
- If `issueType === "curation"` and reason starts with `[item:factId]`,
  `acceptProposal()` routes to `fact_display_overrides` (with `filterEditableFields` guard).
- Other curation proposals route to `section_copy_state` normally.

**Key files:**
- `src/lib/services/fact-display-override-service.ts` — CRUD, `ITEM_EDITABLE_FIELDS`, `filterEditableFields`
- `src/lib/services/page-curation-service.ts` — LLM curation analysis (`analyzeSectionForCuration`)
- `src/lib/worker/handlers/curate-page.ts` — Worker handler for weekly curation
- `db/migrations/0033_fact_display_overrides.sql` — Table + job type CHECK update

### 6.3.1 Live Preview Strategy (Onboarding)

To keep the "builds in front of your eyes" experience without runaway LLM cost, onboarding
uses the deterministic skeleton composer:

1. **Optimistic preview per turn (no extra LLM call)**
   - After each user turn, renderer updates from extracted facts + deterministic templates
2. **Final synthesis before publish checkpoint**
   - One pass generates the complete page from all collected facts

In Phase 1 (after memory layers are active), onboarding preview can optionally trigger
the hybrid personalizer for a polished final draft before the publish checkpoint.

Section regeneration is incremental: only impacted sections are recomputed.

**SSE live preview (implemented):**

Preview updates are now delivered via Server-Sent Events (SSE), superseding the
polling-based approach from ADR-0005:

- **Endpoint**: `GET /api/preview/stream` — SSE with adaptive interval (1s base,
  backs off to 5s on idle), keepalive ping every 15s
- **Client**: `SplitView.tsx` uses `EventSource` as primary transport, falls back
  to polling (`GET /api/preview`) after 5 consecutive SSE errors
- **Payload**: Same preview data shape as the polling endpoint (config +
  publishStatus + configHash), sent as JSON in SSE `data` field
- **Privacy**: Both SSE and polling routes serve config from `projectCanonicalConfig()`
  (see Section 6.10), never `draft.config` raw. This prevents private facts baked into
  legacy drafts from leaking to the preview.
- **Dual-hash model**: Preview uses two hashes for different purposes:
  - `previewHash` = hash of `projectCanonicalConfig()` (all sections, including incomplete).
    Used for SSE change detection — triggers updates on any section change.
  - `publishableHash` = hash of `publishableFromCanonical()` (completeness-filtered).
    Sent as `configHash` in the event payload — used by the publish hash guard.
  This ensures the builder shows incomplete sections while the publish pipeline
  only considers complete ones for its hash comparison.
- **Builder preview mode**: `PageRenderer` receives `previewMode={true}` from SplitView,
  which skips the safety-net `filterCompleteSections()` re-filter. All sections are visible.

This reduces unnecessary network requests during idle periods while providing
near-instant updates when the agent modifies the page.

### 6.4 How the Agent Modifies the Page

When the user asks for changes in chat, the agent modifies the page config —
it does not regenerate everything:

| User says | Agent action |
|---|---|
| "Make it darker" | `style.colorScheme = "dark"` |
| "Put projects first" | Reorder `sections` array |
| "The bio is too long" | Regenerate bio content with shorter prompt |
| "I don't want to show skills" | Remove `skills` section |
| "Add a section for my books" | Add `reading` component, populate from KB |
| "Use a different color" | `style.primaryColor = "#..."` |
| "Make it more minimal" | `theme = "minimal"`, reduce variant complexity |
| "Use a two-column layout" | `set_layout("The Curator")` — re-assigns slots with lock awareness |
| "Use a bento grid" | `set_layout("The Architect")` — sections redistributed across grid slots |
| "Lock the skills section" | `propose_lock("skills-1")` — creates pending proposal for user confirmation |

### 6.5 OpenSelf Visual Identity

All pages share a recognizable DNA. Like how you can spot a Notion page or a Read.cv
profile at a glance, OpenSelf pages should be instantly recognizable.

**Shared across all themes:**
- Typography: limited font set (Inter, Source Serif, JetBrains Mono)
- Spacing rhythm: consistent 8px grid
- Border radius: consistent roundness
- Transitions: subtle, smooth animations
- Footer: small "Made with OpenSelf" badge with link
- Component structure: same HTML skeleton regardless of theme
- Responsiveness: all components work on all screen sizes

**Variable per theme:**
- Color palette (light, dark, custom accent)
- Font weights and sizes
- Density (spacious vs compact)
- Visual embellishments (borders, shadows, gradients)

### 6.5.0 Presence System (Implemented)

OpenSelf uses a **3-axis Presence System** to define visual identity. The three axes are independent and can be combined freely, but 9 curated **Signature Combos** provide opinionated starting points:

| Axis | Field | Values |
|------|-------|--------|
| Surface | `surface` | `canvas` (white/clean), `clay` (warm parchment), `archive` (dark/moody) |
| Voice | `voice` | `signal` (geometric sans), `narrative` (editorial serif), `terminal` (monospace) |
| Light | `light` | `day` (light backgrounds), `night` (dark backgrounds) |

**CSS application:** `OsPageWrapper` applies classes `.surface-{value}`, `.voice-{value}`, `.light-{value}` to `<body>`. CSS custom properties (`--page-bg`, `--page-fg`, `--page-accent`, `--h-font`, `--b-font`) are keyed by these classes in `globals.css`.

**Presence registry:** `src/lib/presence/registry.ts` defines all valid values and their CSS mappings. `src/lib/presence/combos.ts` defines the 9 curated combinations.

**DB:** Migration `0025_presence_system.sql` — `surface`, `voice`, `light` columns on the `page` table.

**Prompt integration:** `src/lib/presence/prompt-builder.ts` injects presence context into agent system prompt.

**Built-in themes (implemented):**

| Theme | Description | Status |
|---|---|---|
| `minimal` | Clean, lots of whitespace, monochrome with one accent color | Implemented |
| `warm` | Soft colors, rounded elements, friendly feel | Implemented |
| `editorial-360` | Luxury digital magazine aesthetic (Stripe/Linear-inspired). Unified `.section-label` headers with accent bar, scroll reveal animations, variable vertical rhythm (hero 80px, narrative 48px, dense 32px), dot separators, hero stagger animations, hover-underline-grow links. Heading font: `var(--font-sans), system-ui` | Implemented |

The legacy theme system (minimal/warm/editorial-360) is preserved for backward compatibility during the transition period. Long-term, `surface × voice × light` fully replaces it. `OsPageWrapper` is the new composition root — it applies presence classes to `<body>` and wraps both builder preview and public page renderer.

**Shared CSS utility classes** (defined in `globals.css`, used across all surfaces):
- `.section-label` — Unified section header (11px uppercase, `letter-spacing: 0.2em`, accent bar via `::before`)
- `.entry-dot-separator` — Middle-dot separator between list entries
- `.theme-reveal` / `.theme-reveal.revealed` — Scroll-triggered reveal animations via IntersectionObserver. **Builder preview bypass**: when `previewMode` is true, the observer is skipped entirely and `.preview-mode .theme-reveal` CSS forces `opacity: 1`. Published pages retain the full animation.
- `.hover-underline-grow` — Left-to-right underline animation on hover (`scaleX(0)` → `scaleX(1)`)
- `prefers-reduced-motion` overrides disable all animations for accessibility

**Aspirational themes (not yet implemented):**

| Theme | Description |
|---|---|
| `bold` | Strong contrast, large typography, confident |
| `elegant` | Serif fonts, refined spacing, understated |
| `hacker` | Monospace, dark background, terminal aesthetic |

Users can request presence changes in conversation via `set_theme` (surface/voice/light) or `update_page_style`. Source of truth for valid presence values: `src/lib/presence/registry.ts`. Legacy `AVAILABLE_THEMES` in `src/lib/page-config/schema.ts` preserved for backward compat.

### 6.5.1 Non-Negotiable Brand Guardrails

Even with community themes/components, public pages keep these immutable constraints:

- Shared layout shell and footer badge remain present
- Token contract controls typography families, spacing scale, radius scale, and motion
- Semantic skeleton stays consistent (`hero`, `section`, heading hierarchy, link patterns)
- Accessibility floor: keyboard navigation, visible focus states, and WCAG-level contrast
- Performance budget applies to every theme/component combination

If a component/theme violates guardrails at runtime, the page falls back to a safe
core component variant and logs an operational event.

### 6.5.2 Community Certification Flow (Phase 2+)

1. Author submits package + manifest + screenshots.
2. CI runs schema checks, SSR snapshot tests, visual regression, and a11y checks.
3. Human review verifies style coherence and safety.
4. Component status becomes `certified`, `experimental`, or `rejected`.
5. Default public pages can use only `core` and `certified` components.

### 6.6 Renderer

The renderer is a React component that takes a page config and produces HTML.
It is **completely decoupled** from the AI:

```
Page Config (JSON) → Renderer (React) → HTML/CSS
```

This means:
- The page can be rendered server-side (SSR/SSG) for performance and SEO
- The page can be exported as static HTML (no server needed)
- The renderer can be tested independently (input JSON → assert output)
- Third parties can build alternative renderers

### 6.6.1 Layout Template Engine

> **Status:** Implemented. Anticipated from Phase 1b (NEXT-8) and completed ahead of schedule.
>
> **Execution note:** Layout phases 1-4 are implemented. **Layout phase 5 is intentionally
> deferred until the end of Phase 1** (after Phase 1 close/stabilization).

The layout template engine separates **spatial structure** (where sections go) from
**visual styling** (how they look). This decoupling allows the same theme to work with
any layout template, and any layout template to work with any theme.

**Architecture:**

```
PageConfig
    │
    ├─ layoutTemplate ──→ Layout Registry ──→ LayoutComponent (CSS Grid structure)
    │                                              │
    │                                              ├─ groupSectionsBySlot()
    │                                              │
    ├─ theme ──────────→ Theme Registry ──→ ThemeLayout (visual wrapper: colors, fonts, animations)
    │                                              │
    └─ sections ───────→ Widget Registry ──→ variant resolution ──→ SectionComponent
```

**Key separation:**
- `LayoutComponent` controls *where* sections go (CSS Grid areas, columns, ordering)
- `ThemeLayout` controls *how* they look (background, typography, animations, texture)
- These are composed, not fused: `ThemeLayout` wraps `LayoutComponent`

**Layout Templates (4):**

| Template ID | User-Facing Name | Description | Grid |
|---|---|---|---|
| `monolith` | The Monolith | Classic single-column (default, backward-compatible) | `flex-col`, max-w-5xl |
| `cinematic` | Cinematic | Immersive snap-scrolling journey | snap-y sections |
| `curator` | The Curator | Two-column editorial split-screen | `grid-cols-12` (7/5 split) |
| `architect` | The Architect | Dynamic asymmetric bento grid | `grid-cols-6` |

Each template defines named **slots** with constraints:
- `size`: wide, half, third (determines compatible widgets)
- `required`: whether the slot must have content (hero, footer)
- `maxSections`: capacity limit per slot
- `accepts`: which section types fit in this slot
- `order` / `mobileOrder`: rendering order for desktop and mobile

**Widget Registry:**

`widgetId` is the source of truth for variant resolution. Each widget has:
- Section type compatibility (e.g., `skills-chips` works with `skills` sections)
- Slot size compatibility (e.g., `skills-chips` fits in `half` and `third` slots)
- Item count constraints (`minItems`, `maxItems`)

Resolution: `section.widgetId` → widget variant (source of truth). Fallback: `section.variant` (legacy).

**Slot Assignment (`assignSlotsFromFacts`):**

Deterministic, lock-aware algorithm:
1. Locked sections keep their current slot
2. Hero → heroSlot, footer → footerSlot (always, regardless of metadata)
3. **Soft-pin via `draftSlots`**: when provided, sections try to keep their previous slot assignment (Phase 2). If the slot exists in the new template and has capacity, the section stays put.
4. Remaining sections ranked by **affinity-based slot scoring** with anti-clustering
5. Overflow sections go to the main slot as fallback
6. Auto-repair (draft only): changes widget/slot, **never truncates user content**

All callers that switch layouts (draft/style route, `set_layout` tool, `generate_page` tool)
build a `draftSlots` map from existing sections before calling `assignSlotsFromFacts()`.
This prevents section slot loss when switching to templates with stricter constraints
(e.g., The Architect's half/third slots).

**Architect Layout Refactoring (Phase 1d):**

The slot assignment engine was upgraded from simple type-based routing to an
affinity-based ranking system for the non-monolith layouts (curator, architect):

1. **Affinity scores** — Each slot definition includes an optional `affinity` map
   (`Record<ComponentType, number>`, 0-1 scale) expressing how well a section type
   fits in that slot. Example: `bio` has high affinity for sidebar slots, `projects`
   for wide main slots.
2. **Anti-clustering** — `rankSlotsForSection()` applies a diversity penalty to slots
   that already contain sections of the same type, preventing all similar sections
   from clustering in one area.
3. **Compact widget variants** — New compact widgets for `reading`, `education`,
   `achievements`, and `music` sections. These fit in `third`-sized slots, enabling
   denser bento/sidebar layouts. Components check `variant === "compact"` for
   condensed rendering.
4. **Expanded accepts** — Slot `accepts` arrays expanded across all 3 templates to
   accommodate more section types in more positions, especially for architect.
5. **Strict accepts check** — The explicit slot path now validates `accepts` before
   assignment. Sections that cannot fit any slot emit an `unplaceable_section`
   warning instead of silently falling back.
6. **Backfill script** — `scripts/backfill-architect-slots.ts` re-assigns existing
   drafts to the new affinity-based slot layout.

**Lock System:**

Granular per-section locks (`position`, `widget`, `content`):
- **User locks** (via `POST /api/draft/lock`): only user can override
- **Agent proposals** (via `propose_lock` tool): creates pending `lockProposal`, not an actual lock
- Central enforcement: `canMutateSection(section, mutation, actor)` called by all mutation paths

**Validation Gates (4 points):**

| Point | File | Behavior |
|---|---|---|
| `composeOptimisticPage()` | `page-composer.ts` | Error → fallback to vertical. Warning → log |
| `set_layout` tool | `tools.ts` | Error → reject change. Warning → return suggestion |
| `update_page_style` tool | `tools.ts` | Error → reject. Warning → log |
| `prepareAndPublish()` | `publish-pipeline.ts` | Error → throw PublishError. Warning → publish with log |

Severity policy: `missing_required` / `incompatible_widget` = **error** (blocking);
`overflow_risk` / `too_sparse` = **warning** (non-blocking).

**Renderer Decoupling:**

ThemeLayout (e.g., `EditorialLayout`) is a pure visual wrapper — background, texture,
border, scroll reveal. It does **not** control flex direction, gap, or max-width.
LayoutComponent (e.g., `VerticalLayout`, `BentoLayout`) handles the CSS Grid structure.

`VerticalLayout` reproduces the original `max-w-5xl flex-col gap-32` layout, so pages
without `layoutTemplate` render **identically** to before.

**Mobile:** All grids collapse to single column below 768px, with ordering driven by
`mobileOrder` from the registry (not hardcoded in components).

**Backward Compatibility:**
- Pages without `layoutTemplate` → always `"monolith"` (no legacy mapping)
- `style.layout` field retained in schema but **ignored** for template resolution
- When `layoutTemplate` is present, `style.layout` is canonicalized to `"centered"` by `normalizeConfigForWrite()`
- All new fields (`widgetId`, `slot`, `lock`, `lockProposal`, `layoutTemplate`) are optional

**Layout Alias Resolution:**
`resolveLayoutAlias()` in `contracts.ts` maps layout names to canonical IDs. Case-insensitive
with a 3-step resolution: (1) check alias map (user-facing names + legacy aliases),
(2) check if normalized value is a canonical ID, (3) fallback to trimmed input.

Aliases: `"The Architect"` → `"architect"`, `"The Curator"` → `"curator"`,
`"The Monolith"` → `"monolith"`, `"The Cinematic"` → `"cinematic"`.
Legacy: `"bento"` / `"bento-standard"` → `"architect"`, `"sidebar"` / `"sidebar-left"` → `"curator"`,
`"vertical"` → `"monolith"`.

**Key files:**
- `src/lib/layout/contracts.ts` — pure constants, `resolveLayoutAlias()` (zero deps, breaks import cycles)
- `src/lib/layout/types.ts` — FullSlotDefinition, LayoutTemplateDefinition
- `src/lib/layout/registry.ts` — template definitions + resolveLayoutTemplate()
- `src/lib/layout/widgets.ts` — widget definitions + resolveVariant()
- `src/lib/layout/quality.ts` — structural validator with severity policy
- `src/lib/layout/assign-slots.ts` — slot assignment engine
- `src/lib/layout/group-slots.ts` — groupSectionsBySlot() for renderer
- `src/lib/layout/lock-policy.ts` — canMutateSection() central enforcement
- `src/lib/layout/validate-adapter.ts` — Section[] → SlotAssignment[] bridge for publish gate
- `src/lib/page-config/normalize.ts` — normalizeConfigForWrite() for all write paths
- `src/components/layout-templates/` — VerticalLayout, SidebarLayout, BentoLayout

### 6.6.2 Layout Phase 5 (Deferred — Post Phase 1)

> **Start condition:** begin only **after Phase 1 is formally complete** and the
> current layout engine (phases 1-4) is stable in production.

Phase 5 extends the layout engine with autonomous behavior (heartbeat + memory)
without regressing user control.

**Technical scope:**

1. **Heartbeat lock-safe mutations**
   - Heartbeat runs (`heartbeat_light`, `heartbeat_deep`) can suggest/apply draft updates,
     but every mutation must pass `canMutateSection(section, mutation, actor="heartbeat")`.
   - Assignment path must pass locks explicitly:
     `assignSlotsFromFacts(template, sections, extractLocks(sections), { repair: false })`.
   - Hard rule: never mutate locked fields (`position`, `widget`, `content`) when locked.
   - Heartbeat writes only to draft; it never bypasses publish flow.

2. **Memory-backed layout preferences**
   - Persist explicit layout choices and lock confirmations as Tier-3 memories
     (`saveMemory`, `memoryType="preference"`, category like `"layout"` / `"lock-policy"`).
   - Heartbeat reads active preferences (`getActiveMemories`) before proposing any structural change.
   - Respect existing memory safeguards (dedup, cooldown, per-owner quota).

3. **Proposal-first behavior for locked sections**
   - If heartbeat is blocked by a lock, it must create a pending proposal
     (no direct override).
   - User approval promotes the proposal; user rejection records feedback memory
     to avoid repeated unwanted proposals.
   - Proposal lifecycle keeps the same safety model already used for soul proposals
     (pending, accepted/rejected, expiry).

4. **Validation + safety before heartbeat writes**
   - Reuse the same layout validation pipeline used for publish:
     `resolveLayoutTemplate` → `toSlotAssignments` → `validateLayoutComposition`.
   - No silent content truncation; auto-repair remains limited to widget/slot changes.
   - On validation errors: abort mutation, log event, keep draft unchanged.

5. **Budget and scheduling controls**
   - Keep existing budget gates (`checkBudget`, `checkOwnerBudget`) as mandatory.
   - Heartbeat should be change-driven when possible (skip expensive work if no meaningful delta).
   - Preserve per-owner/day accounting via `heartbeat_runs`.

6. **Observability**
   - Add explicit events for layout heartbeat actions:
     `heartbeat_layout_skipped_locked`, `heartbeat_layout_proposed`,
     `heartbeat_layout_applied`, `heartbeat_layout_validation_failed`.
   - Track proposal counts, skipped-lock counts, and validation-failure rates.

7. **Test plan for Phase 5**
   - Unit: heartbeat actor lock enforcement for all mutation kinds.
   - Integration: heartbeat run with mixed locked/unlocked sections, ensuring only allowed
     sections mutate.
   - Integration: locked-section change produces proposal (not mutation).
   - Regression: no content truncation under heartbeat path.
   - Budget tests: heartbeat exits cleanly when global or owner budget is exceeded.

### 6.7 Localization & Translation

OpenSelf has two separate localization systems:

1. **UI L10N (deterministic):** Section headers, labels, proficiency levels, and activity
   types are localized at composition time via `getUiL10n(lang)` in `src/lib/i18n/ui-strings.ts`.
   45 keys × 8 languages (en, it, de, fr, es, pt, ja, zh) with English fallback. No LLM
   call — pure lookup table. Handles: section headers (e.g., "Esperienza" vs "Experience"),
   proficiency levels (e.g., "madrelingua" vs "native"), activity types (e.g., "volontariato"
   vs "volunteering"), At-a-Glance labels.

2. **Page translation (LLM-based):** Full page content translation via `translatePageContent()`.

The page is written in the owner's language (`factLanguage` tracked in user preferences).
When the owner switches the display language in the Settings panel, content is translated
via LLM and served from a hash-based cache.

**Current implementation (owner-side):**
1. Owner changes language in Settings → triggers `translatePageContent()`.
2. The function collects translatable sections (skips `footer`, `social`), computes
   `SHA-256(JSON of sections)`, and queries the `translation_cache` table.
3. **Cache hit** → returns cached translated sections immediately. No LLM call.
4. **Cache miss** → calls `generateText` (same model provider as chat) with a
   professional localization prompt → stores result in `translation_cache` → returns.
5. On any error (LLM failure, JSON parse, cache I/O), returns the original config
   unchanged — graceful degradation over hard failure.

**Cache design:**
- Table: `translation_cache` with composite PK `(content_hash, target_language)`.
- Hash-based, zero explicit invalidation: when facts change → sections change →
  hash changes → old cache entries are never hit again.
- Each entry is ~1-2 KB. A page with 8 languages generates at most 7 entries.
- No TTL or cleanup needed at current scale. Future: prune entries > 90 days if needed.

**What gets translated:** section content (bio text, descriptions, taglines, skill
labels, interest names, section titles). What does **not** get translated: person
names, company names, proper nouns, URLs, tech acronyms (AI, API, TypeScript, etc.),
`footer` and `social` section types.

The source language is stored in user preferences (`factLanguage`). The agent sets
it based on the user's onboarding language selection.

**Public page visitor translation (implemented — Phase 1d, NEXT-15):**

The public page auto-translates content for visitors whose browser language differs
from the page's source language:

1. **Language detection:** `parseAcceptLanguage()` parses the `Accept-Language` header
   with q-weight sorting, region-to-base fallback (e.g., `fr-CA` → `fr`), and 8
   supported languages. Bot detection (Googlebot, Bingbot, etc.) skips translation
   for SEO.
2. **Language precedence:** `?lang=` param > `os_lang` cookie > `Accept-Language` >
   page `sourceLanguage` (stored at publish time, migration 0024).
3. **Translation banner:** `TranslationBanner` component shows "Machine-translated
   from {language}. [View original]" with link to `?lang=original`.
4. **Cache:** Translation cache key hardened with composite SHA-256 of content hash +
   source language + target language + model ID. Same `translation_cache` table —
   same hash = instant on repeat visits.
5. **Bypass:** `?lang=original` serves the original content without translation.

#### 6.7.1 Translation Cost Model

- 8 supported languages × N pages = up to 7N cached translations.
- Each translation: ~500 tokens input + ~400 output ≈ $0.001 (Haiku).
- 1,000 pages fully translated: ~$7 one-time, then free from cache.
- **Risk**: if languages grow beyond 8, or if pages grow very long (50+ sections),
  cost per translation rises. Long pages with complex content could reach $0.01-0.05
  per translation.
- **Mitigation**: budget guardrails (`llm_limits` table), cache eliminates repeated
  costs, hard cap on supported languages.

### 6.8 Activities Component

The `activities` component shows recent activities, events, and places. It supports
automatic geolocation enrichment.

**Example content:**
```json
{
  "id": "activities-1",
  "type": "activities",
  "variant": "feed",
  "content": {
    "items": [
      {
        "factRef": "activity:ai-conf-2026",
        "title": "Spoke at AI Conference 2026",
        "date": "2026-02-15",
        "location": {
          "name": "Palazzo delle Esposizioni",
          "city": "Rome",
          "country": "IT",
          "coords": [41.8992, 12.4892]
        },
        "tags": ["conference", "AI", "speaking"]
      }
    ]
  }
}
```

**Geolocation enrichment:** When the user mentions a place in conversation
("yesterday I was at the AI conference at Palazzo delle Esposizioni"), the agent:
1. Extracts the venue name and context
2. Resolves coordinates via geocoding (OpenStreetMap Nominatim or similar)
3. Creates an `activity` fact with structured location data
4. Updates the activities section on the page

**Potential for connection:** Activity data (events attended, places visited) can be
used to suggest connections with other OpenSelf users who attended the same events
or have similar activity patterns. This happens only with explicit opt-in and through
the federated discovery layer (see Section 6.9).

### 6.9 Discovery & Federation

**The problem:** If everyone hosts their own page independently, how do people find
each other? On LinkedIn you search a name and find profiles. But with decentralized
pages hosted in different places, there is no central search.

**The solution: an opt-in federated directory.**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Page A      │     │  Page B      │     │  Page C      │
│  (self-host) │     │  (Vercel)    │     │  (cloud)     │
│              │     │              │     │              │
│  Registers → │     │  Registers → │     │  Registers → │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                  DISCOVERY REGISTRY                       │
│                                                          │
│  - Public profile index (name, tagline, tags, location)  │
│  - Search by name, skill, interest, location             │
│  - Activity-based suggestions (same events, similar      │
│    interests) — opt-in only                              │
│  - No ranking, no algorithm, no engagement metrics       │
│                                                          │
│  Protocol: each page maintains a signed registration     │
│  key that proves ownership and allows updates.           │
│  Registry stores only public metadata, never full KB.    │
└──────────────────────────────────────────────────────────┘
```

**How it works:**
1. When a page is published, the owner can opt-in to register with the discovery
   directory (hosted at `directory.openself.com` or community-run instances).
2. The page sends a signed registration payload containing only public metadata:
   name, tagline, skills, interests, location, page URL.
3. The directory indexes this metadata for search.
4. Each page maintains a **registration key** (asymmetric keypair) that proves
   ownership and allows updates/deregistration.
5. The directory never stores private facts or full page content — only the
   public index card.

**Activity-based discovery (opt-in):**
- Users who attended the same event can discover each other
- Users with similar skill/interest profiles can be suggested
- All suggestions are private (shown only to the individual), never public
- Users can disable discovery entirely

**Federation:** Multiple directory instances can sync with each other, so
community-run directories can interoperate with the main one.

This is designed in Phase 3 alongside the protocol layer.

### 6.10 Shared Canonical Projection

> **Status:** Implemented. Single source of truth for preview and publish page config.

Pages are fact projections. The canonical config is always recomposed from facts —
never read from a cached `draft.config`. This prevents private facts from leaking
through stale draft data.

**Core functions** (`src/lib/services/page-projection.ts`):

```typescript
// Single publishable filter — used by BOTH projection AND promote loop
filterPublishableFacts(facts: FactRow[]): FactRow[]
// Returns facts where visibility is public/proposed AND category is not sensitive

// Canonical projection: filter → compose → preserve metadata → slot assign (NO completeness filter)
// Shows ALL sections including incomplete — used for builder preview display
projectCanonicalConfig(
  facts: FactRow[], username: string, factLanguage: string,
  draftMeta?: DraftMeta,
): PageConfig

// Thin wrapper: applies completeness filter to canonical config
publishableFromCanonical(canonical: PageConfig): PageConfig
// { ...canonical, sections: filterCompleteSections(canonical.sections) }

// Convenience: canonical + completeness filter in one call
projectPublishableConfig(
  facts: FactRow[], username: string, factLanguage: string,
  draftMeta?: DraftMeta,
): PageConfig
// Equivalent to: publishableFromCanonical(projectCanonicalConfig(...))
```

**Usage:**
- `/api/preview` and `/api/preview/stream` call `projectCanonicalConfig()` for the display
  config (all sections visible), then `mergeActiveSectionCopy()` to apply personalized
  content (Phase 1c), then `publishableFromCanonical()` for the hash guard.
- The publish pipeline (`prepareAndPublish`) uses `projectPublishableConfig()` for the
  canonical hash check before any side-effects, then `mergeActiveSectionCopy()` for
  personalized content in the rendered config.

**Personalization bridge** (`mergeActiveSectionCopy`, Phase 1c):
After `projectCanonicalConfig()` produces the deterministic base, `mergeActiveSectionCopy()`
queries `section_copy_state` for active personalized copies and overlays text-only fields.
Hash guard: each copy's `factsHash` + `soulHash` must match the current state; stale
entries are skipped (deterministic fallback). See Section 6.3 Stage 2 for full details.

**Two configs in publish flow:**
1. **Canonical config** — composed from publishable facts in `factLanguage`, no translation.
   Used for hashing (`computeConfigHash`). Compared against `expectedHash` from frontend.
2. **Rendered config** — canonical + optional translation to target language. This is what
   gets persisted via `upsertDraft` and displayed on the published page.

**Concurrency guard (expectedHash):**
The frontend stores `configHash` from the latest preview response. On publish, it sends
`expectedHash` in the request body. The pipeline computes the canonical hash and rejects
with `STALE_PREVIEW_HASH` (409) if they don't match — zero side-effects on mismatch.

**Username guard:**
In `mode: "publish"`, the pipeline checks `draft.username === username`. Mismatch throws
`USERNAME_MISMATCH` (409). This check is skipped in `mode: "register"` because the draft
username hasn't been updated yet at that point.

**Publish promotes all proposed → public:**
Inside an atomic SQLite transaction, the pipeline:
1. Promotes all `proposed` facts to `public` via `setFactVisibility`
2. Persists the rendered (translated) config via `upsertDraft`
3. Calls `requestPublish` + `confirmPublish`

If the hash guard fails, none of these steps execute.

**`PublishResult` type contract:**
`prepareAndPublish()` returns `{ success: true, username: string, url: string }`.
Both `/api/publish` and `/api/register` consume this type — callers must not access
fields outside this contract (e.g., no `regenerated` property exists on the result).

**Multi-session support:** `prepareAndPublish` accepts optional `ownerKey` and `readKeys`
parameters. Facts are read from the full owner scope (`getActiveFacts(ownerKey, readKeys)`),
and personalization is applied using the correct profile ID. Journey state pin
(`updateJourneyStatePin(sessionId, "active_fresh")`) is now applied inside the pipeline
after publish success, not in `request_publish` — this ensures consistent milestone marking
regardless of entry point.

**Publish pin invalidation:** When an authenticated user with a pinned pre-publish state
(`draft_ready`, `returning_no_page`, `first_visit`) has a published page, the pin is
automatically cleared on the next request via `assembleBootstrapPayload`. The system
re-detects their state (advancing to `active_fresh`), preventing users from getting stuck
in pre-publish guidance loops after publishing. Only applies to authenticated users —
anonymous users keep their pre-publish pin.

**Async username validation:** `request_publish` and `publish_preflight` now use
`validatePublishUsername()` which performs both format and availability checks in
multi-user mode. `publish_preflight` also includes a `hasValidLayout` gate and
`layoutIssues` in its quality report.

**Key files:**
- `src/lib/services/page-projection.ts` — `filterPublishableFacts`, `projectCanonicalConfig`, `publishableFromCanonical`, `projectPublishableConfig`
- `src/lib/services/publish-pipeline.ts` — `prepareAndPublish` (hash guard + promote + publish), `PublishResult` type
- `src/lib/visibility/policy.ts` — `SENSITIVE_CATEGORIES` (exported `ReadonlySet<string>`)
- `src/components/layout/SplitView.tsx` — stores `configHash` state, sends `expectedHash`

### 6.11 Section Completeness

> **Status:** Implemented. Filters incomplete sections from published pages.

`isSectionComplete(section)` (`src/lib/page-config/section-completeness.ts`) checks
whether a section has meaningful content. Hero and footer always pass. Other section
types require at least one non-empty item, group, link, method, or text field.

**Usage:**
- `filterCompleteSections(sections)` — returns only complete sections
- `publishableFromCanonical()` applies this filter (see Section 6.10).
  `projectCanonicalConfig()` does NOT filter — builder preview shows all sections.
- `PageRenderer.tsx` applies this filter in non-preview mode (published pages) as a
  safety net. Preview mode (`previewMode={true}`) skips the filter.
- The publish pipeline uses `projectPublishableConfig()` which includes the completeness
  filter via `publishableFromCanonical()`.

The `at-a-glance` section type has a dedicated completeness check: it requires at least one of
`stats` (non-empty array), `skillGroups` (non-empty array), or `interests` (non-empty array).
Validated in both `isSectionComplete()` and `validatePageConfig()`.

### 6.12 Maintenance Scripts

Two one-shot scripts for data hygiene on existing databases:

**`scripts/sanitize-drafts.ts`** — Recomposes all draft configs from facts using
`projectPublishableConfig()`. Ensures no private facts are baked into `draft.config`
from legacy writes. Modes: `--dry-run` (default), `--export` (JSON report),
`--apply` (update DB). Owner-scoped, idempotent.

**`scripts/cleanup-facts.ts`** — Validates all facts against `validateFactValue()`
and reports/removes invalid entries. Groups errors by type for summary.
Modes: `--dry-run` (default), `--export` (JSON report), `--apply` (delete invalid).

---

## 7. Connectors

Connectors are modular plugins that pull data from external services into the
knowledge base. They are optional — OpenSelf works perfectly without any
connectors, using conversation alone.

### 7.1 Architecture

```
┌───────────────┐     ┌──────────────────┐     ┌──────────────┐
│  External     │     │   CONNECTOR      │     │  Knowledge   │
│  Service      │────▶│   DEFINITION     │────▶│  Base        │
│  (GitHub API, │     │                  │     │              │
│   Spotify,    │     │  - Authenticate  │     │  Facts (T1)  │
│   Strava,     │     │  - Fetch/Parse   │     │  via batch   │
│   RSS feed,   │     │  - Map to facts  │     │  writer      │
│   LinkedIn    │     │  - syncFn /      │     │              │
│   ZIP export) │     │    importFn      │     │  Events (T4) │
│               │     │                  │     │  via event   │
│               │     │                  │     │  writer      │
└───────────────┘     └──────────────────┘     └──────────────┘
                              │
                      ┌───────┴────────┐
                      │  WORKER JOB    │
                      │ connector_sync │
                      │  (daily, per   │
                      │   owner)       │
                      └────────────────┘
```

Three connector modes:
1. **Sync connectors** (GitHub, RSS, Spotify, Strava) — periodic worker-based sync via `syncFn`. OAuth or URL-based authentication, cursor-based incremental updates, scheduled daily via `connector_sync` job.
2. **Import connectors** (LinkedIn ZIP) — one-shot user-initiated import via API upload. No OAuth, no scheduling.
3. **URL input connectors** (RSS) — user provides a feed URL (no OAuth). Syncs periodically like OAuth connectors.

Each connector produces **dual output**:
1. **Facts (Tier 1 memory)** — structured knowledge via `batchCreateFacts()` with `actor: "connector"`
2. **Episodic events (Tier 4 memory)** — timeline events via `batchRecordEvents()` with source provenance

The connector pipeline:
1. **Authenticates** with the external service (OAuth, URL input) or receives data directly (file upload)
2. **Fetches/parses** relevant data (API calls, XML parsing, ZIP extraction)
3. **Maps** raw data into facts using connector-specific mappers
4. **Writes** facts to the KB via `batchCreateFacts()`
5. **Generates episodic events** for significant activities (new repos, blog posts, workouts, taste shifts)
6. **Writes** events via `batchRecordEvents()` with intra-batch dedup, DB dedup, per-event error isolation
7. **Tracks provenance** via `connector_items` table (connector_id → fact_id + event_id mapping)

**First-sync baseline rule:** On a connector's first sync (`lastSync` is null), facts are created but NO episodic events are emitted. This prevents flooding the user's timeline with pre-existing data. Event dedup entries are seeded in `connector_items` so subsequent syncs correctly detect truly new items.

**Dream Cycle isolation:** Connector-sourced events (`source != 'chat'`) are excluded from Dream Cycle pattern detection. Only chat-originated events trigger habit/pattern proposals.

### 7.2 Connector Definition

Every connector registers a `ConnectorDefinition` in the registry:

```typescript
type ConnectorDefinition = {
  type: string;              // e.g., "github", "rss", "spotify", "strava", "linkedin_zip"
  displayName: string;       // e.g., "GitHub", "Blog / RSS"
  supportsSync: boolean;     // periodic worker sync
  supportsImport: boolean;   // one-shot import (LinkedIn ZIP)
  syncFn?: (connectorId: string, ownerKey: string) => Promise<SyncResult>;
  eventMapperFn?: (newFacts: FactInput[], ctx: EventMapperContext) => EpisodicEventInput[];
};

type SyncResult = {
  factsCreated: number;
  factsUpdated: number;
  eventsCreated: number;
  error?: string;
};
```

Registration is side-effect based — `src/lib/connectors/register-all.ts` is imported
by the worker to populate the registry at startup.

### 7.3 Implemented Connectors

| Connector | Mode | Facts Produced | Episodic Events | Auth | Status |
|---|---|---|---|---|---|
| **GitHub** | Sync | Profile, repos, languages, skills, stats | New repo creation | OAuth (`read:user`) | Implemented |
| **LinkedIn ZIP** | Import | Profile, positions, education, skills, languages, certifications, causes | Import milestone | File upload (.zip) | Implemented |
| **RSS / Blog** | Sync | Feed link, blog posts, post count | Blog post publication | URL input | Implemented |
| **Spotify** | Sync | Profile, top artists, top tracks, genres | Musical taste shift (≥3/5 top artists changed) | OAuth (`user-top-read`) | Implemented |
| **Strava** | Sync | Profile, sport activities, aggregate stats | Workout completion, personal records | OAuth (`read,activity:read_all`) | Implemented |

### 7.4 GitHub Connector

**OAuth flow** (subdirectory routing):
- Login callback: `/api/auth/github/callback` (uses `oauth_state` cookie)
- Connector callback: `/api/auth/github/callback/connector` (uses `gh_connector_state` cookie)
- Both share `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` env vars
- Connector requests `read:user` scope (login uses `user:email`)

**Sync flow** (`syncGitHub`):
1. Decrypt stored credentials (AES-256-GCM via `connector-encryption.ts`)
2. Fetch profile + repos + per-repo languages from GitHub API (paginated)
3. Map to facts via `mapProfile()` and `mapRepos()`:
   - `social/gh-profile`, `identity/gh-bio`, `identity/gh-company`, `identity/gh-location`
   - `project/gh-{node_id}` per non-fork repo
   - `skill/gh-{language}` aggregated across repos
   - `stat/github-repos` (total count)
4. Write facts via `batchCreateFacts()` (sequential writes + single recompose)
5. Generate episodic events for truly new repos (not forks, not in connector_items). `actionType: "work"`, `externalId: "repo-{node_id}"`. First sync = baseline (no events).
6. Write events via `batchRecordEvents()` with source `"github"`
7. Record provenance in `connector_items`, update `lastSync`/`syncCursor`

**API routes:**
- `GET /api/connectors/github/connect` — Initiates OAuth flow
- `GET /api/auth/github/callback/connector` — Handles OAuth callback, creates connector, enqueues sync
- `POST /api/connectors/github/sync` — Manual sync trigger (auth-gated)

### 7.5 LinkedIn ZIP Connector

**Import flow** (`importLinkedInZip`):
1. User uploads `.zip` file exported from LinkedIn (Settings → Get a copy of your data)
2. API validates file (100MB limit, `.zip` MIME type)
3. Extract ZIP in memory via `yauzl-promise` (bounded by size limit)
4. For each CSV file, match filename to mapper via `FILE_MAPPERS`:
   - `Profile.csv` → identity facts (name, headline, location, summary)
   - `Positions.csv` → experience facts (chronological sort, single "current" role)
   - `Education.csv` → education facts
   - `Skills.csv` → skill facts
   - `Languages.csv` → language facts with proficiency mapping
   - `Certifications.csv` → achievement facts
   - `Courses.csv` → education/course facts
   - `Causes You Care About.csv` → interest/cause facts
   - `Email Addresses.csv`, `PhoneNumbers.csv` → private-contact facts (opt-in, not wired by default)
5. Date normalization handles 5 LinkedIn formats (ISO, "Mon YYYY", "DD Mon YYYY", US short, year-only)
6. CSV parsing handles BOM, preamble rows, relaxed column counts
7. Sensitive files excluded: `Connections.csv`, `messages.csv`, `Endorsement*`, `Recommendations*`
8. On successful import (`factsWritten > 0`), records a single milestone episodic event via `insertEvent()` with `source: "linkedin_zip"` and summary of imported positions/skills/certifications

**API routes:**
- `POST /api/connectors/linkedin-zip/import` — Multipart upload (auth-gated, 100MB limit)

### 7.6 Connector Infrastructure

**Database tables** (migrations 0016, 0029):
- `connectors` — Registered connector instances per owner (id, type, status, encrypted credentials, config, sync cursor)
- `connector_items` — Provenance tracking (connector_id → fact_id + event_id mapping)
- `sync_log` — Per-sync audit trail (status, facts created/updated, events created, errors)
- `episodic_events.source` — Source provenance column: `'chat'|'github'|'linkedin_zip'|'rss'|'spotify'|'strava'`

**Shared services:**
- `connector-service.ts` — CRUD for connector rows (`createConnector`, `getActiveConnectors`, `updateConnectorStatus`, `updateConnectorCredentials`)
- `connector-encryption.ts` — AES-256-GCM encrypt/decrypt for OAuth tokens (key from `CONNECTOR_ENCRYPTION_KEY` env var)
- `connector-fact-writer.ts` — `batchCreateFacts()` with actor:"connector", visibility:"public", sequential writes + single recompose. Visibility override respects user-set `private`.
- `connector-event-writer.ts` — `batchRecordEvents()` with intra-batch dedup, chunked DB dedup (SQLite 999 param limit), per-event error isolation
- `connector-sync-handler.ts` — Worker job handler, fans out by ownerKey (or single connector via `connectorId`), calls `syncFn` per active connector
- `token-refresh.ts` — Shared `withTokenRefresh()` wrapper for OAuth connectors (Spotify, Strava). On `TokenExpiredError`: refresh → update encrypted credentials → retry once
- `register-all.ts` — Side-effect module that registers all connector definitions at import time
- `magic-paste.ts` — `detectConnectorUrls()` detects GitHub, LinkedIn, Spotify, Strava, RSS/Substack/Medium/dev.to URLs in chat messages

**Worker integration:**
- `connector_sync` job type in worker handlers
- Worker imports `register-all.ts` to populate the registry
- Daily scheduler enqueues `connector_sync` for all owners with active connectors (separate loop from heartbeat, per-connector `lastSync` daily guard using owner timezone)
- Manual sync enqueues via `enqueueJob("connector_sync", { ownerKey, connectorId })` for targeted single-connector sync

### 7.7 RSS Connector

**Auth:** URL input (user provides feed URL, no OAuth). One feed per user.

**Sync flow** (`syncRss`):
1. Validate feed URL (SSRF protection: private IP blocklist, DNS resolution check, per-hop redirect validation)
2. Fetch with manual redirect following (max 3 hops), streaming body size limit (5MB)
3. Parse XML via `fast-xml-parser` (supports RSS 2.0 and Atom 1.0)
4. Map to facts: `social/rss-feed`, `project/rss-{hash}` per post, `stat/rss-posts`
5. Map to episodic events: `actionType: "writing"` per new post (`externalId: "rss-post-{hash}"`)
6. First sync = baseline (facts only, seeds connector_items for dedup)

**SSRF defense layers:** URL validation (protocol, port, private IP regex) → DNS resolution check (resolve4+resolve6, all addresses) → per-hop redirect validation → streaming body size limit. TOCTOU DNS rebinding is documented as open risk (full mitigation requires custom fetch agent with pinned DNS).

**API routes:**
- `POST /api/connectors/rss/subscribe` — Subscribe to feed (validates URL, creates connector, enqueues sync)
- `POST /api/connectors/rss/sync` — Manual sync (accepts both 'connected' and 'error' status)

### 7.8 Spotify Connector

**Auth:** OAuth (`user-top-read user-read-recently-played`). Token refresh via shared `withTokenRefresh()` (1h expiry).

**Sync flow** (`syncSpotify`):
1. Fetch profile, `medium_term` top artists/tracks via Spotify API
2. Map to facts: `social/spotify-profile`, `music/sp-artist-{id}` (`{title, note?, url}`), `music/sp-track-{id}` (`{title, artist, url}`)
3. Taste-shift detection: compare `short_term` top-5 artist IDs with previous snapshot (stored in `syncCursor` JSON). If ≥3/5 changed → episodic event `actionType: "music"`
4. First sync: stores top-5 snapshot, NO taste-shift event

**API routes:**
- `GET /api/connectors/spotify/connect` — Initiates OAuth
- `GET /api/auth/spotify/callback/connector` — OAuth callback
- `POST /api/connectors/spotify/sync` — Manual sync

### 7.9 Strava Connector

**Auth:** OAuth (`read,activity:read_all`). Token refresh via shared `withTokenRefresh()` (6h expiry).

**Sync flow** (`syncStrava`):
1. Fetch athlete profile, paginated activities (`?after={syncCursor}`), aggregate stats
2. Map to facts: `social/strava-profile`, `activity/strava-{sport}` per sport type (`{name, type:"sport", activityCount, distanceKm?, timeHrs?}`), `stat/strava-distance`, `stat/strava-activities`
3. Per-activity episodic events: `actionType: "workout"` (`externalId: "activity-{id}"`)
4. PR events: `actionType: "milestone"` when `activity.pr_count > 0` (`externalId: "pr-{id}"`)
5. Incremental via `syncCursor` (unix timestamp). First sync = baseline (facts only, no events).

**API routes:**
- `GET /api/connectors/strava/connect` — Initiates OAuth
- `GET /api/auth/strava/callback/connector` — OAuth callback
- `POST /api/connectors/strava/sync` — Manual sync

### 7.10 Planned Connectors (Future)

| Connector | Category | Auth | Priority |
|---|---|---|---|
| **Goodreads** | Reading | OAuth/scrape | Phase 3 |
| **Google Scholar** | Academic | Public API | Phase 3 |
| **ORCID** | Academic | Public API | Phase 3 |
| **Chess.com** | Gaming | Public API | Phase 3 |
| **Last.fm** | Music | API key | Phase 3 |

### 7.11 How Connectors Feed the Agent

Connectors create facts that the agent reasons about during page composition:

```
GitHub connector syncs →

Creates facts:
  { category: "project", key: "gh-MDEwOlJl...", value: { name: "openself", ... }, source: "github" }
  { category: "skill", key: "gh-typescript", value: { name: "TypeScript", ... }, source: "github" }
  { category: "stat", key: "github-repos", value: { label: "GitHub Repos", number: 42 }, source: "github" }

The page composer then:
  - Includes connector facts in the deterministic skeleton (same as conversation facts)
  - Auto-recomposes draft after batch write (single recompose, not per-fact)
  - Connector facts appear in preview immediately via SSE
```

### 7.12 Post-Import Agent Reaction

After a connector import (currently LinkedIn ZIP), the agent automatically reacts with a
brief review of imported data and asks targeted questions to fill gaps that connectors
don't cover (interests, personal description, social links).

**Architecture:**

```
Import route (success) → writeImportEvent(sessionId, factsWritten)
                        → dispatch CustomEvent("openself:import-complete")
                        ↓
ChatPanel listener      → append() auto-trigger message (localized, 8 languages)
                        → POST /api/chat with metadata.source = "auto_import_trigger"
                        ↓
Chat route              → consumeImportEvent(sessionId) [atomic CAS]
                        → analyzeImportGaps(allFacts) [deterministic, zero-LLM]
                        → bootstrap.importGapReport = report
                        → bootstrap.situations.push("has_recent_import")
                        → assembleContext() → recentImportDirective in system prompt
                        ↓
Agent responds          → acknowledges import summary (role, counts)
                        → asks first gap question (interests > description > social)
```

**Key components:**

| Component | File | Purpose |
|---|---|---|
| Import gap analyzer | `src/lib/connectors/import-gap-analyzer.ts` | Deterministic analysis of missing categories (interests, description, social links) |
| Import event flag | `src/lib/connectors/import-event.ts` | Three-state machine (pending → processing → consumed) with atomic CAS via `json_set`/`json_extract` |
| Situation detection | `src/lib/agent/journey.ts` | `has_recent_import` flag when connector facts exist within 30 min |
| Policy directive | `src/lib/agent/policies/situations.ts` | `recentImportDirective()` with sanitized summary + gap descriptions + prompt delimiters |
| Frontend bridge | `ConnectorSection.tsx` → `ChatPanel.tsx` | DOM CustomEvent bridge (no prop drilling through 3 component layers) |

**Guardrails:**

- **G1 (Atomic CAS):** `json_extract` in SQL WHERE clause ensures only one request transitions pending → processing
- **G2 (Error recovery):** Flag reverted to pending on LLM failure (`onFinish`, `getErrorMessage`, outer catch)
- **G3 (TTL):** 24h expiry on pending flags, cleaned up on next consume attempt
- **G4 (Provenance):** `metadata.source = "auto_import_trigger"` tags auto-triggered messages for telemetry
- **G5 (Prompt hygiene):** `sanitize()` strips control chars + caps length; `--- BEGIN/END IMPORT CONTEXT ---` delimiters

---

## 8. Data Model

### 8.1 Database Schema

```sql
-- Sessions: one per invite-code redemption (multi-user mode)
-- In single-user mode, a sentinel row with id='__default__' is used.
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    invite_code TEXT NOT NULL,
    username TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'registered')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uniq_sessions_username ON sessions(username) WHERE username IS NOT NULL;

-- Facts: everything the agent knows about you
CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSON NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public', 'archived')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, category, key)
);

-- Canonical taxonomy registry (extensible, but controlled)
CREATE TABLE category_registry (
    category TEXT PRIMARY KEY,
    status TEXT DEFAULT 'active',  -- 'active', 'pending', 'deprecated'
    created_by TEXT DEFAULT 'system', -- 'system', 'agent', 'user'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alias mapping used by TaxonomyNormalizer
CREATE TABLE category_aliases (
    alias TEXT PRIMARY KEY,
    category TEXT NOT NULL REFERENCES category_registry(category),
    source TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Component registry (core + community components)
CREATE TABLE component_registry (
    type TEXT PRIMARY KEY,       -- core: "hero", community: "x.author.component"
    namespace TEXT NOT NULL,     -- 'core' | 'community'
    owner TEXT NOT NULL,
    status TEXT NOT NULL,        -- 'draft' | 'certified' | 'experimental' | 'deprecated'
    version TEXT NOT NULL,
    content_schema_hash TEXT,    -- hash of the registered content schema
    renderer_ref TEXT,           -- package/module reference for renderer
    allowed_variants_json TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_component_registry_status ON component_registry(status);

-- Conversation history
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,          -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls JSON,            -- Tool calls made in this message
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Canonical audit/event stream (tool calls, policy decisions, worker actions)
CREATE TABLE agent_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,    -- 'tool_call', 'taxonomy_review_required', 'budget_warning', ...
    actor TEXT NOT NULL,         -- 'user', 'assistant', 'worker', 'connector', 'system'
    source TEXT,                 -- 'chat', 'heartbeat', 'connector:github', ...
    entity_type TEXT,            -- 'fact', 'page', 'job', ...
    entity_id TEXT,
    payload JSON NOT NULL,
    correlation_id TEXT,         -- message_id/session_id/job_id for tracing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_agent_events_type_created ON agent_events(event_type, created_at);
CREATE INDEX idx_agent_events_corr ON agent_events(correlation_id);

-- Page configuration (the generated page)
-- Draft row id = session_id ('__default__' or UUID). Published row id = username.
CREATE TABLE page (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
    username TEXT NOT NULL,
    config JSON NOT NULL,        -- The full page config (see Section 6.2)
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approval_pending', 'published')),
    generated_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status != 'published' OR username != 'draft')
);
CREATE UNIQUE INDEX uniq_page_published ON page(username) WHERE status = 'published';

-- Agent configuration
-- Row id = session_id ('__default__' or UUID).
CREATE TABLE agent_config (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
    config JSON NOT NULL,        -- The agent identity config (see Section 4.1)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent memory (meta-knowledge, observations — Tier 3)
CREATE TABLE agent_memory (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,       -- OwnerScope.cognitiveOwnerKey
    content TEXT NOT NULL,         -- Free-form observation
    memory_type TEXT NOT NULL DEFAULT 'observation', -- 'observation', 'preference', 'insight', 'pattern'
    category TEXT,                 -- Optional grouping
    content_hash TEXT NOT NULL,    -- SHA-256 for dedup
    confidence REAL DEFAULT 0.8,
    is_active INTEGER DEFAULT 1,
    user_feedback TEXT,            -- 'helpful', 'wrong', or NULL
    deactivated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Connected services
CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL, -- 'github', 'strava', etc.
    credentials JSON,            -- Encrypted OAuth tokens, API keys
    config JSON,                 -- Connector-specific settings
    last_sync DATETIME,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Uploaded media metadata (MVP default: binary in SQLite for single-file portability)
CREATE TABLE media_assets (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL DEFAULT 'main',
    kind TEXT NOT NULL CHECK (kind IN ('avatar', 'gallery', 'cover')),
    storage_backend TEXT NOT NULL DEFAULT 'sqlite', -- 'sqlite' | 'fs' | 's3'
    storage_key TEXT,               -- required for 'fs'/'s3', null for 'sqlite'
    blob_data BLOB,                 -- used when storage_backend='sqlite'
    mime_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    sha256 TEXT NOT NULL,
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public', 'archived')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(storage_backend, storage_key)
);
CREATE UNIQUE INDEX uniq_media_avatar_per_profile
ON media_assets(profile_id)
WHERE kind = 'avatar';

-- Connector sync log
CREATE TABLE sync_log (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id),
    status TEXT NOT NULL,        -- 'success', 'error', 'partial'
    facts_created INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Background jobs (heartbeat, connector sync, retries)
-- Rebuilt in Phase 1a with CHECK constraints and expanded job types
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN (
        'page_synthesis', 'memory_summary', 'heartbeat_light', 'heartbeat_deep',
        'expire_proposals', 'soul_proposal', 'connector_sync', 'page_regen',
        'taxonomy_review', 'session_compaction', 'consolidate_episodes'
    )),
    owner_key TEXT,                  -- OwnerScope.cognitiveOwnerKey (NULL for global jobs)
    payload JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
    run_after DATETIME NOT NULL,
    attempts INTEGER DEFAULT 0,     -- max 3, with exponential backoff
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

-- LLM usage accounting and guardrails
CREATE TABLE llm_usage_daily (
    day TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    PRIMARY KEY(day, provider, model)
);

CREATE TABLE llm_limits (
    id TEXT PRIMARY KEY DEFAULT 'main',
    daily_token_limit INTEGER DEFAULT 500000,
    monthly_cost_limit_usd REAL DEFAULT 25.0, -- legacy, unused
    daily_cost_warning_usd REAL DEFAULT 1.0,
    daily_cost_hard_limit_usd REAL DEFAULT 2.0,
    warning_thresholds_json TEXT DEFAULT '[0.5,0.75,0.9,1.0]', -- legacy, unused
    heartbeat_call_limit INTEGER DEFAULT 3, -- legacy, unused
    hard_stop BOOLEAN DEFAULT TRUE,
    warning_cooldown_minutes INTEGER DEFAULT 60, -- legacy, unused
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings for semantic search
-- (managed by sqlite-vec extension)
CREATE VIRTUAL TABLE fact_embeddings USING vec0(
    fact_id TEXT,
    embedding FLOAT[384]         -- Dimension depends on model
);

-- Full-text search index
CREATE VIRTUAL TABLE facts_fts USING fts5(
    category, key, value_text,
    content='facts',
    content_rowid='rowid'
);

-- ============================================================
-- Phase 1a additions (migrations 0012-0016)
-- ============================================================

-- Conversation summaries (Tier 2 — rolling, one per owner)
CREATE TABLE conversation_summaries (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL UNIQUE,  -- OwnerScope.cognitiveOwnerKey
    summary TEXT NOT NULL,
    cursor_created_at TEXT,          -- compound cursor for CAS
    cursor_message_id TEXT,
    token_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-profile message quota (atomic counter)
CREATE TABLE profile_message_usage (
    profile_id TEXT PRIMARY KEY,
    message_count INTEGER NOT NULL DEFAULT 0,
    period_start DATETIME NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Schema version tracking for leader/follower coordination
CREATE TABLE schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Soul profiles (versioned identity overlays)
CREATE TABLE soul_profiles (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    overlay JSON NOT NULL,           -- {voice, tone, values, selfDescription, communicationStyle}
    compiled TEXT,                    -- Prose string for system prompt injection
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Only one active soul profile per owner
CREATE UNIQUE INDEX uniq_soul_active ON soul_profiles(owner_key) WHERE is_active = 1;

-- Soul change proposals (pending changes with TTL)
CREATE TABLE soul_change_proposals (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    proposed_overlay JSON NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

-- Heartbeat run history (DST-safe budget tracking)
CREATE TABLE heartbeat_runs (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    run_type TEXT NOT NULL,          -- 'light' or 'deep'
    owner_day TEXT NOT NULL,         -- YYYY-MM-DD in owner's timezone
    status TEXT NOT NULL,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-owner heartbeat configuration
CREATE TABLE heartbeat_config (
    owner_key TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    timezone TEXT DEFAULT 'UTC',
    light_interval_hours INTEGER DEFAULT 24,
    deep_interval_hours INTEGER DEFAULT 168, -- 7 days
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trust ledger (audit trail with undo capability)
CREATE TABLE trust_ledger (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    action_type TEXT NOT NULL,       -- 'memory_saved', 'soul_accepted', 'conflict_resolved', etc.
    entity_type TEXT NOT NULL,       -- 'memory', 'soul', 'conflict', 'fact'
    entity_id TEXT NOT NULL,
    description TEXT,
    undo_payload JSON,               -- Saved at write time for reversibility
    reversed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_trust_ledger_owner ON trust_ledger(owner_key, created_at);

-- Fact conflicts (detected contradictions with resolution tracking)
CREATE TABLE fact_conflicts (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    fact_id TEXT NOT NULL,            -- The existing fact
    conflicting_value JSON NOT NULL,  -- The new contradictory value
    conflicting_source TEXT NOT NULL,  -- Source of the new value
    existing_source TEXT NOT NULL,     -- Source of the existing fact
    resolution TEXT,                   -- 'kept_existing', 'accepted_new', 'merged', 'dismissed'
    merged_value JSON,                -- Result if resolution = 'merged'
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);
CREATE INDEX idx_fact_conflicts_open ON fact_conflicts(owner_key, status) WHERE status = 'open';

-- ============================================================
-- Phase 1c additions (migration 0018)
-- ============================================================

-- Section copy cache (pure LLM output cache, content-addressed)
CREATE TABLE section_copy_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_key, section_type, facts_hash, soul_hash, language)
);
CREATE INDEX idx_section_cache_lookup
  ON section_copy_cache(owner_key, section_type, facts_hash, soul_hash, language);

-- Section copy state (active approved personalized copy, read by projection)
CREATE TABLE section_copy_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'live',
  UNIQUE(owner_key, section_type, language)
);
CREATE INDEX idx_section_state_lookup
  ON section_copy_state(owner_key, section_type, language);

-- Section copy proposals (conformity check proposals for user review)
CREATE TABLE section_copy_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  current_content TEXT NOT NULL,
  proposed_content TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'pending',
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  baseline_state_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);
CREATE INDEX idx_proposals_pending
  ON section_copy_proposals(owner_key, status);

-- ============================================================
-- Episodic Memory additions (migrations 0027-0028)
-- ============================================================

-- Episodic events — append-only activity ledger (Tier 4)
CREATE TABLE episodic_events (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    source_message_id TEXT,
    event_at_unix INTEGER NOT NULL,
    event_at_human TEXT NOT NULL,
    action_type TEXT NOT NULL,
    narrative_summary TEXT NOT NULL,
    raw_input TEXT NOT NULL,
    details_json TEXT,
    source TEXT NOT NULL DEFAULT 'chat',        -- 'chat', 'github', 'linkedin' (migration 0029)
    external_id TEXT,                           -- stable connector dedup key (migration 0029)
    superseded_by TEXT REFERENCES episodic_events(id),
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_episodic_owner_time ON episodic_events(owner_key, event_at_unix)
    WHERE superseded_by IS NULL AND archived = 0;
CREATE INDEX idx_episodic_source ON episodic_events(owner_key, source);
CREATE UNIQUE INDEX uq_episodic_external_id ON episodic_events(owner_key, source, external_id)
    WHERE source != 'chat' AND external_id IS NOT NULL;

-- FTS5 full-text search on episodic events
CREATE VIRTUAL TABLE episodic_events_fts USING fts5(
    narrative_summary, raw_input, content='episodic_events', content_rowid='rowid'
);

-- Episodic pattern proposals — Dream Cycle output
CREATE TABLE episodic_pattern_proposals (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    action_type TEXT NOT NULL,
    pattern_summary TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    last_event_at_unix INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    expires_at TEXT NOT NULL,
    resolved_at TEXT,
    rejection_cooldown_until TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_episodic_proposals_owner ON episodic_pattern_proposals(owner_key, status)
    WHERE status = 'pending';
CREATE UNIQUE INDEX uq_episodic_proposals_active
    ON episodic_pattern_proposals(owner_key, action_type)
    WHERE status IN ('pending', 'accepted');
```

### 8.2 Storage

**SQLite** as the sole database. In MVP, one file contains your full identity,
including avatar media (`media_assets.blob_data`).

If optional media backends (`fs`/`s3`) are enabled later, portability remains:
backup = SQLite + media bundle.

Why SQLite:
- Zero configuration
- Single file — trivially portable and backupable
- Extensions: FTS5 (full-text search), sqlite-vec (vector search)
- Performance: more than sufficient for single-user workloads
- Works everywhere: server, desktop, edge

### 8.3 Export & Portability

Your data is always exportable:

| Format | What | Use case |
|---|---|---|
| SQLite file | Everything (MVP/default) | Full backup, migrate to another instance |
| Bundle (`.zip`/`.tar`) | SQLite + media assets | Full backup when using `fs`/`s3` media backends |
| JSON | Knowledge base + page config | Machine-readable, API consumption |
| HTML | Generated page | Host anywhere (GitHub Pages, S3, etc.) |
| PDF | Profile as document | CV, job applications |
| Markdown | Profile as text | Embed in README, docs |

The static HTML export is particularly important — it means you can generate your page
with OpenSelf and then host it anywhere, completely independently. No lock-in.

### 8.4 Consistency & Concurrency

To keep behavior stable when chat, heartbeat, and connectors all write concurrently:

1. **Single writer per user**: mutations are serialized through one queue/worker per user.
2. **Atomic updates**: fact writes + page config changes + `agent_events` writes are committed in
   one transaction.
3. **Optimistic concurrency**: updates include `updated_at` preconditions; stale writes fail
   and are retried with fresh state.
4. **Conflict policy**: user-confirmed facts win over inferred connector facts; otherwise
   latest trusted source wins by timestamp + confidence.
5. **Idempotency**: connector sync runs are keyed by external event ID to prevent duplicates.

### 8.5 Media Storage

Avatar-only uploads. No gallery/media wall uploads.

Binary assets are not stored as base64 blobs in `facts` or `page.config`.

**Current implementation (Phase 1d):**
- Metadata + binary in SQLite (`media_assets`, `storage_backend='sqlite'`)
- `page.config` references avatar via media id (preferred) or resolved URL path
- Single-file backup remains true for personal instances

**Avatar upload pipeline (implemented):**
1. `POST /api/media/avatar` — auth-gated, accepts `FormData` with image file.
   In multi-user mode this means authenticated profile identity (`userId` or legacy
   `username`), not just a valid session cookie.
2. **Validation:** 2 MB size limit, MIME whitelist (`image/jpeg`, `image/png`, `image/webp`),
   magic bytes detection (`detectMimeFromMagicBytes`) for JPEG/PNG/GIF/WebP
3. **Processing:** EXIF stripping for JPEG (`stripExifFromJpeg` removes APP1 markers),
   MIME mismatch check (declared vs actual bytes)
4. **Storage:** delete-before-insert pattern for partial unique index
   (`uniq_media_avatar_per_profile`). One avatar per profile.
5. `DELETE /api/media/avatar` — removes avatar (same auth rules)
6. **Composer wiring:** `profileId` threaded through `projectCanonicalConfig()` →
   `composeOptimisticPage()` → `buildHeroSection()` → `getProfileAvatar()`.
   All new params optional for backward compatibility. Wired into preview, stream,
   tools, publish pipeline, and connector fact writer.
7. **UI:** `AvatarSection` in SettingsPanel — 64px circular preview, upload button
   (file picker → POST FormData), remove button (DELETE), loading/error states.

Optional strategy (later/advanced deployments):
- Filesystem or S3-compatible backend (`storage_backend='fs'|'s3'`)
- Same metadata table, different resolver

Non-avatar visual elements should be text/icons/emoticons from the design system,
not user-uploaded binaries.

### 8.6 LLM Cost & Rate Limits

Cost control is enforced in the runtime, not left to provider dashboards alone.

Default guardrails (single-user self-hosted starter profile):
1. Daily token cap: `2000000` (env var `LLM_DAILY_TOKEN_LIMIT`, schema default, migration 0019 backfill)
2. Monthly estimated cost cap: `$25`
3. Daily cost warning: `$1`
4. Daily hard-stop cap: `$2`
5. Per-heartbeat call cap: `3`
6. Warning thresholds: `50%, 75%, 90%, 100%`
7. Hard-stop mode (`hard_stop=true`) blocks new calls when limits are reached
8. Soft mode (`hard_stop=false`) allows explicit manual override in UI. Controlled by `LLM_HARD_STOP` env var (default `false` in development and production as of 2026-03-04 — warnings are logged but calls are not blocked)

Accounting is tracked per day/provider/model in `llm_usage_daily`.

Configuration precedence (highest first):
1. Runtime settings persisted in `llm_limits` (changed via admin/settings UI)
2. Environment variables (`LLM_*`) loaded at boot
3. Schema defaults in `llm_limits`

Boot behavior:
- If `llm_limits` row does not exist, create it from env values (or schema defaults).
- After creation, DB values are the source of truth.

**Rate limit exceptions:** The `GET /api/chat/bootstrap` endpoint passes `{ skipPace: true }`
to `checkRateLimit()` because it is an idempotent read — pace-limiting is inappropriate
for data loads that fire on every page mount.

---

## 9. UX Principles

### 9.1 The 10 Commandments

1. **The user's time is sacred.** 5 minutes should produce a complete page.
2. **Value before everything.** Show the page before asking for an account.
3. **The agent proposes, the person decides.** Nothing goes live without consent.
4. **No vanity metrics.** No likes, no followers, no "profile completeness" bars.
5. **Finite by design.** When the profile is updated, the app says "you're good" and lets you go.
6. **Accessible to everyone.** A 70-year-old and a 20-year-old should both succeed.
7. **Conversation, not forms.** Never make the user fill out a structured form.
8. **Radical transparency.** The user can always see why the agent did something.
9. **Celebrate the person, not the app.** The page showcases YOU, not OpenSelf.
10. **If usage time decreases, we are winning.** Less time in the app = more value delivered.

### 9.2 Layout Strategy: Two Faces, Two Priorities

OpenSelf has two distinct surfaces that serve opposite contexts. Each must be
optimized for its primary usage scenario.

**1. Published Page → Obsessively Mobile-First**

The published page (e.g. `openself.dev/tommaso`) is the output — what people share
and what others see. 70-80% of visitors will open it from their phone: a LinkedIn
link-in-bio tap, a Twitter profile click, a WhatsApp message. If the published page
is ugly or broken on mobile, the product has failed.

Design rules:
- Touch targets, font sizes, and spacing must be phone-native
- Content hierarchy must work in a single narrow column
- Images and sections must load fast on mobile networks
- Desktop is a nice-to-have bonus, not the design target

**2. Builder → Perfect on Desktop**

The builder (split-screen: chat left, preview right) is where professionals craft
their page. Even with voice-based onboarding making the phone flow viable for
initial setup, the serious editing — reviewing your story, reordering skills,
deciding on your professional image — happens on a laptop or office computer.

Design rules:
- The split-screen layout must shine on wide screens (1280px+)
- Dense information display is acceptable (professionals expect it)
- Keyboard shortcuts and precise interactions are valued
- Mobile builder is a fallback, not the primary experience

This dual focus is not a compromise — it reflects how the product is actually used.
The builder is a creation tool (desktop). The published page is a consumption
artifact (mobile).

### 9.3 Conversation Design

**The agent's persona:** A reflective companion. Not a fake friend, not a motivational
coach, not a robot. Like a good journalist who helps you tell your story.

**Tone:** Warm but not invasive. Curious but not nosy. Concise but not cold.

**Anti-patterns:**
- Never ask what the agent already knows
- Never more than 3 questions in a row
- Never "Great question!" or filler phrases
- Never push the user to share more than they want
- Never guilt-trip for inactivity ("You haven't visited in 2 weeks!")

**When to stop:**
> "Your page is up to date. Nothing new from your connected services.
> If you have something new to tell me, I'm here. Otherwise, see you next time!"

### 9.4 Landing Page

The first screen sets the tone. Before any interaction, the landing page communicates
internationality and simplicity:

```
1. Full-screen animated headline:
   "Welcome to OpenSelf" → fades → "Benvenuto in OpenSelf" → fades →
   "Willkommen bei OpenSelf" → cycles through supported languages

2. Single CTA button: "Start your experience" (localized)

3. Below: one-sentence value prop + link to Pro features (visible, "coming soon")
```

Design principles:
- Text is the protagonist — minimal visual noise, no stock photos, no feature grids
- Typography-forward: elegant, distinctive, readable at large sizes
- The animation conveys "this works in your language" without explanation

### 9.5 Onboarding (Guided Setup + Conversation)

Onboarding has two layers: a quick structured setup (3-4 screens, ~30 seconds) that
gives the agent context, followed by the guided conversation interview.

#### Layer 1 — Quick Setup (structured, no LLM)

```
Screen 1: "What's your name?"
           [First name] [Last name]
           → Sets identity.name fact, agent knows how to address the user

Screen 2: "What best describes you?" (optional, skippable)
           [Age range selector: 18-24 / 25-34 / 35-44 / 45-54 / 55+]
           [Gender: he/she/they — or skip]
           → Agent adapts language (gendered forms in Italian/French/etc.)
           → No exact birth date (privacy by design, GDPR minimal collection)

Screen 3: "What brings you here?"
           [Work & professional presence]
           [Personal — hobbies, passions, life]
           [Both — a full picture of who I am]
           [Career transition — repositioning myself]
           → Sets the conversation direction and section emphasis

Screen 4: "Choose your agent" (optional, Phase 1+)
           [Sofia — precise, structured, gets to the point]
           [Marco — creative, curious, explores connections]
           [Skip — let the agent adapt to me]
           → Sets agent personality preset (tone, verbosity, humor)
           → Personality evolves based on interaction over time
```

**Design rules:**
- Each screen is one question, one interaction — no forms with 5 fields
- Everything except name is optional/skippable
- Total time: 20-30 seconds
- No LLM calls yet — all deterministic

**Data note:** Age range (not exact date) and gender are stored as private identity
facts. Gender is functional (grammatical agreement in gendered languages), not
demographic. The user can change or remove these at any time.

#### Layer 2 — Guided Conversation Interview

After setup, the conversation opens. The agent already knows the user's name, intent,
and language. The first message is personalized:

```
0:00  Agent opens with context-aware greeting:
      "Ciao Marco! Vuoi creare una pagina professionale.
       Raccontami — cosa fai di lavoro e cosa ti appassiona?"

0:15  User responds naturally.

0:30  Agent asks follow-up, extracts facts via tools.

1:00  After 2-3 exchanges, agent generates first page preview.
      WOW MOMENT — the page exists. It already looks great.

1:30  "Here's your page! Want to change anything?"

3:00  Refinements via conversation.

4:00  "Choose your username" → create account.

5:00  Page is live. User shares the URL.
```

**Key principle:** Value before registration. Like Duolingo (complete a lesson before
creating an account), the user sees their page before committing.

#### Returning Users (Phase 1+)

When the user is not new, the agent's opening message adapts based on context:

- Time since last visit: "Hey, long time! What's new?"
- Recent connector activity: "I noticed 3 new repos on GitHub. Want to update?"
- Nothing changed: "Everything looks good! Anything new to tell me?"
- Memory-informed: "Last time you mentioned starting a new project — how's that going?"

This requires Tier 2/3 memory (Phase 1a) to work well.

### 9.6 Accessibility

- **Voice as primary modality** — not an accessory. If someone can only speak
  (no typing), they should still get a full page. The agent listens (Whisper),
  reasons, and can speak back (TTS). See Section 4.7.
- **Screen reader support** — full ARIA compliance, WCAG AAA contrast (7:1)
- **Language-first onboarding** — the app asks for the user's language before
  anything else. The agent converses, extracts facts, and generates the page in
  that language. See Section 2 (How It Works).
- **Automatic page translation** — visitors who speak a different language can
  view the page translated. See Section 6.7.
- **Low-bandwidth** — generated pages are lightweight, fast on any connection
- **No jargon** — the app never uses technical terms unless the user does first

---

## 10. Technical Stack

Chosen for: simplicity, AI-coding compatibility, mature ecosystem, single-developer
feasibility.

| Component | Technology | Why |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | Full-stack in one project. SSR/SSG for public pages. |
| **Language** | TypeScript | Type safety. AI coding assistants generate it well. |
| **UI** | Tailwind CSS + shadcn/ui + radix-ui | Beautiful components fast. AI generates them perfectly. `radix-ui` barrel import requires `optimizePackageImports` in `next.config.ts` for SSR compatibility. |
| **Database** | SQLite (via Drizzle ORM) | Zero config. One file. Portable. |
| **Search** | SQLite FTS5 + sqlite-vec | Full-text + vector search without external dependencies. |
| **AI SDK** | Vercel AI SDK | BYOM out of the box: OpenAI, Anthropic, Ollama, Google. Streaming. Tool calling. |
| **Auth** | NextAuth.js (Auth.js) | OAuth (Google, GitHub, email). Only needed for multi-user/cloud. |
| **Voice STT** | Web Speech API + Whisper | Browser-native speech input. Whisper (local or API) for server-side transcription. Multi-language. |
| **Voice TTS** | eSpeak NG / Piper / Provider APIs | Open-source local TTS (eSpeak NG, Piper) for privacy. Cloud TTS APIs for premium quality (opt-in). |
| **Translation** | LLM + DeepL/Google Translate (fallback) | Page auto-translation for visitors. Pre-cached for common languages. |
| **Background Jobs** | Dedicated Node.js worker + SQLite `jobs` table | Heartbeat, connector sync, retries outside request lifecycle. |
| **License** | AGPL-3.0 (outbound) + CLA/CAA (inbound) | Copyleft on hosted forks + explicit contribution rights for future relicensing/commercial options. |

### What we DON'T use (and why)

| Not using | Why not |
|---|---|
| PostgreSQL | Overkill for single-user. SQLite is simpler and more portable. |
| LangChain | Too much abstraction. Vercel AI SDK is simpler and sufficient. |
| Vector database (Pinecone, etc.) | sqlite-vec keeps everything in one file. |
| Docker (for MVP) | Adds complexity. Node.js + SQLite runs everywhere. |
| React Native / mobile | Browser-first. PWA later if needed. |
| WASM plugins (for MVP) | Connectors are TypeScript modules first. WASM is Phase 3. |

---

## 11. Deployment

### 11.1 Self-Hosted (Primary)

OpenSelf runs on any machine with Node.js:

```bash
git clone https://github.com/openself/openself
cd openself
cp .env.example .env          # Set your LLM API key
npm install
npm run dev                    # Web app → localhost:3000
npm run worker:dev             # Background worker (jobs/scheduler; heartbeat/connectors in Phase 1+)
```

**BYOM (Bring Your Own Model):**
```env
# .env — choose your LLM

# Option A: OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Option B: Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Option C: Local (Ollama)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.3

# Option D: Google
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Cost guardrails (recommended)
LLM_DAILY_TOKEN_LIMIT=500000
LLM_DAILY_COST_WARNING_USD=1
LLM_DAILY_COST_HARD_LIMIT_USD=2
LLM_WARNING_THRESHOLDS_PCT=50,75,90,100
HEARTBEAT_MAX_LLM_CALLS=3
LLM_HARD_STOP=true

# Used to seed llm_limits on first boot; after seeding, DB values are authoritative
```

**Multi-provider tier routing (recommended for production):**

Each tier can use a different provider via `provider:model-id` format. Unknown prefixes (e.g. `llama3.2:latest`) are treated as plain model IDs for backward compat.

```env
# Recommended setup — Anthropic for chat, Google for background tasks
AI_PROVIDER=anthropic                                  # fallback
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

AI_MODEL_FAST=google:gemini-2.0-flash          # $0.075/M — translation, schema, coherence
AI_MODEL_STANDARD=anthropic:claude-sonnet-4-6  # $3/M    — chat (user-facing), summaries
AI_MODEL_REASONING=google:gemini-2.5-pro       # $1.25/M — conformity analysis (background)
```

### 11.2 One-Click Deploy

For people who want their own instance without touching a terminal:

```
[Deploy to Vercel]  [Deploy to Railway]  [Deploy to Fly.io]
```

These buttons deploy a fully functional instance with zero configuration beyond
setting an LLM API key. Vercel's free tier is sufficient for a personal instance.
For serverless targets, scheduler ticks run via platform cron invoking an internal
endpoint (for example every 5 minutes).

### 11.3 Static Export

For maximum portability, the generated page can be exported as static HTML:

```bash
npm run export -- --username tommaso
# → /out/tommaso/index.html (self-contained, host anywhere)
```

This HTML file can be uploaded to GitHub Pages, Netlify, S3, or any static
host. The page works completely independently of OpenSelf.

### 11.4 Future: Managed Cloud

When (and if) the community requests it, a managed service at
`openself.com` will offer:

- Sign up → talk → page live at `openself.com/username`
- No API keys needed (LLM is included)
- Automatic backups
- Custom domain support
- Always-on connectors (heartbeat runs on our servers)

This is a **service**, not a feature gate. The self-hosted version has 100% of
the functionality. The cloud version is convenience.

**Pricing (future, only when demand exists):**

| Tier | Price | Includes |
|---|---|---|
| Free | €0 | Page + 10 AI messages/month + 1 connector |
| Pro | €9/month | Unlimited AI + all connectors + custom domain + priority |

### 11.5 Runtime Model (Web + Worker)

OpenSelf runs with two execution roles:

1. **Web app (Next.js)**: chat UI, public pages, APIs — runs as DB leader (`DB_BOOTSTRAP_MODE=web`)
2. **Worker (Node.js process)**: heartbeat, connector polling, retries, scheduled tasks — runs as DB follower (`DB_BOOTSTRAP_MODE=follower`)

Why this split:
- Next.js request handlers are not a reliable place for long-lived periodic jobs
- Worker execution can be bounded, retried, and monitored independently

Scheduling model:
- The **heartbeat scheduler** (`src/lib/worker/scheduler.ts`) runs as a periodic tick
  inside the worker process (every 15 minutes). Each tick iterates all active owners
  and enqueues due `heartbeat_light` / `heartbeat_deep` jobs based on the owner's
  local timezone.
- **Global housekeeping**: runs once per tick before owner loop (table-wide SQL, no LLM).
- **Light jobs**: enqueued daily when local hour >= 3 and no run recorded for today (deterministic, no LLM).
- **Deep jobs**: enqueued on Sunday when local hour >= 3 and no run this ISO week, gated by minimum fact count (LLM-dependent).
- **Deep recovery**: if Sunday's deep was missed, enqueued on Monday before noon.
- **ownerDay capture**: scheduler passes `ownerDay` in job payload at enqueue time, ensuring correct day/week recording even when job execution is delayed.
- **Anti-overlap**: a module-level flag prevents concurrent scheduler ticks.
- Active owners are discovered via `getActiveOwnerKeys()`: UNION of enabled
  `heartbeat_config` rows and distinct fact owners.
- `hasRunToday()` / `hasRunThisWeek()` / `hasRunInWeek()` check `heartbeat_runs`
  to prevent double-enqueue.
- ISO week computation (`computeOwnerWeek()`) and day-of-week detection use
  `Intl.DateTimeFormat` with the owner's timezone (DST-safe).
- Serverless deployments use cron-triggered scheduler ticks to enqueue due work

**Worker deployment:**

The worker is a standalone Node.js process built separately from the Next.js app:

```bash
# Build
tsup src/worker.ts --format cjs --out-dir dist --external better-sqlite3

# Run
node dist/worker.js

# Health check (DB ping + schema check + handler count)
node dist/worker.js --health-check
```

**DB bootstrap coordination:**
- Web process (`DB_BOOTSTRAP_MODE=web`): runs migrations on startup (leader role)
- Worker process (`DB_BOOTSTRAP_MODE=follower`): polls `schema_meta` table until the
  leader has completed migrations, then begins processing jobs

This ensures the worker never attempts to process jobs against an outdated schema.

### 11.6 Runtime Access Profiles

OpenSelf ships as one codebase with environment-driven runtime profiles:

1. **Default (no `INVITE_CODES` env var)**:
   - Baseline for community/self-host installs
   - Single-user data model and behavior (all data uses sentinel `session_id = '__default__'`)
   - No invite gate, no message limits, no registration flow
   - Zero behavior change from pre-session architecture
2. **Multi-user (`INVITE_CODES` env var set)**:
   - Active on managed deployments (e.g. `openself.dev`)
   - Middleware redirects unauthenticated visitors to `/invite`
   - Each invite code creates an isolated session (UUID) with its own facts, draft, preferences
   - Chat is capped at `CHAT_MESSAGE_LIMIT` messages (default 10), after which a registration prompt appears
   - Registration claims a username, auto-publishes the page at `/<username>`
   - Session stored in `os_session` HttpOnly cookie (30 days)
   - Atomic message count increment prevents race conditions at the limit boundary

**Implementation notes:**
- The `sessions` table tracks invite code, message count, username, and status per session.
- All service functions accept a `sessionId` parameter (defaulting to `'__default__'`).
- The `facts`, `page`, and `agent_config` tables include a `session_id` column with `NOT NULL DEFAULT '__default__'`.
- NULL values are never used — the sentinel `'__default__'` preserves UNIQUE constraint behavior in SQLite.
- Edge middleware only checks cookie presence; DB validation happens in API route handlers (Edge runtime cannot use SQLite).
- Chat UI state is memory-local but is rehydrated from `GET /api/messages` on mount; on
  mobile, chat tab content is force-mounted so tab switches preserve in-memory state.

---

## 12. Security & Privacy

### 12.1 Principles

1. **Privacy by default.** New facts are `private` until explicitly made public.
   The agent asks before exposing sensitive information.
2. **Data minimization.** Only store what's needed. Conversation history is summarized
   and archived, not kept indefinitely.
3. **Local-first.** In self-hosted mode, data never leaves your machine.
4. **No tracking.** The app does not track usage, does not have analytics, does not
   phone home.
5. **Transparent AI.** The user can inspect tool calls and automated decisions in a debug
   view backed by `agent_events`.

### 12.2 Connector Security

- OAuth tokens stored encrypted in SQLite via AES-256-GCM (`connector-encryption.ts`)
- Encryption key externalized as `CONNECTOR_ENCRYPTION_KEY` env var (32-byte hex)
- `getConnectorWithCredentials()` returns `decryptedCredentials` (never raw `credentials` column)
- GitHub connector requests minimal `read:user` scope (read-only)
- LinkedIn ZIP import: file processed in memory, no credential storage, sensitive CSVs excluded
- Connector credentials never exposed to the LLM context
- `private-contact` category forces `private` visibility via `SENSITIVE_CATEGORIES`
- All connector API routes are auth-gated (require active session)

### 12.3 Page Visibility

Every fact has a `visibility` field:
- `private` — stored in KB, never shown on public page
- `proposed` — visible only in onboarding/draft preview, not public
- `public` — appears on the public page
- `archived` — removed from the page but preserved in KB for history/context

The agent uses private facts to understand you better (e.g., salary expectations,
personal struggles) without ever putting them on the page.

Onboarding policy:
- Facts start as `private`
- Candidate non-sensitive facts can be moved to `proposed` for draft preview
- One final publish checkpoint promotes approved `proposed` facts to `public`

### 12.4 LLM Privacy

- **Self-hosted + Ollama**: Zero data leaves your machine. Fully air-gapped possible.
- **Self-hosted + cloud LLM**: Your data is sent to the LLM provider (OpenAI, etc.).
  Standard LLM provider privacy policies apply.
- **Managed cloud (future)**: Data stored on our servers (EU), encrypted at rest.
  LLM calls go through our infrastructure.

The user always knows where their data goes. The app is explicit about this in onboarding.

### 12.5 LLM Cost Safety

To avoid runaway costs (for example from heartbeat loops or connector bursts):

- Every LLM call checks limits before execution (`llm_limits`)
- Usage is metered after each call (`llm_usage_daily`)
- Heartbeat has a hard cap of LLM calls per run
- Warning notifications fire at 50/75/90/100% budget usage (cooldown applied)
- On limit breach:
  - `hard_stop=true`: block calls and surface actionable error
  - `hard_stop=false`: queue warning + allow explicit manual override
- The worker never retries rate-limited calls without backoff and jitter

### 12.6 VisibilityPolicy (Onboarding vs Steady State)

Visibility is mode-aware and enforced by `VisibilityPolicy`:

1. **Onboarding mode**
   - Default for new facts: `private`
   - Non-sensitive, high-confidence facts may be marked `proposed`
   - Draft preview renders `public + proposed`
   - Final publish checkpoint is required to promote `proposed -> public`
2. **Steady-state mode**
   - Default for new facts: `private`
   - Any public change requires explicit per-change confirmation (unless auto-approve exists)
3. **Sensitive categories**
   - Always start and remain `private` until explicit user action
   - Examples: compensation, health, personal struggles, private contacts, `contact` (email/phone/address)
4. **Non-sensitive proposal allowlist (default)**
   - `identity` (public profile fields only), `project`, `skill`, `interest`, `achievement`,
     `activity`, `social` (public handles/links), `education`, `stat`, `reading`, `music`, `language`
   - `identity` public profile fields (explicit):
     - `name.full`
     - `tagline.text`
     - `location.city`, `location.country`
     - `avatarMediaId` (if approved)
     - `pronouns` (only if explicitly provided/approved)
   - `identity` fields never auto-proposed: legal name variants, phone, personal email,
     exact address, date of birth, private contacts
   - Categories outside the allowlist remain `private` unless explicitly approved
5. **Archived state**
   - Facts transition from `public` to `archived` when no longer relevant for the page
     (old job, past event, superseded info)
   - Archived facts are preserved in the KB for history, context, and potential reactivation
   - The agent uses archived facts for reasoning (e.g., career evolution analysis)
     but never renders them on the public page

### 12.7 Publish Auth Gate (Multi-User Mode)

In multi-user mode (`INVITE_CODES` set), publishing requires authentication:

1. **Anonymous users blocked server-side.** `POST /api/publish` returns 403
   `AUTH_REQUIRED` if the session has no `userId`. Direct API calls cannot bypass
   the UI signup modal.

2. **Signup-before-publish flow.** Anonymous users who build a page see "Sign up to
   publish" instead of the publish button. The `SignupModal` component collects
   username + email + password + confirm password and POSTs to `/api/register`, which
   atomically creates the user, links the profile, publishes the page, and rotates the
   session. The confirm password field validates onBlur and at submit time. The modal
   does NOT include OAuth buttons — OAuth callbacks redirect to `/builder` or
   `/{username}` and cannot resume the atomic publish flow. Users who need OAuth are
   directed to `/login` via the "Already have an account?" link.

3. **Username enforcement.** If `authCtx.username` exists (user already claimed one),
   `POST /api/publish` ignores `body.username` and uses the authenticated username.
   This prevents crafted API calls from publishing under a different username.

4. **Atomic claim+publish (OAuth edge case).** Authenticated users without a username
   (e.g., OAuth login without prior publish) can provide a username at publish time.
   The pipeline claims `profile.username` inside the same SQLite transaction as
   `requestPublish` + `confirmPublish`. If the UNIQUE constraint fails, the entire
   transaction rolls back — no squatting, no broken ownership.

5. **Builder banner.** When authenticated with a published page, the builder shows a
   `BuilderBanner` with "Live page" (link to `/{username}`) / "Share" / "Log out".
   Falls back to simple `AuthIndicator` when no published page exists.
   `getPublishedUsername(sessionIds)` in `page-service.ts` queries the page table.

6. **Visitor banner.** Published pages show a `VisitorBanner` ("OpenSelf" + "Log in")
   for non-owners. Shown when `!isOwner && !previewMode`. Published page `OwnerBanner`
   includes Edit / Share / Logout for the page owner.

7. **Request-publish endpoint.** `POST /api/draft/request-publish` allows the chat UI
   to trigger publish flow without going through the agent tool. Validates auth context,
   resolves username (prefers `authCtx.username`, falls back to `body.username` for
   OAuth edge case), validates availability, and calls `requestPublish()`.

8. **Single-user mode preserved.** When `INVITE_CODES` is not set, the original
   behavior (username input + direct publish, no signup) is unchanged.

9. **Auth-aware quota UI.** `ChatPanel` receives `authState` and branches on message
   limit: published page → link; authenticated → publish CTA; OAuth → username input;
   anonymous → signup form.

10. **Dynamic OAuth provider detection.** The `/login` and `/signup` pages are Next.js
    Server Components that call `getConfiguredProviders()` (`src/lib/auth/providers.ts`)
    at request time to determine which OAuth buttons to render. The registry checks all
    required env vars for each provider (including `NEXT_PUBLIC_BASE_URL` for providers
    that build callback URLs: Google, Discord, LinkedIn, Twitter, Apple). Only GitHub
    does not require `NEXT_PUBLIC_BASE_URL` (its arctic client uses null redirect URI).
    The registry is intentionally stricter than the route handlers — routes fall back to
    localhost for dev convenience, but the registry requires `NEXT_PUBLIC_BASE_URL` to
    prevent UI buttons that redirect to localhost in production. Login and signup pages
    pass the provider list as props to client form components (`LoginForm`, `SignupForm`),
    which render `OAuthButtons` (shared presentational component) above the email/password
    form with an "or" divider (hidden when no providers are configured).

11. **Forgot password.** The `/login` page includes a "Forgot password?" section with
    a `mailto:tom@openself.dev` link. This is a pre-beta solution — no self-service
    password reset flow exists yet.

12. **Confirm password.** The `/signup` page and `SignupModal` include a confirm
    password field with onBlur validation and submit-time guard. Password onChange
    also clears the confirm error to prevent stuck validation states. The `/login`
    page does not have confirm password (existing account, not new password).

Error codes (publish + request-publish):
- `AUTH_REQUIRED` (403): Anonymous user attempted publish in multi-user mode
- `USERNAME_TAKEN` (409): Username already claimed by another profile
- `USERNAME_RESERVED` (400): Reserved username (draft, api, builder, admin, login, signup, etc.)
- `USERNAME_INVALID` (400): Username fails validation regex
- `NO_DRAFT` (400): No draft exists to publish (request-publish only)

**Username validation** is two-layered:
- `validateUsernameFormat()` (`src/lib/page-config/usernames.ts`): pure function,
  checks regex + `RESERVED_USERNAMES` set. No DB dependency.
- `validateUsernameAvailability()` (`src/lib/services/username-validation.ts`):
  server-only, calls format check + `isUsernameTaken()` from session-service.

---

## 13. Roadmap

`docs/ARCHITECTURE.md` is the source of truth for target architecture and runtime contracts.
Execution planning and sequencing live in `docs/ROADMAP.md`.

Source-of-truth split:
- execution priorities, phases, milestones, and sequencing: `docs/ROADMAP.md`
- current implementation reality (done/partial/missing): `docs/STATUS.md`
- durable decision rationale: `docs/decisions/` (ADRs)

Historical roadmap/checklist content previously embedded in this file is preserved in:
- `docs/archive/ARCHITECTURE-section-13-roadmap-archive-2026-02-26.md`

Governance rule:
1. Keep this file free of sprint checklists and implementation-progress trackers.
2. Keep only stable architecture boundaries, contracts, and invariants here.
3. If a planning detail changes over time, update `docs/ROADMAP.md` instead.


## 14. Design Decisions

Key architectural decisions and their rationale, recorded as ADRs
(Architecture Decision Records).

### ADR-001: SQLite over PostgreSQL

**Decision:** Use SQLite as the sole database.

**Context:** PostgreSQL is the standard for web apps, but we're building a single-user
tool that should be trivially portable.

**Rationale:**
- MVP default: one file = entire identity (backup = copy a file)
- Zero configuration (no database server to run)
- FTS5 and sqlite-vec provide search without external services
- Performance is more than sufficient for our workload
- Aligns with local-first philosophy

**Trade-off:** Multi-user/cloud deployment will need a SQLite-per-user strategy or a
future migration to PostgreSQL for the managed service. Advanced media backends
(`fs`/`s3`) may introduce sidecar storage by choice.

### ADR-002: Component-based page generation over free-form HTML

**Decision:** The agent composes pages from pre-built components via a JSON config,
rather than generating raw HTML.

**Context:** Having the AI generate arbitrary HTML would give maximum creative freedom
but minimum consistency and reliability.

**Rationale:**
- Deterministic: same config = same page, always
- Safe: the AI cannot produce broken or ugly layouts
- Testable: components are tested independently
- Themeable: themes apply to all components uniformly
- Accessible: components are built with a11y from the start
- Recognizable: all OpenSelf pages share a visual DNA

**Trade-off:** Less creative freedom than raw HTML generation. Mitigated by offering
many components, variants, themes, and style options.

### ADR-003: Vercel AI SDK over LangChain/LiteLLM

**Decision:** Use Vercel AI SDK as the AI layer.

**Context:** Multiple options exist for LLM abstraction in TypeScript.

**Rationale:**
- Native BYOM: supports OpenAI, Anthropic, Google, Ollama with unified API
- Streaming built-in
- Tool calling built-in
- TypeScript-native (not a Python port)
- Well-maintained, backed by Vercel
- AI coding assistants generate excellent code for it

**Trade-off:** Tighter coupling with Vercel ecosystem. Acceptable because we use it
purely as an SDK, not as a platform dependency.

### ADR-004: AGPL-3.0 Outbound + CLA/CAA Inbound

**Decision:**
- Outbound project license is AGPL-3.0.
- Inbound external contributions require a signed agreement (`CLA` or `CAA`) before merge.

**Context:**
- MIT/Apache would be more permissive; GPL would protect code but not network use.
- AGPL alone does not prohibit third parties from commercial hosting/resale.
- Future dual-licensing/commercial transactions require explicit rights on contributed code.

**Rationale:**
- AGPL requires anyone who modifies and hosts OpenSelf to share source changes.
- The project remains open and copyleft-aligned by default.
- Inbound `CLA`/`CAA` gives maintainers legal clarity for relicensing, sublicensing,
  and transfer scenarios.
- Legal policy is explicit at PR time (bot-enforced), reducing ambiguity later.

**Trade-off:**
- AGPL still allows commercial use by others (with copyleft obligations).
- `CLA`/`CAA` introduces contributor friction and may reduce community PR volume.
- `CLA` is usually easier for community adoption; `CAA` gives stronger ownership control.

### ADR-005: Conversation-first over form-first

**Decision:** The primary input method is natural conversation, not forms or fields.

**Context:** Traditional profile builders use structured forms. We use an AI agent.

**Rationale:**
- Lower friction: talking is easier than filling forms
- Richer data: conversations reveal personality, not just facts
- Accessible: works for people who struggle with forms
- Engaging: people enjoy talking about themselves to an interested listener
- Flexible: the agent can ask follow-up questions that a form cannot

**Trade-off:** LLM cost per interaction. Mitigated by BYOM (user pays their own LLM
costs in self-hosted mode) and efficient prompt engineering.

### ADR-006: No separate .org and .cloud domains

**Decision:** Everything lives under a single domain: `openself.com`.

**Context:** Many open-source projects split into a .org (community) and a .com/.cloud
(commercial). This creates confusion about what's free and what's paid.

**Rationale:**
- One brand, one domain, one community
- No confusion between "free version" and "paid version"
- Self-hosted users and cloud users are the same community
- The software is identical everywhere — cloud is just hosting

### ADR-007: TypeScript connectors first, WASM later

**Decision:** Connectors are TypeScript modules in Phase 0-2. WASM is Phase 3.

**Context:** WASM would provide better sandboxing and language-agnosticism for plugins.

**Rationale:**
- TypeScript is simpler to write and debug
- The community already knows TypeScript
- Sandboxing is less critical when connectors are reviewed and included in the repo
- WASM adds significant complexity (Extism runtime, PDK, cross-compilation)
- Premature optimization: we don't know if we'll have community connectors soon

**Trade-off:** Less sandboxing, less language choice. Acceptable for early phases.
WASM migration path is clear when needed.

### ADR-008: Community Components — Build-Time Trusted First, Runtime Untrusted Later

**Decision:** In Phase 2, community React components are allowed only via build/deploy-time
installation with pinned versions. Runtime remote code loading is out of scope by default.

**Context:** Executing third-party React dynamically in Next.js is risky:
- Server execution can expose privileged runtime surfaces if not fully isolated
- Client runtime loading increases XSS/supply-chain risk
- Runtime bundling/isolation complexity is high for a small team

**Rationale:**
- Security first: reduce privilege and attack surface
- Reproducible deployments via lockfile and deterministic builds
- Simpler ops/debugging than runtime code fetch/compile
- Compatible with existing CI gates (schema, visual, a11y, performance)

**Trade-off:** Less "instant plugin install" feel. Mitigated by:
- Fast build-time installation workflow
- DSL/template contribution path for non-code customizations
- Future iframe sandbox mode for truly untrusted runtime extensions

**Future path:** If dynamic execution becomes necessary, use cross-origin sandboxed iframes
and structured message contracts only.

### ADR-009: Scalability Strategy — Design for 10K, Evolve to 1M

**Decision:** Design for 10,000 users with clean architecture, then evolve to
hyperscale. Do not prematurely optimize for 1M users.

**Context:** The architecture must support both single-user self-hosting and a
future managed cloud with many users. Over-engineering for scale now would slow
down the MVP. Under-engineering would create a dead end.

**Rationale — three key decisions:**

1. **Stateless agent** — The agent must not depend on in-memory state. Everything
   must be reconstructable from the database. This enables horizontal scaling.
2. **Async job queue** — Heartbeat, insight analysis, connector sync, and trend
   analysis must run in background workers, not in request-response handlers.
   This is already in the architecture (Section 11.5).
3. **Data access layer abstraction** — All database access goes through a repository
   layer (Drizzle ORM). No raw SQL scattered in business logic. This makes future
   database migration (SQLite → PostgreSQL) feasible without rewriting everything.

**Known scaling bottlenecks to address when needed:**

| Bottleneck | When it matters | Migration path |
|---|---|---|
| SQLite write concurrency | 100K+ users with concurrent writes | PostgreSQL (via Drizzle, same schema) |
| Heartbeat LLM cost | 100K+ users with daily heartbeat | Event-driven (skip if nothing changed), batch processing, tiered models |
| Insight/trend engine | Any user-level daily analysis | Centralized trend cache, shared knowledge graph, RAG |
| Real-time voice | High concurrent voice sessions | Edge compute, WebRTC, local Whisper |

**LLM cost is the real constraint**, not CPU, RAM, or storage. Sustainability
requires:
- Event-driven heartbeat (not blind polling)
- Multi-model routing (cheap model for simple tasks, expensive for complex)
- Local inference for lightweight functions (embedding, classification)
- Possibly fine-tuned small models for frequent operations

**Trade-off:** The current architecture is not hyperscale-ready. But it is
modular, with separated memory/agent/rendering/connector layers. Each layer
can be extracted into its own service independently. This is the right balance
for now.

### ADR-010: Agent as Identity Coach, Not Social Network

**Decision:** The agent evolves into a personal identity coach (gap analysis,
trend alignment, career navigation) but never becomes a social network.

**Context:** As the agent gains more context about the user, it could naturally
evolve toward social features (feeds, connections, engagement). This is explicitly
rejected.

**Rationale:**
- The agent works for the user, not for an advertiser or engagement algorithm
- Suggestions are private (only the user sees them), not public
- Opportunities are filtered by relevance, not engagement potential
- No vanity metrics, no comparison, no competition
- No feed, no timeline of others, no "who viewed your profile"

**The boundary:** OpenSelf is an assistant, not a platform. Users opt-in to
discovery (Section 6.9) but never to engagement mechanics.

**Trade-off:** Less viral growth potential. This is intentional — organic growth
through genuine value, not addiction mechanics.

### ADR-011: Single-User Default, Multi-User via Environment Variable

**Original decision (superseded):**
- Keep default runtime mode single-user.
- Use invite-code builder access as the first hosted hardening step.
- Defer full multi-user model to post-Phase 1.

**Amendment (2026-02-24):** Multi-user was pulled forward to Phase 0 gate. The
invite-only gate without data isolation was insufficient: all users shared the same
draft, facts, and preferences. LLM cost exposure required message limits per session.

**Current decision:**
- Default mode remains single-user (no `INVITE_CODES` env var). All data uses
  sentinel `session_id = '__default__'`. Zero behavior change for self-hosted installs.
- When `INVITE_CODES` is set, the app runs in multi-user mode: invite gate, session
  isolation, per-session facts/draft/preferences, chat message limits, and username
  registration.
- No `APP_MODE` env var needed — the presence of `INVITE_CODES` is the toggle.

**Key implementation details:**
- `sessions` table tracks invite code, message count, username, and status.
- `session_id NOT NULL DEFAULT '__default__'` added to `facts`, `page`, `agent_config`.
- NULL never used (SQLite treats NULL as distinct in UNIQUE — would break upserts).
- Draft row `id` changed from `'draft'` to session_id (`'__default__'` or UUID).
- `confirmPublish` DELETE scoped to session: prevents one user from deleting another's published pages.
- Atomic message limit: `UPDATE ... SET message_count = message_count + 1 WHERE id = ? AND message_count < ?`.
- Edge middleware checks cookie presence only; DB validation in route handlers.

**Rationale:**
- Single env var toggle keeps ops simple.
- Backward-compatible migration (sentinel value, no NULL).
- Community self-hosted installs remain unaffected.

**Trade-off:**
- Schema is slightly more complex (session_id on 3 tables, sessions table).
- Invite codes are static (env var), not managed via UI.

### ADR-012: In-House Memory over External APIs

**Decision:** Build the entire memory system (knowledge graph, semantic search,
decay, summarization) in-house using SQLite + sqlite-vec + LLM calls. Do not
use external memory APIs (Supermemory, Mem0, Zep, etc.).

**Context:** Several open-source and SaaS memory solutions exist that could
accelerate development of the agent memory layers (Section 4.5). Supermemory
offers graph memory with semantic search via API or MCP. Mem0 and Zep offer
similar capabilities. The question is build vs. buy.

**Rationale:**

- **Cost containment is a hard constraint.** OpenSelf already carries LLM API
  costs, server hosting, and domain fees. Adding another paid API for memory
  would increase per-user operating costs with no clear ceiling. The LLM is the
  single most expensive component — everything else should be as close to zero
  marginal cost as possible.
- **Local-first principle.** Memory is identity data — the most sensitive data in
  the system. Routing it through external APIs contradicts the privacy-first,
  user-owned-data guarantee. Self-hosted users would lose the "your data never
  leaves your machine" promise.
- **SQLite already provides the building blocks.** FTS5 for keyword search,
  sqlite-vec for vector similarity, and the existing KB schema for structured
  facts. The gap is not infrastructure — it is the orchestration layer (decay
  scoring, relevance signals, summarization triggers).
- **Build time is compressed.** With Claude Opus 4.6 as development accelerator,
  the time cost of building in-house is dramatically lower than traditional
  estimates. The orchestration layer is ~500-800 lines of TypeScript, not a
  multi-month project.
- **No vendor lock-in.** External memory APIs can change pricing, rate limits,
  or shut down. An in-house solution on SQLite is portable and permanent.

**Architecture reference (from Supermemory, kept as design pattern):**

The following patterns from graph memory systems are valuable and should be
implemented in-house:
- Graph structure: facts as nodes, relationships as edges (via `fact_relations` table)
- Decay scoring: `relevance = recency × reference_count × source_weight`
- Semantic search: sqlite-vec embeddings with hybrid text+vector scoring
- Intelligent forgetting: archive low-relevance facts, don't delete

**What we do NOT need from external APIs:**
- Cloud-hosted vector stores (sqlite-vec is sufficient for single-user scale)
- Cross-user knowledge graphs (OpenSelf is single-identity, not multi-tenant search)
- API-based embedding generation (can use local models via Ollama or batch via LLM provider)

**Trade-off:** More upfront development work. Mitigated by compressed build
cycles and the fact that memory is a core differentiator — not something to
outsource.

### ADR-013: Multi-Model Routing for Cost Optimization

**Decision:** Use cheap models for routine operations and capable models for
strategic decisions. Route dynamically based on task complexity.

**Context:** LLM cost is the primary operating expense (see ADR-009). Not all
agent operations require the same model capability.

**Routing policy:**

| Operation | Model tier | Examples |
|---|---|---|
| Fact extraction from chat | Cheap (Haiku, GPT-4o-mini) | Parsing user messages for new facts |
| Page section regeneration | Cheap | Recomposing a section from updated facts |
| Translation | Cheap | Translating page content to target language |
| Heartbeat KB review | Cheap | Checking for contradictions, staleness |
| Conversation summarization | Medium (Sonnet, GPT-4o) | Compressing multi-session history |
| Page voice personalization | Medium | Rewriting sections with personality/voice |
| Identity coaching / gap analysis | Capable (Opus, GPT-4) | Strategic suggestions, career navigation |
| Discovery Scout scoring | Medium | Matching opportunities to profile |

**Implementation:** `getModelForTier(tier)` in `src/lib/ai/provider.ts` accepts `"fast" | "standard" | "reasoning"` (legacy aliases: `cheap→fast`, `medium→standard`, `capable→reasoning`). Parses optional `provider:model-id` prefix in `AI_MODEL_FAST/STANDARD/REASONING` env vars — recognized prefixes are `google|openai|anthropic|ollama`. If a known prefix is found, that provider's SDK is instantiated regardless of `AI_PROVIDER`. Unknown prefixes (e.g. `llama3.2:latest`) fall through as plain model IDs. `getProviderForTier(tier)` returns the effective provider for usage recording.

**Trade-off:** More complex provider layer. But the cost savings compound: a
system that runs 80% of operations on a cheap model costs 5-10x less than one
that uses a capable model for everything.

---

## 15. Execution Spec

This section defines what the runtime must do, independent of prompt quality.

### 15.1 Ownership Boundaries

- The LLM proposes; the application enforces.
- The LLM never writes directly to database tables.
- All mutations pass through deterministic services:
  - `PromptAssembler` (system prompt block composition)
  - `TaxonomyNormalizer` (category canonicalization)
  - `VisibilityPolicy` (`private`/`proposed`/`public`/`archived` enforcement)
  - `BudgetGuard` (token/cost limits)
  - `PageConfigValidator` (schema validation before persist/render)
  - `MutationExecutor` (transaction + conflict policy)

### 15.2 Mutation Pipeline

For every write action (`create_fact`, `delete_fact`, `batch_facts`, connector ingest, heartbeat update):

1. Validate payload schema.
2. Normalize category via alias registry.
3. Apply visibility and confidence policy defaults.
4. Check LLM budget/rate limits (if LLM call is required).
5. Commit fact + page diff + audit/tool log in one transaction.
6. Enqueue follow-up jobs (render, notification, sync) idempotently.

Audit/tool log target:
- Write all non-chat operational events to `agent_events`.
- `messages.tool_calls` remains a conversation-local mirror for chat UX.

### 15.3 Taxonomy Normalization Contract

- Input: raw `category` from LLM/tool.
- Output: canonical `category` persisted in `facts.category`.
- Deterministic resolution order:
  1. Built-in aliases
  2. `category_aliases` table
  3. New canonical category registration (if valid)
- The runtime stores raw input in `agent_events.payload` for traceability.

### 15.4 Scheduler Contract

- Scheduler source of truth is the `jobs` table (`run_after`, `status`).
- Worker acquires due jobs with leasing semantics and bounded retries.
- Cron endpoints only enqueue work; they do not execute long jobs inline.

### 15.5 Media Contract

- MVP is avatar-only: one profile image upload, no gallery uploads.
- MVP default stores avatar binary in SQLite (`media_assets.blob_data`).
- Optional backends (`fs`, `s3`) are supported later without schema changes.
- Schema-level constraint: max one avatar per profile (`uniq_media_avatar_per_profile`).
- Avatar visibility uses the same `private/proposed/public/archived` state machine.
- Public rendering uses sanitized, size-bounded derivatives.

### 15.6 Taxonomy Bootstrap Contract

`category_registry` and `category_aliases` are initialized by migration seed data.

Seeded canonical categories (minimum):
- `identity`, `experience`, `project`, `skill`, `interest`, `achievement`, `activity`, `social`, `reading`
- Phase 1b additions (migration 0017): `education`, `stat`, `music`, `language`, `contact`

Seeded aliases (examples):
- `job`, `work`, `employment` -> `experience`
- `skills`, `tech` -> `skill`
- `hobby`, `hobbies` -> `activity` (remapped from `interest` in Phase 1b)
- `study`, `university`, `degree`, `school` -> `education`
- `sport`, `sports`, `volunteer`, `club` -> `activity`
- `song`, `artist`, `album` -> `music`
- `lang`, `speaks` -> `language`
- `phone`, `email`, `address` -> `contact`

Runtime behavior:
- If category is known: normalize and write.
- If category is unknown but valid: create in `category_registry` with `status='pending'`,
  write fact using the new canonical slug, and create an `agent_events` record with
  `event_type='taxonomy_review_required'`.
- Optionally enqueue `jobs.job_type='taxonomy_review'` for async reviewer workflows.
- If invalid: reject write with deterministic validation error.

### 15.7 Bootstrap Seed (SQL Reference)

Migration files (33 total, `db/migrations/0001-0033`):
- `0001`-`0011`: Phase 0 core schema, taxonomy, components, sessions, media, translation cache, etc.
- `0012`-`0016`: Phase 1a additions — agent memory expansion, conversation summaries,
  soul profiles, fact conflicts, trust ledger, heartbeat tables, jobs rebuild, schema_meta,
  profile_message_usage
- `0017`: Phase 1b — extended taxonomy (6 new categories, aliases, hobby/hobbies remap)
- `0018`: Phase 1c — section copy tables (cache, state, proposals)
- `0019`: Raise `daily_token_limit` from 150k → 500k (backfill for existing DBs)
- `0020`-`0026`: Phase 1d — connectors, avatar, translation, session compaction
- `0027`-`0029`: Episodic memory tables, FTS5, source/external_id columns
- `0030`: Memory summaries (Tier 2 CAS)
- `0031`: Job heartbeat_at column for stale job recovery
- `0032`: Connector fact category migration (interest→music/activity)
- `0033`: Content curation layer (fact_display_overrides table + curate_page job type)

Key bootstrap migrations:
- `db/migrations/0001_core_schema.sql` (creates taxonomy tables)
- `db/migrations/0002_taxonomy_seed.sql` (seeds canonical categories + aliases)
- `db/migrations/0003_component_registry.sql` (component registry bootstrap)

```sql
-- 0002_taxonomy_seed.sql
-- Canonical categories (minimum baseline)
INSERT OR IGNORE INTO category_registry (category, status, created_by) VALUES
  ('identity', 'active', 'system'),
  ('experience', 'active', 'system'),
  ('project', 'active', 'system'),
  ('skill', 'active', 'system'),
  ('interest', 'active', 'system'),
  ('achievement', 'active', 'system'),
  ('activity', 'active', 'system'),
  ('social', 'active', 'system'),
  ('reading', 'active', 'system');

-- Aliases
INSERT OR IGNORE INTO category_aliases (alias, category, source) VALUES
  ('job', 'experience', 'system'),
  ('work', 'experience', 'system'),
  ('employment', 'experience', 'system'),
  ('career', 'experience', 'system'),
  ('skills', 'skill', 'system'),
  ('tech', 'skill', 'system'),
  ('hobby', 'interest', 'system'),   -- remapped to 'activity' in 0017
  ('hobbies', 'interest', 'system'), -- remapped to 'activity' in 0017
  ('book', 'reading', 'system'),
  ('books', 'reading', 'system'),
  ('event', 'activity', 'system'),
  ('events', 'activity', 'system'),
  ('activities', 'activity', 'system');

-- 0017_extended_taxonomy.sql (Phase 1b)
-- New categories
INSERT OR IGNORE INTO category_registry (category, status, created_by) VALUES
  ('education', 'active', 'system'),
  ('stat', 'active', 'system'),
  ('music', 'active', 'system'),
  ('language', 'active', 'system'),
  ('contact', 'active', 'system'),
  ('activity', 'active', 'system');

-- Remap hobby/hobbies from interest → activity
INSERT INTO category_aliases (alias, category, source) VALUES
  ('hobby', 'activity', 'system'),
  ('hobbies', 'activity', 'system')
ON CONFLICT(alias) DO UPDATE SET category = excluded.category, source = excluded.source;
```

### 15.8 TaxonomyNormalizer (TypeScript Reference)

Suggested runtime file:
- `src/lib/taxonomy/normalizeCategory.ts`

```ts
export type NormalizeResult = {
  canonical: string;
  action: "known" | "alias" | "created_pending";
};

type TaxonomyStore = {
  findCanonical(category: string): Promise<string | null>;
  findAlias(alias: string): Promise<string | null>;
  createPendingCategory(category: string): Promise<void>;
};

const CATEGORY_RE = /^[a-z][a-z0-9-]{1,47}$/;

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export async function normalizeCategory(
  raw: string,
  store: TaxonomyStore,
): Promise<NormalizeResult> {
  const slug = toSlug(raw);
  if (!CATEGORY_RE.test(slug)) {
    throw new Error(`INVALID_CATEGORY:${raw}`);
  }

  const canonical = await store.findCanonical(slug);
  if (canonical) return { canonical, action: "known" };

  const aliasTarget = await store.findAlias(slug);
  if (aliasTarget) return { canonical: aliasTarget, action: "alias" };

  await store.createPendingCategory(slug);
  return { canonical: slug, action: "created_pending" };
}
```

### 15.9 Visibility State Machine

Fact visibility has four states and transitions are explicit, actor-dependent, and
category-sensitive:

```
private → proposed → public → archived
   ↑         ↕         │         │
   └─────────┘         │         │
   ↑    (agent/user)   │         │
   └────────────────────┘         │
   ↑         (revoke)             │
   └──────────────────────────────┘
              (reactivate as private, then re-propose)
```

**Actor-based transition matrix** (enforced by `setFactVisibility` in `kb-service.ts`):

| Actor | Category | Allowed targets | Blocked |
|-------|----------|----------------|---------|
| `assistant` | any | `proposed`, `private` | `public` (always) |
| `user` | non-sensitive | `private`, `proposed`, `public` (all directions) | — |
| `user` | sensitive | `private` only | `proposed`, `public` |
| any | sensitive | — | `public`, `proposed` (always blocked) |

Key rules:
- **Agent** can only toggle between `private` ↔ `proposed`. Never `public`.
- **User** has full control on non-sensitive facts (private ↔ proposed ↔ public).
- **Sensitive categories** (`contact`, `compensation`, `health`, `legal`) can only be
  set to `private` by user (for legacy cleanup). Never `proposed` or `public`.
- **Publish** promotes all `proposed` → `public` atomically (the "publish = approve all" model).
  This is the ONLY path from `proposed` to `public` — handled by the publish pipeline, not
  by direct visibility API calls.

**Implementation:**
- Service: `setFactVisibility(factId, target, actor, sessionId, readKeys?)` in `kb-service.ts`
- Agent tool: `set_fact_visibility` in `tools.ts` (calls with `actor: "assistant"`)
- User API: `POST /api/facts/[id]/visibility` (calls with `actor: "user"`)
- Audit: every transition logged via `logEvent` with `eventType: "fact_visibility_changed"`

Renderer mode rules:
- Draft preview: render `public + proposed` (excluding sensitive categories)
- Public page: render `public` only
- Archived facts are never rendered but remain queryable by the agent for context

### 15.10 PageConfig Validation Contract

Before any `page.config` write:
1. Validate against `PageConfig` schema (`PageConfigValidator`)
2. Run component-level `content` validators by `section.type`
3. Reject unknown/unregistered component types and invalid variants
4. Persist only schema-valid config

Renderer never queries KB during render; it consumes only persisted `PageConfig`.

### 15.11 Component Registry Contract (Phase 2+)

- Allowed `section.type` values are:
  - core allowlist in code
  - registry entries with status `certified` or `experimental` (explicit opt-in)
- Community `section.type` must match namespaced format: `x.<author>.<component>`
- Registry metadata includes at minimum:
  - `type`, `version`, `owner`, `status`
  - `content_schema_hash`
  - renderer package reference
- Validator resolves schema by `section.type` and enforces it before persistence.
- Deprecated components can still render old pages, but are blocked for new writes
  unless an explicit migration policy allows them.

### 15.12 Brand Compliance Contract (Phase 2+)

- Renderer enforces the shared token envelope (typography, spacing, radius, motion).
- Community components cannot inject:
  - global CSS overrides
  - external fonts
  - executable third-party scripts
- CI quality gates for certified components/themes:
  - schema tests
  - visual regression snapshots
  - accessibility checks
  - performance budget checks
- On policy failure:
  - fallback to a safe core variant
  - record `agent_events` entry (`event_type='component_fallback'`)

### 15.13 Schema-Repair & Failure Visibility Contract

When a `PageConfig` write fails validation:

1. Record `agent_events` (`event_type='page_config_validation_failed'`) with validator errors.
2. Run a bounded schema-repair loop:
   - feed structured validation errors back to model/tool chain
   - max attempts: 3 (configurable)
3. If all attempts fail:
   - keep previous valid page config unchanged
   - emit `event_type='page_config_retry_exhausted'`
   - return explicit user-visible message (never fail silently)

### 15.14 Live Preview Latency Contract

Current baseline (implemented):
- single-lane optimistic preview with SSE updates
- primary UI states: `idle`, `optimistic_ready`

Phase 1c implemented a two-lane update model:

- Lane A (`optimistic`): deterministic preview from extracted facts, no extra LLM call
- Lane B (`personalization`): fire-and-forget LLM personalization for impacted sections only (steady_state mode)

UI states (implemented):
- `optimistic_ready` — deterministic preview available
- Personalization runs asynchronously after page generation; next preview poll picks up personalized content via `mergeActiveSectionCopy()`
- Personalization failure is transparent — deterministic fallback is always served

Rules:
- Chat response never blocks on personalization completion.
- Preview always renders a valid page config.
- Personalization failure never clears existing preview output.

### 15.15 SQLite Concurrency Contract

Default runtime DB settings for web+worker mode:

1. `PRAGMA journal_mode = WAL`
2. `PRAGMA busy_timeout = 5000` (or deployment-specific equivalent)
3. Single-writer serialization per user for mutating workflows
4. Retry with jitter/backoff on lock contention (`SQLITE_BUSY`)
5. Idempotent mutation keys for connector/worker retries
6. **Targeted WAL checkpoint** after critical multi-write operations (e.g., user registration)
   via `sqlite.pragma("wal_checkpoint(PASSIVE)")`. This ensures data survives process kill
   between writes and the next auto-checkpoint. PASSIVE mode does not block readers/writers.

`SQLITE_BUSY` incidents must be logged in `agent_events` with context (actor, job/message id).

Test-mode contract (Vitest/local CI):

1. Parallel test workers must not share the same SQLite file.
2. DB path is worker-scoped (example: `db/openself.test-worker-<id>.db`), with optional explicit override via `OPENSELF_DB_PATH`.
3. This isolation is mandatory for DB-writing suites to avoid flaky `database is locked` failures.

Migration runner compatibility rule:

1. Migrations that contain `CREATE VIRTUAL TABLE` (FTS5) must be executed outside explicit transaction wrappers.
2. Non-virtual-table migrations remain transactional (atomic apply + `_migrations` insert).

### 15.16 Fact Conflict Resolution Contract (Implemented — Phase 1a)

Source precedence (highest to lowest, numeric weight):

1. `user_explicit` (4) — user directly stated or confirmed
2. `chat` (3) — extracted from conversation by the agent
3. `connector` (2) — imported from external service
4. `heartbeat` (1) — inferred during autonomous maintenance

**Auto-skip rule:** When precedence difference >= 2, the higher-precedence value wins
automatically and no conflict record is created.

**Resolution paths:**
1. Agent resolves via `resolve_conflict` tool during conversation
2. User resolves via `POST /api/conflicts/:id/resolve` API
3. Auto-expire: unresolved conflicts are dismissed after 7 days (heartbeat_deep cleanup)

**Resolution types:** `kept_existing`, `accepted_new`, `merged` (with `merged_value`), `dismissed`

Merge rules:
- Contradictory lower-priority facts are recorded in `fact_conflicts`, not silently overwritten.
- Preserve provenance (`source`, timestamps, confidence) for every competing value.
- Public rendering uses only the winning fact per conflict set.
- All conflict decisions are logged in the `trust_ledger` (action_type='conflict_resolved')
  and emitted to `agent_events`.
- Open conflicts are injected into the system prompt (200 token budget) for agent awareness.

### 15.17 Observability Contract

Runtime reliability requires a minimum event taxonomy:

- `page_config_validation_failed`
- `page_config_retry_exhausted`
- `component_fallback`
- `sqlite_busy_retry`
- `fact_conflict_resolved`
- `budget_warning`

Minimum operational counters (Phase 0-1):
- validation failures per day
- retry-exhausted count per day
- synthesis failure rate
- sqlite lock retry count
- unresolved conflict queue size

No silent failure path is allowed in chat, worker, or connector execution.

### 15.18 Community Component Isolation Contract (Phase 2+)

Execution trust levels:

1. **Core components** (first-party): fully trusted
2. **Certified community packages**: trusted-by-review, installed at build-time only
3. **Untrusted runtime extensions**: disallowed by default; require iframe sandbox mode

Mandatory rules (Phase 2 default mode):
- No runtime fetching/executing remote React component bundles in request path
- Community packages must be version-pinned and resolved during build/deploy
- Registry activation requires `certified` status + explicit operator opt-in
- Rendering inputs are strictly schema-validated JSON; no eval/dynamic code paths
- Policy violations must emit `agent_events` (`event_type='component_policy_violation'`)

If iframe sandbox mode is enabled (future):
- Must use cross-origin iframe with restrictive `sandbox` attributes
- Parent/child communication only via typed `postMessage` contracts
- No direct DOM, cookie, localStorage, or server secret access from sandboxed extension
- On sandbox failure/timeouts, fallback to safe core component and log event

### 15.19 Low-Signal Onboarding Contract (`utente muto`)

The onboarding flow must handle users who provide minimal answers (short/low-information
messages or voice snippets) without hallucinating facts or stalling the experience.

Signal detection heuristics (combined):
- consecutive short replies
- low fact extraction yield per turn
- repeated generic replies ("yes", "ok", "non so", ...)

State machine:
1. `normal_interview`
2. `guided_prompts` (short, concrete choices instead of open prompts)
3. `quick_profile_mode` (minimal viable page with explicit "improve later" CTA)

Rules:
- Never fabricate details to fill gaps.
- Prefer confidence-safe defaults and generic copy over invented claims.
- Keep to at most 3 questions in a row before showing a tangible page update.
- If signal remains low after bounded attempts, publish-ready draft can still be produced
  with minimal sections (`hero`, short `bio`, optional `social`) and marked as editable.

Required fallback UX:
- Offer selectable prompt chips/examples ("Current role", "Projects", "Interests", "Links")
- Offer "skip for now" paths for each topic
- Show progress feedback ("I can already publish a basic page; we can enrich it later")

Observability:
- Emit `agent_events`:
  - `onboarding_low_signal_detected`
  - `onboarding_guided_prompt_used`
  - `onboarding_quick_profile_generated`
- Track metrics:
  - `% onboarding sessions entering low-signal mode`
  - publish completion rate from low-signal sessions
  - 7-day enrichment rate (users who come back and improve profile)

---

## Appendix: What This Document Replaces

This document consolidates and replaces the following files as the source of truth
for what we are building:

| File | Status |
|---|---|
| `01_IDEA.md` | Superseded. Core idea is in Sections 1-2. |
| `02_ANALISI_MERCATO.md` | Reference only. Market research, not architecture. |
| `03_ARCHITETTURA_E_MODELLO.md` | Superseded. Architecture is here. Business model deferred. |
| `04_RISCHI_E_SFIDE.md` | Reference only. Risk analysis, not architecture. |
| `05_IDEE_AGGIUNTIVE.md` | Partially incorporated. Features are in the Roadmap. |
| `06_VISION_DISRUPTIVA.md` | Reference only. Manifesto/philosophy, not building spec. |
| `07_ARCHITETTURA_PROTOCOLLO.md` | Phase 3 reference. Protocol comes after the product. |
| `08_STRATEGIA_BUSINESS.md` | Deferred. Business strategy comes after product-market fit. |
| `09_UX_ESPERIENZA_UMANA.md` | Core principles incorporated in Section 9. Full doc is reference. |
| `10_GOVERNANCE_E_STRUTTURA.md` | Deferred. Governance structure comes after traction. |
| `11_MVP_PIANO_CONCRETO.md` | Superseded. Build plan is in the Roadmap (Section 13). |

The old files remain in the repo as background research. **This document is what we build from.**
