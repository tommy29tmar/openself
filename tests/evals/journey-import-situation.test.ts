import { describe, it, expect, vi } from "vitest";

// --- Mock all service dependencies before importing (same pattern as journey-state-detection.test.ts) ---

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
  },
  db: {},
}));

vi.mock("@/lib/services/kb-service", () => ({
  countFacts: vi.fn(() => 0),
  getActiveFacts: vi.fn(() => []),
}));

vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
  getPublishedUsername: vi.fn(() => null),
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
  proposeSoulChange: vi.fn(),
  getPendingProposals: vi.fn(() => []),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));

vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({
    getPendingProposals: vi.fn(() => []),
  })),
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: unknown[]) => facts),
}));

vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
    projects: ["project"],
  },
}));

import { detectSituations } from "@/lib/agent/journey";
import type { FactRow } from "@/lib/services/kb-service";

function makeFact(overrides: Partial<FactRow> & { category: string; key: string }): FactRow {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    value: {},
    source: "connector",
    confidence: 1,
    visibility: "public",
    sortOrder: null,
    parentFactId: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as FactRow;
}

describe("has_recent_import situation", () => {
  it("detects recent connector facts within 30 minutes", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" }, source: "connector", createdAt: recent }),
      makeFact({ category: "experience", key: "exp-1", value: { role: "Dev" }, source: "connector", createdAt: recent }),
    ];
    const situations = detectSituations(facts, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).toContain("has_recent_import");
  });

  it("does not flag old connector facts", () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" }, source: "connector", createdAt: old }),
    ];
    const situations = detectSituations(facts, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).not.toContain("has_recent_import");
  });

  it("does not flag non-connector facts", () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const facts = [
      makeFact({ category: "identity", key: "name", value: { name: "Test" }, source: "agent", createdAt: recent }),
    ];
    const situations = detectSituations(facts, "owner1", {
      pendingProposalCount: 0,
      openConflicts: [],
    });
    expect(situations).not.toContain("has_recent_import");
  });
});
