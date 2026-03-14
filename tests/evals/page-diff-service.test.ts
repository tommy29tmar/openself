import { describe, it, expect } from "vitest";
import { computePageDiff, type PageChange } from "@/lib/services/page-diff-service";
import type { PageConfig } from "@/lib/page-config/schema";

function makeConfig(sections: Array<{ type: string; content: Record<string, unknown> }>): PageConfig {
  return {
    version: 1,
    username: "test",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: { primaryColor: "#000", layout: "centered" },
    sections: sections.map((s, i) => ({
      id: `sec-${i}`,
      type: s.type as PageConfig["sections"][number]["type"],
      content: s.content,
    })),
  };
}

describe("computePageDiff", () => {
  it("returns empty when draft is null", () => {
    const published = makeConfig([{ type: "hero", content: { name: "Alice" } }]);
    expect(computePageDiff(null, published)).toEqual([]);
  });

  it("returns empty when published is null", () => {
    const draft = makeConfig([{ type: "hero", content: { name: "Alice" } }]);
    expect(computePageDiff(draft, null)).toEqual([]);
  });

  it("returns empty when both are null", () => {
    expect(computePageDiff(null, null)).toEqual([]);
  });

  it("returns empty when configs are identical", () => {
    const cfg = makeConfig([
      { type: "hero", content: { name: "Alice" } },
      { type: "bio", content: { text: "Hello" } },
    ]);
    expect(computePageDiff(cfg, cfg)).toEqual([]);
  });

  it("detects added sections", () => {
    const published = makeConfig([{ type: "hero", content: { name: "Alice" } }]);
    const draft = makeConfig([
      { type: "hero", content: { name: "Alice" } },
      { type: "bio", content: { text: "Hello" } },
    ]);
    const diff = computePageDiff(draft, published);
    expect(diff).toEqual([{ sectionType: "bio", changeType: "added" }]);
  });

  it("detects removed sections", () => {
    const published = makeConfig([
      { type: "hero", content: { name: "Alice" } },
      { type: "bio", content: { text: "Hello" } },
    ]);
    const draft = makeConfig([{ type: "hero", content: { name: "Alice" } }]);
    const diff = computePageDiff(draft, published);
    expect(diff).toEqual([{ sectionType: "bio", changeType: "removed" }]);
  });

  it("detects modified sections", () => {
    const published = makeConfig([{ type: "hero", content: { name: "Alice" } }]);
    const draft = makeConfig([{ type: "hero", content: { name: "Bob" } }]);
    const diff = computePageDiff(draft, published);
    expect(diff).toEqual([{ sectionType: "hero", changeType: "modified" }]);
  });

  it("ignores key order differences in content", () => {
    const published = makeConfig([{ type: "hero", content: { name: "Alice", title: "Dev" } }]);
    const draft = makeConfig([{ type: "hero", content: { title: "Dev", name: "Alice" } }]);
    expect(computePageDiff(draft, published)).toEqual([]);
  });

  it("detects multiple change types at once", () => {
    const published = makeConfig([
      { type: "hero", content: { name: "Alice" } },
      { type: "bio", content: { text: "Old" } },
      { type: "skills", content: { items: ["JS"] } },
    ]);
    const draft = makeConfig([
      { type: "hero", content: { name: "Bob" } },
      { type: "bio", content: { text: "Old" } },
      { type: "projects", content: { items: [] } },
    ]);
    const diff = computePageDiff(draft, published);
    const byType = new Map<string, PageChange>(diff.map((c) => [c.sectionType, c]));
    expect(byType.get("hero")?.changeType).toBe("modified");
    expect(byType.has("bio")).toBe(false); // unchanged
    expect(byType.get("projects")?.changeType).toBe("added");
    expect(byType.get("skills")?.changeType).toBe("removed");
    expect(diff).toHaveLength(3);
  });
});
