import { describe, it, expect } from "vitest";
import {
  isConfirmatoryMessage,
  hashValue,
} from "@/lib/services/confirmation-service";

describe("confirmation-service — Layer 0 semantic pre-check", () => {
  describe("isConfirmatoryMessage", () => {
    const languages = [
      { lang: "en", yes: ["yes", "Yeah", "yep", "ok", "sure", "confirmed", "go ahead", "do it", "approve", "right", "correct"], no: ["no", "maybe", "tell me more", "what?"] },
      { lang: "it", yes: ["sì", "Si", "ok", "va bene", "confermo", "vai", "fallo", "certo", "esatto", "procedi"], no: ["no", "forse", "dimmi di più"] },
      { lang: "de", yes: ["ja", "ok", "bestätige", "mach", "richtig", "genau", "einverstanden"], no: ["nein", "vielleicht", "erzähl mir mehr"] },
      { lang: "fr", yes: ["oui", "ok", "confirme", "vas-y", "d'accord", "c'est bon", "exact"], no: ["non", "peut-être"] },
      { lang: "es", yes: ["sí", "si", "ok", "confirmo", "dale", "hazlo", "correcto"], no: ["no", "quizás"] },
      { lang: "pt", yes: ["sim", "ok", "confirmo", "vai", "faz", "certo", "exato"], no: ["não", "talvez"] },
      { lang: "ja", yes: ["はい", "うん", "ok", "確認", "いいよ", "そうだ"], no: ["いいえ", "ちょっと待って"] },
      { lang: "zh", yes: ["是", "是的", "好", "好的", "ok", "确认", "对", "没问题"], no: ["不", "等一下"] },
    ];

    for (const { lang, yes, no } of languages) {
      describe(`language: ${lang}`, () => {
        for (const word of yes) {
          it(`accepts "${word}"`, () => {
            expect(isConfirmatoryMessage(word, lang)).toBe(true);
          });
        }
        for (const word of no) {
          it(`rejects "${word}"`, () => {
            expect(isConfirmatoryMessage(word, lang)).toBe(false);
          });
        }
      });
    }

    it("rejects messages > 100 chars", () => {
      expect(isConfirmatoryMessage("yes " + "a".repeat(100), "en")).toBe(false);
    });

    it("accepts natural trailing text (< 100 chars)", () => {
      expect(isConfirmatoryMessage("Sì, cambia il nome", "it")).toBe(true);
    });

    it("accepts 'ok, do it' with trailing text", () => {
      expect(isConfirmatoryMessage("ok, go ahead and change it", "en")).toBe(true);
    });

    it("rejects null", () => {
      expect(isConfirmatoryMessage(null, "en")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isConfirmatoryMessage("", "en")).toBe(false);
    });

    it("rejects whitespace-only", () => {
      expect(isConfirmatoryMessage("   ", "en")).toBe(false);
    });

    it("falls back to English for unknown language", () => {
      expect(isConfirmatoryMessage("yes", "xx")).toBe(true);
      expect(isConfirmatoryMessage("no", "xx")).toBe(false);
    });
  });

  describe("hashValue — canonical JSON", () => {
    it("produces deterministic hash", () => {
      const h1 = hashValue({ a: 1, b: 2 });
      const h2 = hashValue({ b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it("different values produce different hashes", () => {
      const h1 = hashValue({ a: 1 });
      const h2 = hashValue({ a: 2 });
      expect(h1).not.toBe(h2);
    });

    it("handles nested objects", () => {
      const h1 = hashValue({ a: { c: 3, b: 2 } });
      const h2 = hashValue({ a: { b: 2, c: 3 } });
      expect(h1).toBe(h2);
    });

    it("handles arrays", () => {
      const h1 = hashValue([1, 2, 3]);
      const h2 = hashValue([1, 2, 3]);
      expect(h1).toBe(h2);
    });

    it("array order matters", () => {
      const h1 = hashValue([1, 2, 3]);
      const h2 = hashValue([3, 2, 1]);
      expect(h1).not.toBe(h2);
    });

    it("handles null and primitives", () => {
      expect(hashValue(null)).toBe(hashValue(null));
      expect(hashValue("hello")).toBe(hashValue("hello"));
      expect(hashValue(42)).toBe(hashValue(42));
    });

    it("returns 16-char hex string", () => {
      const h = hashValue({ test: "value" });
      expect(h).toMatch(/^[a-f0-9]{16}$/);
    });
  });
});
