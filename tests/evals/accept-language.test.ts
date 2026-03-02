import { describe, it, expect, beforeAll } from "vitest";

describe("Accept-Language parser", () => {
  let parseAcceptLanguage: (header: string | null) => string | null;

  beforeAll(async () => {
    const mod = await import("@/lib/i18n/accept-language");
    parseAcceptLanguage = mod.parseAcceptLanguage;
  });

  it("returns null for null/empty header", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage("")).toBeNull();
  });

  it("matches simple language code", () => {
    expect(parseAcceptLanguage("fr")).toBe("fr");
  });

  it("matches with q-weights, picks highest", () => {
    expect(parseAcceptLanguage("de;q=0.5,fr;q=0.9,en;q=0.8")).toBe("fr");
  });

  it("treats missing q as q=1", () => {
    expect(parseAcceptLanguage("it,en;q=0.8")).toBe("it");
  });

  it("falls back from region to base (fr-CA → fr)", () => {
    expect(parseAcceptLanguage("fr-CA")).toBe("fr");
  });

  it("handles complex header with region fallback", () => {
    expect(
      parseAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8,de;q=0.5"),
    ).toBe("fr");
  });

  it("returns null for unsupported languages only", () => {
    expect(parseAcceptLanguage("ko,th;q=0.9")).toBeNull();
  });

  it("handles * wildcard (ignored)", () => {
    expect(parseAcceptLanguage("*;q=0.1,fr;q=0.9")).toBe("fr");
  });

  it("handles zh-CN → zh", () => {
    expect(parseAcceptLanguage("zh-CN;q=0.9,en;q=0.8")).toBe("zh");
  });

  it("handles ja-JP → ja", () => {
    expect(parseAcceptLanguage("ja-JP")).toBe("ja");
  });

  it("handles pt-BR → pt", () => {
    expect(parseAcceptLanguage("pt-BR,pt;q=0.9")).toBe("pt");
  });

  describe("bot detection", () => {
    let isCrawler: (userAgent: string | null) => boolean;

    beforeAll(async () => {
      const mod = await import("@/lib/i18n/accept-language");
      isCrawler = mod.isCrawler;
    });

    it("detects Googlebot", () => {
      expect(
        isCrawler(
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        ),
      ).toBe(true);
    });

    it("detects Bingbot", () => {
      expect(
        isCrawler(
          "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        ),
      ).toBe(true);
    });

    it("returns false for normal browsers", () => {
      expect(
        isCrawler("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
      ).toBe(false);
    });

    it("returns false for null UA", () => {
      expect(isCrawler(null)).toBe(false);
    });
  });
});
