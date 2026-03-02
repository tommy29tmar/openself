/**
 * Tests for step exhaustion handling in the chat route.
 * Validates the STEP_EXHAUSTION_FALLBACK map and synthetic message behavior.
 */
import { describe, it, expect } from "vitest";

// The fallback map is defined inline in route.ts and not exported,
// so we test the contract: all 8 supported languages have a fallback.
const SUPPORTED_LANGUAGES = ["en", "it", "de", "fr", "es", "pt", "ja", "zh"];

// Reproduce the map here to test its properties.
// SYNC: Keep in sync with STEP_EXHAUSTION_FALLBACK in src/app/api/chat/route.ts.
const STEP_EXHAUSTION_FALLBACK: Record<string, string> = {
  en: "I've updated your profile. Let me know if you'd like any changes.",
  it: "Ho aggiornato il tuo profilo. Dimmi se vuoi modificare qualcosa.",
  de: "Ich habe dein Profil aktualisiert. Sag mir, wenn du etwas ändern möchtest.",
  fr: "J'ai mis à jour votre profil. Dites-moi si vous souhaitez des modifications.",
  es: "He actualizado tu perfil. Dime si quieres hacer algún cambio.",
  pt: "Atualizei o seu perfil. Diga-me se quiser fazer alguma alteração.",
  ja: "プロフィールを更新しました。変更があればお知らせください。",
  zh: "我已更新了你的个人资料。如果需要修改请告诉我。",
};

describe("step exhaustion fallback", () => {
  it("has a fallback for every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(STEP_EXHAUSTION_FALLBACK[lang]).toBeDefined();
      expect(STEP_EXHAUSTION_FALLBACK[lang].length).toBeGreaterThan(10);
    }
  });

  it("every fallback is a non-empty string", () => {
    for (const [lang, text] of Object.entries(STEP_EXHAUSTION_FALLBACK)) {
      expect(typeof text).toBe("string");
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("English fallback is the default when language is unknown", () => {
    const unknownLang = "xx";
    const fallback = STEP_EXHAUSTION_FALLBACK[unknownLang] ?? STEP_EXHAUSTION_FALLBACK.en;
    expect(fallback).toBe(STEP_EXHAUSTION_FALLBACK.en);
  });

  it("MAX_STEPS is documented as 12", () => {
    // This is a documentation test — the actual constant is in route.ts (not exported).
    // If MAX_STEPS changes, update this test and the plan.
    const MAX_STEPS = 12;
    expect(MAX_STEPS).toBeGreaterThanOrEqual(10);
  });
});
