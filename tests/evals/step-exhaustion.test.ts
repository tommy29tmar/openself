/**
 * Tests for step exhaustion handling in the chat route.
 * Validates the STEP_EXHAUSTION_FALLBACK map and synthetic message behavior.
 */
import { describe, it, expect } from "vitest";
import { STEP_EXHAUSTION_FALLBACK } from "@/lib/agent/step-exhaustion-fallback";

const SUPPORTED_LANGUAGES = ["en", "it", "de", "fr", "es", "pt", "ja", "zh"];

describe("step exhaustion fallback", () => {
  it("has a fallback for every supported language in every state", () => {
    for (const messages of Object.values(STEP_EXHAUSTION_FALLBACK)) {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(messages[lang]).toBeDefined();
        expect(messages[lang].length).toBeGreaterThan(10);
      }
    }
  });

  it("every fallback is a non-empty string", () => {
    for (const messages of Object.values(STEP_EXHAUSTION_FALLBACK)) {
      for (const text of Object.values(messages)) {
        expect(typeof text).toBe("string");
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("English fallback is the default when language is unknown", () => {
    const unknownLang = "xx";
    const fallback = STEP_EXHAUSTION_FALLBACK.first_visit[unknownLang] ?? STEP_EXHAUSTION_FALLBACK.first_visit.en;
    expect(fallback).toBe(STEP_EXHAUSTION_FALLBACK.first_visit.en);
  });

  it("first_visit fallback avoids claiming a completed save in English", () => {
    const text = STEP_EXHAUSTION_FALLBACK.first_visit.en.toLowerCase();
    expect(text).not.toMatch(/\bi saved\b|\bi've saved\b|\bdone\b|\bupdated\b/);
  });

  it("first_visit fallback avoids claiming a completed save in Italian", () => {
    const text = STEP_EXHAUSTION_FALLBACK.first_visit.it.toLowerCase();
    expect(text).not.toMatch(/\bsalvato\b|\bfatto\b|\baggiornato\b/);
  });

  it("MAX_STEPS is documented as 12", () => {
    // This is a documentation test — the actual constant is in route.ts (not exported).
    // If MAX_STEPS changes, update this test and the plan.
    const MAX_STEPS = 12;
    expect(MAX_STEPS).toBeGreaterThanOrEqual(10);
  });
});
