import { describe, it, expect } from "vitest";
import { applyFactDisplayOverrides } from "@/lib/services/page-projection";

function makeFact(id: string, category: string, value: Record<string, unknown>) {
  return {
    id,
    category,
    key: "test",
    value,
    source: null,
    confidence: null,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

describe("applyFactDisplayOverrides", () => {
  it("applies valid override to fact value", () => {
    const facts = [makeFact("f1", "project", { title: "openself", url: "https://x.com" })];
    const overrides = new Map([["f1", { title: "OpenSelf" }]]);
    const result = applyFactDisplayOverrides(facts, overrides);
    expect((result[0].value as Record<string, unknown>).title).toBe("OpenSelf");
    expect((result[0].value as Record<string, unknown>).url).toBe("https://x.com");
  });

  it("does not mutate original facts array", () => {
    const facts = [makeFact("f1", "project", { title: "openself" })];
    const overrides = new Map([["f1", { title: "OpenSelf" }]]);
    const result = applyFactDisplayOverrides(facts, overrides);
    expect((facts[0].value as Record<string, unknown>).title).toBe("openself");
    expect((result[0].value as Record<string, unknown>).title).toBe("OpenSelf");
  });

  it("passes through facts without overrides unchanged", () => {
    const facts = [
      makeFact("f1", "project", { title: "openself" }),
      makeFact("f2", "project", { title: "other" }),
    ];
    const overrides = new Map([["f1", { title: "OpenSelf" }]]);
    const result = applyFactDisplayOverrides(facts, overrides);
    expect((result[0].value as Record<string, unknown>).title).toBe("OpenSelf");
    expect((result[1].value as Record<string, unknown>).title).toBe("other");
  });

  it("returns original array when no overrides exist", () => {
    const facts = [makeFact("f1", "project", { title: "openself" })];
    const overrides = new Map();
    const result = applyFactDisplayOverrides(facts, overrides);
    expect(result).toEqual(facts);
  });

  it("merges override fields without removing non-overridden fields", () => {
    const facts = [makeFact("f1", "experience", {
      role: "developer",
      company: "acme",
      startDate: "2024-01",
      description: "old desc",
    })];
    const overrides = new Map([["f1", { company: "Acme Corp", description: "New description" }]]);
    const result = applyFactDisplayOverrides(facts, overrides);
    const v = result[0].value as Record<string, unknown>;
    expect(v.company).toBe("Acme Corp");
    expect(v.description).toBe("New description");
    expect(v.role).toBe("developer");
    expect(v.startDate).toBe("2024-01");
  });
});
