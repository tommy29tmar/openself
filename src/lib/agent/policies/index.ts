import type { JourneyState, Situation, ExpertiseLevel } from "@/lib/agent/journey";
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
// Situation Directives
// ---------------------------------------------------------------------------

// Individual directive functions (re-exported from situations.ts in Task 4)
import {
  pendingProposalsDirective,
  thinSectionsDirective,
  staleFactsDirective,
  openConflictsDirective,
} from "./situations";

/**
 * Composes situation-specific directives from active situations + context data.
 * Returns empty string if no situations are active.
 */
export function getSituationDirectives(
  situations: Situation[],
  context: SituationContext,
): string {
  const directives: string[] = [];

  if (situations.includes("has_pending_proposals") && context.pendingProposalCount > 0) {
    directives.push(pendingProposalsDirective(context.pendingProposalCount, context.pendingProposalSections));
  }

  if (situations.includes("has_thin_sections") && context.thinSections.length > 0) {
    directives.push(thinSectionsDirective(context.thinSections));
  }

  if (situations.includes("has_stale_facts") && context.staleFacts.length > 0) {
    directives.push(staleFactsDirective(context.staleFacts));
  }

  if (situations.includes("has_open_conflicts") && context.openConflicts.length > 0) {
    directives.push(openConflictsDirective(context.openConflicts));
  }

  if (directives.length === 0) return "";

  return `SITUATION DIRECTIVES:\n${directives.join("\n\n")}`;
}

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
- This is a new or very new user. Explain features briefly when you use them.
- When generating the page, tell them to look at the preview panel on the right.
- When proposing publish, explain what publishing means (live public page at a URL).
- Keep tool usage invisible — never mention "facts" or "tools" by name.`;

    case "familiar":
      return `EXPERTISE CALIBRATION: familiar
- This user has used OpenSelf a few times. Skip basic explanations.
- You can mention sections and page features by name.
- Don't explain what publishing does — they already know.`;

    case "expert":
      return `EXPERTISE CALIBRATION: expert
- Power user. Be terse and efficient.
- Skip all explanations. Go straight to action.
- Use shorthand references to sections, themes, and layouts.
- Suggest advanced features (reorder, lock, layout changes) proactively.`;

    default:
      return "";
  }
}
