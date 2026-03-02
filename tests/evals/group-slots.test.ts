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
    // b2 should overflow to another slot
    const allNonHeroFooter = Object.entries(result)
      .filter(([key]) => key !== "hero" && key !== "footer")
      .flatMap(([, sections]) => sections);
    expect(allNonHeroFooter.map((s) => s.id)).toContain("b2");
  });
});
