import { describe, it, expect, vi } from "vitest";

// Mock the event-service (used transitively by page-composer's repairAndValidate)
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

import { validatePageConfig } from "@/lib/page-config/schema";
import type { PageConfig } from "@/lib/page-config/schema";
import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeValidConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
    version: 1,
    username: "testuser",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: {
      primaryColor: "#6366f1",
      layout: "centered",
    },
    sections: [
      {
        id: "hero-1",
        type: "hero",
        variant: "large",
        content: { name: "Test User", tagline: "Hello world" },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {},
      },
    ],
    ...overrides,
  };
}

describe("validatePageConfig", () => {
  describe("valid configs", () => {
    it("accepts a well-formed page config", () => {
      const config = makeValidConfig();
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts all valid layout options", () => {
      for (const layout of ["centered", "split", "stack"] as const) {
        const config = makeValidConfig({
          style: {
            primaryColor: "#000",
            layout,
          },
        });
        const result = validatePageConfig(config);
        expect(result.ok).toBe(true);
      }
    });

    it("accepts config with all core section types", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "bio-1", type: "bio", content: { text: "Some bio text" } },
          { id: "skills-1", type: "skills", content: { groups: [{ label: "Skills", skills: ["TS"] }] } },
          { id: "projects-1", type: "projects", content: { items: [{ title: "Proj" }] } },
          { id: "interests-1", type: "interests", content: { items: [{ name: "Music" }] } },
          { id: "social-1", type: "social", content: { links: [{ platform: "github", url: "https://github.com/a" }] } },
          { id: "footer-1", type: "footer", content: {} },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });
  });

  describe("missing required fields", () => {
    it("fails when version is missing", () => {
      const config = makeValidConfig();
      delete (config as any).version;
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("version"))).toBe(true);
    });

    it("fails when username is empty", () => {
      const config = makeValidConfig({ username: "" });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("username"))).toBe(true);
    });

    it("fails when surface is missing", () => {
      const config = makeValidConfig({ surface: "" });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("surface"))).toBe(true);
    });

    it("fails when style is missing", () => {
      const config = makeValidConfig({ style: null as any });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("style"))).toBe(true);
    });

    it("fails when sections is not an array", () => {
      const config = makeValidConfig({ sections: "not-an-array" as any });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("sections"))).toBe(true);
    });
  });

  describe("invalid section types", () => {
    it("fails for an unrecognized section type without a component registry", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "bad-1", type: "nonexistent" as any, content: {} },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("type"))).toBe(true);
    });

    it("fails when hero section is missing required content fields", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: {} },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("hero.content.name"))).toBe(true);
    });

    it("fails when bio section is missing text", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "bio-1", type: "bio", content: {} },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("bio.content.text"))).toBe(true);
    });

    it("fails when projects section items is not an array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "projects-1", type: "projects", content: { items: "bad" } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("projects"))).toBe(true);
    });
  });

  describe("extended section types (Phase 1b)", () => {
    it("accepts experience section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "experience-1", type: "experience", content: { items: [{ title: "Engineer" }] } },
          { id: "footer-1", type: "footer", content: {} },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts education section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "education-1", type: "education", content: { items: [{ institution: "MIT" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts languages section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "languages-1", type: "languages", content: { items: [{ language: "Spanish" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts activities section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "activities-1", type: "activities", content: { items: [{ name: "Tennis" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts achievements section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "achievements-1", type: "achievements", content: { items: [{ title: "Award" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts stats section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "stats-1", type: "stats", content: { items: [{ label: "Years", value: "10+" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts reading section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "reading-1", type: "reading", content: { items: [{ title: "Clean Code" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts music section with items array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "music-1", type: "music", content: { items: [{ title: "Bohemian Rhapsody" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts contact section with methods array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "contact-1", type: "contact", content: { methods: [{ type: "email", value: "a@b.com" }] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("accepts empty items array (lenient validators)", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "experience-1", type: "experience", content: { items: [] } },
          { id: "education-1", type: "education", content: { items: [] } },
          { id: "languages-1", type: "languages", content: { items: [] } },
          { id: "contact-1", type: "contact", content: { methods: [] } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });

    it("fails when experience items is not an array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "experience-1", type: "experience", content: { items: "bad" } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("experience"))).toBe(true);
    });

    it("fails when contact methods is not an array", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "contact-1", type: "contact", content: { methods: "bad" } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("contact"))).toBe(true);
    });

    it("does not validate custom section content (permissive)", () => {
      const config = makeValidConfig({
        sections: [
          { id: "hero-1", type: "hero", content: { name: "A", tagline: "B" } },
          { id: "custom-1", type: "custom", content: { anything: "goes" } },
        ],
      });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(true);
    });
  });

  describe("schema repair via composeOptimisticPage", () => {
    it("always produces a valid page config even with empty facts", () => {
      const page = composeOptimisticPage([], "testuser");
      const result = validatePageConfig(page);
      expect(result.ok).toBe(true);
    });

    it("produces a valid page config with diverse facts", () => {
      const facts = [
        {
          id: "1", category: "identity", key: "full-name",
          value: { full: "Test User" },
          source: "chat", confidence: 1, visibility: "public",
          createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "2", category: "skill", key: "ts",
          value: { name: "TypeScript" },
          source: "chat", confidence: 1, visibility: "public",
          createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "3", category: "project", key: "proj",
          value: { title: "My Project", description: "A project" },
          source: "chat", confidence: 1, visibility: "public",
          createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "4", category: "interest", key: "music",
          value: { name: "Music" },
          source: "chat", confidence: 1, visibility: "public",
          createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        },
      ];
      const page = composeOptimisticPage(facts as any, "testuser");
      const result = validatePageConfig(page);
      expect(result.ok).toBe(true);
    });

    it("output always has version, username, surface, style, and sections", () => {
      const page = composeOptimisticPage([], "testuser");
      expect(page.version).toBe(1);
      expect(page.username).toBe("testuser");
      expect(page.surface).toBeTruthy();
      expect(page.voice).toBeTruthy();
      expect(page.light).toBeTruthy();
      expect(page.style).toBeDefined();
      expect(Array.isArray(page.sections)).toBe(true);
    });
  });
});
