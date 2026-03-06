import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Maria" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sortOrder: 0, parentFactId: null, archivedAt: null,
    ...overrides,
  };
}

describe("hero tagline from identity role", () => {
  it("uses identity/role as hero tagline", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { full: "Maria Bianchi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Architetto freelance" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const hero = page.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
    expect((hero!.content as { tagline: string }).tagline).toBe("Architetto freelance");
  });

  it("updates hero tagline when identity/role changes", () => {
    const factsV1 = [
      makeFact({ category: "identity", key: "name", value: { full: "Maria Bianchi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Software Engineer" } }),
    ];
    const pageV1 = composeOptimisticPage(factsV1, "draft", "en");
    const heroV1 = pageV1.sections.find((s) => s.type === "hero");
    expect((heroV1!.content as { tagline: string }).tagline).toBe("Software Engineer");

    // "Role change" — compose again with updated role
    const factsV2 = [
      makeFact({ category: "identity", key: "name", value: { full: "Maria Bianchi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Engineering Manager" } }),
    ];
    const pageV2 = composeOptimisticPage(factsV2, "draft", "en");
    const heroV2 = pageV2.sections.find((s) => s.type === "hero");
    expect((heroV2!.content as { tagline: string }).tagline).toBe("Engineering Manager");
  });

  it("falls back to experience role when no identity/role exists", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { full: "Maria Bianchi" } }),
      makeFact({ category: "experience", key: "acme-corp", value: { role: "Lead Developer", company: "Acme Corp", status: "current" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    expect((hero!.content as { tagline: string }).tagline).toBeTruthy();
  });

  it("identity/role takes priority over experience role for tagline", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { full: "Maria Bianchi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Freelance Architect" } }),
      makeFact({ category: "experience", key: "old-corp", value: { role: "Junior Dev", company: "Old Corp", status: "past" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    expect((hero!.content as { tagline: string }).tagline).toBe("Freelance Architect");
  });

  it("uses rv.text as tagline fallback (Bug #9)", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { full: "Maria Bianchi" } }),
      makeFact({ category: "identity", key: "role", value: { text: "Creative Director" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const hero = page.sections.find((s) => s.type === "hero");
    expect((hero!.content as { tagline: string }).tagline).toBe("Creative Director");
  });

  it("rejects name > 5 words in hero (Bug #1 composer defense)", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { full: "Marco Rossi è un designer di talento incredibile" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const hero = page.sections.find((s) => s.type === "hero");
    // Name should NOT contain the long sentence
    const name = (hero!.content as { name: string }).name;
    expect(name.split(/\s+/).length).toBeLessThanOrEqual(5);
  });
});
