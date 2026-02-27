# OpenSelf Model-Agnostic Agent Experience Plan (Revised)

Last updated: 2026-02-27
Owner: engineering
Status: revised (user-experience first)

## 1) Why This Revision

This plan is revised to optimize for the real user journey, not only backend architecture.
The LLM is the execution engine and the guide of the whole experience.

Primary product requirement:
- every user should feel the agent knows where they are in the journey,
  what was done before, and what the best next step is.

This means:
1. no generic openings for known users
2. state-aware guidance for each situation
3. deterministic runtime control for high-risk operations (layout/theme/widget/publish)
4. model-agnostic quality guarantees across providers

## 2) Experience Contract (Non-Negotiable)

### 2.1 User-first invariants

1. If user is known, the first assistant message must be contextual and personalized.
2. The assistant must always propose a concrete next action (not generic closure).
3. The assistant must not ask for information already known in KB/history.
4. Visual and publish changes must be explained before execution when impact is high.
5. If user is blocked (quota, auth, publish mismatch), assistant provides immediate recovery path.

### 2.2 Opening message policy

A known user must never receive a static welcome like:
- "Hey! I'm going to build your personal page..."

Instead use context-aware openings.

Examples:
1. Returning published user:
- "Bentornato Tommaso. La tua pagina `/tommaso` e live: vuoi aggiornare lavoro, progetti o layout oggi?"
2. Returning user with stale page:
- "Bentornato Tommaso. La pagina non viene aggiornata da un po': iniziamo da cosa e cambiato nelle ultime settimane?"
3. Returning user with pending proposals:
- "Ho 2 proposte in sospeso su tono e bio. Vuoi rivederle prima o procediamo con nuovi aggiornamenti?"

## 3) User Journey State Matrix

This matrix defines behavior requirements the runtime must enforce.

1. `new_anonymous_no_facts`
- First message: guided onboarding opener.
- Agent behavior: breadth-first discovery, low-friction prompts.
- Exit condition: enough facts -> generate draft.

2. `new_authenticated_no_page`
- First message: personalized onboarding with username mention if available.
- Agent behavior: fast path to first draft and publish.
- Exit condition: draft created + publish suggestion.

3. `returning_with_published_page_recent`
- First message: short personalized check-in with known context.
- Agent behavior: quick updates, avoid interview mode.
- Exit condition: facts updated, optional regenerate/publish.

4. `returning_with_published_page_stale`
- First message: acknowledge inactivity + guided update options.
- Agent behavior: structured catch-up (work, projects, interests).
- Exit condition: key sections refreshed.

5. `returning_with_draft_pending_publish`
- First message: explain pending state and ask whether to review/publish.
- Agent behavior: preflight + confirmation.
- Exit condition: publish confirmed or draft revised.

6. `returning_no_username_authenticated`
- First message: context + clear instruction to claim username when needed.
- Agent behavior: avoid dead-end publish attempts.
- Exit condition: username set and publish flow available.

7. `limit_reached_with_publishable_draft`
- First message: direct CTA to publish, no generic apology loop.
- Agent behavior: unblock path in <= 1 step.
- Exit condition: publish requested.

8. `layout_edit_request`
- First message: confirm intent + summarize impact scope.
- Agent behavior: inspect -> simulate -> explain -> apply.
- Exit condition: patch applied or alternatives proposed.

9. `low_signal_user`
- First message: options/chips style prompt.
- Agent behavior: guided prompts -> fill-in -> minimal fallback.
- Exit condition: minimal viable page built.

10. `error_recovery`
- First message: explain what failed + retry plan.
- Agent behavior: keep user state, no full reset.
- Exit condition: previous action retried or alternative path.

## 4) Agent Behavior Architecture (Runtime + Prompt + Skills)

Behavior must be distributed across three layers:

1. Runtime state engine (source of truth)
- detects journey state from auth, page status, history, proposals, freshness.

2. Prompt policy (execution style)
- enforces turn behavior by state.

