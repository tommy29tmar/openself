import { describe, expect, it } from "vitest";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { Section } from "@/lib/page-config/schema";

function makeSection(
  overrides: Partial<Section> & { id: string; type: string },
): Section {
  return { content: {}, ...overrides } as Section;
}

describe("layout capacity after maxSections increase", () => {
  it("vertical main slot accepts 12+ sections without overflow", () => {
    const template = getLayoutTemplate("vertical");
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "sk1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "p1", type: "projects" }),
      makeSection({ id: "i1", type: "interests" }),
      makeSection({ id: "a1", type: "achievements" }),
      makeSection({ id: "st1", type: "stats" }),
      makeSection({ id: "r1", type: "reading" }),
      makeSection({ id: "m1", type: "music" }),
      makeSection({ id: "c1", type: "contact" }),
      makeSection({ id: "e1", type: "experience" }),
      makeSection({ id: "ed1", type: "education" }),
      makeSection({ id: "l1", type: "languages" }),
      makeSection({ id: "ac1", type: "activities" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result, issues } = assignSlotsFromFacts(template, sections);

    // All 15 sections should have slots (hero, 13 content, footer)
    const unslotted = result.filter((s) => !s.slot);
    expect(unslotted).toHaveLength(0);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("sidebar-left main slot accepts 10 sections after capacity increase", () => {
    const template = getLayoutTemplate("sidebar-left");
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "p1", type: "projects" }),
      makeSection({ id: "a1", type: "achievements" }),
      makeSection({ id: "r1", type: "reading" }),
      makeSection({ id: "m1", type: "music" }),
      makeSection({ id: "cu1", type: "custom" }),
      makeSection({ id: "e1", type: "experience" }),
      makeSection({ id: "ed1", type: "education" }),
      makeSection({ id: "ac1", type: "activities" }),
      makeSection({ id: "sk1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "i1", type: "interests" }),
      makeSection({ id: "so1", type: "social" }),
      makeSection({ id: "st1", type: "stats" }),
      makeSection({ id: "c1", type: "contact" }),
      makeSection({ id: "l1", type: "languages" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(template, sections);

    // Check main and sidebar slots are used
    const mainSections = result.filter((s) => s.slot === "main");
    const sidebarSections = result.filter((s) => s.slot === "sidebar");
    expect(mainSections.length).toBeGreaterThan(0);
    expect(sidebarSections.length).toBeGreaterThan(0);
    expect(mainSections.length).toBeLessThanOrEqual(10);
    expect(sidebarSections.length).toBeLessThanOrEqual(6);
  });

  it("bento with overflow: unfit sections get no slot but template is preserved", () => {
    const template = getLayoutTemplate("bento-standard");

    // Create more sections than bento can hold
    const sections = [
      makeSection({ id: "h1", type: "hero" }),
      makeSection({ id: "b1", type: "bio" }),
      makeSection({ id: "sk1", type: "skills", content: { groups: [{ label: "A", skills: ["x"] }] } }),
      makeSection({ id: "p1", type: "projects" }),
      makeSection({ id: "p2", type: "projects" }),
      makeSection({ id: "p3", type: "projects" }),
      makeSection({ id: "i1", type: "interests" }),
      makeSection({ id: "a1", type: "achievements" }),
      makeSection({ id: "st1", type: "stats" }),
      makeSection({ id: "so1", type: "social" }),
      makeSection({ id: "c1", type: "contact" }),
      makeSection({ id: "l1", type: "languages" }),
      makeSection({ id: "ac1", type: "activities" }),
      makeSection({ id: "r1", type: "reading" }),
      makeSection({ id: "m1", type: "music" }),
      makeSection({ id: "f1", type: "footer" }),
    ];
    const { sections: result } = assignSlotsFromFacts(template, sections);

    // Hero and footer should always be assigned
    expect(result.find((s) => s.id === "h1")?.slot).toBe("hero");
    expect(result.find((s) => s.id === "f1")?.slot).toBe("footer");

    // Some content sections may be unslotted (bento has limited capacity), that's OK
    const slotted = result.filter((s) => s.slot);
    expect(slotted.length).toBeGreaterThanOrEqual(2); // at minimum hero + footer
  });
});
