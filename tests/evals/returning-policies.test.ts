/**
 * Tests for the 5 returning-user policies (Sprint 3).
 * Each policy is tested for:
 * - Required structural elements (mode header, language embedding)
 * - Key behavioral directives (what the agent MUST do)
 * - Banned patterns (what the agent must NEVER do)
 * - Tool references (which tools the policy mentions)
 */
import { describe, it, expect } from "vitest";
import { returningNoPagePolicy } from "@/lib/agent/policies/returning-no-page";
import { draftReadyPolicy } from "@/lib/agent/policies/draft-ready";
import { activeFreshPolicy } from "@/lib/agent/policies/active-fresh";
import { activeStalePolicy } from "@/lib/agent/policies/active-stale";
import { blockedPolicy } from "@/lib/agent/policies/blocked";

// ---------------------------------------------------------------------------
// Shared banned phrases — all policies must forbid these
// ---------------------------------------------------------------------------
const UNIVERSAL_BANNED_PHRASES = [
  "let me know if you need anything",
];

// ---------------------------------------------------------------------------
// returningNoPagePolicy
// ---------------------------------------------------------------------------
describe("returningNoPagePolicy", () => {
  const policyEn = returningNoPagePolicy("en");
  const policyIt = returningNoPagePolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*RETURNING/i);
    });

    it("embeds language parameter (en)", () => {
      expect(policyEn).toContain("en");
    });

    it("embeds language parameter (it)", () => {
      expect(policyIt).toContain("it");
    });
  });

  describe("continuity behavior", () => {
    it("instructs to use name from facts", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name/i);
    });

    it("instructs to summarize known info", () => {
      expect(policyEn).toMatch(/summarize|last time.*told me/i);
    });

    it("instructs to ask what changed", () => {
      expect(policyEn).toMatch(/what\s*(has\s*)?changed|anything\s*new/i);
    });

    it("forbids re-asking known information", () => {
      expect(policyEn).toMatch(/never.*re-?ask|never.*ask.*name.*again/i);
    });
  });

  describe("tools", () => {
    it("references search_facts for checking existing knowledge", () => {
      expect(policyEn).toContain("search_facts");
    });

    it("references generate_page", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("references request_publish", () => {
      expect(policyEn).toContain("request_publish");
    });

    it("references delete+create for corrections", () => {
      expect(policyEn).toContain("delete");
      expect(policyEn).toContain("create");
    });
  });

  describe("fast-path to page", () => {
    it("mentions fast path or early page generation for 5+ facts", () => {
      expect(policyEn).toMatch(/5\+?\s*facts|facts.*5|adequate|fast.?path/i);
    });

    it("instructs to propose publishing after generating", () => {
      expect(policyEn).toMatch(/after.*generat.*publish|immediately.*publish/i);
    });
  });

  describe("banned patterns (delegated to shared-rules)", () => {
    it("does NOT duplicate passive closing bans locally", () => {
      expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
    });

    it("bans fresh interview (policy-specific)", () => {
      expect(policyEn).toMatch(/never.*fresh\s*interview|never.*start.*interview/i);
    });
  });

  it("includes immediate execution directive via IMMEDIATE_EXECUTION_RULE", () => {
    expect(policyEn).toMatch(/concrete.*edit.*this turn|execute.*tool.*this turn|do not.*respond.*only.*plan/i);
  });
});

// ---------------------------------------------------------------------------
// draftReadyPolicy
// ---------------------------------------------------------------------------
describe("draftReadyPolicy", () => {
  const policyEn = draftReadyPolicy("en");
  const policyIt = draftReadyPolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*DRAFT/i);
    });

    it("embeds language parameter (en)", () => {
      expect(policyEn).toContain("en");
    });

    it("embeds language parameter (it)", () => {
      expect(policyIt).toContain("it");
    });
  });

  describe("review-first behavior", () => {
    it("instructs to lead with the page preview", () => {
      expect(policyEn).toMatch(/preview|take a look|look.*right/i);
    });

    it("instructs to use name from facts", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name|never.*ask.*name/i);
    });

    it("asks if changes needed or ready to publish", () => {
      expect(policyEn).toMatch(/change.*publish|want.*change|ready.*publish/i);
    });
  });

  describe("publish flow", () => {
    it("references request_publish", () => {
      expect(policyEn).toContain("request_publish");
    });

    it("instructs to suggest username", () => {
      expect(policyEn).toMatch(/suggest.*username/i);
    });

    it("instructs to use existing username if authenticated", () => {
      expect(policyEn).toMatch(/authenticated.*existing\s*username|existing\s*username.*authenticated/i);
    });
  });

  describe("continued enrichment behavior", () => {
    it("says new profile information in the same conversation must still be saved", () => {
      expect(policyEn).toMatch(/adding new profile information.*save it and keep moving|do not ignore new information/i);
    });

    it("says regenerate immediately when the user explicitly asks", () => {
      expect(policyEn).toMatch(/explicitly asks to regenerate|rebuild immediately/i);
    });

    it("requires executing concrete edits in the same turn", () => {
      expect(policyEn).toMatch(/concrete.*edit.*this turn|execute.*tool.*this turn|do not.*respond.*only.*plan/i);
    });
  });

  describe("banned patterns (delegated to shared-rules)", () => {
    it("does NOT duplicate passive closing bans locally", () => {
      expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
    });

    it("bans reopening the interview (policy-specific)", () => {
      expect(policyEn).toMatch(/not.*interview|not.*exploratory|not.*ask.*what.*do/i);
    });

    it("bans proactive section suggestions (policy-specific)", () => {
      expect(policyEn).toMatch(/not.*add.*section.*proactiv|not.*offer.*add/i);
    });
  });
});

