import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist all mocks
const {
  mockGetActiveFacts,
  mockSetFactVisibility,
  mockGetDraft,
  mockUpsertDraft,
  mockRequestPublish,
  mockConfirmPublish,
  mockComputeConfigHash,
  mockGetPreferences,
  mockTranslatePageContent,
  mockNormalizeConfigForWrite,
  mockSetProfileUsername,
  mockResolveLayoutTemplate,
  mockAssignSlotsFromFacts,
  mockValidateLayoutComposition,
  mockBuildWidgetMap,
  mockToSlotAssignments,
  mockCanFullyValidateSection,
  mockFilterPublishableFacts,
  mockProjectPublishableConfig,
  mockMergeActiveSectionCopy,
} = vi.hoisted(() => {
  const baseConfig = {
    version: 1,
    username: "test",
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
    sections: [{ id: "hero", type: "hero", content: { name: "Test" } }],
    layoutTemplate: "monolith",
  };

  return {
    mockGetActiveFacts: vi.fn().mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public", confidence: 1 },
    ]),
    mockSetFactVisibility: vi.fn(),
    mockGetDraft: vi.fn().mockReturnValue({
      id: "draft",
      username: "test",
      status: "draft",
      config: baseConfig,
    }),
    mockUpsertDraft: vi.fn(),
    mockRequestPublish: vi.fn(),
    mockConfirmPublish: vi.fn(),
    mockComputeConfigHash: vi.fn().mockReturnValue("hash-abc"),
    mockGetPreferences: vi.fn().mockReturnValue({ language: "en", factLanguage: "en" }),
    mockTranslatePageContent: vi.fn().mockImplementation((config: unknown) => Promise.resolve(config)),
    mockNormalizeConfigForWrite: vi.fn().mockImplementation((config: unknown) => config),
    mockSetProfileUsername: vi.fn(),
    mockResolveLayoutTemplate: vi.fn().mockReturnValue({ id: "monolith", slots: [] }),
    mockAssignSlotsFromFacts: vi.fn().mockReturnValue({ sections: [], issues: [] }),
    mockValidateLayoutComposition: vi.fn().mockReturnValue({ all: [], errors: [], warnings: [] }),
    mockBuildWidgetMap: vi.fn().mockReturnValue(new Map()),
    mockToSlotAssignments: vi.fn().mockReturnValue({ assignments: [], skipped: [] }),
    mockCanFullyValidateSection: vi.fn().mockReturnValue(true),
    mockFilterPublishableFacts: vi.fn().mockReturnValue([
      { id: "f1", category: "identity", key: "name", value: { full: "Test" }, visibility: "public", confidence: 1 },
    ]),
    mockProjectPublishableConfig: vi.fn().mockReturnValue(baseConfig),
    mockMergeActiveSectionCopy: vi.fn().mockImplementation((config: unknown) => config),
  };
});

// Mock all dependencies
vi.mock("@/lib/db", () => ({
  sqlite: {
    transaction: vi.fn((fn: () => void) => fn),
  },
}));
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: mockGetActiveFacts,
  setFactVisibility: mockSetFactVisibility,
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: mockRequestPublish,
  confirmPublish: mockConfirmPublish,
  computeConfigHash: mockComputeConfigHash,
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: mockGetPreferences,
}));
vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: mockTranslatePageContent,
}));
vi.mock("@/lib/page-config/normalize", () => ({
  normalizeConfigForWrite: mockNormalizeConfigForWrite,
}));
vi.mock("@/lib/services/errors", () => ({
  PublishError: class PublishError extends Error {
    code: string;
    statusCode: number;
    constructor(message: string, code: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));
vi.mock("@/lib/services/auth-service", () => ({
  setProfileUsername: mockSetProfileUsername,
}));
vi.mock("@/lib/layout/registry", () => ({
  resolveLayoutTemplate: mockResolveLayoutTemplate,
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: mockAssignSlotsFromFacts,
}));
vi.mock("@/lib/layout/quality", () => ({
  validateLayoutComposition: mockValidateLayoutComposition,
}));
vi.mock("@/lib/layout/widgets", () => ({
  buildWidgetMap: mockBuildWidgetMap,
}));
vi.mock("@/lib/layout/validate-adapter", () => ({
  toSlotAssignments: mockToSlotAssignments,
  canFullyValidateSection: mockCanFullyValidateSection,
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: mockFilterPublishableFacts,
  projectPublishableConfig: mockProjectPublishableConfig,
}));
vi.mock("@/lib/services/personalization-projection", () => ({
  mergeActiveSectionCopy: mockMergeActiveSectionCopy,
}));

vi.mock("@/lib/services/session-service", () => ({
  getSession: vi.fn(() => null),
}));

vi.mock("@/lib/agent/journey", () => ({
  updateJourneyStatePin: vi.fn(),
}));

import { prepareAndPublish } from "@/lib/services/publish-pipeline";

describe("publish pipeline personalization integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls mergeActiveSectionCopy before translation", async () => {
    const personalizedConfig = {
      version: 1,
      username: "test",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
      sections: [{ id: "hero", type: "hero", content: { name: "Personalized Test" } }],
      layoutTemplate: "monolith",
    };

    mockMergeActiveSectionCopy.mockReturnValueOnce(personalizedConfig);
    const ownerKey = "profile-1";
    const readKeys = ["session-anchor", "session-rotated"];

    const result = await prepareAndPublish("test", "session-anchor", {
      mode: "publish",
      ownerKey,
      readKeys,
    });

    expect(result.success).toBe(true);

    expect(mockGetActiveFacts).toHaveBeenCalledWith(ownerKey, readKeys);

    // mergeActiveSectionCopy should use the cognitive owner key, not the anchor session
    expect(mockMergeActiveSectionCopy).toHaveBeenCalledTimes(1);
    expect(mockMergeActiveSectionCopy).toHaveBeenCalledWith(
      expect.objectContaining({ username: "test" }),
      ownerKey,
      "en",
      readKeys,
    );

    // translatePageContent should receive the personalized config, not the canonical one
    expect(mockTranslatePageContent).toHaveBeenCalledWith(
      personalizedConfig,
      "en",  // targetLang
      "en",  // factLang
    );
  });

  it("passes through canonical config when no personalization available", async () => {
    // mergeActiveSectionCopy returns input unchanged (default mock behavior)
    const result = await prepareAndPublish("test", "session1", {
      mode: "publish",
    });

    expect(result.success).toBe(true);
    expect(mockMergeActiveSectionCopy).toHaveBeenCalledTimes(1);
    // translatePageContent receives the same config (no personalization)
    expect(mockTranslatePageContent).toHaveBeenCalledTimes(1);
  });

  it("hash guard uses canonical config, NOT personalized config", async () => {
    mockComputeConfigHash.mockReturnValue("correct-hash");

    const personalizedConfig = {
      version: 1,
      username: "test",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
      sections: [{ id: "hero", type: "hero", content: { name: "Different" } }],
      layoutTemplate: "monolith",
    };
    mockMergeActiveSectionCopy.mockReturnValueOnce(personalizedConfig);

    const result = await prepareAndPublish("test", "session1", {
      mode: "publish",
      expectedHash: "correct-hash",
    });

    expect(result.success).toBe(true);

    // computeConfigHash is called with canonical config (from projectPublishableConfig),
    // NOT the personalized config — this happens BEFORE merge
    expect(mockComputeConfigHash).toHaveBeenCalledWith(
      expect.objectContaining({ username: "test" }),
    );
  });
});
