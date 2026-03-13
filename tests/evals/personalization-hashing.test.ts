import { describe, it, expect } from "vitest";
import {
  computeHash,
  computeSectionFactsHash,
  SECTION_FACT_CATEGORIES,
} from "@/lib/services/personalization-hashing";
import type { FactRow } from "@/lib/services/kb-service";

function makeFact(overrides: Partial<FactRow> & Pick<FactRow, "category" | "key">): FactRow {
  return {
    id: overrides.id ?? "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
    sortOrder: overrides.sortOrder ?? 0,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: overrides.archivedAt ?? null,
  };
}

describe("computeHash", () => {
  it("returns consistent SHA-256 hex for same input", () => {
    const h1 = computeHash("hello");
    const h2 = computeHash("hello");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("returns different hash for different input", () => {
    expect(computeHash("a")).not.toBe(computeHash("b"));
  });
});

describe("SECTION_FACT_CATEGORIES", () => {
  it("maps bio to identity and interest", () => {
    expect(SECTION_FACT_CATEGORIES.bio).toContain("identity");
    expect(SECTION_FACT_CATEGORIES.bio).toContain("interest");
  });

  it("maps skills to skill category", () => {
    expect(SECTION_FACT_CATEGORIES.skills).toContain("skill");
  });

  it("does not include non-personalizable types like footer", () => {
    expect(SECTION_FACT_CATEGORIES).not.toHaveProperty("footer");
  });
});

describe("computeSectionFactsHash", () => {
  it("hashes only facts in relevant categories for section type", () => {
    const facts = [
      makeFact({ id: "1", category: "identity", key: "name", value: { name: "Alice" } }),
      makeFact({ id: "2", category: "skill", key: "js", value: { name: "JavaScript" } }),
    ];
    const bioHash = computeSectionFactsHash(facts, "bio");
    const skillsHash = computeSectionFactsHash(facts, "skills");
    expect(bioHash).not.toBe(skillsHash);
  });

  it("excludes visibility from hash — promote does not invalidate", () => {
    const publicFact = makeFact({ id: "1", category: "identity", key: "name", visibility: "public" });
    const proposedFact = makeFact({ id: "1", category: "identity", key: "name", visibility: "proposed" });
    const h1 = computeSectionFactsHash([publicFact], "bio");
    const h2 = computeSectionFactsHash([proposedFact], "bio");
    expect(h1).toBe(h2);
  });

  it("sorts by key for deterministic output", () => {
    const f1 = makeFact({ id: "aaa", category: "skill", key: "a" });
    const f2 = makeFact({ id: "bbb", category: "skill", key: "b" });
    const h1 = computeSectionFactsHash([f1, f2], "skills");
    const h2 = computeSectionFactsHash([f2, f1], "skills");
    expect(h1).toBe(h2);
  });

  it("excludes id from hash — cluster primary changes don't invalidate", () => {
    const f1 = makeFact({ id: "primary-old", category: "skill", key: "ts", value: { name: "TypeScript" } });
    const f2 = makeFact({ id: "primary-new", category: "skill", key: "ts", value: { name: "TypeScript" } });
    const h1 = computeSectionFactsHash([f1], "skills");
    const h2 = computeSectionFactsHash([f2], "skills");
    expect(h1).toBe(h2);
  });

  it("returns a hash for unknown section type (empty relevant)", () => {
    const facts = [makeFact({ category: "skill", key: "js" })];
    const hash = computeSectionFactsHash(facts, "footer");
    expect(hash).toHaveLength(64);
  });
});
