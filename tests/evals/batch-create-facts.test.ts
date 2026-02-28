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
  VisibilityTransitionError: class extends Error {},
  updateFactSortOrder: vi.fn(),
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
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: mockComputeHash,
  SECTION_FACT_CATEGORIES: {},
}));
vi.mock("@/lib/page-config/section-completeness", () => ({ isSectionComplete: vi.fn(() => true) }));
vi.mock("@/lib/services/section-richness", () => ({ classifySectionRichness: vi.fn(() => "adequate") }));
vi.mock("@/lib/services/session-service", () => ({ isMultiUserEnabled: vi.fn(() => false) }));
vi.mock("@/lib/page-config/usernames", () => ({ validateUsernameFormat: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/agent/journey", () => ({ updateJourneyStatePin: vi.fn() }));

import { createAgentTools } from "@/lib/agent/tools";
import { projectCanonicalConfig } from "@/lib/services/page-projection";

describe("create_facts batch tool", () => {
  const draftConfig = {
    username: "draft",
    theme: "minimal",
    style: {},
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } },
    ],
  };

  const toolCallOpts = { toolCallId: "tc1", messages: [] as any[], abortSignal: new AbortController().signal };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test User" }, visibility: "public" },
    ]);
    mockGetDraft.mockReturnValue({
      config: draftConfig,
      configHash: "old-hash",
    });
  });

  it("creates multiple facts with a single recomposition", async () => {
    let factIdCounter = 0;
    mockCreateFact.mockImplementation((input: { category: string; key: string }) => {
      factIdCounter++;
      return { id: `f-${factIdCounter}`, category: input.category, key: input.key, visibility: "proposed" };
    });

    const tools = createAgentTools("en", "sess1", "owner1", "req1");
    const result = await tools.create_facts.execute(
      {
        facts: [
          { category: "skill", key: "typescript", value: { name: "TypeScript", level: "advanced" }, confidence: 1.0 },
          { category: "skill", key: "react", value: { name: "React", level: "advanced" }, confidence: 1.0 },
          { category: "skill", key: "python", value: { name: "Python", level: "intermediate" }, confidence: 0.7 },
        ],
      },
      toolCallOpts,
    );

    // All 3 facts created
    expect(mockCreateFact).toHaveBeenCalledTimes(3);
    expect(result.totalCreated).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r: any) => r.success)).toBe(true);

    // Only ONE recomposition (not 3)
    expect(projectCanonicalConfig).toHaveBeenCalledTimes(1);
  });

  it("handles per-fact errors without failing the batch (partial success)", async () => {
    let callCount = 0;
    mockCreateFact.mockImplementation((input: { category: string; key: string }) => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Duplicate key");
      }
      return { id: `f-${callCount}`, category: input.category, key: input.key, visibility: "proposed" };
    });

    const tools = createAgentTools("en", "sess1", "owner1", "req1");
    const result = await tools.create_facts.execute(
      {
        facts: [
          { category: "skill", key: "typescript", value: { name: "TypeScript" }, confidence: 1.0 },
          { category: "skill", key: "duplicate-key", value: { name: "Duplicate" }, confidence: 1.0 },
          { category: "skill", key: "python", value: { name: "Python" }, confidence: 1.0 },
        ],
      },
      toolCallOpts,
    );

    // 2 succeeded, 1 failed
    expect(result.totalCreated).toBe(2);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain("Duplicate key");
    expect(result.results[2].success).toBe(true);

    // Per-fact error logged with telemetry
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "tool_call_error",
        payload: expect.objectContaining({
          tool: "create_facts",
          key: "duplicate-key",
        }),
      }),
    );

    // Still recomposes once at the end (partial success)
    expect(projectCanonicalConfig).toHaveBeenCalledTimes(1);
  });

  it("returns correct structure for each result", async () => {
    mockCreateFact.mockImplementation((input: { category: string; key: string }) => ({
      id: `f-${input.key}`,
      category: input.category,
      key: input.key,
      visibility: "proposed",
    }));

    const tools = createAgentTools("en", "sess1", "owner1", "req1");
    const result = await tools.create_facts.execute(
      {
        facts: [
          { category: "interest", key: "cooking", value: { name: "Cooking" }, confidence: 1.0 },
        ],
      },
      toolCallOpts,
    );

    expect(result.results[0]).toEqual({
      success: true,
      factId: "f-cooking",
      key: "cooking",
      visibility: "proposed",
    });
  });

  it("still recomposes even when all facts fail", async () => {
    mockCreateFact.mockImplementation(() => {
      throw new Error("DB error");
    });

    const tools = createAgentTools("en", "sess1", "owner1", "req1");
    const result = await tools.create_facts.execute(
      {
        facts: [
          { category: "skill", key: "ts", value: { name: "TS" }, confidence: 1.0 },
          { category: "skill", key: "js", value: { name: "JS" }, confidence: 1.0 },
        ],
      },
      toolCallOpts,
    );

    expect(result.totalCreated).toBe(0);
    // recomposeAfterMutation is still called (it will be a no-op if hash matches)
    expect(projectCanonicalConfig).toHaveBeenCalledTimes(1);
  });
});
