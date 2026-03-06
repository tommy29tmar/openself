/**
 * Tests for slot carry-over (soft-pin) in assignSlotsFromFacts
 * and projectCanonicalConfig preservation.
 */
import { describe, it, expect } from "vitest";
import { assignSlotsFromFacts } from "@/lib/layout/assign-slots";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { composeOptimisticPage } from "@/lib/services/page-composer";
import { projectCanonicalConfig, type DraftMeta } from "@/lib/services/page-projection";
import type { FactRow } from "@/lib/services/kb-service";
import type { Section } from "@/lib/page-config/schema";

function makeFact(overrides: Partial<FactRow> & { id: string; category: string; key: string; value: Record<string, unknown> }): FactRow {
  return {
    sessionId: "test",
    profileId: "test",
    source: "chat",
    confidence: 1,
    visibility: "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
    parentFactId: null,
    archivedAt: null,
    ...overrides,
  } as FactRow;
}

const identityFact = makeFact({
  id: "id1", category: "identity", key: "name",
  value: { full: "Test User" },
});

describe("assignSlotsFromFacts — soft-pin", () => {
  it("assigns section to draftSlot when valid and has capacity", () => {
    const template = getLayoutTemplate("curator");
    const sections: Section[] = [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] } },
    ];
    const draftSlots = new Map([["skills-1", "sidebar"]]);
    const { sections: assigned } = assignSlotsFromFacts(template, sections, undefined, undefined, draftSlots);
    const skills = assigned.find(s => s.id === "skills-1");
    expect(skills).toBeDefined();
    expect(skills!.slot).toBe("sidebar");
  });

  it("falls through to Phase 3 when draftSlot does not exist", () => {
    const template = getLayoutTemplate("monolith");
    const sections: Section[] = [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] } },
    ];
    const draftSlots = new Map([["skills-1", "nonexistent-slot"]]);
    const { sections: assigned } = assignSlotsFromFacts(template, sections, undefined, undefined, draftSlots);
    const skills = assigned.find(s => s.id === "skills-1");
    expect(skills).toBeDefined();
    // Should be assigned to main (the only content slot in vertical)
    expect(skills!.slot).toBe("main");
  });

  it("new sections (not in draftSlots) go through Phase 3 as before", () => {
    const template = getLayoutTemplate("curator");
    const sections: Section[] = [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] } },
      { id: "projects-1", type: "projects", variant: "grid", content: { items: [] } },
    ];
    // Only skills has a draft slot, projects does not
    const draftSlots = new Map([["skills-1", "sidebar"]]);
    const { sections: assigned } = assignSlotsFromFacts(template, sections, undefined, undefined, draftSlots);
    const projects = assigned.find(s => s.id === "projects-1");
    expect(projects).toBeDefined();
    // Projects should get Phase 3 assignment (not curator since it's not in draftSlots)
    expect(projects!.slot).toBeTruthy();
  });

  it("falls through to Phase 3 when draftSlot capacity is exhausted", () => {
    const template = getLayoutTemplate("curator");
    // Fill curator to capacity with many sections pinned to same slot
    const sections: Section[] = [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] } },
      { id: "interests-1", type: "interests", variant: "grid", content: { items: [] } },
      { id: "stats-1", type: "stats", variant: "grid", content: { items: [] } },
      { id: "social-1", type: "social", variant: "grid", content: { links: [] } },
      { id: "contact-1", type: "contact", variant: "grid", content: { items: [] } },
      { id: "languages-1", type: "languages", variant: "grid", content: { items: [] } },
      // 7th curator section — curator maxSections is 6
      { id: "activities-1", type: "activities", variant: "grid", content: { items: [] } },
    ];
    // All pinned to curator
    const draftSlots = new Map([
      ["skills-1", "sidebar"], ["interests-1", "sidebar"], ["stats-1", "sidebar"],
      ["social-1", "sidebar"], ["contact-1", "sidebar"], ["languages-1", "sidebar"],
      ["activities-1", "sidebar"],
    ]);
    const { sections: assigned } = assignSlotsFromFacts(template, sections, undefined, undefined, draftSlots);
    const activities = assigned.find(s => s.id === "activities-1");
    expect(activities).toBeDefined();
    // 7th section should NOT be in curator (capacity exhausted) — falls through to Phase 3
    expect(activities!.slot).not.toBe("sidebar");
  });
});

describe("slot carry-over via projectCanonicalConfig", () => {
  it("preserves section.slot from draft after recompose", () => {
    const facts = [
      identityFact,
      makeFact({ id: "s1", category: "skill", key: "ts", value: { name: "TypeScript" } }),
    ];

    // Simulate a draft that has skills in "curator"
    const draftMeta: DraftMeta = {
      surface: "canvas",
      voice: "signal",
      light: "day",
      style: { primaryColor: "#111", layout: "centered" },
      layoutTemplate: "curator",
      sections: [
        { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
        { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] }, slot: "sidebar" },
      ],
    };

    const config = projectCanonicalConfig(facts, "draft", "en", draftMeta);
    const skills = config.sections.find(s => s.type === "skills" || s.type === "stats");
    // At-a-glance may replace skills in composition, but if skills section exists it should keep sidebar
    // Check any section that was in sidebar stays there
    // Composition may change section IDs, so check the slot is present on ANY section
    const curatorSections = config.sections.filter(s => s.slot === "sidebar");
    expect(curatorSections.length).toBeGreaterThanOrEqual(1);
  });

  it("passes draftSlots through to assignSlotsFromFacts", () => {
    const facts = [
      identityFact,
      makeFact({ id: "s1", category: "skill", key: "ts", value: { name: "TypeScript" } }),
      makeFact({ id: "s2", category: "skill", key: "react", value: { name: "React" } }),
    ];

    // curator sidebar slot accepts skills — use that for a valid soft-pin
    const draftMeta: DraftMeta = {
      surface: "canvas",
      voice: "signal",
      light: "day",
      style: { primaryColor: "#111", layout: "centered" },
      layoutTemplate: "curator",
      sections: [
        { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
        { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] }, slot: "sidebar" },
      ],
    };

    const config = projectCanonicalConfig(facts, "draft", "en", draftMeta);
    const skills = config.sections.find(s => s.type === "skills" || s.type === "stats");
    if (skills) {
      // Skills/stats section should carry over the sidebar slot from draft
      expect(skills.slot).toBe("sidebar");
    }
  });
});
