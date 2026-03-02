/**
 * Tests for Circuito A: Archetype → Soul auto-proposal.
 * Verifies that assembleBootstrapPayload proposes an initial soul profile
 * when conditions are met (non-generalist archetype, no soul, no pending proposals).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoist mock functions for tracking ---
const {
  mockGetActiveSoul,
  mockProposeSoulChange,
  mockGetPendingProposals,
  mockGetSessionMeta,
  mockMergeSessionMeta,
  mockCountFacts,
  mockGetAllFacts,
  mockHasAnyPublishedPage,
  mockGetDraft,
  mockGetPublishedUsername,
  mockGetOpenConflicts,
  mockCreateProposalService,
  mockClassifySectionRichness,
  mockFilterPublishableFacts,
} = vi.hoisted(() => ({
  mockGetActiveSoul: vi.fn(() => null),
  mockProposeSoulChange: vi.fn(() => ({ id: "proposal-1" })),
  mockGetPendingProposals: vi.fn(() => []),
  mockGetSessionMeta: vi.fn(() => ({})),
  mockMergeSessionMeta: vi.fn(),
  mockCountFacts: vi.fn(() => 5),
  mockGetAllFacts: vi.fn(() => []),
  mockHasAnyPublishedPage: vi.fn(() => false),
  mockGetDraft: vi.fn(() => null),
  mockGetPublishedUsername: vi.fn(() => null),
  mockGetOpenConflicts: vi.fn(() => []),
  mockCreateProposalService: vi.fn(() => ({
    getPendingProposals: vi.fn(() => []),
  })),
  mockClassifySectionRichness: vi.fn(() => "rich"),
  mockFilterPublishableFacts: vi.fn((facts: unknown[]) => facts),
}));

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ count: 1 })),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
  },
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []) })) })) })),
  },
}));

vi.mock("@/lib/services/kb-service", () => ({
  countFacts: (...args: unknown[]) => mockCountFacts(...args),
  getAllFacts: (...args: unknown[]) => mockGetAllFacts(...args),
  getActiveFacts: vi.fn(() => []),
}));

vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: (...args: unknown[]) => mockHasAnyPublishedPage(...args),
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
  getPublishedUsername: (...args: unknown[]) => mockGetPublishedUsername(...args),
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: (...args: unknown[]) => mockGetActiveSoul(...args),
  proposeSoulChange: (...args: unknown[]) => mockProposeSoulChange(...args),
  getPendingProposals: (...args: unknown[]) => mockGetPendingProposals(...args),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: (...args: unknown[]) => mockGetOpenConflicts(...args),
}));

vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: (...args: unknown[]) => mockCreateProposalService(...args),
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: (...args: unknown[]) => mockClassifySectionRichness(...args),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: (...args: unknown[]) => mockFilterPublishableFacts(...args),
}));

vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: (...args: unknown[]) => mockGetSessionMeta(...args),
  mergeSessionMeta: (...args: unknown[]) => mockMergeSessionMeta(...args),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
    projects: ["project"],
  },
}));

import { assembleBootstrapPayload } from "@/lib/agent/journey";
import type { OwnerScope } from "@/lib/auth/session";
import { ARCHETYPE_STRATEGIES } from "@/lib/agent/archetypes";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "test-owner",
  knowledgeReadKeys: ["test-owner"],
  knowledgePrimaryKey: "test-owner",
  currentSessionId: "test-session",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: 5 facts → not first_visit, no published page → returning_no_page
  mockCountFacts.mockReturnValue(5);
  mockGetAllFacts.mockReturnValue([
    { id: "f1", category: "identity", key: "role", value: { role: "Software Engineer" }, source: "chat", confidence: 1, visibility: "public", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ]);
  mockHasAnyPublishedPage.mockReturnValue(false);
  mockGetDraft.mockReturnValue(null);
  mockGetPublishedUsername.mockReturnValue(null);
  mockGetActiveSoul.mockReturnValue(null);
  mockGetPendingProposals.mockReturnValue([]);
  mockGetOpenConflicts.mockReturnValue([]);
  mockGetSessionMeta.mockReturnValue({});
  mockCreateProposalService.mockReturnValue({
    getPendingProposals: vi.fn(() => []),
  });
});

describe("Circuito A: archetype → soul auto-proposal", () => {
  it("proposes initial soul when archetype is not generalist and no soul exists", () => {
    // With a role fact, archetype should detect as non-generalist
    // No soul, no pending proposals → should propose
    assembleBootstrapPayload(SCOPE);

    expect(mockProposeSoulChange).toHaveBeenCalledTimes(1);
    const [ownerKey, overlay, reason] = mockProposeSoulChange.mock.calls[0];
    expect(ownerKey).toBe("test-owner");
    expect(overlay).toHaveProperty("tone");
    expect(overlay).toHaveProperty("communicationStyle");
    expect(reason).toContain("Auto-suggested from detected archetype");
  });

  it("does NOT propose soul when one already exists", () => {
    mockGetActiveSoul.mockReturnValue({
      id: "soul-1",
      compiled: "Warm and friendly",
    });

    assembleBootstrapPayload(SCOPE);

    expect(mockProposeSoulChange).not.toHaveBeenCalled();
  });

  it("does NOT propose soul for generalist archetype", () => {
    // No role fact → generalist
    mockGetAllFacts.mockReturnValue([]);
    mockCountFacts.mockReturnValue(5);

    assembleBootstrapPayload(SCOPE);

    expect(mockProposeSoulChange).not.toHaveBeenCalled();
  });

  it("does NOT propose soul when pending soul proposal already exists (R7-S6)", () => {
    mockGetPendingProposals.mockReturnValue([
      { id: "pending-1", status: "pending" },
    ]);

    assembleBootstrapPayload(SCOPE);

    expect(mockProposeSoulChange).not.toHaveBeenCalled();
  });

  it("uses archetype strategy toneHint and communicationStyle in proposal", () => {
    assembleBootstrapPayload(SCOPE);

    if (mockProposeSoulChange.mock.calls.length > 0) {
      const overlay = mockProposeSoulChange.mock.calls[0][1];
      // The overlay should match one of the ARCHETYPE_STRATEGIES
      const allTones = Object.values(ARCHETYPE_STRATEGIES).map(s => s.toneHint);
      const allStyles = Object.values(ARCHETYPE_STRATEGIES).map(s => s.communicationStyle);
      expect(allTones).toContain(overlay.tone);
      expect(allStyles).toContain(overlay.communicationStyle);
    }
  });
});

describe("archetype session cache", () => {
  it("saves archetype to session metadata on first detection", () => {
    assembleBootstrapPayload(SCOPE);

    expect(mockMergeSessionMeta).toHaveBeenCalledWith(
      "test-session",
      expect.objectContaining({ archetype: expect.any(String) }),
    );
  });

  it("uses cached archetype from session on subsequent calls", () => {
    mockGetSessionMeta.mockReturnValue({ archetype: "developer" });

    const result = assembleBootstrapPayload(SCOPE);

    expect(result.payload.archetype).toBe("developer");
    // Should NOT re-detect — mergeSessionMeta should not be called with archetype
    // (it's already cached)
    const archCalls = mockMergeSessionMeta.mock.calls.filter(
      (c: unknown[]) => c[1] && typeof c[1] === "object" && "archetype" in (c[1] as Record<string, unknown>),
    );
    expect(archCalls.length).toBe(0);
  });
});
