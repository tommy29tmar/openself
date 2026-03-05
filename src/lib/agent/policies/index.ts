import type { JourneyState, ExpertiseLevel } from "@/lib/agent/journey";
import type { ImportGapReport } from "@/lib/connectors/import-gap-analyzer";
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
  archivableFacts: string[];
  importGapReport?: ImportGapReport;
  pendingSoulProposals?: Array<{ id: string; overlay: Record<string, unknown>; reason: string }>;
  pendingEpisodicPatterns?: Array<{ id: string; actionType: string; patternSummary: string }>;
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
// Situation Directives — re-exported from directive-registry (Task 3/4)
// ---------------------------------------------------------------------------

export { getSituationDirectives, DIRECTIVE_POLICY } from "@/lib/agent/policies/directive-registry";
export { validateDirectivePolicy } from "@/lib/agent/policies/validate-directive-policy";

// ── Startup validation (TOP-LEVEL, outside any function) ─────────────────────
// Executes at module import time — before any request is served.
import { validateDirectivePolicy as _validateOnStartup } from "@/lib/agent/policies/validate-directive-policy";
import { DIRECTIVE_POLICY as _DIRECTIVE_POLICY } from "@/lib/agent/policies/directive-registry";
_validateOnStartup(_DIRECTIVE_POLICY);

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
You are talking to someone new to this tool. Explain structural and visual actions (page generation, publishing, layout/theme changes). Save facts silently — only explain actions that visibly change what the user sees. This expertise calibration takes precedence over planning-protocol verbalization rules for fact saves: even COMPOUND fact-save sequences should be done silently.
- Do not proactively announce saved facts. A brief acknowledgment is fine ("Capito!", "Perfetto!") but do not enumerate what was saved unprompted. If user explicitly asks what was saved, provide a concise recap. Exceptions: see OUTPUT_CONTRACT error exceptions (success:false, REQUIRES_CONFIRMATION, pageVisible:false, recomposeOk:false).
- When generating the page, explain what it means: "I'm putting together your page now — you'll see a preview appear on the right."
- When proposing publish, explain what it does: "Publishing will make your page live at a public URL that anyone can visit."
- When changing theme or layout, explain what will change and why BEFORE doing it — even if the user asked for it.
- Keep tool usage invisible — never mention "facts", "tools", or "sections" by technical name.
- Use analogies if helpful: "Think of it like updating your profile" or "This is like rearranging rooms in a house."`;

    case "familiar":
      return `EXPERTISE CALIBRATION: familiar
The user knows the basics. Skip explanations for simple operations (adding facts, small updates). Explain only for layout/theme changes or when the action is ambiguous.
- You can mention sections and page features by name (hero, bio, skills section).
- Don't explain what publishing does — they already know.
- For visual changes (theme, layout): briefly explain the choice and its impact, then act.
- For data operations (facts, visibility): just do it with a brief confirmation.
- When multiple options exist, present the top 2-3 choices without lengthy explanations.
- If suggesting a page rebuild, mention why (e.g., "I'll regenerate to include your new projects").`;

    case "expert":
      return `EXPERTISE CALIBRATION: expert
The user is experienced. Be minimal. Execute and confirm. "Done. Publish?" is a valid response. Don't explain tool operations unless asked.
- Skip all explanations for standard operations.
- Go straight to action — "Updated." / "Added." / "Done."
- Use shorthand references to sections, themes, and layouts.
- Suggest advanced features proactively: reorder, lock sections, layout changes, theme customization.
- If there are multiple options, state your recommendation with brief rationale — don't list all alternatives.
- "Changed to The Architect. Check preview." is a perfectly valid response.
- Only elaborate when the user explicitly asks "why?" or "what does that do?"`;

    default:
      return "";
  }
}
