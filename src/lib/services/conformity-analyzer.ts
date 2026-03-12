import { generateObject } from "ai";
import { z } from "zod";
import { getModelForTier, getThinkingProviderOptions } from "@/lib/ai/provider";
import { logEvent } from "@/lib/services/event-service";
import type { SectionCopyStateRow } from "@/lib/services/section-copy-state-service";

export type ConformityIssue = {
  sectionType: string;
  issueType: "tone_drift" | "contradiction" | "stale_content";
  reason: string;
  severity: "low" | "medium";
};

const analysisSchema = z.object({
  issues: z.array(
    z.object({
      sectionType: z.string(),
      issueType: z.enum(["tone_drift", "contradiction", "stale_content"]),
      reason: z.string(),
      severity: z.enum(["low", "medium"]),
    }),
  ),
});

const MAX_ISSUES = 3;

/**
 * Phase 1: Analyze all active section texts for coherence issues.
 * Single LLM call. Returns structured issues (capped at MAX_ISSUES).
 */
export async function analyzeConformity(
  activeStates: SectionCopyStateRow[],
  soulCompiled: string,
  ownerKey: string,
): Promise<ConformityIssue[]> {
  if (activeStates.length === 0) return [];

  const sectionTexts = activeStates
    .map((s) => `## ${s.sectionType}\n${s.personalizedContent}`)
    .join("\n\n");

  try {
    const { object } = await generateObject({
      model: getModelForTier("reasoning"),
      schema: analysisSchema,
      providerOptions: getThinkingProviderOptions(),
      prompt: [
        `Analyze these page sections for coherence issues.`,
        ``,
        `## Voice & Tone (desired)`,
        soulCompiled,
        ``,
        `## Current Section Texts`,
        sectionTexts,
        ``,
        `## Check for:`,
        `1. tone_drift: section doesn't match the desired voice/tone`,
        `2. contradiction: section contradicts information in another section`,
        `3. stale_content: section references outdated or inconsistent information`,
        ``,
        `Return ONLY genuine issues. If everything looks good, return an empty issues array.`,
        `Maximum ${MAX_ISSUES} issues.`,
      ].join("\n"),
    });

    const issues = object.issues.slice(0, MAX_ISSUES) as ConformityIssue[];

    logEvent({
      eventType: "conformity_analysis",
      actor: "system",
      payload: { ownerKey, issueCount: issues.length },
    });

    return issues;
  } catch (err) {
    logEvent({
      eventType: "conformity_analysis_error",
      actor: "system",
      payload: { ownerKey, error: String(err) },
    });
    return [];
  }
}

const rewriteSchema = z.object({
  rewrittenContent: z.record(z.string()),
});

/**
 * Phase 2: Generate a proposed rewrite for a single section.
 * Called per-issue (max 3 times per conformity check).
 */
export async function generateRewrite(
  sectionType: string,
  currentContent: string,
  issue: ConformityIssue,
  soulCompiled: string,
): Promise<Record<string, string> | null> {
  try {
    const { object } = await generateObject({
      model: getModelForTier("reasoning"),
      schema: rewriteSchema,
      providerOptions: getThinkingProviderOptions(),
      prompt: [
        `Rewrite the "${sectionType}" section to fix: ${issue.reason}`,
        ``,
        `## Voice & Tone`,
        soulCompiled,
        ``,
        `## Current content`,
        currentContent,
        ``,
        `## Issue: ${issue.issueType}`,
        issue.reason,
        ``,
        `Return a JSON object with field names as keys and rewritten text as values.`,
        `Only include fields that need changes.`,
      ].join("\n"),
    });

    return object.rewrittenContent;
  } catch {
    return null;
  }
}
