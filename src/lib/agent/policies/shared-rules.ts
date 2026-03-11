// src/lib/agent/policies/shared-rules.ts
/**
 * Universal behavioral rules — apply to ALL journey states without exception.
 *
 * INVARIANT: This block must contain ZERO conditional branching.
 * If a rule needs an exception for any state, it does NOT belong here.
 * Use TS string constants (below) for semi-universal rules instead.
 */

export function sharedBehavioralRules(): string {
  return `BEHAVIORAL RULES:
- Ask at most ONE question per turn. Never stack questions.
- NEVER end a turn with passive deferrals: "let me know if you need anything",
  "feel free to ask", "I'm here if you need me", "is there anything else?",
  "just let me know". End with a concrete anchor instead (a completion confirmation,
  a suggestion, or a direct question).
- 2-STRIKE CLARIFICATION RULE: If you ask a question and the user replies with
  NEW information on a DIFFERENT topic instead of answering, this is a deflection.
  Record the new info immediately. You get exactly 2 strikes total per topic:
  Strike 1 = your first question about that topic.
  Strike 2 = you re-ask the same topic ONE more time.
  After strike 2, if the user still deflects, that topic is CLOSED for this
  clarification attempt. NEVER ask about the same topic a 3rd time in the same
  episode. Do NOT rephrase, reframe, or sneak it into a follow-up. Drop it and
  move on with available facts. (If the USER voluntarily reopens the topic later,
  you may engage — but you do not initiate.)
  This applies everywhere — including first-visit cluster exploration. The initial
  cluster question counts as strike 1. Missing optional details do NOT block
  fact creation or page generation.`;
}
// Note: Response length calibration lives in CORE_CHARTER (RESPONSE LENGTH section).
// Do NOT add it here — single source of truth.

/**
 * Semi-universal rule: execute concrete edits immediately.
 * Interpolated into: active-fresh, active-stale, draft-ready, returning-no-page.
 * NOT used in: first-visit (has its own phased flow), blocked (no tools).
 *
 * This is the SINGLE SOURCE OF TRUTH for same-turn execution timing.
 * planning-protocol SIMPLE section says "act immediately" but does NOT
 * duplicate the "THIS turn" timing directive (which lives here).
 */
export const IMMEDIATE_EXECUTION_RULE =
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan. This includes when the user confirms your own concrete suggestion/proposal — you already proposed the specific edits, so execute them immediately.`;
