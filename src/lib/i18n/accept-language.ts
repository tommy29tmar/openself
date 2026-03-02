import { isLanguageCode, type LanguageCode } from "@/lib/i18n/languages";

type LangEntry = { code: string; q: number };

const CRAWLER_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,         // Yahoo
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebot/i,
  /ia_archiver/i,   // Alexa
  /semrushbot/i,
  /ahrefsbot/i,
];

/**
 * Parse Accept-Language header, match against supported languages.
 * Returns the best matching LanguageCode, or null if no match.
 */
export function parseAcceptLanguage(header: string | null): LanguageCode | null {
  if (!header || header.trim() === "") return null;

  const entries: LangEntry[] = header
    .split(",")
    .map((part) => {
      const [code, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const match = p.trim().match(/^q=(\d+(?:\.\d+)?)$/);
        if (match) q = parseFloat(match[1]);
      }
      return { code: code.trim().toLowerCase(), q };
    })
    .filter((e) => e.code !== "*")
    .sort((a, b) => b.q - a.q);

  for (const entry of entries) {
    // Try exact match
    if (isLanguageCode(entry.code)) return entry.code;

    // Try base language (fr-CA → fr)
    const base = entry.code.split("-")[0];
    if (base !== entry.code && isLanguageCode(base)) return base as LanguageCode;
  }

  return null;
}

/**
 * Check if a User-Agent string belongs to a known crawler.
 * Crawlers get the original (untranslated) page for SEO.
 */
export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}
