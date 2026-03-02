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
  getFactById: vi.fn(),
  factExistsAcrossReadKeys: vi.fn(() => false),
  setFactVisibility: mockSetFactVisibility,
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(),
  setSessionMeta: vi.fn(),
}));
vi.mock("@/lib/services/confirmation-service", () => ({
  hashValue: vi.fn(() => "mock-hash"),
  pruneUnconfirmedPendings: vi.fn(),
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
  LAYOUT_TEMPLATES: ["monolith", "curator", "architect"],
  resolveLayoutAlias: vi.fn((x: string) => x),
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(() => ({ id: "monolith", slots: [] })),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })),
}));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn(() => ({})) }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: mockPersonalizeSection }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: mockDetectImpactedSections }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: mockComputeHash }));

import { createAgentTools } from "@/lib/agent/tools";

const toolCallOpts = { toolCallId: "tc1", messages: [] as any[], abortSignal: new AbortController().signal };

describe("tool visibility response enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public" },
    ]);
    mockGetDraft.mockReturnValue({
      config: {
        username: "draft",
        theme: "minimal",
        style: {},
        sections: [{ id: "hero-1", type: "hero", variant: "large", content: { name: "Test" } }],
      },
      configHash: "old-hash",
    });
  });

  describe("create_fact", () => {
    it("returns visibility and pageVisible fields", async () => {
      mockCreateFact.mockReturnValue({
        id: "f2", category: "skill", key: "react", visibility: "proposed",
      });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.create_fact.execute(
        { category: "skill", key: "react", value: { name: "React" } },
        toolCallOpts,
      );
      expect(result.success).toBe(true);
      expect(result.visibility).toBe("proposed");
      expect(result.pageVisible).toBe(true);
      expect(result.recomposeOk).toBe(true);
    });

    it("returns pageVisible: false for private visibility", async () => {
      mockCreateFact.mockReturnValue({
        id: "f3", category: "contact", key: "phone", visibility: "private",
      });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.create_fact.execute(
        { category: "contact", key: "phone", value: { type: "phone", value: "+1234567890" } },
        toolCallOpts,
      );
      expect(result.success).toBe(true);
      expect(result.visibility).toBe("private");
      expect(result.pageVisible).toBe(false);
    });

    it("returns pageVisible: true for public visibility", async () => {
      mockCreateFact.mockReturnValue({
        id: "f4", category: "identity", key: "name", visibility: "public",
      });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.create_fact.execute(
        { category: "identity", key: "name", value: { full: "Alice" } },
        toolCallOpts,
      );
      expect(result.success).toBe(true);
      expect(result.visibility).toBe("public");
      expect(result.pageVisible).toBe(true);
    });

    it("returns recomposeOk: false when recomposition fails", async () => {
      mockCreateFact.mockReturnValue({
        id: "f5", category: "skill", key: "ts", visibility: "proposed",
      });
      // Make getActiveFacts throw — recomposeAfterMutation calls it internally
      mockGetActiveFacts.mockImplementation(() => { throw new Error("DB read error"); });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.create_fact.execute(
        { category: "skill", key: "ts", value: { name: "TypeScript" } },
        toolCallOpts,
      );
      expect(result.success).toBe(true);
      expect(result.recomposeOk).toBe(false);
      expect(result.factId).toBe("f5");
    });
  });

  describe("update_fact", () => {
    it("returns visibility and pageVisible fields", async () => {
      mockUpdateFact.mockReturnValue({
        id: "f1", category: "identity", key: "name", visibility: "public",
      });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.update_fact.execute(
        { factId: "f1", value: { full: "Alice Updated" } },
        toolCallOpts,
      ) as any;
      expect(result.success).toBe(true);
      expect(result.visibility).toBe("public");
      expect(result.pageVisible).toBe(true);
      expect(result.recomposeOk).toBe(true);
    });

    it("returns pageVisible: false for private fact", async () => {
      mockUpdateFact.mockReturnValue({
        id: "f1", category: "contact", key: "phone", visibility: "private",
      });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.update_fact.execute(
        { factId: "f1", value: { type: "phone", value: "+9876543210" } },
        toolCallOpts,
      ) as any;
      expect(result.success).toBe(true);
      expect(result.visibility).toBe("private");
      expect(result.pageVisible).toBe(false);
    });

    it("returns recomposeOk: false when recomposition fails", async () => {
      mockUpdateFact.mockReturnValue({
        id: "f1", category: "identity", key: "name", visibility: "proposed",
      });
      mockGetActiveFacts.mockImplementation(() => { throw new Error("DB error"); });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.update_fact.execute(
        { factId: "f1", value: { full: "Bob" } },
        toolCallOpts,
      ) as any;
      expect(result.success).toBe(true);
      expect(result.recomposeOk).toBe(false);
    });
  });

  describe("delete_fact", () => {
    it("returns recomposeOk: true on successful delete and recompose", async () => {
      mockDeleteFact.mockReturnValue(true);
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.delete_fact.execute(
        { factId: "f1" },
        toolCallOpts,
      );
      expect(result.success).toBe(true);
      expect(result.recomposeOk).toBe(true);
    });

    it("returns recomposeOk: false when recomposition fails after delete", async () => {
      mockDeleteFact.mockReturnValue(true);
      mockGetActiveFacts.mockImplementation(() => { throw new Error("DB error"); });
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.delete_fact.execute(
        { factId: "f1" },
        toolCallOpts,
      );
      expect(result.success).toBe(true);
      expect(result.recomposeOk).toBe(false);
    });

    it("returns recomposeOk: true when delete returns false (no recompose attempted)", async () => {
      mockDeleteFact.mockReturnValue(false);
      const { tools } = createAgentTools("en", "sess1");
      const result = await tools.delete_fact.execute(
        { factId: "nonexistent" },
        toolCallOpts,
      );
      expect(result.success).toBe(false);
      expect(result.recomposeOk).toBe(true);
    });
  });
});
