import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "music", key: "m1", value: {},
    visibility: "public" as const, confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sortOrder: 0, parentFactId: null, archivedAt: null,
    ...overrides,
  };
}

describe("music section dedup", () => {
  const baseFacts = [
    { ...makeFact({}), category: "identity", key: "name", value: { name: "Elena" } },
  ];

  it("removes artist when same as title", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "m1", value: { title: "Norah Jones", artist: "Norah Jones" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const music = page.sections.find((s) => s.type === "music");
    const items = (music!.content as { items: { title: string; artist?: string }[] }).items;
    expect(items[0].title).toBe("Norah Jones");
    expect(items[0].artist).toBeUndefined();
  });

  it("keeps artist when different from title", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "m2", value: { title: "Kind of Blue", artist: "Miles Davis" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "en");
    const music = page.sections.find((s) => s.type === "music");
    const items = (music!.content as { items: { title: string; artist?: string }[] }).items;
    expect(items[0].artist).toBe("Miles Davis");
  });
});
