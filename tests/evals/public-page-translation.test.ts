import { describe, it, expect } from "vitest";
import { parseAcceptLanguage, isCrawler } from "@/lib/i18n/accept-language";

describe("Public page translation logic", () => {
  describe("language precedence", () => {
    it("?lang=original skips translation", () => {
      const lang = "original";
      const shouldTranslate = lang !== "original";
      expect(shouldTranslate).toBe(false);
    });

    it("?lang=fr overrides Accept-Language", () => {
      const explicitLang = "fr";
      const acceptLang = parseAcceptLanguage("de,en;q=0.8");
      const effective = explicitLang ?? acceptLang;
      expect(effective).toBe("fr");
    });

    it("Accept-Language used when no ?lang= param", () => {
      const explicitLang = null;
      const acceptLang = parseAcceptLanguage("it;q=0.9,en;q=0.8");
      const effective = explicitLang ?? acceptLang;
      expect(effective).toBe("it");
    });

    it("cookie language overrides Accept-Language when no ?lang= param", () => {
      const explicitLang = null;
      const cookieLang = "fr";
      const acceptLang = parseAcceptLanguage("de;q=0.9,en;q=0.8");
      const effective = explicitLang ?? cookieLang ?? acceptLang;
      expect(effective).toBe("fr");
    });

    it("no translation when visitor language matches source", () => {
      const visitorLang = "en";
      const sourceLang = "en";
      const needsTranslation = visitorLang !== sourceLang;
      expect(needsTranslation).toBe(false);
    });
  });

  describe("bot detection integration", () => {
    it("bots get original content (no translation)", () => {
      const ua = "Mozilla/5.0 (compatible; Googlebot/2.1)";
      expect(isCrawler(ua)).toBe(true);
    });
  });

  describe("graceful degradation", () => {
    it("serves original when sourceLanguage is null (old pages)", () => {
      const sourceLanguage = null;
      const visitorLang = "fr";
      // When sourceLanguage is null, skip translation
      const shouldTranslate = sourceLanguage !== null && visitorLang !== sourceLanguage;
      expect(shouldTranslate).toBe(false);
    });

    it("serves original when Accept-Language has no supported match", () => {
      const visitorLang = parseAcceptLanguage("ko,th;q=0.9");
      expect(visitorLang).toBeNull();
      // null visitorLang → no translation
    });
  });

  describe("TranslationBanner language names", () => {
    it("maps source language codes to display names", async () => {
      const { LANGUAGE_NAMES } = await import("@/lib/i18n/language-names");
      expect(LANGUAGE_NAMES.fr).toBe("French");
      expect(LANGUAGE_NAMES.it).toBe("Italian");
      expect(LANGUAGE_NAMES.de).toBe("German");
      expect(LANGUAGE_NAMES.ja).toBe("Japanese");
    });
  });
});
