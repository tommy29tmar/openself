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
  mockGetActiveFacts,
  mockHasAnyPublishedPage,
  mockGetDraft,
  mockGetPublishedUsername,
  mockGetOpenConflicts,
  mockCreateProposalService,
  mockClassifySectionRichness,
  mockFilterPublishableFacts,
} = vi.hoisted(() => ({
  mockGetActiveSoul: vi.fn().mockReturnValue(null),
  mockProposeSoulChange: vi.fn().mockReturnValue({ id: "proposal-1" }),
  mockGetPendingProposals: vi.fn().mockReturnValue([]),
  mockGetSessionMeta: vi.fn().mockReturnValue({}),
  mockMergeSessionMeta: vi.fn(),
  mockCountFacts: vi.fn().mockReturnValue(5),
  mockGetActiveFacts: vi.fn().mockReturnValue([]),
  mockHasAnyPublishedPage: vi.fn().mockReturnValue(false),
  mockGetDraft: vi.fn().mockReturnValue(null),
  mockGetPublishedUsername: vi.fn().mockReturnValue(null),
  mockGetOpenConflicts: vi.fn().mockReturnValue([]),
  mockCreateProposalService: vi.fn().mockReturnValue({
    getPendingProposals: vi.fn().mockReturnValue([]),
  }),
  mockClassifySectionRichness: vi.fn().mockReturnValue("rich"),
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
  countFacts: mockCountFacts,
  getActiveFacts: mockGetActiveFacts,
}));

vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: mockHasAnyPublishedPage,
  getDraft: mockGetDraft,
  getPublishedUsername: mockGetPublishedUsername,
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: mockGetActiveSoul,
  proposeSoulChange: mockProposeSoulChange,
  getPendingProposals: mockGetPendingProposals,
}));

vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: mockGetOpenConflicts,
}));

vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: mockCreateProposalService,
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: mockClassifySectionRichness,
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: mockFilterPublishableFacts,
}));

vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: mockGetSessionMeta,
  mergeSessionMeta: mockMergeSessionMeta,
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
  mockGetActiveFacts.mockReturnValue([
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
    assembleBootstrapPayload(SCOPE, "en");

    expect(mockProposeSoulChange).toHaveBeenCalledTimes(1);
    const call = mockProposeSoulChange.mock.calls[0] as unknown[];
    const [ownerKey, overlay, reason] = call;
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

    assembleBootstrapPayload(SCOPE, "en");

    expect(mockProposeSoulChange).not.toHaveBeenCalled();
  });

  it("does NOT propose soul for generalist archetype", () => {
    // No role fact → generalist
    mockGetActiveFacts.mockReturnValue([]);
    mockCountFacts.mockReturnValue(5);

    assembleBootstrapPayload(SCOPE, "en");

    expect(mockProposeSoulChange).not.toHaveBeenCalled();
  });

  it("does NOT propose soul when pending soul proposal already exists (R7-S6)", () => {
    mockGetPendingProposals.mockReturnValue([
      { id: "pending-1", status: "pending" },
    ]);

    assembleBootstrapPayload(SCOPE, "en");

    expect(mockProposeSoulChange).not.toHaveBeenCalled();
  });

  it("uses archetype strategy toneHint and communicationStyle in proposal", () => {
    assembleBootstrapPayload(SCOPE, "en");

    if (mockProposeSoulChange.mock.calls.length > 0) {
      const call = mockProposeSoulChange.mock.calls[0] as unknown[];
      const overlay = call[1] as Record<string, unknown>;
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
    assembleBootstrapPayload(SCOPE, "en");

    expect(mockMergeSessionMeta).toHaveBeenCalledWith(
      "test-owner",
      expect.objectContaining({ archetype: expect.any(String) }),
    );
  });

  it("uses cached archetype from session on subsequent calls", () => {
    mockGetSessionMeta.mockReturnValue({ archetype: "developer" });

    const result = assembleBootstrapPayload(SCOPE, "en");

    expect(result.payload.archetype).toBe("developer");
    // Should NOT re-detect — mergeSessionMeta should not be called with archetype
    // (it's already cached)
    const archCalls = (mockMergeSessionMeta.mock.calls as unknown[][]).filter(
      (c) => c[1] && typeof c[1] === "object" && "archetype" in (c[1] as Record<string, unknown>),
    );
    expect(archCalls.length).toBe(0);
  });
});
