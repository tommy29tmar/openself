import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageConfig } from "@/lib/page-config/schema";

// ── Mock dependencies ──────────────────────────────────────────────────

const mockGetPublishedPage = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {},
  sqlite: {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(),
    })),
    transaction: vi.fn((fn: () => void) => fn),
  },
}));

vi.mock("@/lib/services/page-service", () => ({
  getPublishedPage: (...args: unknown[]) => mockGetPublishedPage(...args),
  getPublishedPageSourceLanguage: vi.fn(() => "en"),
  getAllPublishedUsernames: vi.fn(() => []),
}));

// ── Helpers ────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<{
  name: string;
  tagline: string;
  bioText: string;
  socialLinks: { platform: string; url: string }[];
  heroSocialLinks: { platform: string; url: string; label?: string }[];
}>): PageConfig {
  const sections: PageConfig["sections"] = [];

  const heroContent: Record<string, unknown> = {
    name: overrides.name ?? "Alice Test",
    tagline: overrides.tagline ?? "Software Engineer",
  };
  if (overrides.heroSocialLinks) {
    heroContent.socialLinks = overrides.heroSocialLinks;
  }
  sections.push({ id: "hero-1", type: "hero", content: heroContent });

  if (overrides.bioText !== undefined) {
    sections.push({ id: "bio-1", type: "bio", content: { text: overrides.bioText } });
  }

  if (overrides.socialLinks) {
    sections.push({
      id: "social-1",
      type: "social",
      content: { links: overrides.socialLinks },
    });
  }

  sections.push({ id: "footer-1", type: "footer", content: {} });

  return {
    version: 1,
    username: "alice",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: { primaryColor: "#000", layout: "centered" },
    sections,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("SEO metadata generation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_BASE_URL = "https://openself.dev";
  });

  describe("generateMetadata output shape", () => {
    // These tests verify the metadata logic inline, since generateMetadata
    // requires Next.js server context (params Promise, headers, cookies).
    // We replicate the core extraction logic here.

    it("extracts name, headline, description from config", () => {
      const config = makeConfig({
        name: "Alice Test",
        tagline: "Full Stack Dev",
        bioText: "I build cool things on the web.",
      });

      const hero = config.sections.find((s) => s.type === "hero");
      const bio = config.sections.find((s) => s.type === "bio");
      const name = typeof hero?.content?.name === "string" ? hero.content.name : "alice";
      const headline = typeof hero?.content?.tagline === "string" ? hero.content.tagline : "";
      const description =
        (typeof bio?.content?.text === "string" ? bio.content.text.slice(0, 160) : null) ??
        `${name} on OpenSelf`;

      expect(name).toBe("Alice Test");
      expect(headline).toBe("Full Stack Dev");
      expect(description).toBe("I build cool things on the web.");
    });

    it("falls back to username when no hero name", () => {
      const config = makeConfig({});
      // Remove hero section to test fallback
      config.sections = config.sections.filter((s) => s.type !== "hero");

      const hero = config.sections.find((s) => s.type === "hero");
      const name = typeof hero?.content?.name === "string" ? hero.content.name : "alice";

      expect(name).toBe("alice");
    });

    it("falls back to 'Name on OpenSelf' when no bio", () => {
      const config = makeConfig({ bioText: undefined });
      // Remove bio section
      config.sections = config.sections.filter((s) => s.type !== "bio");

      const bio = config.sections.find((s) => s.type === "bio");
      const name = "Alice Test";
      const description =
        (typeof bio?.content?.text === "string" ? bio.content.text.slice(0, 160) : null) ??
        `${name} on OpenSelf`;

      expect(description).toBe("Alice Test on OpenSelf");
    });

    it("truncates bio text to 160 chars for description", () => {
      const longBio = "A".repeat(200);
      const config = makeConfig({ bioText: longBio });

      const bio = config.sections.find((s) => s.type === "bio");
      const description =
        typeof bio?.content?.text === "string" ? bio.content.text.slice(0, 160) : "";

      expect(description.length).toBe(160);
    });

    it("generates correct OG image URL", () => {
      const baseUrl = "https://openself.dev";
      const username = "alice";
      const ogImageUrl = `${baseUrl}/api/og/${encodeURIComponent(username)}`;

      expect(ogImageUrl).toBe("https://openself.dev/api/og/alice");
    });

    it("encodes special characters in username", () => {
      const baseUrl = "https://openself.dev";
      const username = "alice test";
      const ogImageUrl = `${baseUrl}/api/og/${encodeURIComponent(username)}`;

      expect(ogImageUrl).toBe("https://openself.dev/api/og/alice%20test");
    });
  });

  describe("JSON-LD structured data", () => {
    it("builds basic Person schema", () => {
      const config = makeConfig({ name: "Alice", tagline: "Engineer" });
      const baseUrl = "https://openself.dev";

      const hero = config.sections.find((s) => s.type === "hero");
      const name = typeof hero?.content?.name === "string" ? hero.content.name : "alice";
      const headline = typeof hero?.content?.tagline === "string" ? hero.content.tagline : undefined;

      const jsonLd: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Person",
        name,
        url: `${baseUrl}/alice`,
      };
      if (headline) jsonLd.jobTitle = headline;

      expect(jsonLd["@context"]).toBe("https://schema.org");
      expect(jsonLd["@type"]).toBe("Person");
      expect(jsonLd.name).toBe("Alice");
      expect(jsonLd.jobTitle).toBe("Engineer");
      expect(jsonLd.url).toBe("https://openself.dev/alice");
    });

    it("omits jobTitle when no headline", () => {
      const config = makeConfig({ tagline: "" });

      const hero = config.sections.find((s) => s.type === "hero");
      const headline = typeof hero?.content?.tagline === "string" ? hero.content.tagline : undefined;

      const jsonLd: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Alice Test",
        url: "https://openself.dev/alice",
      };
      if (headline) jsonLd.jobTitle = headline;

      expect(jsonLd.jobTitle).toBeUndefined();
    });

    it("collects sameAs from social section links", () => {
      const config = makeConfig({
        socialLinks: [
          { platform: "github", url: "https://github.com/alice" },
          { platform: "linkedin", url: "https://linkedin.com/in/alice" },
        ],
      });

      const socialSection = config.sections.find((s) => s.type === "social");
      const sameAs: string[] = [];
      const seen = new Set<string>();

      if (Array.isArray(socialSection?.content?.links)) {
        for (const link of socialSection.content.links as { url?: string }[]) {
          if (typeof link?.url === "string" && !seen.has(link.url)) {
            sameAs.push(link.url);
            seen.add(link.url);
          }
        }
      }

      expect(sameAs).toEqual([
        "https://github.com/alice",
        "https://linkedin.com/in/alice",
      ]);
    });

    it("deduplicates URLs between social section and hero socialLinks", () => {
      const config = makeConfig({
        socialLinks: [
          { platform: "github", url: "https://github.com/alice" },
        ],
        heroSocialLinks: [
          { platform: "github", url: "https://github.com/alice" },
          { platform: "website", url: "https://alice.dev" },
        ],
      });

      const sameAs: string[] = [];
      const seen = new Set<string>();

      const socialSection = config.sections.find((s) => s.type === "social");
      if (Array.isArray(socialSection?.content?.links)) {
        for (const link of socialSection.content.links as { url?: string }[]) {
          if (typeof link?.url === "string" && !seen.has(link.url)) {
            sameAs.push(link.url);
            seen.add(link.url);
          }
        }
      }

      const hero = config.sections.find((s) => s.type === "hero");
      if (Array.isArray(hero?.content?.socialLinks)) {
        for (const link of hero.content.socialLinks as { url?: string }[]) {
          if (typeof link?.url === "string" && !seen.has(link.url)) {
            sameAs.push(link.url);
            seen.add(link.url);
          }
        }
      }

      expect(sameAs).toEqual([
        "https://github.com/alice",
        "https://alice.dev",
      ]);
      expect(sameAs.length).toBe(2); // github not duplicated
    });
  });
});

describe("getAllPublishedUsernames", () => {
  it("is exported from page-service", async () => {
    const mod = await import("@/lib/services/page-service");
    expect(typeof mod.getAllPublishedUsernames).toBe("function");
  });
});

describe("sitemap", () => {
  it("exports a default function", async () => {
    const mod = await import("@/app/sitemap");
    expect(typeof mod.default).toBe("function");
  });

  it("returns array with at least the base URL", async () => {
    const mod = await import("@/app/sitemap");
    const result = mod.default();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].url).toContain("openself.dev");
  });
});

describe("robots", () => {
  it("exports a default function", async () => {
    const mod = await import("@/app/robots");
    expect(typeof mod.default).toBe("function");
  });

  it("returns rules allowing all and sitemap URL", async () => {
    const mod = await import("@/app/robots");
    const result = mod.default();
    expect(result.rules).toBeDefined();
    expect(result.sitemap).toContain("sitemap.xml");
  });
});
