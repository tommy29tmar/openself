import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { FactRow } from "@/lib/services/kb-service";

// Enable extended sections for these tests
const originalEnv = process.env.EXTENDED_SECTIONS;
beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });
afterAll(() => { process.env.EXTENDED_SECTIONS = originalEnv; });

function makeFact(overrides: Partial<FactRow> & { category: string; key: string; value: Record<string, unknown> }): FactRow {
  return {
    id: overrides.id ?? overrides.key,
    category: overrides.category,
    key: overrides.key,
    value: overrides.value,
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    sortOrder: overrides.sortOrder ?? 0,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: null,
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

describe("sortOrder in page composition", () => {
  it("skills section respects sortOrder within domain group", () => {
    // Use skills from same domain (Frontend) to avoid cross-domain reordering
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({ category: "skill", key: "angular", value: { name: "Angular" }, sortOrder: 2 }),
      makeFact({ category: "skill", key: "react", value: { name: "React" }, sortOrder: 0 }),
      makeFact({ category: "skill", key: "vue", value: { name: "Vue" }, sortOrder: 1 }),
    ];
    const page = composeOptimisticPage(facts, "test", "en", "curator");
    const aag = page.sections.find(s => s.type === "at-a-glance");
    const groups = (aag?.content as any)?.skillGroups ?? [];
    // All same domain → single group preserves sort order
    const frontendGroup = groups.find((g: any) => g.skills.includes("React"));
    expect(frontendGroup?.skills).toEqual(["React", "Vue", "Angular"]);
  });

  it("experience section respects sortOrder", () => {
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({ category: "experience", key: "c", value: { role: "CTO", company: "C Corp" }, sortOrder: 2 }),
      makeFact({ category: "experience", key: "a", value: { role: "Junior", company: "A Corp" }, sortOrder: 0 }),
      makeFact({ category: "experience", key: "b", value: { role: "Senior", company: "B Corp" }, sortOrder: 1 }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const exp = page.sections.find(s => s.type === "experience");
    const items = (exp?.content as any)?.items;
    expect(items).toBeDefined();
    expect(items.map((i: any) => i.title)).toEqual(["Junior", "Senior", "CTO"]);
  });

  it("falls back to createdAt when sortOrder is equal", () => {
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({
        category: "skill", key: "later", value: { name: "Later" },
        sortOrder: 0, createdAt: "2024-01-02T00:00:00Z",
      }),
      makeFact({
        category: "skill", key: "earlier", value: { name: "Earlier" },
        sortOrder: 0, createdAt: "2024-01-01T00:00:00Z",
      }),
    ];
    const page = composeOptimisticPage(facts, "test", "en", "curator");
    const aag = page.sections.find(s => s.type === "at-a-glance");
    const groups = (aag?.content as any)?.skillGroups ?? [];
    const allSkills = groups.flatMap((g: any) => g.skills);
    expect(allSkills).toEqual(["Earlier", "Later"]);
  });

  it("projects section respects sortOrder", () => {
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({ category: "project", key: "z", value: { name: "Zeta" }, sortOrder: 2 }),
      makeFact({ category: "project", key: "a", value: { name: "Alpha" }, sortOrder: 0 }),
      makeFact({ category: "project", key: "m", value: { name: "Mid" }, sortOrder: 1 }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const proj = page.sections.find(s => s.type === "projects");
    const items = (proj?.content as any)?.items;
    expect(items.map((i: any) => i.title)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("education section respects sortOrder", () => {
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({ category: "education", key: "mba", value: { institution: "Stanford", degree: "MBA" }, sortOrder: 1 }),
      makeFact({ category: "education", key: "cs", value: { institution: "MIT", degree: "CS" }, sortOrder: 0 }),
    ];
    const page = composeOptimisticPage(facts, "test", "en");
    const edu = page.sections.find(s => s.type === "education");
    const items = (edu?.content as any)?.items;
    expect(items.map((i: any) => i.institution)).toEqual(["MIT", "Stanford"]);
  });

  it("monolith layout generates skills section (not at-a-glance)", () => {
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" }, sortOrder: 0 }),
    ];
    const page = composeOptimisticPage(facts, "test", "en", "monolith");
    expect(page.sections.find(s => s.type === "at-a-glance")).toBeUndefined();
    expect(page.sections.find(s => s.type === "skills")).toBeDefined();
  });

  it("non-monolith layouts keep at-a-glance", () => {
    const facts: FactRow[] = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      makeFact({ category: "skill", key: "react", value: { name: "React" }, sortOrder: 0 }),
    ];
    const page = composeOptimisticPage(facts, "test", "en", "curator");
    expect(page.sections.find(s => s.type === "at-a-glance")).toBeDefined();
  });
});
