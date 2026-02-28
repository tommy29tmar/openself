/**
 * Tests for the undo awareness policy.
 * Validates detection keywords, response pattern steps, critical rules,
 * and reversal scope coverage.
 */
import { describe, it, expect } from "vitest";
import { undoAwarenessPolicy } from "@/lib/agent/policies/undo-awareness";

describe("undoAwarenessPolicy", () => {
  const policy = undoAwarenessPolicy();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policy).toBe("string");
      expect(policy.length).toBeGreaterThan(200);
    });

    it("contains an UNDO AND REVERSAL header", () => {
      expect(policy).toContain("UNDO AND REVERSAL");
    });
  });

  describe("detection keywords — English", () => {
    const englishKeywords = ["undo", "revert", "go back", "don't like", "change it back", "was better before"];

    it.each(englishKeywords)("contains English keyword: %s", (keyword) => {
      expect(policy.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  describe("detection keywords — Italian", () => {
    const italianKeywords = ["annulla", "torna indietro", "non mi piace", "com'era prima"];

    it.each(italianKeywords)("contains Italian keyword: %s", (keyword) => {
      expect(policy.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  describe("response pattern steps", () => {
    it("has IDENTIFY step — check last action", () => {
      expect(policy).toMatch(/IDENTIFY.*last action/is);
    });

    it("has EXPLAIN step — describe what was done", () => {
      expect(policy).toMatch(/EXPLAIN.*what was done/is);
    });

    it("has PROPOSE step — offer reversal and alternatives", () => {
      expect(policy).toMatch(/PROPOSE.*reversal.*alternative/is);
    });

    it("has ACT step — execute the decision", () => {
      expect(policy).toMatch(/ACT.*decision/is);
    });
  });

  describe("critical rules", () => {
    it("prohibits full page regeneration as first reaction", () => {
      expect(policy).toMatch(/NEVER.*regenerate.*entire page.*first/is);
    });

    it("requires asking what specifically when complaint is vague", () => {
      expect(policy).toMatch(/vague|what specifically|what part/is);
    });

    it("prohibits excessive apologies", () => {
      expect(policy).toMatch(/NEVER.*apologize.*excessively/is);
    });

    it("handles case when no recent changes were made", () => {
      expect(policy).toMatch(/haven't made any.*changes/is);
    });

    it("handles impossible reversals honestly", () => {
      expect(policy).toMatch(/impossible|don't have the exact|be honest/is);
    });
  });

  describe("reversal scope", () => {
    const reversalTargets = [
      { action: "Theme change", tool: "set_theme" },
      { action: "Layout change", tool: "set_layout" },
      { action: "Section reorder", tool: "reorder_sections" },
      { action: "Fact deletion", tool: "create_fact" },
      { action: "Style change", tool: "update_page_style" },
    ];

    it.each(reversalTargets)("covers reversal for $action → $tool", ({ tool }) => {
      expect(policy).toContain(tool);
    });

    it("acknowledges page regeneration is hard to undo", () => {
      expect(policy).toMatch(/page regeneration.*harder to undo|hard.*undo/is);
    });
  });
});
