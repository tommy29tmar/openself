import { describe, it, expect } from "vitest";
import type { FactRow } from "@/lib/services/kb-service";
import { classifySectionRichness, type RichnessLevel } from "@/lib/services/section-richness";

function makeFact(overrides: Partial<FactRow> & Pick<FactRow, "category" | "key">): FactRow {
  return {
    id: overrides.id ?? "f1",
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: "chat",
    confidence: 1.0,
    visibility: "public",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

describe("classifySectionRichness", () => {
  it("returns 'empty' when no relevant facts", () => {
    expect(classifySectionRichness([], "skills")).toBe("empty");
  });

  it("returns 'thin' when 1-2 relevant facts", () => {
    const facts = [makeFact({ category: "skill", key: "js" })];
    expect(classifySectionRichness(facts, "skills")).toBe("thin");
  });

  it("returns 'rich' when 3+ relevant facts", () => {
    const facts = [
      makeFact({ category: "skill", key: "js" }),
      makeFact({ category: "skill", key: "ts" }),
      makeFact({ category: "skill", key: "py" }),
    ];
    expect(classifySectionRichness(facts, "skills")).toBe("rich");
  });

  it("ignores facts from unrelated categories", () => {
    const facts = [
      makeFact({ category: "identity", key: "name" }),
      makeFact({ category: "identity", key: "location" }),
    ];
    expect(classifySectionRichness(facts, "skills")).toBe("empty");
  });

  it("returns 'empty' for unknown section type", () => {
    const facts = [makeFact({ category: "skill", key: "js" })];
    expect(classifySectionRichness(facts, "unknown_type")).toBe("empty");
  });

  it("returns 'thin' for exactly 2 relevant facts", () => {
    const facts = [
      makeFact({ category: "skill", key: "js" }),
      makeFact({ category: "skill", key: "ts" }),
    ];
    expect(classifySectionRichness(facts, "skills")).toBe("thin");
  });

  it("handles multi-category sections (bio = identity + interest)", () => {
    const facts = [
      makeFact({ category: "identity", key: "name" }),
      makeFact({ category: "interest", key: "coding" }),
      makeFact({ category: "identity", key: "location" }),
    ];
    expect(classifySectionRichness(facts, "bio")).toBe("rich");
  });

  it("handles activities section (activity + hobby categories)", () => {
    const facts = [
      makeFact({ category: "activity", key: "tennis" }),
      makeFact({ category: "hobby", key: "reading" }),
    ];
    expect(classifySectionRichness(facts, "activities")).toBe("thin");
  });
});
