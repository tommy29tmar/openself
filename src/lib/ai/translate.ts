import { createHash } from "node:crypto";
import { generateObject } from "ai";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getModelForTier, getModelIdForTier, getThinkingProviderOptions } from "@/lib/ai/provider";
import { db } from "@/lib/db";
import { translationCache } from "@/lib/db/schema";
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

/** Zod schema for structured translation output. */
export const TranslationResultSchema = z.object({
  sections: z.array(
    z.object({
      sectionId: z.string().min(1),
      type: z.string().min(1),
      content: z.record(z.string(), z.unknown()),
    }),
  ),
});

/** Compute SHA-256 hex digest of the translatable sections JSON. */
function computeContentHash(sections: SectionPayload[]): string {
  return createHash("sha256")
    .update(JSON.stringify(sections))
    .digest("hex");
}

/**
 * Derive a composite cache key from content hash, source language,
 * target language, and translation model id.
 *
 * This prevents stale hits when the same content is translated from a
 * different source language or with a different model version.
 */
export function computeCompositeCacheKey(
  contentHash: string,
  sourceLanguage: string,
  targetLanguage: string,
  modelId: string,
): string {
  return createHash("sha256")
    .update(`${contentHash}:${sourceLanguage}:${targetLanguage}:${modelId}`)
    .digest("hex");
}

/**
 * Merge translated section payloads back into the original config.
 */
function mergeSections(
  config: PageConfig,
  translated: SectionPayload[],
): PageConfig {
  const translatedMap = new Map<string, Record<string, unknown>>();
  for (const item of translated) {
    if (item.sectionId && item.content) {
      translatedMap.set(item.sectionId, item.content);
    }
  }

  const newSections = config.sections.map((s) => {
    const tc = translatedMap.get(s.id);
    return tc ? { ...s, content: tc } : s;
  });

  return { ...config, sections: newSections };
}

/**
 * Translate the human-readable content of a PageConfig to a target language.
 *
 * - Skips the LLM call entirely when sourceLanguage === targetLanguage.
 * - Uses a hash-based translation cache to avoid repeated LLM calls.
 * - On any error (LLM failure, JSON parse error) returns the original config
 *   unchanged — graceful degradation over hard failure.
 *
 * CONTRACT: on success, always returns a NEW object (via mergeSections).
 * On failure/fallback, returns the exact same `config` reference passed in.
 * Callers may rely on reference identity (`result !== config`) to detect
 * whether translation actually succeeded.
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

  // Build composite cache key (content + source + target + model)
  const contentHash = computeContentHash(toTranslate);
  const normalizedSource = sourceLanguage ?? "unknown";
  const modelId = getModelIdForTier("fast");
  const cacheKey = computeCompositeCacheKey(
    contentHash,
    normalizedSource,
    targetLanguage,
    modelId,
  );

  try {
    const cached = db
      .select()
      .from(translationCache)
      .where(
        and(
          eq(translationCache.contentHash, cacheKey),
          eq(translationCache.targetLanguage, targetLanguage),
        ),
      )
      .get();

    if (cached) {
      logEvent({
        eventType: "translation_cache_hit",
        actor: "system",
        payload: { targetLanguage, cacheKey, sourceLanguage: normalizedSource },
      });
      const cachedSections = cached.translatedSections as SectionPayload[];
      return mergeSections(config, cachedSections);
    }
  } catch {
    // Cache lookup failed — proceed with LLM call
  }

  logEvent({
    eventType: "translation_cache_miss",
    actor: "system",
    payload: { targetLanguage, cacheKey, sourceLanguage: normalizedSource },
  });

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
- Preserve the exact JSON structure: same keys, same nesting, same array order.

${JSON.stringify(toTranslate, null, 2)}`;

  // Guard: verify fast-tier model is available before attempting translation
  let model: ReturnType<typeof getModelForTier>;
  try {
    model = getModelForTier("fast");
  } catch {
    // No model configured for fast tier — skip translation silently
    return config;
  }

  try {
    const result = await generateObject({
      model,
      schema: TranslationResultSchema,
      prompt,
      providerOptions: getThinkingProviderOptions(),
    });

    const translated: SectionPayload[] = result.object.sections;

    // Store in cache (best-effort, don't fail translation on cache write error)
    try {
      db.insert(translationCache)
        .values({
          contentHash: cacheKey,
          targetLanguage,
          translatedSections: translated as any,
          model: modelId,
        })
        .onConflictDoUpdate({
          target: [translationCache.contentHash, translationCache.targetLanguage],
          set: {
            translatedSections: translated as any,
            model: modelId,
          },
        })
        .run();
    } catch {
      // Cache write failed — translation still succeeds
    }

    return mergeSections(config, translated);
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
