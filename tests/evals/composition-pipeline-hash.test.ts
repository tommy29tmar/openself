import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Composition Pipeline Hash Tests
 *
 * Verifies that personalized copy survives fact mutations and publish.
 * Covers: bio revert bug, Strava data preservation, skill deduplication.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockGetActiveFacts,
  mockGetDraft,
  mockUpsertDraft,
  mockCreateFact,
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
  updateFact: vi.fn(),
  deleteFact: mockDeleteFact,
  searchFacts: mockSearchFacts,
  getActiveFacts: mockGetActiveFacts,
  getFactById: vi.fn(),
  setFactVisibility: mockSetFactVisibility,
  factExistsAcrossReadKeys: vi.fn(() => false),
  findFactsByOwnerCategoryKey: vi.fn(() => []),
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
    version: 1,
    username: "draft",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: { primaryColor: "#000", layout: "centered" },
    sections: [
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Elena" } },
      { id: "bio-1", type: "bio", variant: "full", content: { text: "Deterministic bio." } },
    ],
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
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(() => ({ id: "monolith", slots: [] })),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })),
}));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn(() => ({})) }));
vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: mockPersonalizeSection,
  prioritizeSections: vi.fn((sections: unknown[]) => sections),
}));
vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: mockDetectImpactedSections,
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: mockComputeHash,
  computeSectionFactsHash: vi.fn(() => "mock-section-hash"),
  SECTION_FACT_CATEGORIES: { bio: ["identity", "interest"], hero: ["identity"], skills: ["skill"] },
}));

import { createAgentTools } from "@/lib/agent/tools";
import { projectCanonicalConfig } from "@/lib/services/page-projection";
import { computeConfigHash } from "@/lib/services/page-service";

// ---------------------------------------------------------------------------
// BUG-1: Bio revert — recomposeAfterMutation triggers re-personalization
// ---------------------------------------------------------------------------
describe("BUG-1: fact mutation triggers re-personalization in steady_state", () => {
  const draftConfig = {
    version: 1 as const,
    username: "draft",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: { primaryColor: "#000", layout: "centered" as const },
    sections: [
      { id: "hero-1", type: "hero" as const, variant: "large" as const, content: { name: "Elena" } },
      { id: "bio-1", type: "bio" as const, variant: "full" as const, content: { text: "Bio text" } },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { name: "Elena" }, visibility: "public", source: "chat" },
      { id: "f2", category: "identity", key: "title", value: { value: "Designer" }, visibility: "public", source: "chat" },
    ]);
    mockGetDraft.mockReturnValue({ config: draftConfig, configHash: "old-hash", username: "draft" });
    vi.mocked(projectCanonicalConfig).mockReturnValue({
      ...draftConfig,
      sections: [
        { id: "hero-1", type: "hero", variant: "large", content: { name: "Elena" } },
        { id: "bio-1", type: "bio", variant: "full", content: { text: "New deterministic bio." } },
      ],
    });
    vi.mocked(computeConfigHash).mockReturnValue("new-hash");
    mockGetActiveSoul.mockReturnValue({ compiled: "soul-text" });
    mockComputeHash.mockReturnValue("soul-hash-abc");
    mockDetectImpactedSections.mockReturnValue(["bio"]);
    mockPersonalizeSection.mockResolvedValue({ text: "Personalized bio" });
  });

  it("triggers re-personalization after fact mutation in steady_state mode", async () => {
    mockCreateFact.mockReturnValue({ id: "f3", category: "identity", key: "title", visibility: "proposed" });

    // mode = "steady_state", ownerKey = "owner1"
    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", undefined, "steady_state");
    await tools.create_fact.execute(
      { category: "identity", key: "title", value: { value: "Engineer" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    // Draft should be updated
    expect(mockUpsertDraft).toHaveBeenCalled();

    // Re-personalization should fire: getActiveSoul, detectImpactedSections
    // Use a small delay to let fire-and-forget run
    await new Promise(r => setTimeout(r, 50));

    expect(mockGetActiveSoul).toHaveBeenCalledWith("owner1");
    expect(mockDetectImpactedSections).toHaveBeenCalled();
    expect(mockPersonalizeSection).toHaveBeenCalled();
  });

  it("does NOT trigger re-personalization in onboarding mode", async () => {
    mockCreateFact.mockReturnValue({ id: "f3", category: "identity", key: "title", visibility: "proposed" });

    // mode = "onboarding"
    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", undefined, "onboarding");
    await tools.create_fact.execute(
      { category: "identity", key: "title", value: { value: "Engineer" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    await new Promise(r => setTimeout(r, 50));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("does NOT trigger re-personalization when draft hash unchanged", async () => {
    // Same hash → skip recompose entirely → no personalization
    vi.mocked(computeConfigHash).mockReturnValue("old-hash");
    mockCreateFact.mockReturnValue({ id: "f3", category: "skill", key: "figma", visibility: "proposed" });

    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", undefined, "steady_state");
    await tools.create_fact.execute(
      { category: "skill", key: "figma", value: { name: "Figma" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    await new Promise(r => setTimeout(r, 50));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("skips re-personalization when no soul exists", async () => {
    mockGetActiveSoul.mockReturnValue(null);
    mockCreateFact.mockReturnValue({ id: "f3", category: "identity", key: "title", visibility: "proposed" });

    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", undefined, "steady_state");
    await tools.create_fact.execute(
      { category: "identity", key: "title", value: { value: "Engineer" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    await new Promise(r => setTimeout(r, 50));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });

  it("skips re-personalization when no sections impacted", async () => {
    mockDetectImpactedSections.mockReturnValue([]);
    mockCreateFact.mockReturnValue({ id: "f3", category: "identity", key: "title", visibility: "proposed" });

    const { tools } = createAgentTools("en", "sess1", "owner1", "req1", undefined, "steady_state");
    await tools.create_fact.execute(
      { category: "identity", key: "title", value: { value: "Engineer" } },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    await new Promise(r => setTimeout(r, 50));
    expect(mockPersonalizeSection).not.toHaveBeenCalled();
  });
});
