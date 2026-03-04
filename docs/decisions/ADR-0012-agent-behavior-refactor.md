# ADR-0012: Agent Behavior Refactor — Constraints-by-Construction Prompt Pipeline

**Date:** 2026-03-04
**Status:** Implemented
**Deciders:** Engineering

---

## Context

A systematic review of the prompt/context pipeline identified 22 issues across 6 categories:

1. **Dead code accumulation** — `promptAssembler.ts`, `onboardingPolicy()`, `steadyStatePolicy()`, `getSystemPromptText()`, `getPromptContent()` were all reachable but no longer the canonical path. The legacy path was silently diverging from the composable path.

2. **Situation eligibility enforced at runtime** — Nothing prevented an ineligible situation (e.g., `has_archivable_facts` in `first_visit`) from being injected if the detection layer misfired. Eligibility was checked inside `build()`, not at composition time.

3. **Duplicate rule injection** — `SEARCH_FACTS_RULE` appeared verbatim in 3 separate policy files (`returning-no-page.ts`, `planning-protocol.ts`, inline in context). Any change required 3 edits.

4. **Schema token waste** — The full fact schema reference (~1800 tokens) was injected regardless of journey state. In `draft_ready`, `active_fresh`, and `blocked` states the agent already has complete context; the schema added cost with no benefit.

5. **Archetype re-detection was session-scoped** — The profile archetype (designer, executive, student, etc.) was re-detected on every cold start, adding latency and producing inconsistent results as facts accumulated across sessions.

6. **Soul proposal cooldown was session-meta** — The 30-day cooldown for soul change proposals was tracked in session metadata, which meant it reset on new sessions and did not survive multi-session correctly.

7. **Welcome message logic scattered** — Three separate maps (`FIRST_VISIT_WELCOME`, `RETURNING_WELCOME`, `DRAFT_READY_WELCOME`) plus two functions (`getWelcomeMessage`, `getSmartWelcomeMessage`) handled the same concern with different dedup logic per language.

8. **INCOMPLETE_OPERATION always re-surfaced** — Stale pending operations were injected every turn regardless of whether the user had moved on to a new topic, creating repetitive prompting.

9. **`STEP_EXHAUSTION_FALLBACK` in `route.ts`** — Next.js App Router rejects non-standard named exports from route files. This was a latent build risk.

10. **CORE_CHARTER missing behavioral constraints** — No register policy (informal/formal), no banned opener list, no emoji policy, no explicit response length rules.

---

## Decision

Apply a **constraints-by-construction** approach: make invalid states impossible to produce rather than catching them at runtime.

### Key decisions

**1. DIRECTIVE_POLICY matrix** (`src/lib/agent/policies/directive-registry.ts`)

`DIRECTIVE_POLICY` becomes the single source of truth for every situation's behavior.
Each entry declares:
- `eligibleStates: JourneyState[]` — only these states may produce this directive
- `priority: number` — lower = higher priority in composed output
- `incompatibleWith: Situation[]` — symmetric mutual exclusion
- `build(ctx)` — directive text factory

`getSituationDirectives()` filters by eligibility before calling `build()` — by
construction, an ineligible situation cannot be injected. `validateDirectivePolicy()`
runs at startup and in CI to enforce no self-conflicts, symmetric incompatibilities,
and valid state references.

**2. `schemaMode: "full" | "minimal" | "none"`** replaces `includeSchemaReference: boolean`

Per-state assignment:
| State | schemaMode |
|---|---|
| `first_visit` | `minimal` |
| `returning_no_page` | `full` |
| `draft_ready` | `none` |
| `active_fresh` | `none` |
| `active_stale` | `minimal` |
| `blocked` | `none` |

`minimal` uses `buildMinimalSchemaForOnboarding()` (~300 tokens). Estimated savings:
~1500–1800 tokens per turn in `none`/`minimal` states.

**3. `sortFactsForContext()`** with guaranteed recency quota

Top 5 most-recently-updated facts are always included regardless of relevance score.
The remaining 45 slots are filled by scored relevance. `childCountMap` is added to
`BootstrapData` to pre-compute parent→child counts for scoring without DB round-trips.

**4. Archetype TTL + identity invalidation**

`ARCHETYPE_TTL_DAYS = 14`. `shouldRedetectArchetype()` (exported from `journey.ts`)
re-detects only when: (1) never detected, (2) TTL expired, or (3) a role/title fact
was updated after the last detection timestamp. Owner-scoped — survives multi-session.

**5. Soul proposal cooldown owner-scoped**

`getSoulProposalCooldownStatus()` queries `soul_change_proposals` directly. 30-day
cooldown per `owner_key`, not per session. Survives multi-session correctly.

**6. `buildWelcomeMessage()`** replaces 3 maps + 2 functions

Single function in `ChatPanel.tsx` handling all 6 journey states. All messages share
`id: 'welcome'` — dedup is id-based (language-agnostic). `blocked` uses
`QUOTA_EXHAUSTED_MESSAGES` for coherence with `LimitReachedUI`.

**7. `isNewTopicSignal()`** gates INCOMPLETE_OPERATION injection

`src/lib/agent/policies/topic-signal-detector.ts`. Multi-language action-verb patterns +
continuation-first logic. Long messages (>30 chars) always signal new topic. Prevents
repetitive re-surfacing of stale pending operations.

