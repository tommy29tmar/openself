/**
 * Tests for hero-fallbacks.ts — pure constants module for tagline fallbacks.
 */
import { describe, it, expect } from "vitest";
import { TAGLINE_TEMPLATES, HERO_NAME_FALLBACKS } from "@/lib/i18n/hero-fallbacks";
import { LANGUAGE_OPTIONS } from "@/lib/i18n/languages";

describe("hero fallbacks", () => {
  it("TAGLINE_TEMPLATES covers all supported languages", () => {
    const supportedCodes = LANGUAGE_OPTIONS.map((l) => l.code);
    const templateCodes = Object.keys(TAGLINE_TEMPLATES);
    expect(templateCodes.sort()).toEqual(supportedCodes.sort());
  });

  it("HERO_NAME_FALLBACKS has one entry per language", () => {
    expect(HERO_NAME_FALLBACKS.size).toBe(LANGUAGE_OPTIONS.length);
  });

  it("fallback names are non-empty strings", () => {
    for (const name of HERO_NAME_FALLBACKS) {
      expect(typeof name).toBe("string");
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it("real names are not in fallbacks", () => {
    expect(HERO_NAME_FALLBACKS.has("Marco Rossi")).toBe(false);
    expect(HERO_NAME_FALLBACKS.has("John Smith")).toBe(false);
  });
});
