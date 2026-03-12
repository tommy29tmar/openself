import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import type { FactRow } from "@/lib/services/kb-service";

let prevExtended: string | undefined;
beforeAll(() => {
  prevExtended = process.env.EXTENDED_SECTIONS;
  process.env.EXTENDED_SECTIONS = "true";
});
afterAll(() => {
  if (prevExtended !== undefined) {
    process.env.EXTENDED_SECTIONS = prevExtended;
  } else {
    delete process.env.EXTENDED_SECTIONS;
  }
});

function fakeFact(overrides: Partial<FactRow>): FactRow {
  return {
    id: "f-" + Math.random().toString(36).slice(2),
    category: "identity",
    key: "test",
    value: {},
    source: "connector",
    confidence: 1,
    visibility: "public",
    sortOrder: 0,
    parentFactId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

describe("connector section mapping", () => {
  it("music category facts produce a music section", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      fakeFact({
        category: "music",
        key: "sp-artist-1",
        value: { title: "Radiohead", note: "alt rock", url: "https://example.com" },
      }),
      fakeFact({
        category: "music",
        key: "sp-track-1",
        value: { title: "Creep", artist: "Radiohead", url: "https://example.com" },
      }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const musicSection = page.sections.find((s) => s.type === "music");
    expect(musicSection).toBeDefined();
    expect((musicSection!.content as { items: unknown[] }).items).toHaveLength(2);
  });

  it("activity category facts produce an activities section", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      fakeFact({
        category: "activity",
        key: "strava-run",
        value: { name: "Run", type: "sport", description: "5 activities · 15 km · 2 hrs" },
      }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const activitiesSection = page.sections.find((s) => s.type === "activities");
    expect(activitiesSection).toBeDefined();
  });

  it("music and activity facts do NOT appear in interests section", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test" } }),
      fakeFact({ category: "interest", key: "ai", value: { name: "AI" } }),
      fakeFact({ category: "music", key: "sp-1", value: { title: "Song" } }),
      fakeFact({ category: "activity", key: "strava-run", value: { name: "Run" } }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const interestsSection = page.sections.find((s) => s.type === "interests");
    if (interestsSection) {
      const items = (interestsSection.content as { items: { name: string }[] }).items;
      const names = items.map((i) => i.name);
      expect(names).not.toContain("Song");
      expect(names).not.toContain("Run");
      expect(names).toContain("AI");
    }
  });

  it("bio does not mention music or activity items", () => {
    const facts: FactRow[] = [
      fakeFact({ category: "identity", key: "name", value: { name: "Test User" } }),
      fakeFact({ category: "music", key: "sp-1", value: { title: "Radiohead" } }),
      fakeFact({ category: "activity", key: "strava-run", value: { name: "Run" } }),
    ];
    const page = composeOptimisticPage(facts, "testuser", "en");
    const bioSection = page.sections.find((s) => s.type === "bio");
    if (bioSection) {
      const text = (bioSection.content as { text: string }).text;
      expect(text).not.toContain("Radiohead");
      expect(text).not.toContain("Run");
    }
  });
});
