import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

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
    sortOrder: overrides.sortOrder ?? 0,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: overrides.archivedAt ?? null,
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

    it("generates empty tagline when only name provided (no repetition)", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("");
    });

    it("uses role as tagline when available", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
        makeFact({ category: "identity", key: "role", value: { role: "Software Engineer" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("Software Engineer");
    });

    it("uses interests as tagline when no role", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice Smith" } }),
        makeFact({ category: "interest", key: "interest", value: { name: "AI" } }),
        makeFact({ category: "interest", key: "interest", value: { name: "Design" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("AI, Design");
    });

    it("uses displayable username when no name fact is provided", () => {
      const page = composeOptimisticPage([], "alice");
      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero).toBeDefined();
      expect(hero!.content.name).toBe("alice");
    });

    it("uses neutral fallback for reserved username 'draft'", () => {
      const page = composeOptimisticPage([], "draft");
      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero).toBeDefined();
      // Should NOT be "draft" or "Anonymous"
      expect(hero!.content.name).not.toBe("draft");
      expect(hero!.content.name).not.toBe("Anonymous");
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

    it("Italian: empty tagline when only name (no greeting repetition)", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Marco Rossi" } }),
      ];
      const page = composeOptimisticPage(facts, "marco", "it");

      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero!.content.tagline).toBe("");
    });
  });

  describe("extended sections (Phase 1b, feature flag ON)", () => {
    const envBackup = process.env.EXTENDED_SECTIONS;

    beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });
    afterAll(() => {
      if (envBackup !== undefined) { process.env.EXTENDED_SECTIONS = envBackup; }
      else { delete process.env.EXTENDED_SECTIONS; }
    });

    it("maps experience facts to experience section (not timeline)", () => {
      const facts: FactRow[] = [
        makeFact({ category: "experience", key: "acme", value: { role: "Engineer", company: "Acme" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "experience")).toBeDefined();
      expect(page.sections.find((s) => s.type === "timeline")).toBeUndefined();
    });

    it("maps education facts to education section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "education", key: "mit", value: { institution: "MIT", degree: "MSc" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      const edu = page.sections.find((s) => s.type === "education");
      expect(edu).toBeDefined();
      const items = edu!.content.items as Array<{ institution: string }>;
      expect(items[0].institution).toBe("MIT");
    });

    it("maps achievement facts to achievements section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "achievement", key: "award", value: { title: "Best Paper", issuer: "IEEE" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "achievements")).toBeDefined();
    });

    it("maps stat facts to at-a-glance section (fused)", () => {
      const facts: FactRow[] = [
        makeFact({ category: "stat", key: "experience", value: { label: "Years", value: "10+" } }),
      ];
      const page = composeOptimisticPage(facts, "alice", undefined, "curator");
      // Stats are fused into at-a-glance when EXTENDED_SECTIONS=true (non-monolith layouts)
      const aag = page.sections.find((s) => s.type === "at-a-glance");
      expect(aag).toBeDefined();
      const content = aag!.content as Record<string, unknown>;
      expect(content.stats).toBeDefined();
    });

    it("maps reading facts to reading section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "reading", key: "clean-code", value: { title: "Clean Code", author: "Robert Martin" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "reading")).toBeDefined();
    });

    it("maps music facts to music section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "music", key: "bohemian", value: { title: "Bohemian Rhapsody", artist: "Queen" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "music")).toBeDefined();
    });

    it("maps language facts into hero content (absorbed into ContactBar)", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
        makeFact({ category: "language", key: "spanish", value: { language: "Spanish", proficiency: "fluent" } }),
      ];
      // In non-monolith layouts, languages are absorbed into hero without a standalone section
      const page = composeOptimisticPage(facts, "alice", undefined, "curator");
      expect(page.sections.find((s) => s.type === "languages")).toBeUndefined();
      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero).toBeDefined();
      const languages = (hero!.content as Record<string, unknown>).languages as Array<{ language: string; proficiency?: string }>;
      expect(languages).toHaveLength(1);
      expect(languages[0].language).toBe("Spanish");
      expect(languages[0].proficiency).toBe("fluent");
    });

    it("maps activity facts to activities section", () => {
      const facts: FactRow[] = [
        makeFact({ category: "activity", key: "tennis", value: { name: "Tennis", activityType: "sport", frequency: "weekly" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "activities")).toBeDefined();
    });

    it("filters contact facts by visibility and absorbs email into hero (only public/proposed)", () => {
      const facts: FactRow[] = [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
        makeFact({ category: "contact", key: "email", value: { type: "email", email: "a@b.com" }, visibility: "public" }),
        makeFact({ category: "contact", key: "phone", value: { type: "phone", value: "123" }, visibility: "private" }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      // Contact is absorbed into hero, no standalone section
      expect(page.sections.find((s) => s.type === "contact")).toBeUndefined();
      const hero = page.sections.find((s) => s.type === "hero");
      expect(hero).toBeDefined();
      const content = hero!.content as Record<string, unknown>;
      // Only the public email should appear (private is filtered by global privacy gate)
      expect(content.contactEmail).toBe("a@b.com");
    });

    it("returns null contact section when all facts are private", () => {
      const facts: FactRow[] = [
        makeFact({ category: "contact", key: "email", value: { type: "email", value: "a@b.com" }, visibility: "private" }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "contact")).toBeUndefined();
    });

    it("section IDs are stable and deterministic", () => {
      const facts: FactRow[] = [
        makeFact({ category: "experience", key: "acme", value: { role: "Engineer" } }),
        makeFact({ category: "education", key: "mit", value: { institution: "MIT" } }),
        makeFact({ category: "activity", key: "tennis", value: { name: "Tennis" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "experience")!.id).toBe("experience-1");
      expect(page.sections.find((s) => s.type === "education")!.id).toBe("education-1");
      expect(page.sections.find((s) => s.type === "activities")!.id).toBe("activities-1");
    });
  });

  describe("feature flag OFF → produces timeline (not experience)", () => {
    const envBackup = process.env.EXTENDED_SECTIONS;

    beforeAll(() => { delete process.env.EXTENDED_SECTIONS; });
    afterAll(() => {
      if (envBackup !== undefined) { process.env.EXTENDED_SECTIONS = envBackup; }
      else { delete process.env.EXTENDED_SECTIONS; }
    });

    it("produces timeline section from experience facts when flag is off", () => {
      const facts: FactRow[] = [
        makeFact({ category: "experience", key: "acme", value: { role: "Engineer", company: "Acme" } }),
      ];
      const page = composeOptimisticPage(facts, "alice");
      expect(page.sections.find((s) => s.type === "timeline")).toBeDefined();
      expect(page.sections.find((s) => s.type === "experience")).toBeUndefined();
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
