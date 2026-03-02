import { describe, expect, it } from "vitest";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { Section, SectionLock } from "@/lib/page-config/schema";

function makeSection(
  overrides: Partial<Section> & { id: string; type: string },
): Section {
  return { content: {}, ...overrides } as Section;
}

describe("assignSlotsFromFacts", () => {
  const vertical = getLayoutTemplate("monolith");
  const architect = getLayoutTemplate("architect");
  const curator = getLayoutTemplate("curator");

  it("assigns hero to heroSlot and footer to footerSlot", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(vertical, sections);
    expect(result.find((s) => s.id === "h1")?.slot).toBe("hero");
    expect(result.find((s) => s.id === "f1")?.slot).toBe("footer");
    expect(result.find((s) => s.id === "b1")?.slot).toBe("main");
  });

  it("assigns widgetIds to all sections", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "s1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(vertical, sections);
    for (const s of result) {
      expect(s.widgetId).toBeTruthy();
    }
  });

  it("respects position locks — locked section keeps its slot", () => {
    const lock: SectionLock = {
      position: true,
      lockedBy: "user",
      lockedAt: new Date().toISOString(),
    };
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "s1", type: "skills", slot: "curator", lock }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const locks = new Map([["s1", lock]]);
    const { sections: result } = assignSlotsFromFacts(curator, sections, locks);
    expect(result.find((s) => s.id === "s1")?.slot).toBe("curator");
  });

  it("distributes sections across architect slots", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "s1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "p1", type: "projects", content: { items: [{ title: "X" }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(architect, sections);
    // All sections should have a slot
    for (const s of result) {
      expect(s.slot).toBeTruthy();
    }
    // Hero and footer in their designated slots
    expect(result.find((s) => s.id === "h1")?.slot).toBe("hero");
    expect(result.find((s) => s.id === "f1")?.slot).toBe("footer");
  });

  it("does not truncate content during auto-repair", () => {
    const manySkills = Array.from({ length: 50 }, (_, i) => `skill-${i}`);
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({
        id: "s1",
        type: "skills",
        content: { groups: [{ label: "Skills", skills: manySkills }] },
      }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(vertical, sections);
    const skillSection = result.find((s) => s.id === "s1");
    expect(skillSection).toBeDefined();
    // Content must be preserved — never truncated
    const groups = (skillSection!.content as Record<string, unknown>).groups as Array<{ skills: string[] }>;
    expect(groups[0].skills).toHaveLength(50);
  });

  it("preserves existing widgetId when present", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero", widgetId: "hero-compact" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(vertical, sections);
    expect(result.find((s) => s.id === "h1")?.widgetId).toBe("hero-compact");
  });

  it("publish gate mode (repair: false) skips auto-repair", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { issues } = assignSlotsFromFacts(vertical, sections, undefined, {
      repair: false,
    });
    // Should still return issues but not attempt repair
    expect(Array.isArray(issues)).toBe(true);
  });

  it("emits unplaceable_section when section type has no compatible slot", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "c1", type: "custom" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
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
    const { sections: result, issues } = assignSlotsFromFacts(tinyTemplate, sections);
    const custom = result.find(s => s.id === "c1");
    expect(custom).toBeDefined();
    expect(custom!.slot).toBeUndefined();
    const unplaceable = issues.find(i => i.issue === "unplaceable_section");
    expect(unplaceable).toBeDefined();
    expect(unplaceable!.severity).toBe("warning");
    expect(unplaceable!.message).toContain("custom");
  });

  it("does not emit unplaceable_section for sections with compatible slots", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "s1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { issues } = assignSlotsFromFacts(architect, sections);
    const unplaceable = issues.filter(i => i.issue === "unplaceable_section");
    expect(unplaceable).toHaveLength(0);
  });

  it("post-assign invariant: all core sections have slot + widgetId", () => {
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "s1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "i1", type: "interests", content: { items: [{ name: "x" }] } }),
      makeSection({ id: "so1", type: "social", content: { links: [{ platform: "x", url: "y" }] } }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(vertical, sections, undefined, { repair: false });
    for (const s of result) {
      expect(s.slot).toBeTruthy();
      // All should have widgetId assigned by the assigner
      expect(s.widgetId).toBeTruthy();
    }
  });
});
