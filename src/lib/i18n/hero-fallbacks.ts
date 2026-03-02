/**
 * Pure constants module for hero tagline fallbacks.
 * No server dependencies — safe to import from "use client" components.
 *
 * Single source of truth for hero name fallback templates, used by:
 * - page-composer.ts (server: generates fallback hero names)
 * - SplitView.tsx (client: detects fallback names to skip username suggestion)
 */

/** Tagline templates per language. Each returns the welcome string for a given name. */
export const TAGLINE_TEMPLATES: Record<string, (name: string) => string> = {
  en: (name) => `Hello, I'm ${name}`,
  it: (name) => `Ciao, sono ${name}`,
  de: (name) => `Willkommen auf ${name}s Seite`,
  fr: (name) => `Bienvenue sur la page de ${name}`,
  es: (name) => `Bienvenido a la página de ${name}`,
  pt: (name) => `Bem-vindo à página de ${name}`,
  ja: (name) => `${name}のページへようこそ`,
  zh: (name) => `欢迎来到${name}的页面`,
};

/**
 * Set of fallback hero "name" values (the template with empty name, trimmed).
 * Used to detect if the hero name is a generic fallback vs. a real user name.
 */
export const HERO_NAME_FALLBACKS = new Set(
  Object.values(TAGLINE_TEMPLATES).map((fn) => fn("").replace(/,?\s*$/, "").trim()),
);