// ---------------------------------------------------------------------------
// activeFreshPolicy
// ---------------------------------------------------------------------------
describe("activeFreshPolicy", () => {
  const policyEn = activeFreshPolicy("en");
  const policyIt = activeFreshPolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*ACTIVE/i);
    });

    it("mentions 7 days freshness window", () => {
      expect(policyEn).toMatch(/7\s*days?|within.*last.*7/i);
    });

    it("embeds language parameter", () => {
      expect(policyEn).toContain("en");
      expect(policyIt).toContain("it");
    });
  });

  describe("operational behavior", () => {
    it("instructs to be brief", () => {
      expect(policyEn).toMatch(/brief|concise|short/i);
    });

    it("instructs to ask what to update", () => {
      expect(policyEn).toMatch(/what.*update|what.*change/i);
    });

    it("instructs to use name from facts", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name/i);
    });

    it("does NOT duplicate response length calibration (canonical source is CORE_CHARTER)", () => {
      expect(policyEn).not.toMatch(/proportional.*response.*length/i);
    });
  });

  describe("tools", () => {
    it("references delete+create for corrections", () => {
      expect(policyEn).toContain("delete_fact");
      expect(policyEn).toContain("create_fact");
    });

    it("references create_fact", () => {
      expect(policyEn).toContain("create_fact");
    });

    it("references delete_fact", () => {
      expect(policyEn).toContain("delete_fact");
    });

    it("references generate_page", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("references search_facts", () => {
      expect(policyEn).toContain("search_facts");
    });

    it("requires executing concrete edits in the same turn", () => {
      expect(policyEn).toMatch(/concrete.*edit.*this turn|execute.*tool.*this turn|do not.*respond.*only.*plan/i);
    });
  });

  describe("publish flow", () => {
    it("instructs to use existing username if authenticated", () => {
      expect(policyEn).toMatch(/existing\s*username|do\s*not\s*ask.*username/i);
    });

    it("mentions navigation bar as publish alternative", () => {
      expect(policyEn).toMatch(/navigation\s*bar|publish.*button/i);
    });
  });

  describe("banned patterns (delegated to shared-rules)", () => {
    it("does NOT duplicate passive closing bans locally", () => {
      expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
    });

    it("bans reopening exploration (policy-specific)", () => {
      expect(policyEn).toMatch(/not.*reopen.*explor|not.*ask.*tell.*more/i);
    });
  });
});

