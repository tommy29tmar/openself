import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "identity", key: "name",
    value: { name: "Elena" }, visibility: "public" as const,
    confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sortOrder: 0, parentFactId: null, archivedAt: null,
    ...overrides,
  };
}

describe("hero proficiency L10N", () => {
  it("localizes proficiency in hero languages for Italian", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "language", key: "english", value: { language: "English", proficiency: "fluent" } }),
      makeFact({ category: "language", key: "italian", value: { language: "Italiano", proficiency: "native" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const hero = page.sections.find((s) => s.type === "hero");
    const languages = (hero!.content as { languages: { language: string; proficiency?: string }[] }).languages;
    // Language names are localized to Italian: "English" → "Inglese", "Italiano" stays
    const eng = languages.find((l) => l.language === "Inglese");
    expect(eng?.proficiency).toBe("fluente");
    const ita = languages.find((l) => l.language === "Italiano");
    expect(ita?.proficiency).toBe("madrelingua");
  });

  it("passes through unknown proficiency values unchanged", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "language", key: "eng", value: { language: "English", proficiency: "conversational" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const hero = page.sections.find((s) => s.type === "hero");
    const languages = (hero!.content as { languages: { language: string; proficiency?: string }[] }).languages;
    // "English" → "Inglese" in Italian, proficiency "conversational" is unknown so passed through
    const eng = languages.find((l) => l.language === "Inglese");
    expect(eng?.proficiency).toBe("conversational");
  });
});
