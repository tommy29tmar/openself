/**
 * Tests for archetype detection module.
 * 8 archetypes with multilingual regex detection and fact-based refinement.
 */
import { describe, it, expect } from "vitest";
import {
  detectArchetypeFromSignals,
  refineArchetype,
  ARCHETYPE_STRATEGIES,
  type Archetype,
} from "@/lib/agent/archetypes";

describe("detectArchetypeFromSignals", () => {
  it("detects developer from English role", () => {
    expect(detectArchetypeFromSignals("software engineer", null)).toBe("developer");
  });

  it("detects developer from Italian role", () => {
    expect(detectArchetypeFromSignals("ingegnere del software", null)).toBe("developer");
  });

  it("detects designer before executive for 'Art Director'", () => {
    expect(detectArchetypeFromSignals("Art Director", null)).toBe("designer");
  });

  it("does not classify 'Scrum Master' as student", () => {
    expect(detectArchetypeFromSignals("Scrum Master", null)).not.toBe("student");
  });

  it("detects student from 'Master degree student'", () => {
    expect(detectArchetypeFromSignals("Master degree student", null)).toBe("student");
  });

  it("falls back to generalist for unknown roles", () => {
    expect(detectArchetypeFromSignals("florist", null)).toBe("generalist");
  });

  it("uses lastUserMessage as fallback when role is null", () => {
    expect(detectArchetypeFromSignals(null, "I'm a frontend developer")).toBe("developer");
  });

  it("detects academic from 'Professor of Physics'", () => {
    expect(detectArchetypeFromSignals("Professor of Physics", null)).toBe("academic");
  });

  it("detects executive from 'CEO'", () => {
    expect(detectArchetypeFromSignals("CEO", null)).toBe("executive");
  });

  it("detects consultant from 'Management Consultant'", () => {
    expect(detectArchetypeFromSignals("Management Consultant", null)).toBe("consultant");
  });

  it("detects designer from German 'Grafikdesigner'", () => {
    expect(detectArchetypeFromSignals("Grafikdesigner", null)).toBe("designer");
  });

  it("detects developer from French 'développeur web'", () => {
    expect(detectArchetypeFromSignals("développeur web", null)).toBe("developer");
  });

  it("returns generalist when both inputs are null", () => {
    expect(detectArchetypeFromSignals(null, null)).toBe("generalist");
  });
});

describe("refineArchetype", () => {
  it("refines to creator when 3+ project facts dominate", () => {
    const facts = [
      { category: "project" }, { category: "project" }, { category: "project" },
      { category: "identity" }, { category: "skill" },
    ];
    expect(refineArchetype(facts as any, "developer")).toBe("creator");
  });

  it("does not refine with fewer than 5 facts", () => {
    const facts = [{ category: "project" }, { category: "project" }, { category: "project" }];
    expect(refineArchetype(facts as any, "developer")).toBe("developer");
  });

  it("does not refine when dominant category has fewer than 3 facts", () => {
    const facts = [
      { category: "project" }, { category: "project" },
      { category: "skill" }, { category: "skill" },
      { category: "identity" },
    ];
    expect(refineArchetype(facts as any, "developer")).toBe("developer");
  });

  it("does not use 'experience' category for refinement (not discriminating)", () => {
    const facts = [
      { category: "experience" }, { category: "experience" }, { category: "experience" },
      { category: "experience" }, { category: "experience" },
    ];
    expect(refineArchetype(facts as any, "developer")).toBe("developer");
  });

  it("refines to academic when education facts dominate", () => {
    const facts = [
      { category: "education" }, { category: "education" }, { category: "education" },
      { category: "skill" }, { category: "identity" },
    ];
    expect(refineArchetype(facts as any, "generalist")).toBe("academic");
  });
});

describe("ARCHETYPE_STRATEGIES", () => {
  const archetypes: Archetype[] = [
    "developer", "designer", "executive", "student",
    "creator", "consultant", "academic", "generalist",
  ];

  it("has strategies for all 8 archetypes", () => {
    for (const a of archetypes) {
      expect(ARCHETYPE_STRATEGIES[a]).toBeDefined();
      expect(ARCHETYPE_STRATEGIES[a].explorationOrder).toBeDefined();
      expect(ARCHETYPE_STRATEGIES[a].sectionPriority).toBeDefined();
      expect(ARCHETYPE_STRATEGIES[a].toneHint).toBeTruthy();
    }
  });

  it("each explorationOrder contains at least 3 categories", () => {
    for (const a of archetypes) {
      expect(ARCHETYPE_STRATEGIES[a].explorationOrder.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("each strategy has a communicationStyle", () => {
    for (const a of archetypes) {
      expect(ARCHETYPE_STRATEGIES[a].communicationStyle).toBeTruthy();
    }
  });
});
