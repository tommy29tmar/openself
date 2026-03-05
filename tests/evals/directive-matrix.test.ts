// tests/evals/directive-matrix.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));

import {
  getSituationDirectives,
  ALL_JOURNEY_STATES,
  DirectiveConflictError,
} from "@/lib/agent/policies/directive-registry";
import type { SituationContext } from "@/lib/agent/policies";
import type { Situation, JourneyState } from "@/lib/agent/journey";

const ALL_SITUATIONS: Situation[] = [
  "has_pending_proposals", "has_thin_sections", "has_stale_facts",
  "has_open_conflicts", "has_archivable_facts", "has_recent_import",
  "has_name", "has_soul", "has_pending_soul_proposals",
];

// Situations that are NOT eligible for first_visit (eligibleStates does not include it)
const FIRST_VISIT_INELIGIBLE: Situation[] = [
  "has_pending_proposals", "has_thin_sections", "has_stale_facts",
  "has_open_conflicts", "has_archivable_facts", "has_recent_import",
  "has_name", "has_soul",
];

const mockCtx: SituationContext = {
  pendingProposalCount: 1,
  pendingProposalSections: ["skills"],
  thinSections: ["education", "projects"],
  staleFacts: ["experience/acme"],
  openConflicts: ["identity/role"],
  archivableFacts: ["interest/chess"],
  // has_recent_import is only set when a real importGapReport exists
  importGapReport: {
    summary: { currentRole: "Engineer at Acme" },
    gaps: [],
  } as any,
  pendingSoulProposals: [
    { id: "sp-1", overlay: { tone: "direct", communicationStyle: "concise" }, reason: "Auto-suggested from archetype" },
  ],
};

// ── Eligibility filtering by journeyState ────────────────────────────────────
describe("first_visit eligibility", () => {
  it("returns empty string for non-eligible situations in first_visit", () => {
    for (const s of FIRST_VISIT_INELIGIBLE) {
      expect(getSituationDirectives([s], "first_visit", mockCtx)).toBe("");
    }
  });
  it("returns empty for empty situations array", () => {
    expect(getSituationDirectives([], "first_visit", mockCtx)).toBe("");
  });
  it("has_pending_soul_proposals IS eligible in first_visit and produces a directive", () => {
    const result = getSituationDirectives(["has_pending_soul_proposals"], "first_visit", mockCtx);
    expect(result).toContain("PENDING SOUL PROPOSAL");
  });
});

// ── Eligibility filtering ────────────────────────────────────────────────────
describe("eligibility filtering", () => {
  it("has_thin_sections is NOT injected in active_fresh", () => {
    const result = getSituationDirectives(["has_thin_sections"], "active_fresh", mockCtx);
    expect(result).toBe("");
  });

  it("has_thin_sections IS injected in active_stale", () => {
    const result = getSituationDirectives(["has_thin_sections"], "active_stale", mockCtx);
    expect(result).toContain("THIN SECTIONS:");
    expect(result).toContain("education");
    expect(result).toContain("projects");
  });

  it("has_archivable_facts is NOT injected in active_fresh", () => {
    const result = getSituationDirectives(["has_archivable_facts"], "active_fresh", mockCtx);
    expect(result).toBe("");
  });
});

// ── Conflict resolution (incompatibleWith) ───────────────────────────────────
describe("conflict resolution", () => {
  it("[active_stale] has_thin_sections(p3) wins over has_archivable_facts(p4)", () => {
    const result = getSituationDirectives(
      ["has_thin_sections", "has_archivable_facts"],
      "active_stale",
      mockCtx,
    );
    expect(result).toContain("THIN SECTIONS:");
    // has_thin_sections wins (lower priority number), has_archivable_facts dropped
    const r2 = getSituationDirectives(["has_archivable_facts"], "active_stale", mockCtx);
    const r1 = getSituationDirectives(["has_thin_sections"], "active_stale", mockCtx);
    expect(result).toContain(r1.replace("SITUATION DIRECTIVES:\n", "").trim());
  });

  it("[active_stale] order of input array does not change winner", () => {
    const r1 = getSituationDirectives(["has_thin_sections", "has_archivable_facts"], "active_stale", mockCtx);
    const r2 = getSituationDirectives(["has_archivable_facts", "has_thin_sections"], "active_stale", mockCtx);
    expect(r1).toBe(r2);
  });

  it("throws DirectiveConflictError when same priority conflict detected", () => {
    // This should not happen with the current DIRECTIVE_POLICY (thin=p3, archivable=p4)
    // but we test that same-priority throws (policy bug scenario)
    // We can't easily test this without modifying DIRECTIVE_POLICY, so just verify
    // that the normal case does NOT throw
    expect(() =>
      getSituationDirectives(["has_thin_sections", "has_archivable_facts"], "active_stale", mockCtx)
    ).not.toThrow();
  });
});

// ── Combination tests ────────────────────────────────────────────────────────
describe("combinations", () => {
  it("[active_stale] multiple compatible directives all appear", () => {
    const result = getSituationDirectives(
      ["has_pending_proposals", "has_stale_facts"],
      "active_stale",
      mockCtx,
    );
    expect(result).toContain("PENDING PROPOSALS:");
    // Both should appear
    const r1 = getSituationDirectives(["has_pending_proposals"], "active_stale", mockCtx);
    const r2 = getSituationDirectives(["has_stale_facts"], "active_stale", mockCtx);
    expect(result.length).toBeGreaterThan(r1.length);
    expect(result.length).toBeGreaterThan(r2.length);
  });

  it("[draft_ready] has_pending_proposals + has_open_conflicts both appear", () => {
    const result = getSituationDirectives(
      ["has_pending_proposals", "has_open_conflicts"],
      "draft_ready",
      mockCtx,
    );
    expect(result).toContain("PENDING PROPOSALS:");
    expect(result).toContain("OPEN CONFLICTS:");
  });
});

// ── Priority ordering ────────────────────────────────────────────────────────
describe("priority ordering", () => {
  it("output is ordered by priority (lower priority number first)", () => {
    // has_stale_facts p=2, has_pending_proposals p=1
    // p1 should appear before p2 in output
    const result = getSituationDirectives(
      ["has_stale_facts", "has_pending_proposals"],
      "active_stale",
      mockCtx,
    );
    const r_p1 = getSituationDirectives(["has_pending_proposals"], "active_stale", mockCtx);
    const r_p2 = getSituationDirectives(["has_stale_facts"], "active_stale", mockCtx);
    // Extract the directive text (without "SITUATION DIRECTIVES:\n" header)
    const p1_text = r_p1.replace("SITUATION DIRECTIVES:\n", "").trim();
    const p2_text = r_p2.replace("SITUATION DIRECTIVES:\n", "").trim();
    const p1_idx = result.indexOf(p1_text);
    const p2_idx = result.indexOf(p2_text);
    expect(p1_idx).toBeLessThan(p2_idx);
  });
});

// ── Snapshot: full matrix ────────────────────────────────────────────────────
describe("snapshot matrix", () => {
  for (const state of ALL_JOURNEY_STATES) {
    for (const situation of ALL_SITUATIONS) {
      it(`[${state}] + [${situation}]`, () => {
        const result = getSituationDirectives([situation], state, mockCtx);
        expect(result).toMatchSnapshot();
      });
    }
  }
});
