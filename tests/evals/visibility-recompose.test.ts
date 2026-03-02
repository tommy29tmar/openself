import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist all mocks before imports
const {
  mockGetActiveFacts,
  mockGetDraft,
  mockUpsertDraft,
  mockCreateFact,
  mockUpdateFact,
  mockDeleteFact,
  mockSearchFacts,
  mockSetFactVisibility,
  mockLogEvent,
  mockGetFactLanguage,
  mockTranslatePageContent,
  mockSaveMemory,
  mockProposeSoulChange,
  mockGetActiveSoul,
  mockResolveConflict,
  mockPersonalizeSection,
  mockFilterPublishableFacts,
  mockDetectImpactedSections,
  mockComputeHash,
  mockRequestPublish,
} = vi.hoisted(() => ({
  mockGetActiveFacts: vi.fn(),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockCreateFact: vi.fn(),
  mockUpdateFact: vi.fn(),
  mockDeleteFact: vi.fn(),
  mockSearchFacts: vi.fn(),
  mockSetFactVisibility: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetFactLanguage: vi.fn(),
  mockTranslatePageContent: vi.fn(),
  mockSaveMemory: vi.fn(),
  mockProposeSoulChange: vi.fn(),
  mockGetActiveSoul: vi.fn(),
  mockResolveConflict: vi.fn(),
  mockPersonalizeSection: vi.fn(),
  mockFilterPublishableFacts: vi.fn((facts: unknown[]) => facts),
  mockDetectImpactedSections: vi.fn(),
  mockComputeHash: vi.fn(),
  mockRequestPublish: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: mockUpdateFact,
  deleteFact: mockDeleteFact,
  searchFacts: mockSearchFacts,
  getActiveFacts: mockGetActiveFacts,
  setFactVisibility: mockSetFactVisibility,
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: mockRequestPublish,
  computeConfigHash: vi.fn((config: unknown) => JSON.stringify(config)),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({
    username: "draft",
    theme: "minimal",
    style: {},
    sections: [{ id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } }],
  })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({
    username: "draft",
    theme: "minimal",
    style: {},
    sections: [{ id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } }],
  })),
  filterPublishableFacts: mockFilterPublishableFacts,
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: mockTranslatePageContent }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: mockSaveMemory }));
vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: mockProposeSoulChange,
  getActiveSoul: mockGetActiveSoul,
}));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: mockResolveConflict }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {
    code = "FACT_VALIDATION_FAILED";
    constructor(m: string) { super(m); }
  },
}));
vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["vertical", "sidebar-left", "bento-standard"],
  resolveLayoutAlias: vi.fn((x: string) => x),
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(() => ({ id: "vertical", slots: [] })),
  resolveLayoutTemplate: vi.fn(() => ({ id: "vertical", slots: [] })),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })),
}));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn(() => ({})) }));
vi.mock("@/lib/layout/group-slots", () => ({ groupSectionsBySlot: vi.fn(() => ({})) }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: mockPersonalizeSection }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: mockDetectImpactedSections }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: mockComputeHash, SECTION_FACT_CATEGORIES: {} }));
vi.mock("@/lib/page-config/section-completeness", () => ({ isSectionComplete: vi.fn(() => true) }));
vi.mock("@/lib/services/section-richness", () => ({ classifySectionRichness: vi.fn(() => "adequate") }));
vi.mock("@/lib/services/session-service", () => ({ isMultiUserEnabled: vi.fn(() => false) }));
vi.mock("@/lib/page-config/usernames", () => ({ validateUsernameFormat: vi.fn(() => ({ ok: true })), RESERVED_USERNAMES: new Set() }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";
import { projectCanonicalConfig } from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";

describe("set_fact_visibility triggers recomposition", () => {
  const draftConfig = {
    username: "draft",
    theme: "minimal",
    style: {},
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { name: "Test" }, visibility: "public" },
    ]);
    mockGetDraft.mockReturnValue({
      config: draftConfig,
      configHash: "old-hash",
    });
    vi.mocked(projectCanonicalConfig).mockReturnValue({
      username: "draft",
      theme: "minimal",
      style: { colorScheme: "dark" },
      sections: [{ id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } }],
    } as any);
    vi.mocked(computeConfigHash).mockReturnValue("new-hash");
    mockSetFactVisibility.mockReturnValue({
      id: "f1",
      category: "identity",
      key: "name",
      value: { name: "Test" },
      visibility: "proposed",
    });
  });

  it("calls recomposeAfterMutation (upsertDraft) after visibility change", async () => {
    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", ["sess1"]);
    const result = await tools.set_fact_visibility.execute(
      { factId: "f1", visibility: "proposed" },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("passes readKeys as 5th argument to setFactVisibility", async () => {
    const readKeys = ["sess1", "sess2"];
    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", readKeys);
    await tools.set_fact_visibility.execute(
      { factId: "f1", visibility: "proposed" },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal },
    );
    expect(mockSetFactVisibility).toHaveBeenCalledWith(
      "f1",
      "proposed",
      "assistant",
      "sess1",
      readKeys,
    );
  });
});
