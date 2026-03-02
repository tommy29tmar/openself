/**
 * Tests for archetype-weighted personalization priority (Circuit B).
 * Verifies that prioritizeSections reorders sections based on archetype strategy
 * without affecting page layout.
 */
import { describe, it, expect } from "vitest";
import { prioritizeSections } from "@/lib/services/section-personalizer";
import type { Section } from "@/lib/page-config/schema";

function makeSection(type: string): Section {
  return {
    id: `${type}-1`,
    type: type as any,
    variant: "default",
    content: {},
  };
}

describe("archetype-weighted personalization", () => {
  const sections: Section[] = [
    makeSection("hero"),
    makeSection("bio"),
    makeSection("experience"),
    makeSection("skills"),
    makeSection("projects"),
    makeSection("interests"),
  ];

  it("developer archetype prioritizes projects and skills sections", () => {
    const result = prioritizeSections(sections, "developer");
    const types = result.map(s => s.type);
    // Developer explorationOrder starts with projects, skills, experience
    const projectsIdx = types.indexOf("projects");
    const skillsIdx = types.indexOf("skills");
    const interestsIdx = types.indexOf("interests");
    // Projects and skills should come before interests
    expect(projectsIdx).toBeLessThan(interestsIdx);
    expect(skillsIdx).toBeLessThan(interestsIdx);
  });

  it("creator archetype prioritizes interests and projects", () => {
    const result = prioritizeSections(sections, "creator");
    const types = result.map(s => s.type);
    const interestsIdx = types.indexOf("interests");
    const projectsIdx = types.indexOf("projects");
    // Both should be in priority group (near the front)
    expect(interestsIdx).toBeLessThan(types.length - 1);
    expect(projectsIdx).toBeLessThan(types.length - 1);
  });

  it("generalist uses default section order (no reordering)", () => {
    const result = prioritizeSections(sections, "generalist");
    expect(result).toEqual(sections);
  });

  it("undefined archetype uses default section order", () => {
    const result = prioritizeSections(sections, undefined);
    expect(result).toEqual(sections);
  });

  it("unknown archetype uses default section order", () => {
    const result = prioritizeSections(sections, "unknown_type");
    expect(result).toEqual(sections);
  });

  it("priority only affects personalization order, not page layout", () => {
    const original = [...sections];
    const result = prioritizeSections(sections, "developer");
    // Original array unchanged (no mutation)
    expect(sections).toEqual(original);
    // Same sections, potentially different order
    expect(result).toHaveLength(sections.length);
    for (const s of sections) {
      expect(result).toContainEqual(s);
    }
  });

  it("sections not in explorationOrder are placed after priority sections", () => {
    const withFooter: Section[] = [
      makeSection("hero"),
      makeSection("footer"),
      makeSection("skills"),
      makeSection("projects"),
    ];
    const result = prioritizeSections(withFooter, "developer");
    const types = result.map(s => s.type);
    // hero and footer are not in explorationOrder → placed after priority
    const skillsIdx = types.indexOf("skills");
    const footerIdx = types.indexOf("footer");
    expect(skillsIdx).toBeLessThan(footerIdx);
  });
});
