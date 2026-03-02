/**
 * Regression tests for draftSlots carry-over in assignSlotsFromFacts.
 *
 * Verifies that existing slot assignments are preserved when switching
 * layouts — the fix for the Architect 400 error (UAT Round 3, Bug #5).
 */
import { describe, it, expect } from "vitest";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { getLayoutTemplate } from "@/lib/layout/registry";
import type { Section } from "@/lib/page-config/schema";

describe("draftSlots carry-over prevents Architect 400", () => {
  const heroSection: Section = {
    id: "hero-1",
    type: "hero",
    variant: "large",
    content: { name: "Test User" },
  };

  // feature-right accepts: skills, interests, stats, achievements, at-a-glance
  const skillsSection: Section = {
    id: "skills-1",
    type: "skills",
    variant: "grid",
    slot: "feature-right",
    content: { groups: [] },
  };

  // feature-left accepts: bio, projects, timeline, experience, education
  const projectsSection: Section = {
    id: "projects-1",
    type: "projects",
    variant: "grid",
    slot: "feature-left",
    content: { items: [] },
  };

  it("without draftSlots, sections are still assigned via Phase 3", () => {
    const template = getLayoutTemplate("architect");
    const sections = [heroSection, skillsSection, projectsSection];

    // No draftSlots — sections go through Phase 3 only
    const { sections: assigned, issues } = assignSlotsFromFacts(
      template, sections, undefined,
    );

    // Should still assign (Phase 3 fallback)
    expect(assigned.length).toBeGreaterThan(0);
    // No content-related errors (ignore footer)
    const errors = issues.filter(i => i.severity === "error" && i.slotId !== "footer");
    expect(errors).toHaveLength(0);
  });

  it("with draftSlots, sections are assigned to feature slots without errors", () => {
    const template = getLayoutTemplate("architect");
    const sections = [heroSection, skillsSection, projectsSection];

    // Build draftSlots from existing section slots
    const draftSlots = new Map<string, string>();
    for (const s of sections) {
      if (s.slot) draftSlots.set(s.id, s.slot);
    }

    const { sections: assigned, issues } = assignSlotsFromFacts(
      template, sections, undefined, undefined,
      draftSlots.size > 0 ? draftSlots : undefined,
    );

    // Skills should keep feature-right, projects should keep feature-left
    const skills = assigned.find(s => s.id === "skills-1");
    const projects = assigned.find(s => s.id === "projects-1");
    expect(skills?.slot).toBe("feature-right");
    expect(projects?.slot).toBe("feature-left");

    // No content-related errors (ignore footer)
    const errors = issues.filter(i => i.severity === "error" && i.slotId !== "footer");
    expect(errors).toHaveLength(0);
  });

  it("switching from curator to architect with draftSlots carries slots", () => {
    // Simulate: user had curator layout, sections in sidebar slot
    const curatorSections: Section[] = [
      heroSection,
      { ...skillsSection, slot: "sidebar" },
      { ...projectsSection, slot: "main" },
    ];

    const architectTemplate = getLayoutTemplate("architect");

    // Without draftSlots (the old bug)
    const resultWithout = assignSlotsFromFacts(
      architectTemplate, curatorSections, undefined,
    );
    const withoutErrors = resultWithout.issues.filter(i => i.severity === "error");

    // With draftSlots (the fix) — sidebar is not valid in architect, so Phase 3 handles it
    const draftSlots = new Map<string, string>();
    for (const s of curatorSections) {
      if (s.slot) draftSlots.set(s.id, s.slot);
    }
    const resultWith = assignSlotsFromFacts(
      architectTemplate, curatorSections, undefined, undefined,
      draftSlots.size > 0 ? draftSlots : undefined,
    );
    const withErrors = resultWith.issues.filter(i => i.severity === "error");

    // Filter out footer-related errors (test sections don't include a footer)
    const withoutContentErrors = withoutErrors.filter(e => e.slotId !== "footer");
    const withContentErrors = withErrors.filter(e => e.slotId !== "footer");
    expect(withoutContentErrors).toHaveLength(0);
    expect(withContentErrors).toHaveLength(0);

    // With draftSlots, sections should be assigned somewhere valid in architect
    for (const s of resultWith.sections) {
      if (s.type !== "hero" && s.type !== "footer") {
        expect(s.slot).toBeTruthy();
      }
    }
  });
});