3. Skills (task procedure)
- gives deterministic playbooks for onboarding, layout edits, publish, heartbeat, etc.

No single layer is sufficient alone.

## 5) Revised Scope

In scope:
1. Journey-state engine and contextual bootstrap message
2. Model-agnostic AI router v2
3. Structured output hardening
4. Layout/theme/widget control plane
5. Domain control plane expansion (facts, heartbeat, publish)
6. Skills package v1 aligned to user states
7. MCP connector gateway foundation
8. Cross-provider eval and rollout

Out of scope:
1. Theme visual redesign program
2. Pricing/monetization refactor
3. Generic multi-product assistant framework

## 6) Success Metrics (User-facing + Technical)

User-facing:
1. Generic opening rate for known users = 0%
2. First-turn usefulness score >= 90% (internal eval rubric)
3. User-reported "agent understood my context" >= 85%
4. Layout edit success without manual correction >= 95%

Technical:
1. Same acceptance matrix passes on OpenAI/Anthropic/Google
2. No provider hardcoding in domain services
3. No publish/privacy regression
4. P95 latency impact <= +20%

## 7) Execution Tracks

- Track A: User Journey and Conversation Intelligence
- Track B: Model-Agnostic Core
- Track C: Control Plane APIs
- Track D: Skills and Operational Playbooks
- Track E: MCP Connector Gateway
- Track F: Evals, Observability, Rollout

## 8) Phase Plan

### Phase 0 - Journey Contract and Baseline Alignment (2-3 days)

Objective:
Lock user-state behavior contract before implementation.

Deliverables:
1. ADR-0011 model-agnostic runtime contract
2. ADR-0012 conversation journey-state contract
3. Feature flags list + rollout policy

Flags:
- `JOURNEY_STATE_V1`
- `CONTEXTUAL_BOOTSTRAP_V1`
- `MODEL_ROUTER_V2`
- `STRUCTURED_OUTPUT_V2`
- `LAYOUT_CONTROL_PLANE_V1`
- `DOMAIN_CONTROL_PLANE_V1`
- `MCP_CONNECTOR_GATEWAY_V1`

Acceptance:
- explicit mapping from user states to expected first message and action policy.

---

### Phase 1 - Contextual Bootstrap Messages (4-6 days)

Objective:
Replace static welcome with state-aware personalized bootstrap.

Deliverables:
1. Server-generated bootstrap payload for chat start
2. Contextual first assistant message by journey state
3. Fallback policy when data unavailable

Implementation:
- New endpoint: `GET /api/chat/bootstrap`
- New service: `src/lib/agent/bootstrap.ts`
- Inputs:
  - auth state
  - published/draft state
  - last update freshness
  - pending proposals/conflicts
  - language
- Output:
  - `journeyState`
  - `initialAssistantMessage`
  - `suggestedNextActions[]`

UI changes:
- `src/components/chat/ChatPanel.tsx`
  - remove static-first assumption for known users
  - load bootstrap before welcome fallback
  - keep current fallback for network failure

Tests:
- `tests/evals/chat-bootstrap.test.ts`
- extend `tests/evals/chat-context-integration.test.ts`

Acceptance:
- known user never gets generic static welcome.

---

### Phase 2 - Journey State Engine in Context Assembly (4-6 days)

Objective:
Move from `onboarding|steady_state` to richer journey signals.

Deliverables:
1. `JourneyState` enum and detector
2. state blocks injected into system context
3. state-specific behavior rules in prompts

Implementation:
- `src/lib/agent/context.ts`
  - add `detectJourneyState(...)`
  - include blocks: freshness, pending proposals, publish status, session goal
- `src/lib/agent/prompts.ts`
  - add policy sections by state, not only mode
- preserve compatibility with existing `PromptMode`

Suggested state enum:
- `new_user`
- `new_user_low_signal`
- `draft_ready_for_review`
- `published_recent`
- `published_stale`
- `publish_blocked_auth`
- `publish_blocked_username`
- `recovery_mode`

