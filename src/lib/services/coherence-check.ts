/**
 * Page Coherence Check — cross-section factual consistency validation.
 *
 * Two layers:
 *  1. quickCoherenceCheck: deterministic (zero LLM), ~O(n) on facts.
 *     Catches structural inconsistencies via date math, string match, counting.
 *  2. checkPageCoherence: hybrid (deterministic + LLM with timeout/dedup).
 *     Only invokes LLM when deterministic found <3 issues AND page has ≥5 content sections.
 *
 * Circuit I: soul-aware coherence (soulCompiled passed to LLM prompt).
 * Circuit D1: issues stored in session.metadata (coherenceWarnings/coherenceInfos).
 */

import { generateObject } from "ai";
import { z } from "zod";
import type { Section } from "@/lib/page-config/schema";
import type { FactRow } from "@/lib/services/kb-service";
import { getModel } from "@/lib/ai/provider";

export type CoherenceIssue = {
  type: "role_mismatch" | "timeline_overlap" | "skill_gap" | "level_mismatch" | "completeness_gap";
  severity: "info" | "warning";
  description: string;
  suggestion: string;
  affectedSections: string[];
};

// ---------------------------------------------------------------------------
// Section type → fact category mapping
// ---------------------------------------------------------------------------

const SECTION_CATEGORY_MAP: Record<string, string> = {
  skills: "skill",
  projects: "project",
  interests: "interest",
  achievements: "achievement",
  reading: "reading",
  music: "music",
  education: "education",
  languages: "language",
  activities: "activity",
  experience: "experience",
  stats: "stat",
  contact: "contact",
};

// ---------------------------------------------------------------------------
// Layer 1: Deterministic checks
// ---------------------------------------------------------------------------

/**
 * Deterministic coherence checks — zero LLM cost, ~O(n) on facts.
 * Catches structural inconsistencies via date math, string match, and counting.
 * Returns max 3 issues.
 */
export function quickCoherenceCheck(sections: Section[], facts: FactRow[]): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  // 1. timeline_overlap: two experiences with status:"current" and overlapping date ranges
  const currentExperiences = facts.filter(f =>
    f.category === "experience" && !f.archivedAt &&
    (f.value as Record<string, unknown>)?.status === "current"
  );
  if (currentExperiences.length >= 2) {
    for (let i = 0; i < currentExperiences.length; i++) {
      for (let j = i + 1; j < currentExperiences.length; j++) {
        const aVal = currentExperiences[i].value as Record<string, unknown>;
        const bVal = currentExperiences[j].value as Record<string, unknown>;
        const aStart = String(aVal.start ?? "");
        const bStart = String(bVal.start ?? "");
        // Both current with start dates → overlap (both run to present)
        if (aStart && bStart) {
          issues.push({
            type: "timeline_overlap",
            severity: "warning",
            description: `Two concurrent current roles: "${aVal.role ?? aVal.company}" and "${bVal.role ?? bVal.company}"`,
            suggestion: "Verify both roles are truly concurrent, or archive the ended one.",
            affectedSections: ["experience"],
          });
          break; // one overlap is enough
        }
      }
      if (issues.some(i => i.type === "timeline_overlap")) break;
    }
  }

  // 2. role_mismatch: hero title not found among experience role titles
  const heroSection = sections.find(s => s.type === "hero");
  const heroTitle = heroSection
    ? String((heroSection.content as Record<string, unknown>)?.tagline ?? "")
    : "";
  if (heroTitle) {
    const expRoles = facts
      .filter(f => f.category === "experience" && !f.archivedAt)
      .map(f => String((f.value as Record<string, unknown>)?.role ?? "").toLowerCase());
    const heroLower = heroTitle.toLowerCase();
    const roleMatch = expRoles.some(r => r && (heroLower.includes(r) || r.includes(heroLower)));
    if (expRoles.length > 0 && !roleMatch) {
      issues.push({
        type: "role_mismatch",
        severity: "warning",
        description: `Hero title "${heroTitle}" doesn't match any experience role`,
        suggestion: "Update hero tagline to reflect current role, or add the matching experience.",
        affectedSections: ["hero", "experience"],
      });
    }
  }

  // 3. completeness_gap: section with 1 item when category has ≥3 active facts
  const categoryFactCounts = new Map<string, number>();
  for (const f of facts) {
    if (!f.archivedAt) {
      categoryFactCounts.set(f.category, (categoryFactCounts.get(f.category) ?? 0) + 1);
    }
  }
  for (const section of sections) {
    if (section.type === "hero" || section.type === "footer") continue;
    const content = section.content as Record<string, unknown>;
    // Count items in section content (arrays in content)
    const arrays = Object.values(content).filter(v => Array.isArray(v));
    const itemCount = arrays.reduce((sum, arr) => sum + (arr as unknown[]).length, 0);
    // Map section type → fact category
    const category = SECTION_CATEGORY_MAP[section.type] ?? section.type;
    const factCount = categoryFactCounts.get(category) ?? 0;
    if (itemCount === 1 && factCount >= 3) {
      issues.push({
        type: "completeness_gap",
        severity: "info",
        description: `Section "${section.type}" shows 1 item but ${factCount} facts exist`,
        suggestion: "Check visibility settings — some facts may be hidden.",
        affectedSections: [section.id],
      });
    }
  }

  return issues.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Layer 2: LLM coherence analysis
