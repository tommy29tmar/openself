/**
 * Tests for the turn management rules.
 * Validates that R1, R2, R4 are present with their key directives.
 * R3, R5, R6 moved to sharedBehavioralRules — verified absent here.
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

    it("contains rules R1, R2, and R4", () => {
      expect(rules).toContain("R1");
      expect(rules).toContain("R2");
      expect(rules).toContain("R4");
    });

    it("does NOT contain removed rules R3, R5, R6", () => {
      expect(rules).not.toMatch(/^R3\b/m);
      expect(rules).not.toMatch(/^R5\b/m);
      expect(rules).not.toMatch(/^R6\b/m);
    });
  });

  describe("R1 — Topic exploration", () => {
    it("targets ~2 exchanges per topic in exploration mode", () => {
      expect(rules).toMatch(/~2\s*exchange|target.*2\s*exchange/i);
    });

    it("allows flexible end (short answer) or extension (still developing)", () => {
      expect(rules).toMatch(/end\s*earlier|extend.*3|still\s*developing/i);
    });

    it("requires a bridge sentence when transitioning", () => {
      expect(rules).toMatch(/bridge\s*sentence/i);
    });

    it("scopes cluster approach to exploration, excludes edit sessions", () => {
      expect(rules).toMatch(/exploring|exploration/i);
      expect(rules).toMatch(/editing|edit.*session|returning\s*user|skip/i);
    });

    it("does NOT hard-code cluster count (now in journey policies)", () => {
      expect(rules).not.toMatch(/target\s*2\s*(primary\s*)?cluster/i);
    });

    it("does NOT hard-code exchange cap (now in journey policies + R2)", () => {
      expect(rules).not.toMatch(/hard\s*cap.*6\s*exchange/i);
    });
  });

  describe("R2 — Max exchanges before action", () => {
    it("specifies the 6-exchange limit as default", () => {
      expect(rules).toMatch(/6.*exchange/i);
    });

    it("instructs to propose action after limit", () => {
      expect(rules).toMatch(/propose.*action|generate_page|publish/i);
    });

    it("references generate_page as an action option", () => {
      expect(rules).toContain("generate_page");
    });

    it("explicitly marks 6-exchange as default that journey policies may override", () => {
      expect(rules).toMatch(/default.*6|journey.*polic.*override|journey.*polic.*precedence/i);
    });

    it("notes first_visit defines its own cap that takes precedence", () => {
      expect(rules).toMatch(/first_visit.*own.*cap|first_visit.*precedence/i);
    });
  });

  describe("R3 — removed (now in shared-rules)", () => {
    it("does NOT contain banned phrases list (moved to sharedBehavioralRules)", () => {
      expect(rules).not.toMatch(/banned\s*phrases/i);
      expect(rules).not.toMatch(/let me know if you need anything/i);
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

  describe("R5 — removed (now in shared-rules)", () => {
    it("does NOT contain response length rules (moved to sharedBehavioralRules)", () => {
      expect(rules).not.toMatch(/proportional.*response/i);
    });
  });

  describe("R6 — removed (now in shared-rules)", () => {
    it("does NOT contain clarification rules (moved to sharedBehavioralRules)", () => {
      expect(rules).not.toMatch(/clarification.*expire/i);
    });
  });
});
