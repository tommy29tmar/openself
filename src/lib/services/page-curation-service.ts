import { generateObject } from "ai";
import { z } from "zod";
import { getModelForTier, getThinkingProviderOptions } from "@/lib/ai/provider";

export type CurationPromptInput = {
  sectionType: string;
  currentContent: Record<string, unknown>;
  relevantFacts: Array<{ id: string; category: string; key: string; value: unknown }>;
  soulCompiled: string;
  existingOverrides: Array<{ factId: string; source: string }>;
};

export type CurationSuggestion = {
  type: "section" | "item";
  sectionType: string;
  factId?: string;
  fields: Record<string, string>;
  reason: string;
};

const curationResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      type: z.enum(["section", "item"]),
      sectionType: z.string(),
      factId: z.string().optional(),
      fields: z.record(z.string()),
      reason: z.string(),
    }),
  ),
});

export function buildCurationPrompt(input: CurationPromptInput): string {
  const factsBlock = input.relevantFacts
    .map((f) => `- [${f.category}/${f.key}] (id: ${f.id}): ${JSON.stringify(f.value)}`)
    .join("\n");

  const overridesNote =
    input.existingOverrides.length > 0
      ? `\n\nAlready curated (DO NOT suggest changes for these):\n${input.existingOverrides.filter((o) => o.source === "agent").map((o) => `- fact ${o.factId} (agent-curated)`).join("\n")}`
      : "";

  return `You are a professional copywriter reviewing a "${input.sectionType}" section of a personal page.

## Voice & Tone
${input.soulCompiled}

## Current Content
${JSON.stringify(input.currentContent, null, 2)}

## Source Facts
${factsBlock}
${overridesNote}

## Instructions
Review the section content and suggest improvements:
- Fix capitalization, grammar, and formatting
- Improve wording for professionalism and clarity
- Ensure tone matches the voice guidelines
- Stay GROUNDED in facts — never invent information
- For item-level improvements, include the factId
- For section-level improvements (description, tagline), use type "section"
- Only suggest changes where improvement is meaningful — skip if content is already good
- Maximum 5 suggestions per section`;
}

export function parseCurationResponse(
  response: z.infer<typeof curationResponseSchema>,
  agentCuratedFactIds?: Set<string>,
): CurationSuggestion[] {
  return response.suggestions.filter((s) => {
    // Skip items already curated by agent
    if (s.type === "item" && s.factId && agentCuratedFactIds?.has(s.factId)) {
      return false;
    }
    // Validate fields exist
    return Object.keys(s.fields).length > 0;
  });
}

export async function analyzeSectionForCuration(
  input: CurationPromptInput,
  agentCuratedFactIds: Set<string>,
): Promise<CurationSuggestion[]> {
  const model = getModelForTier("standard");
  const prompt = buildCurationPrompt(input);

  try {
    const { object } = await generateObject({
      model,
      schema: curationResponseSchema,
      prompt,
      providerOptions: getThinkingProviderOptions({ structured: true }),
    });
    return parseCurationResponse(object, agentCuratedFactIds);
  } catch (error) {
    console.error("[page-curation] LLM analysis failed:", error);
    return [];
  }
}
