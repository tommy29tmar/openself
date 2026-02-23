export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];

const LANGUAGE_SET = new Set<string>(LANGUAGE_OPTIONS.map((l) => l.code));

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGE_SET.has(value);
}

export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === "undefined") return "en";
  const browserLang = navigator.language.split("-")[0];
  return isLanguageCode(browserLang) ? browserLang : "en";
}
