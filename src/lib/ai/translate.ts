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

  const langName =
    LANGUAGE_NAMES[targetLanguage as LanguageCode] ?? targetLanguage;

  const prompt = `You are a professional translator. Translate the following personal page content to ${langName}.

Rules:
1. TRANSLATE: job titles, skill names, interest names, taglines, bio text, project descriptions, section labels, and all other human-readable text.
2. DO NOT TRANSLATE: person names (first, last, full), company/organization names, brand names, URLs, email addresses.
3. Produce natural, fluent ${langName} — not word-for-word translation.
4. Keep the exact same JSON structure and keys.
5. Return ONLY the JSON array, no markdown formatting, no explanation.

Input JSON:
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
