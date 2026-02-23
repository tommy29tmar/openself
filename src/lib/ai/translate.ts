import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import type { PageConfig } from "@/lib/page-config/schema";
import { LANGUAGE_NAMES } from "@/lib/i18n/language-names";
import type { LanguageCode } from "@/lib/i18n/languages";
import { logEvent } from "@/lib/services/event-service";

/** Section types whose content should NOT be translated. */
const SKIP_TYPES = new Set(["footer", "social"]);

type SectionPayload = {
  sectionId: string;
  type: string;
  content: Record<string, unknown>;
};

/**
 * Strip markdown code fences from an LLM response so we can JSON.parse it.
 * Handles ```json ... ``` and ``` ... ```.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    // Remove opening fence (with optional language tag) and closing fence
    return trimmed
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }
  return trimmed;
}

/**
 * Translate the human-readable content of a PageConfig to a target language.
 *
 * - Skips the LLM call entirely when sourceLanguage === targetLanguage.
 * - On any error (LLM failure, JSON parse error) returns the original config
 *   unchanged — graceful degradation over hard failure.
 */
export async function translatePageContent(
  config: PageConfig,
  targetLanguage: string,
  sourceLanguage?: string | null,
): Promise<PageConfig> {
  // No translation needed if source matches target
  if (sourceLanguage && sourceLanguage === targetLanguage) {
    return config;
  }

  // Collect sections that need translation
  const toTranslate: SectionPayload[] = config.sections
    .filter((s) => !SKIP_TYPES.has(s.type))
    .map((s) => ({
      sectionId: s.id,
      type: s.type,
      content: s.content,
    }));

  if (toTranslate.length === 0) {
    return config;
  }

  const targetName =
    LANGUAGE_NAMES[targetLanguage as LanguageCode] ?? targetLanguage;
  const sourceName = sourceLanguage
    ? (LANGUAGE_NAMES[sourceLanguage as LanguageCode] ?? sourceLanguage)
    : null;
  const sourceHint = sourceName ? ` The source language is ${sourceName}.` : "";

  const prompt = `You are a professional localization engine for a personal portfolio website. Your task is to translate the JSON content below into natural, fluent ${targetName}.${sourceHint}

## What to translate
- Section labels and titles (e.g. "Competenze" → "Skills", "Interessi" → "Interests")
- Job titles and professional roles (e.g. "Economista" → "Economist")
- Skill names (e.g. "Economia" → "Economics", "Gestione progetti" → "Project management")
- Interest and hobby names (e.g. "Pianoforte" → "Piano", "Escursionismo" → "Hiking")
- Taglines, bios, and all other descriptive text
- Project descriptions and tags

## What to keep unchanged
- Person names: first, last, and full names (e.g. "Marco Rossi" stays "Marco Rossi")
- Organization and company names (e.g. "Cassa Depositi e Prestiti", "Google")
- Brand names, product names, and proper nouns
- URLs, email addresses, and usernames
- Globally adopted English acronyms and terms used in tech: AI, API, IT, SaaS, UX, UI, ML, DevOps, CSS, HTML, JavaScript, TypeScript, Python, React, etc. Keep these in English even when a local equivalent exists.

## Quality standards
- Produce publication-ready text, not machine-translation output.
- Adapt grammar, gender, and phrasing to sound native in ${targetName} — never translate word-for-word.
- Every single text value in the output must be in ${targetName}. Do not leave any value in the source language.
- When in doubt whether a term is a proper noun, keep it unchanged.

## Output format
- Return ONLY the JSON array — no markdown fences, no commentary, no explanation.
- Preserve the exact JSON structure: same keys, same nesting, same array order.

${JSON.stringify(toTranslate, null, 2)}`;

  try {
    const result = await generateText({
      model: getModel(),
      prompt,
    });

    const cleaned = stripCodeFences(result.text);
    const translated: SectionPayload[] = JSON.parse(cleaned);

    // Build a lookup map: sectionId → translated content
    const translatedMap = new Map<string, Record<string, unknown>>();
    for (const item of translated) {
      if (item.sectionId && item.content) {
        translatedMap.set(item.sectionId, item.content);
      }
    }

    // Merge translated content back into the original config
    const newSections = config.sections.map((s) => {
      const tc = translatedMap.get(s.id);
      return tc ? { ...s, content: tc } : s;
    });

    return { ...config, sections: newSections };
  } catch (error) {
    // Graceful fallback: return untranslated config
    logEvent({
      eventType: "translation_error",
      actor: "system",
      payload: {
        targetLanguage,
        sourceLanguage: sourceLanguage ?? "unknown",
        error: String(error),
      },
    });
    console.warn("[translate] Failed to translate page content:", error);
    return config;
  }
}
