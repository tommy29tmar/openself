import type { LanguageCode } from "./languages";

/**
 * Full language names keyed by code — used in translation prompts
 * so the LLM knows the target language unambiguously.
 */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  it: "Italian",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  ja: "Japanese",
  zh: "Chinese",
};
