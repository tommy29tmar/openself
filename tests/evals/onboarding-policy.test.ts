/**
 * Tests for the first-visit onboarding policy.
 * Validates that the policy text contains the required structural elements:
 * turn phases, fact recording mandate, breadth-first rule, generate/publish flow,
 * and banned patterns.
 */
import { describe, it, expect } from "vitest";
import { firstVisitPolicy } from "@/lib/agent/policies/first-visit";
import { getSystemPromptText } from "@/lib/agent/prompts";

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

    it("contains Phase B — Cluster exploration", () => {
      expect(policyEn).toContain("PHASE B");
      expect(policyEn).toMatch(/Cluster\s*exploration/i);
      expect(policyEn).toMatch(/exchange.*3.*6|exchanges.*3.*6/i);
    });

    it("contains Phase C — condition-based generate + publish with unconditional name+role gate", () => {
      expect(policyEn).toContain("PHASE C");
      // Extract only the PHASE C block to avoid false matches from Phase A text
      const phaseCBlock = policyEn.match(/PHASE C[\s\S]*?(?=PHASE [^C]|$)/)?.[0] ?? "";
      expect(phaseCBlock).toMatch(/generate_page/);
      expect(phaseCBlock).toMatch(/request_publish/);
      // Trigger is condition-based, not fixed turn numbers
      expect(phaseCBlock).toMatch(/2\s*cluster.*done|Phase\s*B.*complete|6-exchange.*cap|6-exchange cap/i);
      // Gate: one direct question if name/role missing, then generate regardless
      expect(phaseCBlock).toMatch(/GATE|one.*attempt|one.*direct.*question/i);
      // Critical: register/claim URL instruction must be preserved in Phase C
      expect(phaseCBlock).toMatch(/register.*claim.*URL|claim.*URL|openself\.dev\/yourname/i);
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
  // Phase B: Cluster exploration
  // -------------------------------------------------------------------------
  describe("Phase B: Cluster exploration", () => {
    it("describes cluster-based exploration", () => {
      expect(policyEn).toMatch(/cluster/i);
    });

    it("targets ~2 exchanges per cluster", () => {
      expect(policyEn).toMatch(/~2\s*exchange|target.*2\s*exchange/i);
    });

    it("targets 2 primary clusters", () => {
      expect(policyEn).toMatch(/2\s*(topic\s*)?cluster/i);
    });

    it("requires bridge sentences between clusters", () => {
      expect(policyEn).toMatch(/bridge\s*sentence/i);
    });

    it("does NOT contain old 'never 2 consecutive same area' rule", () => {
      expect(policyEn).not.toMatch(/never.*2\s*consecutive.*same\s*area/i);
    });

    it("handles user-volunteered third area briefly", () => {
      expect(policyEn).toMatch(/third\s*area|1\s*exchange.*before.*Phase\s*C/i);
    });

    it("covers at least 3 exploration area types", () => {
      const areas = ["work", "skills", "projects", "interests", "education", "activities", "hobbies"];
      const count = areas.filter((a) => policyEn.toLowerCase().includes(a)).length;
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it("requires exactly one question per turn", () => {
      expect(policyEn).toMatch(/one\s*question\s*per\s*turn/i);
    });

    it("hard cap at exchange 6", () => {
      expect(policyEn).toMatch(/exchange.*6|6.*exchange/i);
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

    it("allows entering Phase C early with good signal", () => {
      expect(policyEn).toMatch(/done\s*early|user\s*seems\s*done|earlier.*phase\s*c|good\s*signal/is);
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

describe("legacy onboardingPolicy() via getSystemPromptText('onboarding')", () => {
  const legacyPrompt = getSystemPromptText("onboarding", "en");

  it("contains cluster approach guidance", () => {
    expect(legacyPrompt).toMatch(/topic.*cluster|cluster.*topic|~2\s*exchange/i);
  });

  it("does NOT contain old 'Cover BREADTH first' directive", () => {
    expect(legacyPrompt).not.toMatch(/Cover BREADTH first.*before going deep/i);
  });

  it("does NOT use old '~5 exchanges' trigger for generate_page", () => {
    expect(legacyPrompt).not.toMatch(/~5\s*exchanges.*call.*generate_page|~5\s*exchanges.*suggest building/i);
  });

  it("contains bridge sentence guidance", () => {
    expect(legacyPrompt).toMatch(/bridge.*sentence|fuori del lavoro/i);
  });

  it("contains unconditional gate (one attempt then generate) before generate_page", () => {
    expect(legacyPrompt).toMatch(/one.*attempt|one.*direct.*question|one.*attempt.*answered.*declined/i);
  });
});
