/**
 * Tests for has_archivable_facts situation (Task 15).
 * Verifies relevance-based archival detection, safety floor,
 * recency factors, child count impact, and directive formatting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock DB-dependent modules BEFORE importing ---
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  },
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) })),
  },
}));
vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: vi.fn(() => []),
  getActiveFacts: vi.fn(() => []),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
  getPublishedUsername: vi.fn(() => null),
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));
vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({ getPendingProposals: vi.fn(() => []) })),
}));
vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((f: any[]) => f),
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {},
}));

import { detectSituations, recencyFactor } from "@/lib/agent/journey";
import type { FactRow } from "@/lib/services/kb-service";
import { archivableFactsDirective } from "@/lib/agent/policies/situations";
import { getSituationDirectives, type SituationContext } from "@/lib/agent/policies/index";

// --- Helpers ---

function makeFact(overrides: Partial<FactRow> & { id: string; category: string; key: string }): FactRow {
  return {
    id: overrides.id,
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1,
    visibility: overrides.visibility ?? "public",
    sortOrder: overrides.sortOrder ?? null,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01",
    updatedAt: overrides.updatedAt ?? "2026-01-01",
  } as FactRow;
}

/** Create a date string N days ago from now. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// recencyFactor
// ---------------------------------------------------------------------------

describe("recencyFactor", () => {
  it("returns 1.0 for facts updated <30 days ago", () => {
    expect(recencyFactor(daysAgo(5))).toBe(1.0);
    expect(recencyFactor(daysAgo(29))).toBe(1.0);
  });

  it("returns 0.7 for facts updated 30-89 days ago", () => {
    expect(recencyFactor(daysAgo(30))).toBe(0.7);
    expect(recencyFactor(daysAgo(89))).toBe(0.7);
  });

  it("returns 0.4 for facts updated 90-179 days ago", () => {
    expect(recencyFactor(daysAgo(90))).toBe(0.4);
    expect(recencyFactor(daysAgo(179))).toBe(0.4);
  });

  it("returns 0.2 for facts updated >180 days ago", () => {
    expect(recencyFactor(daysAgo(180))).toBe(0.2);
    expect(recencyFactor(daysAgo(365))).toBe(0.2);
  });

  it("returns 0.2 for null updatedAt", () => {
    expect(recencyFactor(null)).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// has_archivable_facts detection
// ---------------------------------------------------------------------------

describe("has_archivable_facts situation", () => {
  it("detects facts with relevance below 0.3", () => {
    // confidence 0.5, updatedAt 200 days ago (recency 0.2), no children
    // relevance = 0.5 × 0.2 × 1.0 = 0.1 → archivable
    const facts = [
      // 6 recent active facts (not archivable)
      ...Array.from({ length: 6 }, (_, i) =>
        makeFact({ id: `recent-${i}`, category: "skill", key: `s${i}`, updatedAt: daysAgo(5), confidence: 1 }),
      ),
      // 1 old, low-confidence fact → archivable
      makeFact({ id: "old-1", category: "experience", key: "old-job", updatedAt: daysAgo(200), confidence: 0.5 }),
    ];

    const situations = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
    });

    expect(situations).toContain("has_archivable_facts");
  });

  it("does not flag if fewer than 6 active facts (safety floor)", () => {
    // 5 active facts total — even if some are archivable, don't flag
    const facts = [
      makeFact({ id: "f1", category: "skill", key: "s1", updatedAt: daysAgo(5) }),
      makeFact({ id: "f2", category: "skill", key: "s2", updatedAt: daysAgo(5) }),
      makeFact({ id: "f3", category: "skill", key: "s3", updatedAt: daysAgo(5) }),
      makeFact({ id: "f4", category: "skill", key: "s4", updatedAt: daysAgo(5) }),
      makeFact({ id: "f5", category: "experience", key: "old", updatedAt: daysAgo(200), confidence: 0.5 }),
    ];

    const situations = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
    });

    expect(situations).not.toContain("has_archivable_facts");
  });

  it("does not suggest archival if it would leave fewer than 5 active facts", () => {
    // 6 active facts, 2 archivable → 4 remaining < 5 → should NOT flag
    const facts = [
      makeFact({ id: "f1", category: "skill", key: "s1", updatedAt: daysAgo(5) }),
      makeFact({ id: "f2", category: "skill", key: "s2", updatedAt: daysAgo(5) }),
      makeFact({ id: "f3", category: "skill", key: "s3", updatedAt: daysAgo(5) }),
      makeFact({ id: "f4", category: "skill", key: "s4", updatedAt: daysAgo(5) }),
      makeFact({ id: "old-1", category: "experience", key: "old1", updatedAt: daysAgo(200), confidence: 0.5 }),
      makeFact({ id: "old-2", category: "experience", key: "old2", updatedAt: daysAgo(200), confidence: 0.5 }),
    ];

    const situations = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
    });

    expect(situations).not.toContain("has_archivable_facts");
  });

  it("includes child count in relevance calculation", () => {
    // Fact with confidence 0.5, updatedAt 200 days ago (recency 0.2), 3 children
    // relevance = 0.5 × 0.2 × (1 + 3 × 0.1) = 0.5 × 0.2 × 1.3 = 0.13 → still archivable
    // But with 10 children: 0.5 × 0.2 × (1 + 10 × 0.1) = 0.5 × 0.2 × 2.0 = 0.2 → still archivable
    // With 15 children: 0.5 × 0.2 × (1 + 15 × 0.1) = 0.5 × 0.2 × 2.5 = 0.25 → still archivable
    // With 20 children: 0.5 × 0.2 × (1 + 20 × 0.1) = 0.5 × 0.2 × 3.0 = 0.3 → NOT archivable

    const facts = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeFact({ id: `recent-${i}`, category: "skill", key: `s${i}`, updatedAt: daysAgo(5) }),
      ),
      makeFact({ id: "parent-1", category: "experience", key: "old-job", updatedAt: daysAgo(200), confidence: 0.5 }),
    ];

    // With 20 children → relevance = 0.3 → NOT archivable
    const childCountMap20 = new Map([["parent-1", 20]]);
    const situations20 = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
      childCountMap: childCountMap20,
    });
    expect(situations20).not.toContain("has_archivable_facts");

    // With 3 children → relevance = 0.13 → archivable
    const childCountMap3 = new Map([["parent-1", 3]]);
    const situations3 = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
      childCountMap: childCountMap3,
    });
    expect(situations3).toContain("has_archivable_facts");
  });

  it("ignores archived facts when counting active facts", () => {
    // 6 total facts but 1 is archived → only 5 active → below safety floor, skip
    const facts = [
      makeFact({ id: "f1", category: "skill", key: "s1", updatedAt: daysAgo(5) }),
      makeFact({ id: "f2", category: "skill", key: "s2", updatedAt: daysAgo(5) }),
      makeFact({ id: "f3", category: "skill", key: "s3", updatedAt: daysAgo(5) }),
      makeFact({ id: "f4", category: "skill", key: "s4", updatedAt: daysAgo(5) }),
      makeFact({ id: "f5", category: "skill", key: "s5", updatedAt: daysAgo(5) }),
      makeFact({ id: "archived", category: "experience", key: "old", updatedAt: daysAgo(200), archivedAt: "2026-01-01" }),
    ];

    const situations = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
    });

    expect(situations).not.toContain("has_archivable_facts");
  });

  it("does not flag when all facts have high relevance", () => {
    // All recent, high confidence → all relevance > 0.3
    const facts = Array.from({ length: 10 }, (_, i) =>
      makeFact({ id: `f${i}`, category: "skill", key: `s${i}`, updatedAt: daysAgo(5), confidence: 1 }),
    );

    const situations = detectSituations(facts, "owner-1", {
      pendingProposalCount: 0,
      openConflicts: [],
      publishableFacts: [],
    });

    expect(situations).not.toContain("has_archivable_facts");
  });
});

// ---------------------------------------------------------------------------
// archivableFactsDirective
// ---------------------------------------------------------------------------

describe("archivableFactsDirective", () => {
  it("formats archivable facts for system prompt", () => {
    const result = archivableFactsDirective(["experience/old-job", "skill/legacy-tool"]);
    expect(result).toContain("ARCHIVABLE FACTS:");
    expect(result).toContain("experience/old-job");
    expect(result).toContain("skill/legacy-tool");
    expect(result).toContain("archive_fact");
  });

  it("returns empty string for no archivable facts", () => {
    expect(archivableFactsDirective([])).toBe("");
  });

  it("limits to 5 facts with more note", () => {
    const many = Array.from({ length: 8 }, (_, i) => `skill/s${i}`);
    const result = archivableFactsDirective(many);
    expect(result).toContain("(and 3 more)");
    // Should only list 5
    expect(result).toContain("skill/s0");
    expect(result).toContain("skill/s4");
    expect(result).not.toContain("skill/s5");
  });
});

// ---------------------------------------------------------------------------
// getSituationDirectives integration
// ---------------------------------------------------------------------------

describe("getSituationDirectives with archivable facts", () => {
  it("includes archivable facts directive when situation is active", () => {
    const ctx: SituationContext = {
      pendingProposalCount: 0,
      pendingProposalSections: [],
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      archivableFacts: ["experience/old-job", "skill/legacy"],
    };
    const result = getSituationDirectives(["has_archivable_facts"], ctx);
    expect(result).toContain("ARCHIVABLE FACTS:");
    expect(result).toContain("experience/old-job");
  });

  it("skips archivable directive when situation flag set but no facts", () => {
    const ctx: SituationContext = {
      pendingProposalCount: 0,
      pendingProposalSections: [],
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      archivableFacts: [],
    };
    const result = getSituationDirectives(["has_archivable_facts"], ctx);
    expect(result).toBe("");
  });
});
