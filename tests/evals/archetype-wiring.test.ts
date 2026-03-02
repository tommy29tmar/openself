/**
 * Tests for archetype wiring into bootstrap payload and context injection.
 */
import { describe, it, expect } from "vitest";
import type { BootstrapPayload } from "@/lib/agent/journey";
import { ARCHETYPE_STRATEGIES, type Archetype } from "@/lib/agent/archetypes";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";

describe("archetype in BootstrapPayload", () => {
  it("BootstrapPayload type includes archetype field", () => {
    // Type-level test: verify archetype is a valid field
    const payload: Partial<BootstrapPayload> = {
      archetype: "developer",
    };
    expect(payload.archetype).toBe("developer");
  });

  it("all ARCHETYPE_STRATEGIES have explorationOrder with valid section categories", () => {
    for (const [archetype, strategy] of Object.entries(ARCHETYPE_STRATEGIES)) {
      expect(strategy.explorationOrder.length).toBeGreaterThan(0);
      expect(strategy.sectionPriority.length).toBeGreaterThan(0);
      expect(strategy.toneHint).toBeTruthy();
      expect(strategy.communicationStyle).toBeTruthy();
    }
  });
});

describe("archetype context injection", () => {
  it("archetype-weighted exploration uses SECTION_FACT_CATEGORIES keys", () => {
    // Every explorationOrder item should exist as a section type in SECTION_FACT_CATEGORIES
    const validCategories = new Set(Object.keys(SECTION_FACT_CATEGORIES));
    for (const [archetype, strategy] of Object.entries(ARCHETYPE_STRATEGIES)) {
      for (const cat of strategy.explorationOrder) {
        expect(
          validCategories.has(cat),
          `${archetype} explorationOrder has "${cat}" which is not in SECTION_FACT_CATEGORIES`,
        ).toBe(true);
      }
    }
  });

  it("exploration priorities format is correct", () => {
    // Simulate what the context builder will produce
    const archetype: Archetype = "developer";
    const strategy = ARCHETYPE_STRATEGIES[archetype];
    const mockRichness = new Map<string, string>([
      ["projects", "empty"],
      ["skills", "thin"],
      ["experience", "adequate"],
    ]);

    const weighted = strategy.explorationOrder
      .map(category => ({
        category,
        richness: mockRichness.get(category) ?? "empty",
      }))
      .filter(x => x.richness !== "rich");

    const lines = weighted.map(
      (x, i) => `${i + 1}. ${x.category}: ${x.richness}`,
    );

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^\d+\. \w+: (empty|thin|adequate)$/);
  });
});
