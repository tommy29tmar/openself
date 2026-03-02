import { describe, expect, it } from "vitest";
import { groupSectionsBySlot } from "@/lib/layout/group-slots";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { Section } from "@/lib/page-config/schema";

function makeSection(overrides: Partial<Section> & { id: string; type: string }): Section {
  return {
    content: {},
    ...overrides,
  } as Section;
}

describe("groupSectionsBySlot", () => {
  const vertical = getLayoutTemplate("monolith");
  const architect = getLayoutTemplate("architect");
  const curator = getLayoutTemplate("curator");

  it("routes hero to heroSlot regardless of slot field", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero", slot: "main" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, vertical);
    expect(result["hero"].map((s) => s.id)).toContain("h1");
    expect(result["main"].map((s) => s.id)).not.toContain("h1");
  });

  it("routes footer to footerSlot regardless of slot field", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "f1", type: "footer", slot: "main" }),
    ];
    const result = groupSectionsBySlot(sections, vertical);
    expect(result["footer"].map((s) => s.id)).toContain("f1");
    expect(result["main"].map((s) => s.id)).not.toContain("f1");
  });

  it("respects explicit slot assignment for non-hero/footer sections", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "s1", type: "skills", slot: "sidebar" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, curator);
    expect(result["sidebar"].map((s) => s.id)).toContain("s1");
  });

  it("overflows sections without slot to main", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "s1", type: "skills" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, vertical);
    expect(result["main"].map((s) => s.id)).toContain("b1");
    expect(result["main"].map((s) => s.id)).toContain("s1");
  });

  it("preserves section order within each slot", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "s1", type: "skills" }),
      makeSection({ id: "p1", type: "projects" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, vertical);
    const mainIds = result["main"].map((s) => s.id);
    expect(mainIds.indexOf("b1")).toBeLessThan(mainIds.indexOf("s1"));
    expect(mainIds.indexOf("s1")).toBeLessThan(mainIds.indexOf("p1"));
  });

  it("initializes all slots even when empty", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, architect);
    // All architect slots should exist as keys
    for (const slot of architect.slots) {
      expect(result[slot.id]).toBeDefined();
      expect(Array.isArray(result[slot.id])).toBe(true);
    }
  });

  it("distributes architect sections to feature slots", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio", slot: "feature-left" }),
      makeSection({ id: "s1", type: "skills", slot: "feature-right" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, architect);
    expect(result["feature-left"].map((s) => s.id)).toContain("b1");
    expect(result["feature-right"].map((s) => s.id)).toContain("s1");
  });

  it("handles invalid slot gracefully (falls through to overflow)", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio", slot: "nonexistent" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, vertical);
    // bio should end up in main (overflow)
    expect(result["main"].map((s) => s.id)).toContain("b1");
  });

  it("respects slot capacity limits", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio", slot: "feature-left" }),
      makeSection({ id: "b2", type: "bio", slot: "feature-left" }), // overflow: feature-left maxSections=1
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, architect);
    expect(result["feature-left"]).toHaveLength(1);
    expect(result["feature-left"][0].id).toBe("b1");
    // b2 overflows but no architect slot with capacity > 1 accepts bio — dropped
    const allSections = Object.values(result).flat();
    expect(allSections.map((s) => s.id)).not.toContain("b2");
  });

  it("rejects explicit slot assignment when slot does not accept section type", () => {
    // card-1 only accepts skills — bio with slot:"card-1" should NOT land there
    const tinyTemplate = {
      id: "architect" as const,
      name: "Test",
      description: "Test",
      heroSlot: "hero",
      footerSlot: "footer",
      slots: [
        { id: "hero", size: "wide" as const, required: true, maxSections: 1, accepts: ["hero" as const], order: 0, mobileOrder: 0 },
        { id: "card-1", size: "third" as const, required: false, maxSections: 1, accepts: ["skills" as const], order: 1, mobileOrder: 1 },
        { id: "footer", size: "wide" as const, required: true, maxSections: 1, accepts: ["footer" as const], order: 99, mobileOrder: 99 },
      ],
    };
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio", slot: "card-1" }), // bio not in card-1 accepts
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, tinyTemplate);
    // bio should NOT be in card-1 (incompatible type)
    expect(result["card-1"].map(s => s.id)).not.toContain("b1");
    // bio has no compatible slot in this template — should not appear anywhere
    const allSections = Object.values(result).flat();
    expect(allSections.map(s => s.id)).not.toContain("b1");
  });

  it("falls through to overflow when explicit slot rejects section type", () => {
    // Use curator: sidebar has maxSections=6 and accepts bio.
    // Overflow path requires capacity > 1 + accepts, which curator's sidebar satisfies.
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio", slot: "footer" }), // footer doesn't accept bio
      makeSection({ id: "f1", type: "footer" }),
    ];
    const result = groupSectionsBySlot(sections, curator);
    // bio should NOT be in footer
    expect(result["footer"].map(s => s.id)).not.toContain("b1");
    // bio should overflow to main or sidebar (both accept bio with capacity > 1)
    const allNonHeroFooter = Object.entries(result)
      .filter(([key]) => key !== "hero" && key !== "footer")
      .flatMap(([, sections]) => sections);
    expect(allNonHeroFooter.map(s => s.id)).toContain("b1");
  });
});
