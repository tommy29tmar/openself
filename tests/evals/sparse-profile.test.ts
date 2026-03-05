// tests/evals/sparse-profile.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
  db: {},  // REQUIRED: journey.ts imports both sqlite and db
}));

import { sparseProfileDirective } from "@/lib/agent/policies/situations";
import { getSituationDirectives } from "@/lib/agent/policies/directive-registry";
import { SPARSE_PROFILE_FACT_THRESHOLD } from "@/lib/agent/thresholds";
import type { SituationContext } from "@/lib/agent/policies";

// Full SituationContext with all required fields
const mockCtx: SituationContext = {
  pendingProposalCount: 0,
  pendingProposalSections: [],
  thinSections: ["experience", "education", "skills"],
  staleFacts: [],
  openConflicts: [],
  archivableFacts: [],
  // importGapReport is optional — omit to simulate no recent import
  pendingSoulProposals: [],
};

// ---------------------------------------------------------------------------
// sparseProfileDirective text
// ---------------------------------------------------------------------------

describe("sparseProfileDirective text", () => {
  it("contains DATA COLLECTION OVERRIDE", () => {
    expect(sparseProfileDirective([])).toContain("DATA COLLECTION OVERRIDE");
  });

  it("embeds the threshold value", () => {
    expect(sparseProfileDirective([])).toContain(String(SPARSE_PROFILE_FACT_THRESHOLD));
  });

  it("lists provided thin sections", () => {
    const text = sparseProfileDirective(["experience", "education"]);
    expect(text).toContain("experience");
    expect(text).toContain("education");
  });

  it("falls back to default sections when thinSections is empty", () => {
    expect(sparseProfileDirective([])).toMatch(/experience|education|skills/);
  });

  it("explicitly forbids publish redirect", () => {
    expect(sparseProfileDirective([])).toMatch(/do not redirect.*publish/i);
  });

  it("explicitly forbids praising the profile", () => {
    expect(sparseProfileDirective([])).toMatch(/do not frame/i);
  });

  it("provides exception path for user insistence", () => {
    expect(sparseProfileDirective([])).toMatch(/exception/i);
  });
});

// ---------------------------------------------------------------------------
// has_sparse_profile directive eligibility
// ---------------------------------------------------------------------------

describe("has_sparse_profile directive eligibility", () => {
  // Eligible states (should fire): returning_no_page, draft_ready, active_fresh, active_stale
  // Ineligible states (should return ""): first_visit, blocked

  it("produces directive in returning_no_page", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "returning_no_page", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces directive in draft_ready", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "draft_ready", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces directive in active_fresh", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "active_fresh", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces directive in active_stale", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "active_stale", mockCtx))
      .toContain("DATA COLLECTION OVERRIDE");
  });

  it("produces NO directive in first_visit", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "first_visit", mockCtx)).toBe("");
  });

  it("produces NO directive in blocked", () => {
    expect(getSituationDirectives(["has_sparse_profile"], "blocked", mockCtx)).toBe("");
  });

  // ---------------------------------------------------------------------------
  // Incompatibility: sparse vs archivable_facts
  // ---------------------------------------------------------------------------

  it("has_sparse_profile wins over has_archivable_facts in active_stale (incompatible)", () => {
    const ctxWithArchivable: SituationContext = {
      ...mockCtx,
      archivableFacts: ["experience/old-job"],
    };
    const combined = getSituationDirectives(
      ["has_sparse_profile", "has_archivable_facts"],
      "active_stale",
      ctxWithArchivable,
    );

    expect(combined).toContain("DATA COLLECTION OVERRIDE");
    // Archivable-specific text must NOT appear (archivable dropped via incompatibility)
    expect(combined).not.toMatch(/archiv/i);
  });

  // ---------------------------------------------------------------------------
  // Incompatibility: sparse vs recent_import
  // ---------------------------------------------------------------------------

  it("has_sparse_profile wins over has_recent_import even when importGapReport is present", () => {
    // has_recent_import.build() returns "" when importGapReport is absent, so we provide one
    const ctxWithImport: SituationContext = {
      ...mockCtx,
      importGapReport: {
        summary: {
          currentRole: "Engineer",
          pastRoles: 1,
          educationCount: 1,
          languageCount: 0,
          skillCount: 2,
          certificationCount: 0,
        },
        gaps: [],
      },
    };

    const combined = getSituationDirectives(
      ["has_sparse_profile", "has_recent_import"],
      "active_stale",
      ctxWithImport,
    );
    expect(combined).toContain("DATA COLLECTION OVERRIDE");
    expect(combined).not.toMatch(/post-import/i);
  });

  // ---------------------------------------------------------------------------
  // Incompatibility: sparse vs thin_sections
  // ---------------------------------------------------------------------------

  it("has_sparse_profile wins over has_thin_sections in active_stale (incompatible)", () => {
    const ctxWithThinSections: SituationContext = {
      ...mockCtx,
      thinSections: ["experience", "education"],
    };
    const combined = getSituationDirectives(
      ["has_sparse_profile", "has_thin_sections"],
      "active_stale",
      ctxWithThinSections,
    );
    expect(combined).toContain("DATA COLLECTION OVERRIDE");
    // has_thin_sections directive text should not appear
    expect(combined).not.toMatch(/thin section/i);
  });

  // ---------------------------------------------------------------------------
  // Co-existence: sparse + pending_proposals (both fire simultaneously)
  // ---------------------------------------------------------------------------

  it("has_sparse_profile and has_pending_proposals co-exist (both fire, no incompatibility)", () => {
    const ctxWithProposals: SituationContext = {
      ...mockCtx,
      pendingProposalCount: 2,
      pendingProposalSections: ["experience"],
    };
    const result = getSituationDirectives(
      ["has_sparse_profile", "has_pending_proposals"],
      "active_stale",
      ctxWithProposals,
    );
    expect(result).toContain("DATA COLLECTION OVERRIDE");
    expect(result).toContain("PENDING PROPOSALS");
  });
});