// ---------------------------------------------------------------------------
// activeStalePolicy
// ---------------------------------------------------------------------------
describe("activeStalePolicy", () => {
  const policyEn = activeStalePolicy("en");
  const policyIt = activeStalePolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(200);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*ACTIVE.*STALE/i);
    });

    it("mentions 7+ days staleness window", () => {
      expect(policyEn).toMatch(/7\s*days?|over\s*7|hasn't\s*been\s*updated/i);
    });

    it("embeds language parameter", () => {
      expect(policyEn).toContain("en");
      expect(policyIt).toContain("it");
    });
  });

  describe("re-engagement behavior", () => {
    it("instructs to greet by name", () => {
      expect(policyEn).toMatch(/name\s*from\s*facts|identity\/name|never.*ask.*name/i);
    });

    it("MUST acknowledge time gap in greeting (not optional)", () => {
      expect(policyEn).toMatch(/MUST.*acknowledge|MUST.*mention.*time/i);
      expect(policyEn).toMatch(/been\s*a\s*while|it's\s*been|time.*passed/i);
    });

    it("instructs to ask what changed", () => {
      expect(policyEn).toMatch(/what's\s*new|what.*changed|any\s*new/i);
    });

    it("references specific areas to check (work, projects, interests)", () => {
      expect(policyEn).toMatch(/work|projects?|interests?/i);
    });
  });

  describe("targeted updates", () => {
    it("instructs to focus on what changed, not what stayed the same", () => {
      expect(policyEn).toMatch(/focus.*changed|not.*re-?explore|what's\s*changed/i);
    });

    it("references delete+create for corrections", () => {
      expect(policyEn).toContain("delete");
      expect(policyEn).toContain("create");
    });

    it("references create_fact for new info", () => {
      expect(policyEn).toContain("create_fact");
    });

    it("references delete_fact for removals", () => {
      expect(policyEn).toContain("delete_fact");
    });

    it("does NOT duplicate max exchanges rule locally (now in turn-management R2)", () => {
      expect(policyEn).not.toMatch(/max\s*6\s*exchange.*rule/i);
    });

    it("requires executing concrete edits in the same turn", () => {
      expect(policyEn).toMatch(/concrete.*edit.*this turn|execute.*tool.*this turn|do not.*respond.*only.*plan/i);
    });
  });

  describe("publish flow", () => {
    it("references generate_page", () => {
      expect(policyEn).toContain("generate_page");
    });

    it("instructs to use existing username if authenticated", () => {
      expect(policyEn).toMatch(/existing\s*username|do\s*not\s*ask.*username/i);
    });
  });

  describe("banned patterns (delegated to shared-rules)", () => {
    it("does NOT duplicate passive closing bans locally", () => {
      expect(policyEn).not.toMatch(/never.*let me know if you need anything/i);
    });

    it("forbids re-asking known facts (policy-specific)", () => {
      expect(policyEn).toMatch(/never.*re-?ask|never.*ask.*name/i);
    });
  });
});

// ---------------------------------------------------------------------------
// blockedPolicy
// ---------------------------------------------------------------------------
describe("blockedPolicy", () => {
  const policyEn = blockedPolicy("en");
  const policyIt = blockedPolicy("it");

  describe("structure", () => {
    it("returns a non-empty string", () => {
      expect(typeof policyEn).toBe("string");
      expect(policyEn.length).toBeGreaterThan(100);
    });

    it("contains mode header", () => {
      expect(policyEn).toMatch(/MODE:.*BLOCKED/i);
    });

    it("embeds language parameter", () => {
      expect(policyEn).toContain("en");
      expect(policyIt).toContain("it");
    });
  });

  describe("quota block handling", () => {
    it("mentions message limit", () => {
      expect(policyEn).toMatch(/message\s*limit|quota/i);
    });

    it("mentions coming back tomorrow", () => {
      expect(policyEn).toMatch(/come\s*back\s*tomorrow/i);
    });

    it("mentions the Publish button for draft users", () => {
      expect(policyEn).toMatch(/publish.*button|publish.*page/i);
    });
  });

  describe("auth block handling", () => {
    it("mentions authentication requirement", () => {
      expect(policyEn).toMatch(/account|authentication|sign\s*up/i);
    });
  });

  describe("brevity enforcement", () => {
    it("enforces maximum 2 sentences", () => {
      expect(policyEn).toMatch(/2\s*sentences?|maximum.*2|one\s*sentence/i);
    });

    it("forbids asking questions", () => {
      expect(policyEn).toMatch(/not.*ask.*question|do\s*not\s*ask/i);
    });
  });

  describe("banned patterns", () => {
    it("bans offering further help (user cannot continue)", () => {
      expect(policyEn).toMatch(/not.*end.*offer.*help|not.*offer.*help.*further|cannot continue/i);
    });

    it("bans apologetic language", () => {
      expect(policyEn).toMatch(/not.*apologize|not.*unfortunately|not.*sorry/i);
    });

    it("bans vague 'try again later' phrasing", () => {
      expect(policyEn).toMatch(/never.*vague|specific.*tomorrow/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-policy invariants
// ---------------------------------------------------------------------------
describe("cross-policy invariants", () => {
  const allPolicies = [
    { name: "returningNoPage", fn: returningNoPagePolicy },
    { name: "draftReady", fn: draftReadyPolicy },
    { name: "activeFresh", fn: activeFreshPolicy },
    { name: "activeStale", fn: activeStalePolicy },
    { name: "blocked", fn: blockedPolicy },
  ];

  it("every policy produces distinct text", () => {
    const results = allPolicies.map((p) => p.fn("en"));
    const unique = new Set(results);
    expect(unique.size).toBe(allPolicies.length);
  });

  it("every policy embeds the language parameter", () => {
    for (const p of allPolicies) {
      expect(p.fn("fr")).toContain("fr");
      expect(p.fn("de")).toContain("de");
    }
  });

  it("every policy contains a MODE: header", () => {
    for (const p of allPolicies) {
      expect(p.fn("en")).toMatch(/^MODE:/m);
    }
  });

  it("no non-blocked policy asks fewer than 200 chars", () => {
    for (const p of allPolicies.filter((p) => p.name !== "blocked")) {
      expect(p.fn("en").length).toBeGreaterThan(200);
    }
  });
});
