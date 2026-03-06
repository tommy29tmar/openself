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

describe("role casing in bio", () => {
  it("lowercases entire role in Italian bio", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Graphic Designer" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("graphic designer");
    expect(text).not.toContain("graphic Designer");
  });

  it("preserves acronyms like UX in role", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "UX Designer" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("UX designer");
    expect(text).not.toContain("ux designer");
  });

  it("preserves capitalization in German", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ category: "identity", key: "role", value: { role: "Grafikdesignerin" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "de");
    const bio = page.sections.find((s) => s.type === "bio");
    const text = (bio!.content as { text: string }).text;
    expect(text).toContain("Grafikdesignerin");
  });
});
