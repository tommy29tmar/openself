import { describe, it, expect } from "vitest";
import type { FactRow } from "@/lib/services/kb-service";
import {
  projectCanonicalConfig,
  publishableFromCanonical,
  projectPublishableConfig,
} from "@/lib/services/page-projection";

function makeFact(
  overrides: Partial<FactRow> & Pick<FactRow, "category" | "key">,
): FactRow {
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

describe("Dual-hash preview projection", () => {
  it("canonical config includes all sections, publishable filters incomplete", () => {
    const facts: FactRow[] = [
      makeFact({
        category: "identity",
        key: "full-name",
        value: { full: "Alice Smith" },
      }),
      // Skills with only a single skill — this creates a complete section
      makeFact({
        category: "skill",
        key: "skill",
        value: { name: "TypeScript" },
      }),
    ];

    const canonical = projectCanonicalConfig(facts, "alice", "en");
    const publishable = publishableFromCanonical(canonical);

    // Both should have sections (hero is always complete)
    expect(canonical.sections.length).toBeGreaterThan(0);
    expect(publishable.sections.length).toBeGreaterThan(0);

    // Publishable should have <= canonical sections
    expect(publishable.sections.length).toBeLessThanOrEqual(
      canonical.sections.length,
    );
  });

  it("publishableFromCanonical matches projectPublishableConfig output", () => {
    const facts: FactRow[] = [
      makeFact({
        category: "identity",
        key: "full-name",
        value: { full: "Alice Smith" },
      }),
      makeFact({
        category: "skill",
        key: "skill",
        value: { name: "TypeScript" },
      }),
    ];

    const canonical = projectCanonicalConfig(facts, "alice", "en");
    const fromCanonical = publishableFromCanonical(canonical);
    const direct = projectPublishableConfig(facts, "alice", "en");

    // Both paths should produce the same sections
    expect(fromCanonical.sections.length).toBe(direct.sections.length);
    expect(fromCanonical.sections.map((s) => s.id)).toEqual(
      direct.sections.map((s) => s.id),
    );
  });

  it("canonical config does not apply completeness filter", () => {
    // A hero with empty tagline is now valid (not filtered)
    const facts: FactRow[] = [
      makeFact({
        category: "identity",
        key: "full-name",
        value: { full: "Test User" },
      }),
    ];

    const canonical = projectCanonicalConfig(facts, "test", "en");
    const hero = canonical.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
  });
});