Tests:
- `tests/evals/journey-state-detection.test.ts`
- `tests/evals/drill-down-context.test.ts` update for state rules

Acceptance:
- first 2 turns are state-consistent in all key scenarios.

---

### Phase 3 - Model Router v2 (5-7 days)

Objective:
Guarantee model-agnostic execution quality via capability routing.

Deliverables:
1. capability registry
2. task profile router (`cheap|medium|capable`)
3. fallback chain with reason codes
4. remove provider coupling leaks

Implementation:
- `src/lib/ai/capabilities.ts`
- `src/lib/ai/task-profiles.ts`
- `src/lib/ai/router.ts`
- `src/lib/ai/client.ts`

Refactors:
- `src/app/api/chat/route.ts`
- `src/lib/services/summary-service.ts` (remove hardcoded provider)
- `src/lib/ai/translate.ts`
- `src/lib/services/section-personalizer.ts`
- `src/lib/services/conformity-analyzer.ts`

Tests:
- `tests/evals/model-router.test.ts`
- `tests/evals/model-fallback.test.ts`

Acceptance:
- same task profile executes across providers without behavior drift beyond tolerance.

---

### Phase 4 - Structured Output Hardening (4-6 days)

Objective:
Make structured tasks robust across different model output styles.

Deliverables:
1. unified structured generation utility
2. repair loop standardization
3. structured translation pipeline

Implementation:
- `src/lib/ai/structured.ts`
- migrate translation from free-text parse to schema output
- apply utility to personalization and conformity

Tests:
- extend `tests/evals/translate.test.ts`
- extend `tests/evals/section-personalizer.test.ts`
- extend `tests/evals/conformity-analyzer.test.ts`

Acceptance:
- structured task parse failures reduced to near zero in provider matrix.

---

### Phase 5 - Layout/Theme/Widget Control Plane v1 (7-10 days)

Objective:
Ensure high-quality guided layout edits.

Deliverables:
1. layout patch DSL
2. inspect/simulate/apply tool sequence
3. diff explanation payload for user-facing confirmation
4. compatibility shim for legacy tools

Patch operations:
- `set_layout_template`
- `move_section`
- `set_section_widget`
- `set_section_slot`
- `set_theme`
- `set_style_token`
- `set_lock`

Implementation:
- `src/lib/layout/patch-schema.ts`
- `src/lib/layout/patch-simulator.ts`
- `src/lib/layout/patch-apply.ts`
- `src/lib/layout/patch-diff.ts`
- tools in `src/lib/agent/tools.ts`:
  - `inspect_layout_state`
  - `simulate_layout_patch`
  - `apply_layout_patch`

Prompt/skill constraints:
- assistant must run inspect->simulate before apply.
- assistant must explain expected visual impact in plain language.

Tests:
- `tests/evals/layout-control-plane.test.ts`
- `tests/evals/layout-simulator.test.ts`
- extend `tests/evals/publish-pipeline-layout-gate.test.ts`

Acceptance:
- no blind layout mutation from assistant.

---

### Phase 6 - Domain Control Plane Expansion (7-10 days)

Objective:
Replicate deterministic control pattern in other critical domains.

6A Facts:
- `inspect_fact_state`, `simulate_fact_patch`, `apply_fact_patch`
- tests: `tests/evals/fact-control-plane.test.ts`

6B Personalization/proposals:
- inspect/simulate proposal impact and stale guards
- tests: extend personalization/proposal evals

6C Heartbeat:
- remove hardcoded `en`, use preference language
- planner for plan/simulate/apply heartbeat actions
- tests: extend heartbeat/scheduler evals

6D Publish:
- `publish_preflight` tool with explicit checklist result
- tests: `tests/evals/publish-preflight.test.ts`

Acceptance:
- all high-risk mutations have inspect/simulate/apply interfaces.

---

### Phase 7 - Skills Package v1 (5-8 days)

Objective:
Make behavior reusable and predictable per user scenario.

