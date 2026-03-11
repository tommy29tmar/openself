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
- If you asked for a clarification and the user replies with NEW information
  instead of answering: record the new info immediately. Re-ask the SAME
  question exactly ONCE more — then STOP. If the user deflects a second time,
  drop that topic permanently and proceed with available facts.
  Count: 1st ask → user deflects → 2nd ask (final) → user deflects again → move on.
  NEVER ask the same clarification a 3rd time. Missing optional dates, levels,
  or descriptions do NOT block fact creation or page generation.`;
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
  `When the user asks for a concrete edit and you have enough info, execute the tool call in THIS turn. Do NOT respond with only a plan.`;