// ---------------------------------------------------------------------------

const coherenceSchema = z.object({
  issues: z.array(z.object({
    type: z.enum(["role_mismatch", "timeline_overlap", "skill_gap", "level_mismatch", "completeness_gap"]),
    severity: z.enum(["info", "warning"]),
    description: z.string(),
    suggestion: z.string(),
    affectedSections: z.array(z.string()),
  })).max(3),
});

/**
 * Build prompt for LLM coherence analysis.
 * Summarizes sections (truncated content) + optional soul context for tone checking.
 */
function buildCoherencePrompt(sections: Section[], soulCompiled?: string): string {
  const sectionSummaries = sections
    .filter(s => s.type !== "hero" && s.type !== "footer")
    .map(s => `- ${s.type} (${s.id}): ${JSON.stringify(s.content).slice(0, 200)}`)
    .join("\n");

  return [
    "Analyze this personal page for cross-section coherence issues.",
    "Look for: role mismatches between sections, timeline overlaps in experience/education,",
    "skill gaps (skills claimed but not evidenced), level mismatches (junior role + senior skills).",
    "",
    "Sections:",
    sectionSummaries,
    soulCompiled ? `\nOwner voice/tone profile:\n${soulCompiled}` : "",
    "",
    "Return up to 3 issues. Only flag clear inconsistencies, not style preferences.",
  ].filter(Boolean).join("\n");
}

/** Timeout for LLM coherence call. Prevents blocking page generation. */
const COHERENCE_TIMEOUT_MS = 3000;

/**
 * Hybrid coherence check: deterministic first, LLM only if needed.
 *
 * - Always runs quickCoherenceCheck (zero cost).
 * - Invokes LLM only when deterministic found <3 issues AND page has ≥5 content sections.
 * - Deduplicates results by type+affectedSections. Cap: 3 issues total.
 */
export async function checkPageCoherence(
  sections: Section[],
  facts: FactRow[],
  soulCompiled?: string,
): Promise<CoherenceIssue[]> {
  const contentSections = sections.filter(
    s => s.type !== "hero" && s.type !== "footer" && Object.keys(s.content).length > 0,
  );
  if (contentSections.length < 3) return [];

  // Phase 1: deterministic
  const deterministicIssues = quickCoherenceCheck(sections, facts);

  // Short-circuit: if deterministic already found 3 issues, skip LLM
  if (deterministicIssues.length >= 3) return deterministicIssues.slice(0, 3);

  // Phase 2: LLM only for richer pages (≥5 content sections)
  if (contentSections.length < 5) return deterministicIssues;

  // Circuit I: pass soul context so LLM can check tone/style coherence
  const llmResult = await Promise.race([
    generateObject({
      model: getModel(),
      schema: coherenceSchema,
      prompt: buildCoherencePrompt(sections, soulCompiled),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("coherence_timeout")), COHERENCE_TIMEOUT_MS),
    ),
  ]).catch((err) => {
    console.warn("[coherence] LLM check skipped:", err.message);
    return null;
  });

  if (!llmResult) return deterministicIssues;
  const { object } = llmResult;

  // Force severity rules on LLM output
  const llmIssues = object.issues.map(issue => ({
    ...issue,
    severity: (issue.type === "skill_gap" || issue.type === "level_mismatch")
      ? "info" as const
      : issue.severity,
  }));

  // Deduplicate: merge deterministic + LLM, dedup by type+affectedSections key
  const seen = new Set(
    deterministicIssues.map(i => `${i.type}:${[...i.affectedSections].sort().join(",")}`),
  );
  const merged = [...deterministicIssues];
  for (const issue of llmIssues) {
    const key = `${issue.type}:${[...issue.affectedSections].sort().join(",")}`;
    if (!seen.has(key)) {
      merged.push(issue);
      seen.add(key);
    }
  }

  return merged.slice(0, 3);
}
