export type Visibility = "private" | "proposed" | "public";
export type Mode = "onboarding" | "steady_state" | "heartbeat";

export type VisibilityInput = {
  mode: Mode;
  category: string;
  confidence: number;
  explicitPublicApproval?: boolean;
  autoApprove?: boolean;
};

const PROPOSAL_ALLOWLIST = new Set([
  "identity",
  "project",
  "skill",
  "interest",
  "achievement",
  "social",
]);

const SENSITIVE_CATEGORIES = new Set([
  "compensation",
  "salary",
  "health",
  "mental-health",
  "private-contact",
  "personal-struggle",
]);

function isSensitiveCategory(category: string): boolean {
  return SENSITIVE_CATEGORIES.has(category);
}

export function canProposePublic(
  category: string,
  confidence: number,
): boolean {
  if (isSensitiveCategory(category)) return false;
  if (!PROPOSAL_ALLOWLIST.has(category)) return false;
  return confidence >= 0.8;
}

export function initialVisibility(input: VisibilityInput): Visibility {
  if (input.explicitPublicApproval) {
    return "public";
  }

  if (isSensitiveCategory(input.category)) {
    return "private";
  }

  if (input.mode === "onboarding" && canProposePublic(input.category, input.confidence)) {
    return "proposed";
  }

  if (input.mode !== "onboarding" && input.autoApprove && canProposePublic(input.category, input.confidence)) {
    return "public";
  }

  return "private";
}

export function canPromoteToPublic(
  from: Visibility,
  mode: Mode,
  hasExplicitApproval: boolean,
): boolean {
  if (from === "public") return true;
  if (mode === "onboarding") return from === "proposed" && hasExplicitApproval;
  return hasExplicitApproval;
}
