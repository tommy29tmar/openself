/**
 * Tests for the memory usage directives.
 * Validates that all four tiers are documented, the golden rule is present,
 * and cross-tier rules are defined.
 */
import { describe, it, expect } from "vitest";
import { memoryUsageDirectives } from "@/lib/agent/policies/memory-directives";

describe("memoryUsageDirectives", () => {
  const directives = memoryUsageDirectives();

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof directives).toBe("string");
      expect(directives.length).toBeGreaterThan(200);
    });

    it("contains a MEMORY USAGE header", () => {
      expect(directives).toMatch(/MEMORY\s*USAGE/i);
    });
  });

  describe("Tier 1 — Facts", () => {
    it("references Tier 1 or facts as source of truth", () => {
      expect(directives).toMatch(/tier\s*1|facts.*source\s*of\s*truth/i);
    });

    it("contains the canonical search_facts rule", () => {
      expect(directives).toContain("search_facts");
      expect(directives).toContain("WHEN TO CALL search_facts");
    });

    it("instructs to use name from facts on first response", () => {
      expect(directives).toMatch(/name\s*from\s*facts|identity\/name/i);
    });

    it("references fact recording for new info (delegated to TOOL_POLICY)", () => {
      expect(directives).toMatch(/record it as a fact/i);
      expect(directives).toMatch(/FACT RECORDING/);
    });

    it("references immutable fact correction flow", () => {
      expect(directives).toContain("delete");
      expect(directives).toContain("immutable");
    });

    it("references delete_fact for removals", () => {
      expect(directives).toContain("delete_fact");
    });

    it("does NOT duplicate fact recording mandate (now in TOOL_POLICY)", () => {
      expect(directives).not.toMatch(/when the user shares new information.*record it immediately/i);
      expect(directives).not.toMatch(/do not batch or delay/i);
    });
  });

  describe("Tier 2 — Summary", () => {
    it("references Tier 2 or conversation summary", () => {
      expect(directives).toMatch(/tier\s*2|conversation\s*summary/i);
    });

    it("instructs to use summary for continuity", () => {
      expect(directives).toMatch(/continuity|last\s*time/i);
    });

    it("instructs not to recite the summary", () => {
      expect(directives).toMatch(/not.*recite|do\s*not.*recite/i);
    });
  });

  describe("Tier 3 — Meta-Memories", () => {
    it("references Tier 3 or meta-memories", () => {
      expect(directives).toMatch(/tier\s*3|meta.?memor/i);
    });

    it("references save_memory tool", () => {
      expect(directives).toContain("save_memory");
    });

    it("contains the golden rule about saving at end of significant sessions", () => {
      expect(directives).toMatch(/golden\s*rule/i);
      expect(directives).toMatch(/save_memory.*session|session.*save_memory/i);
    });

    it("gives examples of good meta-memories", () => {
      expect(directives).toMatch(/good\s*meta.?memor/i);
    });

    it("gives examples of bad meta-memories", () => {
      expect(directives).toMatch(/bad\s*meta.?memor/i);
    });

    it("references memoryType values", () => {
      expect(directives).toContain("preference");
      expect(directives).toContain("insight");
      expect(directives).toContain("observation");
    });
  });

  describe("Tier 4 — Episodic Memory", () => {
    it("references Tier 4 or episodic memory", () => {
      expect(directives).toMatch(/tier\s*4|episodic\s*memory/i);
    });

    it("references record_event for time-bound events", () => {
      expect(directives).toContain("record_event");
    });

    it("references recall_episodes for temporal recall", () => {
      expect(directives).toContain("recall_episodes");
    });

    it("references confirm_episodic_pattern for promotion decisions", () => {
      expect(directives).toContain("confirm_episodic_pattern");
    });
  });

  describe("cross-tier rules", () => {
    it("contains cross-tier rules section", () => {
      expect(directives).toMatch(/cross.?tier/i);
    });

    it("distinguishes WHAT (facts) from HOW (memories) and WHEN (episodic)", () => {
      expect(directives).toMatch(/what.*know.*how.*behave.*when.*happened|tier\s*1.*what.*tier\s*3.*how.*tier\s*4.*when/i);
    });
  });
});
