import { describe, it, expect } from "vitest";
import { STEP_EXHAUSTION_FALLBACK } from "@/app/api/chat/route";

// R3 banned phrases from turn-management.ts
const BANNED_PHRASES = [
  "let me know if you need",
  "feel free to ask",
  "i'm here if you need",
  "don't hesitate",
  "is there anything else",
  "just let me know",
  "let me know if you'd like",
  "let me know if you want",
];

describe("STEP_EXHAUSTION_FALLBACK — R3 compliance", () => {
  for (const [state, messages] of Object.entries(STEP_EXHAUSTION_FALLBACK)) {
    for (const [lang, text] of Object.entries(messages)) {
      it(`[${state}][${lang}] contains no banned R3 phrase`, () => {
        const lower = text.toLowerCase();
        for (const banned of BANNED_PHRASES) {
          expect(lower).not.toContain(banned);
        }
      });

      it(`[${state}][${lang}] is non-empty`, () => {
        expect(text.trim().length).toBeGreaterThan(0);
      });
    }
  }
});
