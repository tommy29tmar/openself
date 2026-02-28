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
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(() => ({ id: "vertical", slots: [] })),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })),
}));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn(() => ({})) }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: mockPersonalizeSection }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: mockDetectImpactedSections }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: mockComputeHash }));

import { createAgentTools } from "@/lib/agent/tools";
import { projectCanonicalConfig } from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";

describe("auto-recompose after fact mutations", () => {
  const draftConfig = {
    username: "draft",
    theme: "editorial-360",
    style: { colorScheme: "dark" },
    layoutTemplate: "sidebar-left",
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Elena" } },
      { id: "bio-1", type: "bio", variant: "full", content: { text: "Bio" }, lock: { content: "user" } },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("it");
    mockGetAllFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { name: "Elena" }, visibility: "public" },
    ]);
    mockGetDraft.mockReturnValue({
      config: draftConfig,
      configHash: "old-hash",
    });
    // projectCanonicalConfig returns a NEW config (different hash)
    vi.mocked(projectCanonicalConfig).mockReturnValue({
      username: "draft",
      theme: "editorial-360",
      style: { colorScheme: "dark" },
      layoutTemplate: "sidebar-left",
      sections: [
        { id: "hero-1", type: "hero", variant: "large", content: { name: "Elena" } },
        { id: "bio-1", type: "bio", variant: "full", content: { text: "Updated bio" }, lock: { content: "user" } },
      ],
    });
    vi.mocked(computeConfigHash).mockReturnValue("new-hash");
  });

  it("recomposes draft after create_fact using projectCanonicalConfig", async () => {
    mockCreateFact.mockReturnValue({ id: "f2", category: "skill", key: "figma", visibility: "proposed" });
    const tools = createAgentTools("it", "sess1");
    const result = await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    // Must use projectCanonicalConfig (preserves order + locks), NOT raw composeOptimisticPage
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("passes DraftMeta to projectCanonicalConfig for order/lock preservation", async () => {
    mockCreateFact.mockReturnValue({ id: "f2", category: "skill", key: "figma", visibility: "proposed" });
    const tools = createAgentTools("it", "sess1");
    await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );
    // Verify DraftMeta was passed with theme, style, layoutTemplate, AND sections
    const call = vi.mocked(projectCanonicalConfig).mock.calls[0];
    const draftMeta = call[3]; // 4th arg
    expect(draftMeta).toBeDefined();
    expect(draftMeta!.theme).toBe("editorial-360");
    expect(draftMeta!.style).toEqual({ colorScheme: "dark" });
    expect(draftMeta!.layoutTemplate).toBe("sidebar-left");
    expect(draftMeta!.sections).toHaveLength(2); // preserves section array for order/lock merge
  });

  it("recomposes draft after update_fact", async () => {
    mockUpdateFact.mockReturnValue({ id: "f1", category: "identity", key: "name", visibility: "public" });
    const tools = createAgentTools("it", "sess1");
    const result = await tools.update_fact.execute(
      { factId: "f1", value: { name: "Elena Rossi" } },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("recomposes draft after delete_fact", async () => {
    mockDeleteFact.mockReturnValue(true);
    const tools = createAgentTools("it", "sess1");
    const result = await tools.delete_fact.execute(
      { factId: "f1" },
      { toolCallId: "tc3", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(true);
    expect(projectCanonicalConfig).toHaveBeenCalled();
    expect(mockUpsertDraft).toHaveBeenCalled();
  });

  it("skips recompose when no facts remain after delete", async () => {
    mockDeleteFact.mockReturnValue(true);
    mockGetAllFacts.mockReturnValue([]); // no facts left
    const tools = createAgentTools("it", "sess1");
    await tools.delete_fact.execute(
      { factId: "f1" },
      { toolCallId: "tc4", messages: [], abortSignal: new AbortController().signal },
    );
    expect(projectCanonicalConfig).not.toHaveBeenCalled();
  });

  it("skips upsertDraft when computeConfigHash matches draft.configHash", async () => {
    // Make computeConfigHash return the SAME hash as the existing draft
    vi.mocked(computeConfigHash).mockReturnValue("old-hash");
    mockCreateFact.mockReturnValue({ id: "f2", category: "skill", key: "figma", visibility: "proposed" });
    const tools = createAgentTools("it", "sess1");
    await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc5", messages: [], abortSignal: new AbortController().signal },
    );
    expect(projectCanonicalConfig).toHaveBeenCalled();
    // upsertDraft skipped because computeConfigHash(composed) === draft.configHash
    expect(mockUpsertDraft).not.toHaveBeenCalled();
  });

  it("does not recompose on create_fact failure", async () => {
    mockCreateFact.mockImplementation(() => { throw new Error("DB error"); });
    const tools = createAgentTools("it", "sess1");
    const result = await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc6", messages: [], abortSignal: new AbortController().signal },
    );
    expect(result.success).toBe(false);
    expect(projectCanonicalConfig).not.toHaveBeenCalled();
  });
});
