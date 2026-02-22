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
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#6366f1",
      fontFamily: "inter",
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
            colorScheme: "light",
            primaryColor: "#000",
            fontFamily: "inter",
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

    it("fails when theme is missing", () => {
      const config = makeValidConfig({ theme: "" });
      const result = validatePageConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("theme"))).toBe(true);
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

    it("output always has version, username, theme, style, and sections", () => {
      const page = composeOptimisticPage([], "testuser");
      expect(page.version).toBe(1);
      expect(page.username).toBe("testuser");
      expect(page.theme).toBeTruthy();
      expect(page.style).toBeDefined();
      expect(page.style.colorScheme).toMatch(/^(light|dark)$/);
      expect(Array.isArray(page.sections)).toBe(true);
    });
  });
});
