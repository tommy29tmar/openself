import { generateObject } from "ai";
import { getModelForTier } from "@/lib/ai/provider";
import type { FactRow } from "@/lib/services/kb-service";
import type { Section } from "@/lib/page-config/schema";
import {
  isPersonalizableSection,
  getPersonalizerSchema,
  MAX_WORDS,
  PERSONALIZABLE_FIELDS,
} from "@/lib/services/personalizer-schemas";
import {
  computeHash,
  computeSectionFactsHash,
  SECTION_FACT_CATEGORIES,
} from "@/lib/services/personalization-hashing";
import {
  getCachedCopy,
  putCachedCopy,
} from "@/lib/services/section-cache-service";
import { upsertState } from "@/lib/services/section-copy-state-service";
import { logEvent } from "@/lib/services/event-service";

import { ARCHETYPE_STRATEGIES } from "@/lib/agent/archetypes";

/**
 * Reorder sections for personalization priority based on archetype.
 * Archetype-priority sections are processed first (more LLM budget),
 * remaining sections follow in original order.
 */
export function prioritizeSections(sections: Section[], archetype?: string): Section[] {
  if (!archetype || archetype === "generalist") return sections;
  const strategy = ARCHETYPE_STRATEGIES[archetype as keyof typeof ARCHETYPE_STRATEGIES];
  if (!strategy) return sections;

  const priorityTypes = new Set(strategy.explorationOrder);
  const priority = sections.filter(s => priorityTypes.has(s.type));
  const rest = sections.filter(s => !priorityTypes.has(s.type));
  return [...priority, ...rest];
}

export type PersonalizeSectionInput = {
  section: Section;
  ownerKey: string;
  language: string;
  publishableFacts: FactRow[];
  soulCompiled: string;
  username: string;
};

export async function personalizeSection(
  input: PersonalizeSectionInput,
): Promise<Record<string, string> | null> {
  const {
    section,
    ownerKey,
    language,
    publishableFacts,
    soulCompiled,
    username,
  } = input;

  if (!isPersonalizableSection(section.type)) return null;
  if (!soulCompiled) return null;

  const schema = getPersonalizerSchema(section.type);
  if (!schema) return null;

  const factsHash = computeSectionFactsHash(publishableFacts, section.type);
  const soulHash = computeHash(soulCompiled);

  // 1. Check cache
  const cached = getCachedCopy(
    ownerKey,
    section.type,
    factsHash,
    soulHash,
    language,
  );
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      upsertState({
        ownerKey,
        sectionType: section.type,
        language,
        personalizedContent: cached,
        factsHash,
        soulHash,
        source: "live",
      });
      return parsed;
    } catch {
      /* fall through to LLM */
    }
  }

  // 2. Filter facts to relevant categories
  const categories = SECTION_FACT_CATEGORIES[section.type] ?? [];
  const relevantFacts = publishableFacts.filter((f) =>
    categories.includes(f.category),
  );
  if (relevantFacts.length === 0) return null;

  const fields = PERSONALIZABLE_FIELDS[section.type] ?? [];
  const maxWords = MAX_WORDS[section.type] ?? 60;

  // 3. Call LLM
  try {
    const { object } = await generateObject({
      model: getModelForTier("fast"),
      schema,
      prompt: [
        `You are a personal page copywriter. Rewrite the content of a "${section.type}" section for ${username}'s personal page.`,
        `\n## Voice & Tone\n${soulCompiled}`,
        `\n## Facts for this section\n${relevantFacts.map((f) => `- [${f.category}/${f.key}]: ${JSON.stringify(f.value)}`).join("\n")}`,
        `\n## Current deterministic content\n${JSON.stringify(section.content, null, 2)}`,
        `\n## Instructions`,
        `- Rewrite ONLY text fields: ${fields.join(", ")}`,
        `- Keep structured fields EXACTLY as provided`,
        `- Ground everything in the facts — do not invent information`,
        `- Do not reference private details, medical conditions, relationships, or sensitive topics`,
        `- Write in ${language}`,
        `- Keep it concise: ${maxWords} words max per text field`,
      ].join("\n"),
    });

    const personalized = object as Record<string, string>;
    const serialized = JSON.stringify(personalized);

    putCachedCopy(
      ownerKey,
      section.type,
      factsHash,
      soulHash,
      language,
      serialized,
    );
    upsertState({
      ownerKey,
      sectionType: section.type,
      language,
      personalizedContent: serialized,
      factsHash,
      soulHash,
      source: "live",
    });
    logEvent({
      eventType: "personalize_section",
      actor: "system",
      payload: { ownerKey, sectionType: section.type, language },
    });

    return personalized;
  } catch (err) {
    logEvent({
      eventType: "personalize_section_error",
      actor: "system",
      payload: {
        ownerKey,
        sectionType: section.type,
        error: String(err),
      },
    });
    return null;
  }
}