**8. `SEARCH_FACTS_RULE` canonical constant**

`src/lib/agent/policies/search-facts-rule.ts`. Single definition injected only via
`memoryUsageDirectives()`. Removed from all other injection points.

**9. `STEP_EXHAUSTION_FALLBACK` extracted**

Moved to `src/lib/agent/step-exhaustion-fallback.ts`. Journey-state-keyed, 8 languages,
R3-compliant (no passive closings). Safe to import from route files.

**10. Two new situations**

- `has_archivable_facts` — eligible in `active_stale` only. Facts older than 90 days with low confidence, suggesting archival.
- `has_recent_import` — eligible in returning/active states. Connector import processed in last 24h; prompts gap review.

**11. CORE_CHARTER behavioral constraints added**

- REGISTER block: always informal (tu/du/vous non-formal), overridable by explicit user preference
- OPENING BANS: explicit list of banned filler openers ("Certamente!", "Of course!", etc.)
- EMOJI POLICY: only if user uses first, max 1 per message
- LANGUAGE HANDLING: switch seamlessly without announcing the switch
- RESPONSE LENGTH: 1–2 sentences for confirmations, 3–5 max for explanations

**12. OUTPUT_CONTRACT PATTERN VARIATION block**

No same acknowledgment on consecutive turns. Don't always close with a question.
No 3 consecutive turns opening the same way. Never start two consecutive messages
with the same word.

**13. Dead code removal**

- `promptAssembler.ts` — deleted
- `onboardingPolicy()`, `steadyStatePolicy()`, `getSystemPromptText()`, `getPromptContent()` — deleted from `prompts.ts`
- `PromptMode` — marked `@deprecated`
- `getWelcomeMessage()`, `getSmartWelcomeMessage()`, `WELCOME_MESSAGES` — deleted from `ChatPanel.tsx`
- Legacy fallback in `context.ts` now uses `buildSystemPrompt()` with `first_visit` defaults

---

## Key Invariants

1. **Eligibility by construction**: a situation directive cannot be injected in an ineligible journey state — the filter runs before `build()`, not inside it.
2. **Single source of truth per rule**: `SEARCH_FACTS_RULE`, step exhaustion fallback, and welcome message logic each have exactly one definition.
3. **Schema tokens proportional to need**: states with full context (`draft_ready`, `active_fresh`, `blocked`) inject no schema; states beginning data collection inject minimal or full schema.
4. **Archetype stability**: the profile archetype is stable for 14 days unless identity facts change, preventing per-session drift.
5. **Soul cooldown cross-session**: the 30-day cooldown is tied to `owner_key` in the DB, not to any session object.
6. **Startup validation**: `validateDirectivePolicy()` fails fast at boot if the policy matrix has internal inconsistencies.

---

## Consequences

**Positive:**
- ~1500–1800 token savings per turn in `none`/`minimal` schema states
- Ineligible situation injection is impossible by construction
- Single definition for all cross-cutting rules — changes need one edit, not three
- Archetype detection latency eliminated for 14-day windows
- Soul cooldown is session-independent
- Welcome message dedup works across languages without per-language maps
- INCOMPLETE_OPERATION repetition eliminated for users who have moved on

**Negative / Trade-offs:**
- `DIRECTIVE_POLICY` matrix is a new concept that contributors must understand before adding situations
- `validateDirectivePolicy()` adds ~5ms to startup (acceptable)
- `schemaMode` adds a per-state config decision; wrong assignment would silently degrade agent quality (mitigated by code review)

---

## Files Created

- `src/lib/agent/policies/directive-registry.ts` — DIRECTIVE_POLICY matrix + validateDirectivePolicy
- `src/lib/agent/policies/topic-signal-detector.ts` — isNewTopicSignal()
- `src/lib/agent/policies/search-facts-rule.ts` — SEARCH_FACTS_RULE canonical constant
- `src/lib/agent/step-exhaustion-fallback.ts` — STEP_EXHAUSTION_FALLBACK (moved from route.ts)

## Files Modified

- `src/lib/agent/prompts.ts` — CORE_CHARTER rewrite, OUTPUT_CONTRACT PATTERN VARIATION, dead code removed
- `src/lib/agent/context.ts` — sortFactsForContext(), schemaMode, childCountMap in BootstrapData, legacy fallback updated
- `src/lib/agent/journey.ts` — ARCHETYPE_TTL_DAYS, shouldRedetectArchetype(), getSoulProposalCooldownStatus(), 2 new situations
- `src/lib/agent/policies/situations.ts` — has_archivable_facts, has_recent_import
- `src/lib/agent/policies/memory-directives.ts` — SEARCH_FACTS_RULE import, GOLDEN RULE clarified with examples
- `src/lib/agent/policies/returning-no-page.ts` — SEARCH_FACTS_RULE deduplication
- `src/lib/agent/policies/planning-protocol.ts` — SEARCH_FACTS_RULE deduplication
- `src/components/chat/ChatPanel.tsx` — buildWelcomeMessage(), legacy welcome functions deleted
- `src/app/api/chat/route.ts` — STEP_EXHAUSTION_FALLBACK import updated

## Files Deleted

- `src/lib/agent/promptAssembler.ts`
