/**
 * Tests for the enhanced expertise calibration.
 * Validates that each level has the correct behavioral instructions,
 * with specific expected phrases per level.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the policy sub-module dependencies since we're importing from the registry
vi.mock("@/lib/agent/policies/first-visit", () => ({
  firstVisitPolicy: vi.fn((lang: string) => `FIRST_VISIT_${lang}`),
}));
vi.mock("@/lib/agent/policies/returning-no-page", () => ({
  returningNoPagePolicy: vi.fn((lang: string) => `RETURNING_${lang}`),
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
  pendingProposalsDirective: vi.fn(),
  thinSectionsDirective: vi.fn(),
  staleFactsDirective: vi.fn(),
  openConflictsDirective: vi.fn(),
}));

import { getExpertiseCalibration } from "@/lib/agent/policies/index";

describe("getExpertiseCalibration — enhanced", () => {
  describe("novice level", () => {
    const novice = getExpertiseCalibration("novice");

    it("contains expertise header with novice label", () => {
      expect(novice).toContain("EXPERTISE CALIBRATION: novice");
    });

    it("instructs to explain every action", () => {
      expect(novice).toMatch(/explain every action/i);
    });

    it("uses user-friendly phrasing examples", () => {
      expect(novice).toContain("I'm adding this skill to your page");
    });

    it("instructs to walk through steps", () => {
      expect(novice).toMatch(/walk.*through.*step/i);
    });

    it("instructs to preview results explicitly", () => {
      expect(novice).toMatch(/preview.*explicitly|preview.*appear/i);
    });

    it("instructs to explain publishing", () => {
      expect(novice).toMatch(/publishing.*make.*page.*live|explain.*publishing/i);
    });

    it("instructs to keep tool usage invisible", () => {
      expect(novice).toMatch(/tool usage invisible|never mention.*facts.*tools/i);
    });

    it("instructs to explain theme/layout changes even with explicit instruction", () => {
      expect(novice).toMatch(/explain.*BEFORE.*doing.*even if.*user asked/i);
    });
  });

  describe("familiar level", () => {
    const familiar = getExpertiseCalibration("familiar");

    it("contains expertise header with familiar label", () => {
      expect(familiar).toContain("EXPERTISE CALIBRATION: familiar");
    });

    it("instructs to skip explanations for simple operations", () => {
      expect(familiar).toMatch(/skip.*explanations.*simple/i);
    });

    it("instructs to explain for layout/theme changes", () => {
      expect(familiar).toMatch(/explain.*layout.*theme|layout.*theme.*explain/i);
    });

    it("allows mentioning features by name", () => {
      expect(familiar).toMatch(/mention.*sections|features.*by name/i);
    });

    it("instructs not to explain publishing", () => {
      expect(familiar).toMatch(/don't explain.*publishing/i);
    });

    it("allows brief confirmation for data operations", () => {
      expect(familiar).toMatch(/brief confirmation|just do it/i);
    });
  });

  describe("expert level", () => {
    const expert = getExpertiseCalibration("expert");

    it("contains expertise header with expert label", () => {
      expect(expert).toContain("EXPERTISE CALIBRATION: expert");
    });

    it("instructs to be minimal", () => {
      expect(expert).toMatch(/minimal|terse/i);
    });

    it("instructs to execute and confirm", () => {
      expect(expert).toMatch(/execute and confirm|done.*publish/i);
    });

    it("provides example of terse responses", () => {
      expect(expert).toMatch(/Done\.|Updated\.|Added\./);
    });

    it("instructs to suggest advanced features proactively", () => {
      expect(expert).toMatch(/suggest.*advanced.*proactively/i);
    });

    it("only elaborates on explicit user request", () => {
      expect(expert).toMatch(/only.*elaborate.*when.*user.*asks|explicitly asks/i);
    });

    it("provides shorthand example", () => {
      expect(expert).toMatch(/check preview|architect/i);
    });
  });

  describe("cross-level guarantees", () => {
    it("each level produces distinct text", () => {
      const levels = ["novice", "familiar", "expert"] as const;
      const results = levels.map((l) => getExpertiseCalibration(l));
      const unique = new Set(results);
      expect(unique.size).toBe(3);
    });

    it("each level is at least 200 chars (substantive content)", () => {
      const levels = ["novice", "familiar", "expert"] as const;
      for (const level of levels) {
        const text = getExpertiseCalibration(level);
        expect(text.length).toBeGreaterThan(200);
      }
    });

    it("novice is longest, expert is shortest", () => {
      const novice = getExpertiseCalibration("novice");
      const familiar = getExpertiseCalibration("familiar");
      const expert = getExpertiseCalibration("expert");
      expect(novice.length).toBeGreaterThan(familiar.length);
      expect(familiar.length).toBeGreaterThan(expert.length);
    });

    it("returns empty string for unknown level", () => {
      expect(getExpertiseCalibration("unknown" as any)).toBe("");
    });
  });
});
