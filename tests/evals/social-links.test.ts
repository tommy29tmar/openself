import { describe, it, expect, beforeAll } from "vitest";
import { detectPlatform, getPlatformLabel, SOCIAL_PLATFORMS } from "@/lib/social-links";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

describe("social-links registry", () => {
  describe("SOCIAL_PLATFORMS", () => {
    it("defines all expected platforms", () => {
      const platforms = Object.keys(SOCIAL_PLATFORMS);
      expect(platforms).toContain("linkedin");
      expect(platforms).toContain("email");
      expect(platforms).toContain("twitter");
      expect(platforms).toContain("website");
      expect(platforms).toContain("calendly");
      expect(platforms).toContain("mastodon");
      expect(platforms).toContain("bluesky");
      expect(platforms).toContain("threads");
      expect(platforms).toContain("github");
      expect(platforms).toContain("spotify");
      expect(platforms).toContain("strava");
    });

    it("every platform has icon, label, and urlPattern fields", () => {
      for (const [key, def] of Object.entries(SOCIAL_PLATFORMS)) {
        expect(def.icon, `${key} should have icon`).toBeTruthy();
        expect(def.label, `${key} should have label`).toBeTruthy();
        // urlPattern can be null (website fallback)
        if (key !== "website") {
          expect(def.urlPattern, `${key} should have urlPattern`).toBeInstanceOf(RegExp);
        }
      }
    });
  });

  describe("detectPlatform", () => {
    it("detects LinkedIn from URL", () => {
      expect(detectPlatform("https://www.linkedin.com/in/johndoe")).toBe("linkedin");
    });

    it("detects GitHub from URL", () => {
      expect(detectPlatform("https://github.com/johndoe")).toBe("github");
    });

    it("detects Twitter/X from x.com", () => {
      expect(detectPlatform("https://x.com/johndoe")).toBe("twitter");
    });

    it("detects Twitter/X from twitter.com", () => {
      expect(detectPlatform("https://twitter.com/johndoe")).toBe("twitter");
    });

    it("detects email from mailto:", () => {
      expect(detectPlatform("mailto:john@example.com")).toBe("email");
    });

    it("detects Spotify from URL", () => {
      expect(detectPlatform("https://open.spotify.com/user/123")).toBe("spotify");
    });

    it("detects Strava from URL", () => {
      expect(detectPlatform("https://www.strava.com/athletes/123")).toBe("strava");
    });

    it("detects Calendly from URL", () => {
      expect(detectPlatform("https://calendly.com/johndoe")).toBe("calendly");
    });

    it("detects Mastodon from URL", () => {
      expect(detectPlatform("https://mastodon.social/@johndoe")).toBe("mastodon");
    });

    it("detects Bluesky from URL", () => {
      expect(detectPlatform("https://bsky.app/profile/johndoe")).toBe("bluesky");
    });

    it("detects Threads from URL", () => {
      expect(detectPlatform("https://www.threads.net/@johndoe")).toBe("threads");
    });

    it("falls back to website for unknown URLs", () => {
      expect(detectPlatform("https://example.com")).toBe("website");
    });

    it("is case-insensitive", () => {
      expect(detectPlatform("HTTPS://GITHUB.COM/johndoe")).toBe("github");
    });
  });

  describe("getPlatformLabel", () => {
    it("returns known label for known platform", () => {
      expect(getPlatformLabel("github")).toBe("GitHub");
      expect(getPlatformLabel("linkedin")).toBe("LinkedIn");
      expect(getPlatformLabel("twitter")).toBe("X / Twitter");
    });

    it("is case-insensitive", () => {
      expect(getPlatformLabel("GitHub")).toBe("GitHub");
      expect(getPlatformLabel("LINKEDIN")).toBe("LinkedIn");
    });

    it("returns platform string for unknown platform", () => {
      expect(getPlatformLabel("myspace")).toBe("myspace");
    });
  });
});

describe("hero social links composition", () => {
  // Integration test: verify composeOptimisticPage puts social facts into hero.socialLinks
  it("includes social facts in hero socialLinks", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      {
        id: "1", sessionId: "s1", category: "identity", key: "name",
        value: { full: "John Doe" }, source: "chat", confidence: 1,
        visibility: "public", createdAt: "2024-01-01", updatedAt: "2024-01-01",
        sortOrder: 0, parentFactId: null, archivedAt: null, clusterId: null,
        profileId: null,
      },
      {
        id: "2", sessionId: "s1", category: "social", key: "github",
        value: { platform: "github", url: "https://github.com/johndoe" },
        source: "chat", confidence: 1, visibility: "public",
        createdAt: "2024-01-01", updatedAt: "2024-01-01",
        sortOrder: 0, parentFactId: null, archivedAt: null, clusterId: null,
        profileId: null,
      },
      {
        id: "3", sessionId: "s1", category: "social", key: "linkedin",
        value: { platform: "linkedin", url: "https://linkedin.com/in/johndoe" },
        source: "chat", confidence: 1, visibility: "public",
        createdAt: "2024-01-01", updatedAt: "2024-01-01",
        sortOrder: 0, parentFactId: null, archivedAt: null, clusterId: null,
        profileId: null,
      },
    ];

    const page = composeOptimisticPage(facts as any, "johndoe", "en");
    const hero = page.sections.find(s => s.type === "hero");
    expect(hero).toBeDefined();
    const links = hero!.content.socialLinks as { platform: string; url: string }[];
    expect(links).toBeDefined();
    expect(links.length).toBe(2);
    expect(links.find(l => l.platform === "github")).toBeDefined();
    expect(links.find(l => l.platform === "linkedin")).toBeDefined();
  });

  it("includes CTA in hero from social fact with key cta", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      {
        id: "1", sessionId: "s1", category: "identity", key: "name",
        value: { full: "Jane Doe" }, source: "chat", confidence: 1,
        visibility: "public", createdAt: "2024-01-01", updatedAt: "2024-01-01",
        sortOrder: 0, parentFactId: null, archivedAt: null, clusterId: null,
        profileId: null,
      },
      {
        id: "4", sessionId: "s1", category: "social", key: "cta",
        value: { label: "Book a call", url: "https://calendly.com/janedoe" },
        source: "chat", confidence: 1, visibility: "public",
        createdAt: "2024-01-01", updatedAt: "2024-01-01",
        sortOrder: 0, parentFactId: null, archivedAt: null, clusterId: null,
        profileId: null,
      },
    ];

    const page = composeOptimisticPage(facts as any, "janedoe", "en");
    const hero = page.sections.find(s => s.type === "hero");
    expect(hero).toBeDefined();
    const cta = hero!.content.cta as { label: string; url: string };
    expect(cta).toBeDefined();
    expect(cta.label).toBe("Book a call");
    expect(cta.url).toBe("https://calendly.com/janedoe");
  });

  it("does not include CTA when no cta social fact exists", async () => {
    const { composeOptimisticPage } = await import("@/lib/services/page-composer");
    const facts = [
      {
        id: "1", sessionId: "s1", category: "identity", key: "name",
        value: { full: "John Doe" }, source: "chat", confidence: 1,
        visibility: "public", createdAt: "2024-01-01", updatedAt: "2024-01-01",
        sortOrder: 0, parentFactId: null, archivedAt: null, clusterId: null,
        profileId: null,
      },
    ];

    const page = composeOptimisticPage(facts as any, "johndoe", "en");
    const hero = page.sections.find(s => s.type === "hero");
    expect(hero).toBeDefined();
    expect(hero!.content.cta).toBeUndefined();
  });
});
