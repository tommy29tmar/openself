import type { FactRow } from "@/lib/services/kb-service";

export type ImportSummary = {
  currentRole?: string;
  pastRoles: number;
  educationCount: number;
  languageCount: number;
  skillCount: number;
  certificationCount: number;
};

export type ImportGap = {
  priority: number;
  type: "no_interests" | "no_personal_description" | "no_social_links";
  description: string;
};

export type ImportGapReport = {
  summary: ImportSummary;
  gaps: ImportGap[];
};

export function analyzeImportGaps(facts: FactRow[]): ImportGapReport {
  const summary = buildSummary(facts);
  const gaps = detectGaps(facts);
  return { summary, gaps };
}

function buildSummary(facts: FactRow[]): ImportSummary {
  // Current role: prefer identity/role, fallback to experience with status=current
  let currentRole: string | undefined;

  const identityRole = facts.find(
    (f) => f.category === "identity" && f.key === "role",
  );
  if (identityRole) {
    const v = identityRole.value as Record<string, string>;
    currentRole = v.company ? `${v.role} at ${v.company}` : v.role;
  }

  const experiences = facts.filter((f) => f.category === "experience");

  if (!currentRole) {
    const currentExp = experiences.find(
      (f) => (f.value as Record<string, string>).status === "current",
    );
    if (currentExp) {
      const v = currentExp.value as Record<string, string>;
      currentRole = v.company ? `${v.role} at ${v.company}` : v.role;
    }
  }

  // Exclude the current role from past count; experiences with no status are ambiguous
  // so we only count those explicitly marked as "past"
  const pastRoles = experiences.filter(
    (f) => (f.value as Record<string, string>).status === "past",
  ).length;

  return {
    currentRole,
    pastRoles,
    educationCount: facts.filter((f) => f.category === "education").length,
    languageCount: facts.filter((f) => f.category === "language").length,
    skillCount: facts.filter((f) => f.category === "skill").length,
    certificationCount: facts.filter((f) => f.category === "certification").length,
  };
}

function detectGaps(facts: FactRow[]): ImportGap[] {
  const gaps: ImportGap[] = [];

  // Gap 1: No interests/hobbies — LinkedIn never exports these
  const hasInterests = facts.some(
    (f) => f.category === "interest" || f.category === "activity" || f.category === "hobby",
  );
  if (!hasInterests) {
    gaps.push({
      priority: 1,
      type: "no_interests",
      description: "No interests or hobbies found. LinkedIn does not export these — high value to ask.",
    });
  }

  // Gap 2: No personal description — LinkedIn summary may be empty or corporate
  const hasDescription = facts.some(
    (f) => f.category === "identity" && (f.key === "summary" || f.key === "bio" || f.key === "description"),
  );
  if (!hasDescription) {
    gaps.push({
      priority: 2,
      type: "no_personal_description",
      description: "No personal description or bio found. Ask for a personal summary beyond the LinkedIn headline.",
    });
  }

  // Gap 3: No social links — website, GitHub, etc.
  const hasSocialLinks = facts.some(
    (f) => f.category === "contact" && isUrlContact(f),
  );
  if (!hasSocialLinks) {
    gaps.push({
      priority: 3,
      type: "no_social_links",
      description: "No website or social links found. Ask about personal website, GitHub, portfolio, etc.",
    });
  }

  return gaps;
}

function isUrlContact(fact: FactRow): boolean {
  const v = fact.value as Record<string, string>;
  const value = v.value ?? v.url ?? "";
  return value.startsWith("http") || v.type === "website" || v.type === "github";
}
