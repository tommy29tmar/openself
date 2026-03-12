/**
 * Tests for buildSystemPrompt composition.
 * Validates that the prompt includes all expected blocks in the right order,
 * including the new memory directives and turn management rules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all policy modules
vi.mock("@/lib/agent/policies/first-visit", () => ({
  firstVisitPolicy: vi.fn((lang: string) => `FIRST_VISIT_POLICY_${lang}`),
}));
vi.mock("@/lib/agent/policies/returning-no-page", () => ({
  returningNoPagePolicy: vi.fn((lang: string) => `RETURNING_NO_PAGE_${lang}`),
}));
vi.mock("@/lib/agent/policies/draft-ready", () => ({
  draftReadyPolicy: vi.fn((lang: string) => `DRAFT_READY_${lang}`),
}));
vi.mock("@/lib/agent/policies/active-fresh", () => ({
  activeFreshPolicy: vi.fn((lang: string) => `ACTIVE_FRESH_${lang}`),
}));
vi.mock("@/lib/agent/policies/active-stale", () => ({
  activeStalePolicy: vi.fn((lang: string, _days?: number | null) => `ACTIVE_STALE_${lang}`),
}));
vi.mock("@/lib/agent/policies/blocked", () => ({
  blockedPolicy: vi.fn((lang: string) => `BLOCKED_${lang}`),
}));
vi.mock("@/lib/agent/policies/situations", () => ({
  pendingProposalsDirective: vi.fn(
    (count: number, sections: string[]) =>
      `PROPOSALS: ${count} pending in [${sections.join(", ")}]`,
  ),
  thinSectionsDirective: vi.fn(
    (sections: string[]) => `THIN: [${sections.join(", ")}]`,
  ),
  staleFactsDirective: vi.fn(
    (facts: string[]) => `STALE: [${facts.join(", ")}]`,
  ),
  openConflictsDirective: vi.fn(
    (conflicts: string[]) => `CONFLICTS: [${conflicts.join(", ")}]`,
  ),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({
  memoryUsageDirectives: vi.fn(() => "MEMORY_USAGE_DIRECTIVES_BLOCK"),
}));
vi.mock("@/lib/agent/policies/turn-management", () => ({
  turnManagementRules: vi.fn(() => "TURN_MANAGEMENT_RULES_BLOCK"),
}));
vi.mock("@/lib/agent/policies/planning-protocol", () => ({
  planningProtocol: vi.fn(() => "PLANNING_PROTOCOL_BLOCK"),
}));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({
  undoAwarenessPolicy: vi.fn(() => "UNDO_AWARENESS_POLICY_BLOCK"),
}));
vi.mock("@/lib/agent/policies/shared-rules", () => ({
  sharedBehavioralRules: vi.fn(() => "SHARED_BEHAVIORAL_RULES_BLOCK"),
  IMMEDIATE_EXECUTION_RULE: "IMMEDIATE_EXECUTION_RULE_MOCK",
}));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";
import { planningProtocol } from "@/lib/agent/policies/planning-protocol";
import { undoAwarenessPolicy } from "@/lib/agent/policies/undo-awareness";

beforeEach(() => {
  vi.clearAllMocks();
});

const makeBootstrap = (overrides?: Partial<BootstrapPayload>): BootstrapPayload => ({
  journeyState: "first_visit",
  situations: [],
  expertiseLevel: "novice",
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  language: "en",
  conversationContext: null,
  archetype: "generalist",
  ...overrides,
});

describe("buildSystemPrompt", () => {
  describe("composition", () => {
    it("includes core charter block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("OpenSelf agent");
    });

    it("includes safety policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/privacy|safety/i);
    });

    it("includes tool policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("create_fact");
    });

    it("includes fact schema reference block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/fact.*schema|category/i);
    });

    it("includes output contract block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/output.*rule/i);
    });

    it("includes the journey policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("FIRST_VISIT_POLICY_en");
    });

    it("includes expertise calibration block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toMatch(/EXPERTISE\s*CALIBRATION|novice/i);
    });

    it("expertise calibration (novice) does NOT use CORE_CHARTER banned words as examples", () => {
      const result = buildSystemPrompt(makeBootstrap({ expertiseLevel: "novice" }));
      const bannedExamples = /acknowledgment.*(?:Capito!|Perfetto!)/i;
      expect(result).not.toMatch(bannedExamples);
      expect(result).toMatch(/Bene\.|Ricevuto\./);
    });

    it("includes turn management rules block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("TURN_MANAGEMENT_RULES_BLOCK");
    });

    it("includes memory usage directives block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("MEMORY_USAGE_DIRECTIVES_BLOCK");
    });

    it("includes shared behavioral rules block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("SHARED_BEHAVIORAL_RULES_BLOCK");
    });
  });

  describe("block ordering", () => {
    it("journey policy comes after output contract", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const outputIdx = result.indexOf("Output rules");
      const policyIdx = result.indexOf("FIRST_VISIT_POLICY_en");
      expect(outputIdx).toBeGreaterThan(-1);
      expect(policyIdx).toBeGreaterThan(outputIdx);
    });

    it("turn management comes after expertise calibration", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const expertiseIdx = result.indexOf("EXPERTISE CALIBRATION");
      const turnIdx = result.indexOf("TURN_MANAGEMENT_RULES_BLOCK");
      expect(expertiseIdx).toBeGreaterThan(-1);
      expect(turnIdx).toBeGreaterThan(expertiseIdx);
    });

    it("shared behavioral rules come after turn management", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const turnIdx = result.indexOf("TURN_MANAGEMENT_RULES_BLOCK");
      const sharedIdx = result.indexOf("SHARED_BEHAVIORAL_RULES_BLOCK");
      expect(turnIdx).toBeGreaterThan(-1);
      expect(sharedIdx).toBeGreaterThan(turnIdx);
    });

    it("shared behavioral rules come before memory directives", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const sharedIdx = result.indexOf("SHARED_BEHAVIORAL_RULES_BLOCK");
      const memoryIdx = result.indexOf("MEMORY_USAGE_DIRECTIVES_BLOCK");
      expect(sharedIdx).toBeGreaterThan(-1);
      expect(memoryIdx).toBeGreaterThan(sharedIdx);
    });
  });

  describe("situation directives", () => {
    it("omits situation directives when no situations are active", () => {
      const result = buildSystemPrompt(makeBootstrap({ situations: [] }));
      expect(result).not.toContain("SITUATION DIRECTIVES:");
    });

    it("includes situation directives when situations are active", () => {
      const result = buildSystemPrompt(
        makeBootstrap({
          journeyState: "active_stale",
          situations: ["has_thin_sections"],
          thinSections: ["skills", "projects"],
        }),
      );
      expect(result).toContain("THIN:");
    });
  });

  describe("journey state routing", () => {
    it("routes first_visit to firstVisitPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "first_visit" }));
      expect(result).toContain("FIRST_VISIT_POLICY_en");
    });

    it("routes returning_no_page to returningNoPagePolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "returning_no_page" }));
      expect(result).toContain("RETURNING_NO_PAGE_en");
    });

    it("routes draft_ready to draftReadyPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "draft_ready" }));
      expect(result).toContain("DRAFT_READY_en");
    });

    it("routes active_fresh to activeFreshPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "active_fresh" }));
      expect(result).toContain("ACTIVE_FRESH_en");
    });

    it("routes active_stale to activeStalePolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "active_stale" }));
      expect(result).toContain("ACTIVE_STALE_en");
    });

    it("routes blocked to blockedPolicy", () => {
      const result = buildSystemPrompt(makeBootstrap({ journeyState: "blocked" }));
      expect(result).toContain("BLOCKED_en");
    });

    it("passes lastSeenDaysAgo to activeStalePolicy", async () => {
      const { activeStalePolicy: mockFn } = await import("@/lib/agent/policies/active-stale");
      vi.mocked(mockFn).mockClear();
      buildSystemPrompt(makeBootstrap({ journeyState: "active_stale", lastSeenDaysAgo: 12 }));
      expect(mockFn).toHaveBeenCalledWith("en", 12);
    });
  });

  describe("minimal schema variants", () => {
    it("uses edit-oriented minimal schema for active_fresh", () => {
      const result = buildSystemPrompt(
        makeBootstrap({ journeyState: "active_fresh" }),
        { schemaMode: "minimal" },
      );
      expect(result).toContain("EDIT WORKFLOW (quick updates):");
      expect(result).toContain('search_facts({ query: "..." })');
      expect(result).toContain("create_fact({ category, key, value })");
      expect(result).toContain("Facts are immutable — no updates");
      expect(result).not.toContain("After exploring 2-3 topic areas beyond name + role");
    });

    it("uses onboarding minimal schema for first_visit", () => {
      const result = buildSystemPrompt(
        makeBootstrap({ journeyState: "first_visit" }),
        { schemaMode: "minimal" },
      );
      expect(result).toContain("After exploring 2-3 topic areas beyond name + role");
      expect(result).not.toContain("EDIT WORKFLOW (quick updates):");
    });
  });

  describe("language passthrough", () => {
    it("passes language to journey policy", () => {
      const result = buildSystemPrompt(makeBootstrap({ language: "it" }));
      expect(result).toContain("FIRST_VISIT_POLICY_it");
    });
  });

  describe("planning protocol and undo awareness", () => {
    it("includes planning protocol block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("PLANNING_PROTOCOL_BLOCK");
      expect(planningProtocol).toHaveBeenCalled();
    });

    it("includes undo awareness policy block", () => {
      const result = buildSystemPrompt(makeBootstrap());
      expect(result).toContain("UNDO_AWARENESS_POLICY_BLOCK");
      expect(undoAwarenessPolicy).toHaveBeenCalled();
    });

    it("places planning protocol after memory directives", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const memIdx = result.indexOf("MEMORY_USAGE_DIRECTIVES_BLOCK");
      const planIdx = result.indexOf("PLANNING_PROTOCOL_BLOCK");
      expect(memIdx).toBeGreaterThan(-1);
      expect(planIdx).toBeGreaterThan(memIdx);
    });

    it("places undo awareness after planning protocol", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const planIdx = result.indexOf("PLANNING_PROTOCOL_BLOCK");
      const undoIdx = result.indexOf("UNDO_AWARENESS_POLICY_BLOCK");
      expect(planIdx).toBeGreaterThan(-1);
      expect(undoIdx).toBeGreaterThan(planIdx);
    });

    it("composition has 13 blocks without situation directives", () => {
      const result = buildSystemPrompt(makeBootstrap());
      const parts = result.split("\n\n---\n\n");
      // [CORE_CHARTER, SAFETY, TOOL, FACT_SCHEMA, DATA_MODEL, OUTPUT,
      //  journeyPolicy, expertiseCalibration, turnManagement,
      //  sharedBehavioralRules, memoryDirectives, planningProtocol, undoAwareness]
      expect(parts.length).toBe(13);
    });

    it("composition has 14 blocks with situation directives", () => {
      const result = buildSystemPrompt(
        makeBootstrap({
          journeyState: "active_stale",
          situations: ["has_thin_sections"],
          thinSections: ["skills", "projects"],
        }),
      );
      const parts = result.split("\n\n---\n\n");
      // [CORE_CHARTER, SAFETY, TOOL, FACT_SCHEMA, DATA_MODEL, OUTPUT,
      //  journeyPolicy, situationDirectives, expertiseCalibration,
      //  turnManagement, sharedBehavioralRules, memoryDirectives, planningProtocol, undoAwareness]
      expect(parts.length).toBe(14);
    });
  });
});
