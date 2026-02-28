/**
 * Tests for the first-visit onboarding policy.
 * Validates that the policy text contains the required structural elements:
 * turn phases, fact recording mandate, breadth-first rule, generate/publish flow,
 * and banned patterns.
 */
import { describe, it, expect } from "vitest";
import { firstVisitPolicy } from "@/lib/agent/policies/first-visit";

describe("firstVisitPolicy", () => {
  const policyEn = firstVisitPolicy("en");
  const policyIt = firstVisitPolicy("it");

  // -------------------------------------------------------------------------
  // Phase structure
  // -------------------------------------------------------------------------
  describe("phase structure", () => {
    it("contains Phase A — Identity with turns 1-2", () => {
      expect(policyEn).toContain("PHASE A");
      expect(policyEn).toMatch(/Identity.*turn.*1.*2/is);
    });

    it("contains Phase B — Breadth-first exploration with turns 3-6", () => {
      expect(policyEn).toContain("PHASE B");
      expect(policyEn).toMatch(/exploration.*turn.*3.*6/is);
    });

    it("contains Phase C — Generate + publish with turns 7-8", () => {
      expect(policyEn).toContain("PHASE C");
      expect(policyEn).toMatch(/publish.*turn.*7.*8/is);
    });
  });

  // -------------------------------------------------------------------------
  // Phase A: Identity (name + role)
  // -------------------------------------------------------------------------
  describe("Phase A: Identity", () => {
    it("instructs to record name as fact on turn 1", () => {
      expect(policyEn).toMatch(/turn\s*1.*create_fact.*identity.*name/is);
    });

    it("instructs to ask about work/role after name", () => {
      expect(policyEn).toMatch(/ask.*what they do|work|role|profession/i);
    });

    it("requires name + role by end of turn 2", () => {
      expect(policyEn).toMatch(/turn\s*2.*name.*role|must have.*name.*role/is);
    });
  });

  // -------------------------------------------------------------------------
  // Phase B: Breadth-first rule
  // -------------------------------------------------------------------------
  describe("Phase B: Breadth-first exploration", () => {
    it("explicitly forbids consecutive questions on the same area", () => {
      expect(policyEn).toMatch(/never.*2\s*consecutive.*same\s*area/i);
    });

    it("lists at least 3 distinct exploration areas", () => {
      // The policy should mention skills, projects, interests, achievements, education, or activities
      const areas = ["skills", "projects", "interests", "achievements", "education", "activities"];
      const mentionedAreas = areas.filter((a) => policyEn.toLowerCase().includes(a));
      expect(mentionedAreas.length).toBeGreaterThanOrEqual(3);
    });

    it("requires exactly one question per turn", () => {
      expect(policyEn).toMatch(/one\s*question\s*per\s*turn/i);
    });
  });

  // -------------------------------------------------------------------------
  // Phase C: Generate + publish
  // -------------------------------------------------------------------------
  describe("Phase C: Generate + publish", () => {
    it("mentions generate_page tool", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("mentions request_publish tool", () => {
      expect(policyEn).toContain("request_publish");
    });

    it("instructs to suggest a username", () => {
      expect(policyEn).toMatch(/suggest.*username/i);
    });

    it("allows skipping to Phase C early with good signal", () => {
      expect(policyEn).toMatch(/skip.*ahead|earlier.*phase\s*c/is);
    });
  });

  // -------------------------------------------------------------------------
  // Fact recording mandate
  // -------------------------------------------------------------------------
  describe("fact recording", () => {
    it("demands EVERY piece of information be recorded as fact", () => {
      expect(policyEn).toMatch(/every.*piece.*information.*fact/i);
    });

    it("demands IMMEDIATE fact recording via create_fact", () => {
      expect(policyEn).toMatch(/immediately|immediate/i);
      expect(policyEn).toContain("create_fact");
    });

    it("forbids batching or delaying fact recording", () => {
      expect(policyEn).toMatch(/not\s*(batch|delay)|never.*wait/i);
    });
  });

  // -------------------------------------------------------------------------
  // Low-signal handling
  // -------------------------------------------------------------------------
  describe("low-signal handling", () => {
    it("defines 3 escalation steps", () => {
      expect(policyEn).toContain("Step 1");
      expect(policyEn).toContain("Step 2");
      expect(policyEn).toContain("Step 3");
    });

    it("step 1 triggers after 2+ low-signal replies", () => {
      expect(policyEn).toMatch(/2\+\s*low-signal/i);
    });

    it("step 2 uses fill-in-the-blank technique", () => {
      expect(policyEn).toMatch(/fill.*blank|sentence\s*starters?/i);
    });

    it("step 3 generates minimal page fallback", () => {
      expect(policyEn).toMatch(/minimal\s*page/i);
    });
  });

  // -------------------------------------------------------------------------
  // Banned patterns
  // -------------------------------------------------------------------------
  describe("banned patterns", () => {
    it("explicitly bans 'let me know if you need anything'", () => {
      expect(policyEn).toMatch(/never.*let me know/i);
    });

    it("bans passive closings", () => {
      expect(policyEn).toMatch(/never.*passive|never.*let me know.*anything/i);
    });
  });

  // -------------------------------------------------------------------------
  // Language embedding
  // -------------------------------------------------------------------------
  describe("language embedding", () => {
    it("embeds the language parameter in the policy text (en)", () => {
      expect(policyEn).toContain("en");
    });

    it("embeds the language parameter in the policy text (it)", () => {
      expect(policyIt).toContain("it");
    });
  });

  // -------------------------------------------------------------------------
  // Return type
  // -------------------------------------------------------------------------
  it("returns a non-empty string", () => {
    expect(typeof policyEn).toBe("string");
    expect(policyEn.length).toBeGreaterThan(100);
  });
});
