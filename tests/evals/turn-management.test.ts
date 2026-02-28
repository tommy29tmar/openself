/**
 * Tests for the turn management rules.
 * Validates that all 5 rules (R1-R5) are present with their key directives.
 */
import { describe, it, expect } from "vitest";
import { turnManagementRules } from "@/lib/agent/policies/turn-management";

describe("turnManagementRules", () => {
  const rules = turnManagementRules();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof rules).toBe("string");
      expect(rules.length).toBeGreaterThan(200);
    });

    it("contains a TURN MANAGEMENT header", () => {
      expect(rules).toMatch(/TURN\s*MANAGEMENT/i);
    });

    it("contains all 5 rules (R1 through R5)", () => {
      expect(rules).toContain("R1");
      expect(rules).toContain("R2");
      expect(rules).toContain("R3");
      expect(rules).toContain("R4");
      expect(rules).toContain("R5");
    });
  });

  describe("R1 — No consecutive same-area questions", () => {
    it("forbids consecutive questions on the same area", () => {
      expect(rules).toMatch(/never.*2.*consecutive.*same|no\s*consecutive.*same/i);
    });

    it("mentions breadth as the goal", () => {
      expect(rules).toMatch(/breadth/i);
    });
  });

  describe("R2 — Max 6 fact-gathering exchanges", () => {
    it("specifies the 6-exchange limit", () => {
      expect(rules).toMatch(/6\s*exchange/i);
    });

    it("instructs to propose action after limit", () => {
      expect(rules).toMatch(/propose.*action|generate_page|publish/i);
    });

    it("references generate_page as an action option", () => {
      expect(rules).toContain("generate_page");
    });
  });

  describe("R3 — No passive closings", () => {
    it("lists banned phrases", () => {
      expect(rules).toMatch(/banned\s*phrases/i);
    });

    it("bans 'let me know if you need anything'", () => {
      expect(rules).toMatch(/let me know if you need anything/i);
    });

    it("bans 'feel free to ask'", () => {
      expect(rules).toMatch(/feel free to ask/i);
    });

    it("bans 'don't hesitate to reach out'", () => {
      expect(rules).toMatch(/don't hesitate to reach out/i);
    });

    it("bans 'is there anything else'", () => {
      expect(rules).toMatch(/is there anything else/i);
    });

    it("bans 'just let me know'", () => {
      expect(rules).toMatch(/just let me know/i);
    });

    it("requires specific next step instead", () => {
      expect(rules).toMatch(/specific\s*next\s*step/i);
    });
  });

  describe("R4 — Stall detection and recovery", () => {
    it("triggers after 2+ low-signal replies", () => {
      expect(rules).toMatch(/2\+?\s*consecutive\s*low.?signal/i);
    });

    it("offers concrete options as first recovery step", () => {
      expect(rules).toMatch(/option|pick\s*one|concrete/i);
    });

    it("offers fill-in-the-blank as second recovery step", () => {
      expect(rules).toMatch(/fill.?in.?the.?blank/i);
    });

    it("proposes generating page after 3+ low-signal replies", () => {
      expect(rules).toMatch(/3\+?\s*low.?signal.*generat|generat.*page/i);
    });
  });

  describe("R5 — Proportional response length", () => {
    it("instructs to match response length to user message length", () => {
      expect(rules).toMatch(/match.*response.*length|proportional.*response/i);
    });

    it("gives short-message guidance (1-2 sentences)", () => {
      expect(rules).toMatch(/1-2\s*sentence/i);
    });

    it("bans walls of text for short messages", () => {
      expect(rules).toMatch(/never.*wall.*text|never.*long.*response.*short/i);
    });
  });
});
