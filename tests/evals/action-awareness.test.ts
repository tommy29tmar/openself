/**
 * Tests for the action awareness policy.
 * Validates that high-impact and low-impact operations are properly categorized,
 * the explain-before-act pattern is documented, and expertise modulation is defined.
 */
import { describe, it, expect } from "vitest";
import { actionAwarenessPolicy } from "@/lib/agent/policies/action-awareness";

describe("actionAwarenessPolicy", () => {
  const policy = actionAwarenessPolicy();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policy).toBe("string");
      expect(policy.length).toBeGreaterThan(200);
    });

    it("contains an ACTION AWARENESS header", () => {
      expect(policy).toContain("ACTION AWARENESS");
    });
  });

  describe("high-impact operations", () => {
    it("lists set_layout as high-impact", () => {
      expect(policy).toContain("set_layout");
    });

    it("lists set_theme as high-impact", () => {
      expect(policy).toContain("set_theme");
    });

    it("lists update_page_style as high-impact", () => {
      const highImpactSection = policy.split("LOW-IMPACT")[0];
      expect(highImpactSection).toContain("update_page_style");
    });

    it("lists reorder_sections as high-impact", () => {
      const highImpactSection = policy.split("LOW-IMPACT")[0];
      expect(highImpactSection).toContain("reorder_sections");
    });

    it("lists generate_page in steady_state as high-impact", () => {
      expect(policy).toContain("generate_page");
      expect(policy).toContain("steady_state");
    });

    it("includes explain step in the pattern", () => {
      expect(policy).toMatch(/EXPLAIN/i);
    });

    it("includes ask-for-confirmation step", () => {
      expect(policy).toMatch(/ASK.*confirmation|confirm/i);
    });

    it("includes execute step", () => {
      expect(policy).toMatch(/EXECUTE/i);
    });

    it("includes point-to-result step", () => {
      expect(policy).toMatch(/preview/i);
    });

    it("has an explicit-instruction exception", () => {
      expect(policy).toMatch(/explicit.*instruction|unambiguous/i);
    });
  });

  describe("low-impact operations", () => {
    it("lists create_fact as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toBeDefined();
      expect(lowImpactSection).toContain("create_fact");
    });

    it("lists update_fact as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("update_fact");
    });

    it("lists delete_fact as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("delete_fact");
    });

    it("lists set_fact_visibility as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toContain("set_fact_visibility");
    });

    it("does NOT list update_page_style as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).not.toContain("update_page_style");
    });

    it("does NOT list reorder_sections as low-impact", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).not.toContain("reorder_sections");
    });

    it("instructs to just do it without asking", () => {
      const lowImpactSection = policy.split("LOW-IMPACT")[1];
      expect(lowImpactSection).toMatch(/just do them/i);
    });
  });

  describe("expertise modulation", () => {
    it("defines novice behavior — always explain", () => {
      expect(policy).toMatch(/novice.*ALWAYS.*explain/is);
    });

    it("defines familiar behavior — explain when ambiguous", () => {
      expect(policy).toMatch(/familiar.*ambiguous/is);
    });

    it("defines expert behavior — act and confirm", () => {
      expect(policy).toMatch(/expert.*act and confirm/is);
    });

    it("references EXPERTISE CALIBRATION block", () => {
      expect(policy).toContain("EXPERTISE CALIBRATION");
    });
  });
});
