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
    ...overrides,
  };
}

describe("achievements date formatting in composer", () => {
  it("formats ISO date in achievement content for Italian", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena" } }),
      makeFact({ category: "achievement", key: "a1", value: { title: "Premio Design", date: "2023-03-15" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const ach = page.sections.find((s) => s.type === "achievements");
    expect(ach).toBeDefined();
    const items = (ach!.content as { items: { title: string; date?: string }[] }).items;
    expect(items[0].date).toBe("marzo 2023");
    expect(items[0].date).not.toBe("2023-03-15");
  });

  it("shows year only for YYYY-01-01 dates", () => {
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Elena" } }),
      makeFact({ category: "achievement", key: "a1", value: { title: "Award", date: "2023-01-01" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const ach = page.sections.find((s) => s.type === "achievements");
    const items = (ach!.content as { items: { date?: string }[] }).items;
    expect(items[0].date).toBe("2023");
  });
});
