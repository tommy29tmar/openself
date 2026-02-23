import { describe, it, expect, vi } from "vitest";

// Mock the event-service before importing page-composer (which imports logEvent)
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { FactRow } from "@/lib/services/kb-service";

function makeFact(overrides: Partial<FactRow> & Pick<FactRow, "category" | "key">): FactRow {
  return {
    id: overrides.id ?? "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

describe("composeOptimisticPage — fact-to-section mapping", () => {
  describe("identity facts → hero section", () => {
    it("maps full-name fact to hero name", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero).toBeDefined();
      expect(hero!.content.name).toBe("Alice Smith");
    });

    it("maps tagline fact to hero tagline", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
        makeFact({ category: "identity", key: "tagline", value: { tagline: "Building the future" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("Building the future");
    });

    it("generates a default tagline when none provided", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("Welcome to Alice Smith's page");
    });

    it("uses 'Anonymous' when no name fact is provided", () => {
      const page = composeOptimisticPage([], "alice");
      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero).toBeDefined();
      expect(hero!.content.name).toBe("Anonymous");
    });
  });

  describe("skill facts → skills section", () => {
    it("maps skill facts to skills section with correct skills", () => {
      const facts: FactRow[] = [
        makeFact({ category: "skill", key: "typescript", value: { name: "TypeScript" } }),
        makeFact({ category: "skill", key: "rust", value: { name: "Rust" } }),
        makeFact({ category: "skill", key: "python", value: { name: "Python" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const skills = page.sections.find((s) => s.type === "skills");
      expect(skills).toBeDefined();

      const groups = skills!.content.groups as Array<{ label: string; skills: string[] }>;
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe("Skills");
      expect(groups[0].skills).toEqual(["TypeScript", "Rust", "Python"]);
    });

    it("omits skills section when no skill facts exist", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const skills = page.sections.find((s) => s.type === "skills");
      expect(skills).toBeUndefined();
    });
  });

  describe("interest facts → interests section", () => {
    it("maps interest facts to interests section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "interest", key: "music", value: { name: "Music" } }),
        makeFact({ category: "interest", key: "hiking", value: { name: "Hiking" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const interests = page.sections.find((s) => s.type === "interests");
      expect(interests).toBeDefined();

      const items = interests!.content.items as Array<{ name: string }>;
      expect(items).toHaveLength(2);
      expect(items[0].name).toBe("Music");
      expect(items[1].name).toBe("Hiking");
    });

    it("uses the 'Interests' title label in English", () => {
      const facts: FactRow[] = [
        makeFact({ category: "interest", key: "music", value: { name: "Music" } }),
      ];
      const page = composeOptimisticPage(facts, "alice", "en");

      const interests = page.sections.find((s) => s.type === "interests");
      expect(interests!.content.title).toBe("Interests");
    });
  });

  describe("project facts → projects section", () => {
    it("maps project facts to projects section with correct items", () => {
      const facts: FactRow[] = [
        makeFact({
          category: "project",
          key: "openself",
          value: { title: "OpenSelf", description: "AI page builder", url: "https://openself.dev", tags: ["ai", "web"] },
        }),
        makeFact({
          category: "project",
          key: "cli-tool",
          value: { title: "CLI Tool" },
        }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const projects = page.sections.find((s) => s.type === "projects");
      expect(projects).toBeDefined();

      const items = projects!.content.items as Array<{
        title: string;
        description?: string;
        url?: string;
        tags?: string[];
      }>;
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe("OpenSelf");
      expect(items[0].description).toBe("AI page builder");
      expect(items[0].url).toBe("https://openself.dev");
      expect(items[0].tags).toEqual(["ai", "web"]);
      expect(items[1].title).toBe("CLI Tool");
    });
  });

  describe("empty facts → valid minimal page", () => {
    it("produces a valid page with hero + footer when facts are empty", () => {
      const page = composeOptimisticPage([], "alice");

      expect(page.version).toBe(1);
      expect(page.username).toBe("alice");
      expect(page.sections.length).toBeGreaterThanOrEqual(2);

      const hero = page.sections.find((s) => s.type === "hero");
      const footer = page.sections.find((s) => s.type === "footer");
      expect(hero).toBeDefined();
      expect(footer).toBeDefined();
    });

    it("footer is always the last section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
        makeFact({ category: "skill", key: "ts", value: { name: "TypeScript" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const lastSection = page.sections[page.sections.length - 1];
      expect(lastSection.type).toBe("footer");
    });
  });

  describe("language parameter → localized labels", () => {
    it("produces Italian labels with language='it'", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Marco Rossi" } }),
        makeFact({ category: "skill", key: "java", value: { name: "Java" } }),
        makeFact({ category: "interest", key: "cucina", value: { name: "Cucina" } }),
      ];
      const page = composeOptimisticPage(facts, "marco", "it");

      const skills = page.sections.find((s) => s.type === "skills");
      const groups = skills!.content.groups as Array<{ label: string; skills: string[] }>;
      expect(groups[0].label).toBe("Competenze");

      const interests = page.sections.find((s) => s.type === "interests");
      expect(interests!.content.title).toBe("Interessi");
    });

    it("produces German labels with language='de'", () => {
      const facts: FactRow[] = [
        makeFact({ category: "skill", key: "go", value: { name: "Go" } }),
        makeFact({ category: "interest", key: "wandern", value: { name: "Wandern" } }),
      ];
      const page = composeOptimisticPage(facts, "hans", "de");

      const skills = page.sections.find((s) => s.type === "skills");
      const groups = skills!.content.groups as Array<{ label: string; skills: string[] }>;
      expect(groups[0].label).toBe("Fähigkeiten");

      const interests = page.sections.find((s) => s.type === "interests");
      expect(interests!.content.title).toBe("Interessen");
    });

    it("falls back to English for unknown language code", () => {
      const facts: FactRow[] = [
        makeFact({ category: "skill", key: "ts", value: { name: "TypeScript" } }),
      ];
      const page = composeOptimisticPage(facts, "alice", "xx");

      const skills = page.sections.find((s) => s.type === "skills");
      const groups = skills!.content.groups as Array<{ label: string; skills: string[] }>;
      expect(groups[0].label).toBe("Skills");
    });

    it("Italian tagline is generated when no tagline fact exists", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Marco Rossi" } }),
      ];
      const page = composeOptimisticPage(facts, "marco", "it");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("Benvenuto nella pagina di Marco Rossi");
    });
  });

  describe("role casing in bio section", () => {
    it("lowercases role in English bio", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
        makeFact({ category: "identity", key: "role", value: { role: "Economist" } }),
      ];
      const page = composeOptimisticPage(facts, "alice", "en");

      const bio = page.sections.find((s) => s.type === "bio");
      expect((bio!.content as any).text).toContain("economist");
      expect((bio!.content as any).text).not.toMatch(/is a Economist/);
    });

    it("lowercases role in Italian bio", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Marco Rossi" } }),
        makeFact({ category: "identity", key: "role", value: { role: "Economista" } }),
        makeFact({ category: "identity", key: "company", value: { company: "Google" } }),
      ];
      const page = composeOptimisticPage(facts, "marco", "it");

      const bio = page.sections.find((s) => s.type === "bio");
      expect((bio!.content as any).text).toContain("economista");
      expect((bio!.content as any).text).not.toContain("Economista");
    });

    it("keeps role capitalized in German bio", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Hans Müller" } }),
        makeFact({ category: "identity", key: "role", value: { role: "Ökonom" } }),
      ];
      const page = composeOptimisticPage(facts, "hans", "de");

      const bio = page.sections.find((s) => s.type === "bio");
      expect((bio!.content as any).text).toContain("Ökonom");
    });
  });
});
