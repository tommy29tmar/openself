import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions needed by fire-and-forget personalization
const {
  mockGetActiveFacts,
  mockGetDraft,
  mockUpsertDraft,
  mockComposeOptimisticPage,
  mockGetFactLanguage,
  mockTranslatePageContent,
  mockLogEvent,
  mockGetActiveSoul,
  mockFilterPublishableFacts,
  mockProjectCanonicalConfig,
  mockDetectImpactedSections,
  mockComputeHash,
  mockPersonalizeSection,
} = vi.hoisted(() => {
  const defaultPageConfig = {
    version: 1,
    username: "test",
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
    sections: [{ id: "hero", type: "hero", content: { name: "Test" } }],
  };
  return {
    mockGetActiveFacts: vi.fn().mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public", confidence: 1 },
    ]),
    mockGetDraft: vi.fn().mockReturnValue(null),
    mockUpsertDraft: vi.fn(),
    mockComposeOptimisticPage: vi.fn().mockReturnValue(defaultPageConfig),
    mockGetFactLanguage: vi.fn().mockReturnValue("en"),
    mockTranslatePageContent: vi.fn().mockImplementation((config: unknown) => Promise.resolve(config)),
    mockLogEvent: vi.fn(),
    mockGetActiveSoul: vi.fn().mockReturnValue(null),
    mockFilterPublishableFacts: vi.fn().mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public", confidence: 1 },
    ]),
    mockProjectCanonicalConfig: vi.fn().mockReturnValue(defaultPageConfig),
    mockDetectImpactedSections: vi.fn().mockReturnValue([]),
    mockComputeHash: vi.fn().mockReturnValue("soul-hash-abc"),
    mockPersonalizeSection: vi.fn().mockResolvedValue({ title: "Personalized" }),
  };
});

// Mock all tool dependencies
vi.mock("@/lib/services/kb-service", () => ({
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getActiveFacts: mockGetActiveFacts,
  getFactById: vi.fn(),
  factExistsAcrossReadKeys: vi.fn(() => false),
  findFactsByOwnerCategoryKey: vi.fn(() => []),
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: vi.fn(),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: mockComposeOptimisticPage,
}));
vi.mock("@/lib/services/event-service", () => ({
  logEvent: mockLogEvent,
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: mockGetFactLanguage,
}));
vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: mockTranslatePageContent,
}));
vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));
vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn().mockReturnValue({ id: "proposal-1" }),
  getActiveSoul: mockGetActiveSoul,
}));
vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn().mockReturnValue({ success: true }),
}));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {},
}));
vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["monolith", "curator", "architect"] as const,
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn().mockReturnValue({ id: "monolith", slots: [] }),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn().mockReturnValue({ sections: [], issues: [] }),
}));
vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: mockPersonalizeSection,
  prioritizeSections: vi.fn((sections: unknown[]) => sections),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: mockFilterPublishableFacts,
  projectCanonicalConfig: mockProjectCanonicalConfig,
}));
vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: mockDetectImpactedSections,
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: mockComputeHash,
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

import { createAgentTools } from "@/lib/agent/tools";

describe("generate_page fire-and-forget personalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const defaultPageConfig = {
      version: 1,
      username: "test",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
      sections: [{ id: "hero", type: "hero", content: { name: "Test" } }],
    };
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public", confidence: 1 },
    ]);
    mockGetDraft.mockReturnValue(null);
    mockComposeOptimisticPage.mockReturnValue(defaultPageConfig);
    mockProjectCanonicalConfig.mockReturnValue(defaultPageConfig);
    mockTranslatePageContent.mockImplementation((config: unknown) => Promise.resolve(config));
    mockGetActiveSoul.mockReturnValue(null);
    mockDetectImpactedSections.mockReturnValue([]);
    mockPersonalizeSection.mockResolvedValue({ title: "Personalized" });
  });

  it("does NOT trigger personalization in onboarding mode", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero"]);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "onboarding");
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    // personalizeSection should NOT be called in onboarding mode
    // Wait a tick for the fire-and-forget to settle (if it ran)
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("does NOT trigger personalization when mode is undefined", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero"]);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"]);
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("does NOT trigger personalization when ownerKey is undefined", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero"]);

    // No ownerKey passed (3rd param), no mode passed (effectiveOwnerKey fallback
    // to sessionId means the mode guard is the actual gate now)
    const { tools } = createAgentTools("en", "session1", undefined, "req1", ["session1"]);
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("does NOT trigger personalization when no active soul", async () => {
    mockGetActiveSoul.mockReturnValue(null);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("does NOT trigger personalization when soul has no compiled field", async () => {
    mockGetActiveSoul.mockReturnValue({ id: "s1", compiled: "" });

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("does NOT trigger personalization when no impacted sections", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue([]);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    expect(result.success).toBe(true);
    expect(mockDetectImpactedSections).toHaveBeenCalledOnce();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("triggers fire-and-forget personalization in steady_state with active soul and impacted sections", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero"]);
    mockFilterPublishableFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public", confidence: 1 },
    ]);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    // Tool returns immediately (fire-and-forget)
    expect(result.success).toBe(true);

    // Wait for the async IIFE to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetActiveSoul).toHaveBeenCalledWith("owner1");
    expect(mockFilterPublishableFacts).toHaveBeenCalled();
    expect(mockComputeHash).toHaveBeenCalledWith("warm voice");
    expect(mockDetectImpactedSections).toHaveBeenCalled();
    expect(mockPersonalizeSection).toHaveBeenCalledTimes(1);
    expect(mockPersonalizeSection).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: "owner1",
        language: "en",
        soulCompiled: "warm voice",
        username: "test",
      }),
    );
  });

  it("personalizes multiple impacted sections", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero", "bio"]);
    const multiSectionConfig = {
      version: 1,
      username: "test",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
      sections: [
        { id: "hero", type: "hero", content: { name: "Test" } },
        { id: "bio", type: "bio", content: { text: "Bio text" } },
      ],
    };
    mockComposeOptimisticPage.mockReturnValue(multiSectionConfig);
    mockProjectCanonicalConfig.mockReturnValue(multiSectionConfig);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(mockPersonalizeSection).toHaveBeenCalledTimes(2);
  });

  it("skips impacted sections not found in config", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero", "skills"]);
    // config only has hero, not skills
    const heroOnlyConfig = {
      version: 1,
      username: "test",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
      sections: [{ id: "hero", type: "hero", content: { name: "Test" } }],
    };
    mockComposeOptimisticPage.mockReturnValue(heroOnlyConfig);
    mockProjectCanonicalConfig.mockReturnValue(heroOnlyConfig);

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    await new Promise((r) => setTimeout(r, 50));

    // Only hero should be personalized (skills section not in config)
    expect(mockPersonalizeSection).toHaveBeenCalledTimes(1);
  });

  it("does not block tool response even if personalization throws", async () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "warm voice", id: "s1" });
    mockDetectImpactedSections.mockReturnValue(["hero"]);
    mockPersonalizeSection.mockRejectedValue(new Error("LLM error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    const result = await tools.generate_page.execute(
      { username: "test", language: "en" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    // Tool still succeeds
    expect(result.success).toBe(true);

    await new Promise((r) => setTimeout(r, 50));

    expect(consoleSpy).toHaveBeenCalledWith(
      "[generate_page] personalization error:",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });
});
