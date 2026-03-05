/**
 * Tests for the turn management rules.
 * Validates that all 6 rules (R1-R6) are present with their key directives.
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

    it("contains all 6 rules (R1 through R6)", () => {
      expect(rules).toContain("R1");
      expect(rules).toContain("R2");
      expect(rules).toContain("R3");
      expect(rules).toContain("R4");
      expect(rules).toContain("R5");
      expect(rules).toContain("R6");
    });
  });

  describe("R1 — Topic clusters with natural bridges", () => {
    it("targets ~2 exchanges per cluster in exploration mode", () => {
      expect(rules).toMatch(/~2\s*exchange|target.*2\s*exchange/i);
    });

    it("allows flexible cluster end (short answer) or extension (still developing)", () => {
      expect(rules).toMatch(/end\s*earlier|extend.*3|still\s*developing/i);
    });

    it("handles user-volunteered third area briefly (1 exchange, not a full cluster)", () => {
      expect(rules).toMatch(/user.*volunteers.*new.*area|brief.*1\s*exchange|handle.*briefly/i);
    });

    it("requires a bridge sentence when transitioning", () => {
      expect(rules).toMatch(/bridge\s*sentence/i);
    });

    it("explicitly forbids cold topic switches", () => {
      expect(rules).toMatch(/cold.{0,20}switch|never.*cold.{0,20}topic/i);
    });

    it("targets 2 primary clusters with R2 hard cap at 6 exchanges", () => {
      expect(rules).toMatch(/2.*cluster|cluster.*2/i);
      expect(rules).toMatch(/6\s*exchange|R2/i);
    });

    it("scopes cluster approach to exploration, excludes edit sessions", () => {
      expect(rules).toMatch(/exploring|onboarding|exploration/i);
      expect(rules).toMatch(/editing|edit.*session|returning\s*user/i);
    });

    it("hard cap at 6 exchanges with immediate action", () => {
      expect(rules).toMatch(/6\s*exchange.*R2|R2.*6\s*exchange/i);
    });
  });

  describe("R2 — gate exception", () => {
    it("R2 generate_page includes one-question gate exception for missing name/role", () => {
      expect(rules).toMatch(/exception.*name.*role.*missing|ONE.*direct.*question.*collect|missing.*ask.*ONE|ask.*ONE.*direct.*question/i);
    });
  });

  describe("R4 — low-signal gate reference", () => {
    it("R4 low-signal fallback includes Phase C gate before generation", () => {
      expect(rules).toMatch(/Phase\s*C\s*gate|missing.*name.*role.*gate|ask.*one.*direct.*question.*generate/i);
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

  describe("R6 — Clarifications expire", () => {
    it("records new explicit information even when clarification is unanswered", () => {
      expect(rules).toMatch(/record.*new.*information.*immediately|do not ignore it/i);
    });

    it("limits repeated clarifications", () => {
      expect(rules).toMatch(/at most one more time|same clarification/i);
    });

    it("forbids optional clarifications from blocking generation", () => {
      expect(rules).toMatch(/missing optional.*do not block|do it with what you have/i);
    });
  });
});