Skill set:
- `openself-onboarding`
- `openself-returning-published`
- `openself-returning-stale`
- `openself-layout-editor`
- `openself-theme-styling`
- `openself-publish-gate`
- `openself-heartbeat-light`
- `openself-heartbeat-deep`
- `openself-conflict-resolution`

Requirements:
1. Each skill maps to explicit journey states.
2. Each skill includes do/don't behavioral rules.
3. Each skill references required tool sequence.

Tests:
- `tests/evals/skill-prompts-smoke.test.ts`

Acceptance:
- prompt remains lean; state behaviors live in skills + runtime state engine.

---

### Phase 8 - MCP Connector Gateway Foundation (6-9 days)

Objective:
Integrate external sources in model-agnostic way.

Deliverables:
1. connector gateway abstraction
2. MCP client adapter
3. GitHub pilot through gateway

Implementation:
- `src/lib/connectors/gateway.ts`
- `src/lib/connectors/mcp-client.ts`
- `src/lib/connectors/providers/github-mcp.ts`
- wire `connector_sync` in worker

Acceptance:
- connector events normalized before reaching agent tools.

---

### Phase 9 - Observability, Evals, and Rollout (5-7 days)

Objective:
Release with measurable quality and safe rollback.

Deliverables:
1. trace fields per AI call:
- `journeyState`, `taskProfile`, `tier`, `provider`, `model`, `fallbackCount`, `repairCount`
2. cross-provider eval matrix
3. canary and rollback playbook

Rollout order:
1. `JOURNEY_STATE_V1` + `CONTEXTUAL_BOOTSTRAP_V1` (staging)
2. `MODEL_ROUTER_V2`
3. `STRUCTURED_OUTPUT_V2`
4. `LAYOUT_CONTROL_PLANE_V1`
5. `DOMAIN_CONTROL_PLANE_V1`
6. `MCP_CONNECTOR_GATEWAY_V1`

Acceptance:
- no regressions in privacy/publish guarantees
- UX metrics improve for returning users

## 9) Test Strategy

Unit:
- journey state detection
- bootstrap message selection
- router capability matching
- structured repair utility
- patch simulator semantics

Integration:
- chat bootstrap + messages history merge
- layout inspect/simulate/apply flow
- publish preflight + publish pipeline
- heartbeat language selection + planning

E2E (required scenarios):
1. first visit anonymous -> first draft -> publish
2. returning published user -> personalized greeting -> small update -> publish
3. returning stale user -> guided catch-up -> section refresh
4. layout request -> inspect/simulate/apply with explanation
5. quota reached -> unblock path without dead-end

Cross-provider matrix:
- OpenAI
- Anthropic
- Google
- Optional local sanity: Ollama

## 10) Risks and Mitigations

Risk 1: Extra latency from control loops.
- Mitigation: fast local simulation and batched patches.

Risk 2: Journey-state false positives.
- Mitigation: deterministic priority rules + scenario evals.

Risk 3: Skill drift over time.
- Mitigation: skill ownership and periodic validation.

Risk 4: MCP instability.
- Mitigation: gateway isolation, retries, circuit breakers.

## 11) Definition of Done

Done when all are true:
1. Returning known users always receive contextual first message.
2. Agent proposes clear next step in first 2 turns for all core journey states.
3. No provider hardcodes outside AI adapter/router/pricing tables.
4. Layout/theme/widget changes always use inspect/simulate/apply path.
5. Structured output utility adopted in translation/personalization/conformity.
6. Heartbeat language is user-preference-aware.
7. Skills v1 package shipped and linked to journey states.
8. Connector gateway pilot running behind flag.
9. Cross-provider eval matrix green.
10. Roadmap/status updated with shipped items.

## 12) Immediate Next Actions (Week 1)

1. Approve ADR-0011 and ADR-0012 drafts.
2. Implement chat bootstrap endpoint + contextual greeting in ChatPanel.
3. Add journey-state detector v1 in context assembler.
4. Add evals for returning user greeting (published/stale/pending).
5. Start router v2 skeleton and remove summary provider hardcode.
