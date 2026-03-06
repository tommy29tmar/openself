import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => { process.env.EXTENDED_SECTIONS = "true"; });

import { composeOptimisticPage } from "@/lib/services/page-composer";

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1", category: "activity", key: "a1", value: {},
    visibility: "public" as const, confidence: 1, source: "agent" as const,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sortOrder: 0, parentFactId: null, archivedAt: null,
    ...overrides,
  };
}

describe("activity type L10N", () => {
  const baseFacts = [
    { ...makeFact({}), category: "identity", key: "name", value: { name: "Elena" } },
  ];

  it("localizes 'volunteering' to Italian", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "a1", value: { name: "Croce Rossa", activityType: "volunteering" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const act = page.sections.find((s) => s.type === "activities");
    const items = (act!.content as { items: { name: string; activityType?: string }[] }).items;
    expect(items[0].activityType).not.toBe("volunteering");
    expect(items[0].activityType).toBe("volontariato");
  });

  it("passes through unknown activity types unchanged", () => {
    const facts = [
      ...baseFacts,
      makeFact({ key: "a2", value: { name: "Climbing", activityType: "sport" } }),
    ];
    const page = composeOptimisticPage(facts, "draft", "it");
    const act = page.sections.find((s) => s.type === "activities");
    const items = (act!.content as { items: { name: string; activityType?: string }[] }).items;
    expect(items[0].activityType).toBe("sport");
  });
});
