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

describe("section headers L10N", () => {
  const baseFacts = [
    makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
    makeFact({ category: "identity", key: "role", value: { role: "Designer" } }),
  ];

  it("bio title is 'Chi Sono' in Italian", () => {
    const page = composeOptimisticPage(baseFacts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    expect((bio!.content as { title: string }).title).toBe("Chi Sono");
  });

  it("bio title is 'About' in English", () => {
    const page = composeOptimisticPage(baseFacts, "draft", "en");
    const bio = page.sections.find((s) => s.type === "bio");
    expect((bio!.content as { title: string }).title).toBe("About");
  });

  it("bio title is 'Über Mich' in German", () => {
    const page = composeOptimisticPage(baseFacts, "draft", "de");
    const bio = page.sections.find((s) => s.type === "bio");
    expect((bio!.content as { title: string }).title).toBe("Über Mich");
  });

  it("at-a-glance has localized interestsInto", () => {
    const facts = [
      ...baseFacts,
      makeFact({ category: "interest", key: "i1", value: { name: "Typography" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it", "curator");
    const aag = page.sections.find((s) => s.type === "at-a-glance");
    expect(aag).toBeDefined();
    const content = aag!.content as { interestsInto?: string };
    expect(content.interestsInto).toBeDefined();
    expect(content.interestsInto).not.toBe("Into");
  });
});
