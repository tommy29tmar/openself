import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist all mocks before imports
const {
  mockGetAllFacts,
  mockGetDraft,
  mockUpsertDraft,
  mockCreateFact,
  mockUpdateFact,
  mockDeleteFact,
  mockSearchFacts,
  mockSetFactVisibility,
  mockUpdateFactSortOrder,
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
  mockGetAllFacts: vi.fn(),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockCreateFact: vi.fn(),
  mockUpdateFact: vi.fn(),
  mockDeleteFact: vi.fn(),
  mockSearchFacts: vi.fn(),
  mockSetFactVisibility: vi.fn(),
  mockUpdateFactSortOrder: vi.fn(),
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
  getAllFacts: mockGetAllFacts,
  setFactVisibility: mockSetFactVisibility,
  updateFactSortOrder: mockUpdateFactSortOrder,
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
  resolveLayoutAlias: vi.fn((v: string) => v),
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
vi.mock("@/lib/page-config/section-completeness", () => ({ isSectionComplete: vi.fn(() => true) }));
vi.mock("@/lib/services/section-richness", () => ({ classifySectionRichness: vi.fn(() => "adequate") }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: mockPersonalizeSection }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: mockDetectImpactedSections }));
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: mockComputeHash,
  SECTION_FACT_CATEGORIES: {},
}));
vi.mock("@/lib/services/session-service", () => ({ isMultiUserEnabled: vi.fn(() => false) }));
vi.mock("@/lib/page-config/usernames", () => ({ validateUsernameFormat: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";
import { projectCanonicalConfig } from "@/lib/services/page-projection";

describe("reorder_section_items tool", () => {
  const draftConfig = {
    username: "draft",
    theme: "minimal",
    style: { colorScheme: "dark" } as any,
    sections: [
      { id: "hero-1", type: "hero" as const, variant: "large", content: { name: "Test" } },
      { id: "skills-1", type: "skills" as const, variant: "grid", content: { items: [] } },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockFilterPublishableFacts.mockImplementation((facts: unknown[]) => facts);
    mockGetFactLanguage.mockReturnValue("en");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "skill", key: "typescript", value: { name: "TypeScript" }, visibility: "proposed" },
      { id: "f2", category: "skill", key: "react", value: { name: "React" }, visibility: "proposed" },
      { id: "f3", category: "skill", key: "python", value: { name: "Python" }, visibility: "proposed" },
    ]);
    mockGetDraft.mockReturnValue({
      config: draftConfig,
      configHash: "old-hash",
    });
    vi.mocked(projectCanonicalConfig).mockReturnValue(draftConfig as any);
  });

  it("calls updateFactSortOrder for each key with correct indices", async () => {
    const tools = createAgentTools("en", "sess1");
    const result = await tools.reorder_section_items.execute(
      { category: "skill", orderedKeys: ["react", "typescript", "python"] },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(true);
    expect(mockUpdateFactSortOrder).toHaveBeenCalledTimes(3);
    expect(mockUpdateFactSortOrder).toHaveBeenNthCalledWith(1, "sess1", "skill", "react", 0);
    expect(mockUpdateFactSortOrder).toHaveBeenNthCalledWith(2, "sess1", "skill", "typescript", 1);
    expect(mockUpdateFactSortOrder).toHaveBeenNthCalledWith(3, "sess1", "skill", "python", 2);
  });

  it("triggers recomposeAfterMutation after reordering", async () => {
    const tools = createAgentTools("en", "sess1");
    const result = await tools.reorder_section_items.execute(
      { category: "skill", orderedKeys: ["python", "react"] },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(true);
    expect(result.recomposeOk).toBe(true);
    expect(projectCanonicalConfig).toHaveBeenCalled();
  });

  it("returns success with recomposeOk false if recompose fails", async () => {
    vi.mocked(projectCanonicalConfig).mockImplementation(() => {
      throw new Error("recompose error");
    });

    const tools = createAgentTools("en", "sess1");
    const result = await tools.reorder_section_items.execute(
      { category: "skill", orderedKeys: ["react", "typescript"] },
      { toolCallId: "tc3", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(true);
    expect(result.recomposeOk).toBe(false);
    // updateFactSortOrder still called
    expect(mockUpdateFactSortOrder).toHaveBeenCalledTimes(2);
  });

  it("returns the category and orderedKeys in the result", async () => {
    const tools = createAgentTools("en", "sess1");
    const orderedKeys = ["python", "typescript", "react"];
    const result = await tools.reorder_section_items.execute(
      { category: "experience", orderedKeys },
      { toolCallId: "tc4", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(true);
    expect(result.category).toBe("experience");
    expect(result.orderedKeys).toEqual(orderedKeys);
  });

  it("handles errors and logs them", async () => {
    mockUpdateFactSortOrder.mockImplementation(() => {
      throw new Error("DB write error");
    });

    const tools = createAgentTools("en", "sess1");
    const result = await tools.reorder_section_items.execute(
      { category: "skill", orderedKeys: ["react"] },
      { toolCallId: "tc5", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("DB write error");
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "tool_call_error",
        payload: expect.objectContaining({ tool: "reorder_section_items" }),
      }),
    );
  });

  it("works with a single item", async () => {
    const tools = createAgentTools("en", "sess1");
    const result = await tools.reorder_section_items.execute(
      { category: "skill", orderedKeys: ["typescript"] },
      { toolCallId: "tc6", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(true);
    expect(mockUpdateFactSortOrder).toHaveBeenCalledTimes(1);
    expect(mockUpdateFactSortOrder).toHaveBeenCalledWith("sess1", "skill", "typescript", 0);
  });

  it("works with empty orderedKeys array", async () => {
    const tools = createAgentTools("en", "sess1");
    const result = await tools.reorder_section_items.execute(
      { category: "skill", orderedKeys: [] },
      { toolCallId: "tc7", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.success).toBe(true);
    expect(mockUpdateFactSortOrder).not.toHaveBeenCalled();
  });
});
