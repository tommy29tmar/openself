/**
 * Tests for the policy registry module.
 * Covers: getJourneyPolicy, getSituationDirectives, getExpertiseCalibration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all policy modules before import
vi.mock("@/lib/agent/policies/first-visit", () => ({
  firstVisitPolicy: vi.fn((lang: string) => `FIRST_VISIT_POLICY_${lang}`),
}));
vi.mock("@/lib/agent/policies/returning-no-page", () => ({
  returningNoPagePolicy: vi.fn((lang: string) => `RETURNING_NO_PAGE_${lang}`),
}));
vi.mock("@/lib/agent/policies/draft-ready", () => ({
  draftReadyPolicy: vi.fn((lang: string) => `DRAFT_READY_${lang}`),
}));
vi.mock("@/lib/agent/policies/active-fresh", () => ({
  activeFreshPolicy: vi.fn((lang: string) => `ACTIVE_FRESH_${lang}`),
}));
vi.mock("@/lib/agent/policies/active-stale", () => ({
  activeStalePolicy: vi.fn((lang: string) => `ACTIVE_STALE_${lang}`),
}));
vi.mock("@/lib/agent/policies/blocked", () => ({
  blockedPolicy: vi.fn((lang: string) => `BLOCKED_${lang}`),
}));
vi.mock("@/lib/agent/policies/situations", () => ({
  pendingProposalsDirective: vi.fn(
    (count: number, sections: string[]) =>
      `PROPOSALS: ${count} pending in [${sections.join(", ")}]`,
  ),
  thinSectionsDirective: vi.fn(
    (sections: string[]) => `THIN: [${sections.join(", ")}]`,
  ),
  staleFactsDirective: vi.fn(
    (facts: string[]) => `STALE: [${facts.join(", ")}]`,
  ),
  openConflictsDirective: vi.fn(
    (conflicts: string[]) => `CONFLICTS: [${conflicts.join(", ")}]`,
  ),
}));

import {
  getJourneyPolicy,
  getSituationDirectives,
  getExpertiseCalibration,
} from "@/lib/agent/policies/index";
import type { SituationContext } from "@/lib/agent/policies/index";
import type { Situation } from "@/lib/agent/journey";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getJourneyPolicy
// ---------------------------------------------------------------------------
describe("getJourneyPolicy", () => {
  it("returns first_visit policy for first_visit state", () => {
    const result = getJourneyPolicy("first_visit", "en");
    expect(result).toBe("FIRST_VISIT_POLICY_en");
  });

  it("returns returning_no_page policy for returning_no_page state", () => {
    const result = getJourneyPolicy("returning_no_page", "it");
    expect(result).toBe("RETURNING_NO_PAGE_it");
  });

  it("returns draft_ready policy for draft_ready state", () => {
    const result = getJourneyPolicy("draft_ready", "en");
    expect(result).toBe("DRAFT_READY_en");
  });

  it("returns active_fresh policy for active_fresh state", () => {
    const result = getJourneyPolicy("active_fresh", "fr");
    expect(result).toBe("ACTIVE_FRESH_fr");
  });

  it("returns active_stale policy for active_stale state", () => {
    const result = getJourneyPolicy("active_stale", "de");
    expect(result).toBe("ACTIVE_STALE_de");
  });

  it("returns blocked policy for blocked state", () => {
    const result = getJourneyPolicy("blocked", "es");
    expect(result).toBe("BLOCKED_es");
  });

  it("maps every JourneyState to a distinct policy function", () => {
    const states = [
      "first_visit",
      "returning_no_page",
      "draft_ready",
      "active_fresh",
      "active_stale",
      "blocked",
    ] as const;
    const results = states.map((s) => getJourneyPolicy(s, "en"));
    const unique = new Set(results);
    expect(unique.size).toBe(states.length);
  });
});

// ---------------------------------------------------------------------------
// getSituationDirectives
// ---------------------------------------------------------------------------
describe("getSituationDirectives", () => {
  const emptyContext: SituationContext = {
    pendingProposalCount: 0,
    pendingProposalSections: [],
    thinSections: [],
    staleFacts: [],
    openConflicts: [],
  };

  it("returns empty string when no situations active", () => {
    const result = getSituationDirectives([], emptyContext);
    expect(result).toBe("");
  });

  it("includes pending proposals directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      pendingProposalCount: 3,
      pendingProposalSections: ["bio", "skills"],
    };
    const result = getSituationDirectives(["has_pending_proposals"], ctx);
    expect(result).toContain("SITUATION DIRECTIVES:");
    expect(result).toContain("PROPOSALS: 3 pending");
    expect(result).toContain("bio");
    expect(result).toContain("skills");
  });

  it("includes thin sections directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      thinSections: ["projects", "achievements"],
    };
    const result = getSituationDirectives(["has_thin_sections"], ctx);
    expect(result).toContain("THIN:");
    expect(result).toContain("projects");
    expect(result).toContain("achievements");
  });

  it("includes stale facts directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      staleFacts: ["skill/typescript", "experience/acme"],
    };
    const result = getSituationDirectives(["has_stale_facts"], ctx);
    expect(result).toContain("STALE:");
    expect(result).toContain("skill/typescript");
  });

  it("includes open conflicts directive when situation is active", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      openConflicts: ["identity/name: chat vs github"],
    };
    const result = getSituationDirectives(["has_open_conflicts"], ctx);
    expect(result).toContain("CONFLICTS:");
    expect(result).toContain("identity/name");
  });

  it("composes multiple directives when multiple situations active", () => {
    const situations: Situation[] = [
      "has_pending_proposals",
      "has_thin_sections",
      "has_stale_facts",
    ];
    const ctx: SituationContext = {
      ...emptyContext,
      pendingProposalCount: 1,
      pendingProposalSections: ["bio"],
      thinSections: ["skills"],
      staleFacts: ["experience/old-job"],
    };
    const result = getSituationDirectives(situations, ctx);
    expect(result).toContain("PROPOSALS:");
    expect(result).toContain("THIN:");
    expect(result).toContain("STALE:");
  });

  it("skips proposals directive when situation flag is set but count is 0", () => {
    const ctx: SituationContext = {
      ...emptyContext,
      pendingProposalCount: 0,
      pendingProposalSections: [],
    };
    const result = getSituationDirectives(["has_pending_proposals"], ctx);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getExpertiseCalibration
// ---------------------------------------------------------------------------
describe("getExpertiseCalibration", () => {
  it("returns novice calibration with explanation hints", () => {
    const result = getExpertiseCalibration("novice");
    expect(result).toContain("novice");
    expect(result).toMatch(/preview/i);
    expect(result).toMatch(/publishing/i);
  });

  it("returns familiar calibration with skip-basics hint", () => {
    const result = getExpertiseCalibration("familiar");
    expect(result).toContain("familiar");
    expect(result).toMatch(/skip.*explanations/i);
  });

  it("returns expert calibration with terse hint", () => {
    const result = getExpertiseCalibration("expert");
    expect(result).toContain("expert");
    expect(result).toMatch(/minimal|terse/i);
  });

  it("each level produces distinct text", () => {
    const levels = ["novice", "familiar", "expert"] as const;
    const results = levels.map((l) => getExpertiseCalibration(l));
    const unique = new Set(results);
    expect(unique.size).toBe(3);
  });
});
