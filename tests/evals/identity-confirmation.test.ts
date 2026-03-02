import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCreateFact,
  mockUpdateFact,
  mockGetActiveFacts,
  mockGetDraft,
  mockUpsertDraft,
  mockGetFactById,
  mockFactExists,
  mockLogEvent,
  mockGetFactLanguage,
  mockGetSessionMeta,
  mockMergeSessionMeta,
} = vi.hoisted(() => ({
  mockCreateFact: vi.fn(),
  mockUpdateFact: vi.fn(),
  mockGetActiveFacts: vi.fn(() => []),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockGetFactById: vi.fn(),
  mockFactExists: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetFactLanguage: vi.fn(),
  mockGetSessionMeta: vi.fn(() => ({})),
  mockMergeSessionMeta: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: mockUpdateFact,
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getActiveFacts: mockGetActiveFacts,
  getFactById: mockGetFactById,
  setFactVisibility: vi.fn(),
  factExistsAcrossReadKeys: mockFactExists,
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: mockUpsertDraft,
  requestPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "test-hash"),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({ username: "draft", theme: "minimal", style: {}, sections: [] })),
  filterPublishableFacts: vi.fn((f: unknown[]) => f),
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/services/preferences-service", () => ({ getFactLanguage: mockGetFactLanguage }));
vi.mock("@/lib/ai/translate", () => ({ translatePageContent: vi.fn() }));
vi.mock("@/lib/services/memory-service", () => ({ saveMemory: vi.fn() }));
vi.mock("@/lib/services/soul-service", () => ({ proposeSoulChange: vi.fn(), getActiveSoul: vi.fn() }));
vi.mock("@/lib/services/conflict-service", () => ({ resolveConflict: vi.fn() }));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error { code = "FACT_VALIDATION_FAILED"; },
}));
vi.mock("@/lib/layout/contracts", () => ({ LAYOUT_TEMPLATES: ["monolith"], resolveLayoutAlias: vi.fn() }));
vi.mock("@/lib/layout/registry", () => ({ getLayoutTemplate: vi.fn(() => ({ id: "monolith", slots: [] })), resolveLayoutTemplate: vi.fn() }));
vi.mock("@/lib/layout/assign-slots", () => ({ assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })) }));
vi.mock("@/lib/layout/lock-policy", () => ({ extractLocks: vi.fn(() => ({})) }));
vi.mock("@/lib/services/section-personalizer", () => ({ personalizeSection: vi.fn(), prioritizeSections: vi.fn() }));
vi.mock("@/lib/services/personalization-impact", () => ({ detectImpactedSections: vi.fn() }));
vi.mock("@/lib/services/personalization-hashing", () => ({ computeHash: vi.fn(), SECTION_FACT_CATEGORIES: {} }));
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: mockGetSessionMeta,
  mergeSessionMeta: mockMergeSessionMeta,
  setSessionMeta: vi.fn(),
}));

import { createAgentTools } from "@/lib/agent/tools";

const toolCtx = { toolCallId: "tc", messages: [], abortSignal: new AbortController().signal };

describe("identity overwrite confirmation gate (Bug #5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetDraft.mockReturnValue(null);
    mockGetActiveFacts.mockReturnValue([]);
  });

  it("allows first identity creation (onboarding)", async () => {
    mockFactExists.mockReturnValue(false); // no existing
    mockCreateFact.mockReturnValue({ id: "f1", category: "identity", key: "name", visibility: "public" });
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: "Marco Rossi" } },
      toolCtx,
    );
    expect(result.success).toBe(true);
  });

  it("blocks identity overwrite (upsert)", async () => {
    mockFactExists.mockReturnValue(true); // existing fact
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: "Giovanni Rossi" } },
      toolCtx,
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("latches: blocks ALL identity ops after first block", async () => {
    mockFactExists.mockReturnValue(true);
    const { tools } = createAgentTools("en", "s1");
    // First: blocked
    const r1 = await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: "X" } },
      toolCtx,
    );
    expect(r1.success).toBe(false);
    // Second: also blocked (even different key)
    const r2 = await tools.create_fact.execute(
      { category: "identity", key: "role", value: { role: "Dev" } },
      toolCtx,
    );
    expect(r2.success).toBe(false);
    expect(r2.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("allows after confirmatory message with matching valueHash", async () => {
    // Simulate: previous turn blocked with a pending
    const { hashValue } = await import("@/lib/services/confirmation-service");
    const vh = hashValue({ full: "Giovanni Rossi" });

    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "identity_overwrite",
        category: "identity",
        key: "name",
        valueHash: vh,
        createdAt: new Date().toISOString(),
      }],
    });
    mockFactExists.mockReturnValue(true);
    mockCreateFact.mockReturnValue({ id: "f2", category: "identity", key: "name", visibility: "public" });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: "Giovanni Rossi" } },
      toolCtx,
    );
    expect(result.success).toBe(true);
    // Pending was consumed
    expect(mockMergeSessionMeta).toHaveBeenCalledWith("s1", { pendingConfirmations: null });
  });

  it("re-blocks when same key has different value", async () => {
    const { hashValue } = await import("@/lib/services/confirmation-service");
    const vh = hashValue({ full: "Giovanni Rossi" }); // pending is for Giovanni

    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "identity_overwrite",
        category: "identity",
        key: "name",
        valueHash: vh,
        createdAt: new Date().toISOString(),
      }],
    });
    mockFactExists.mockReturnValue(true);

    const { tools } = createAgentTools("en", "s1");
    // Try with Roberto (different value)
    const result = await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: "Roberto Bianchi" } },
      toolCtx,
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("blocks identity overwrite via update_fact", async () => {
    mockGetFactById.mockReturnValue({ id: "f1", category: "identity", key: "name", value: { full: "Marco" } });
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.update_fact.execute(
      { factId: "f1", value: { full: "Roberto" } },
      toolCtx,
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("allows non-identity creates without gate", async () => {
    mockCreateFact.mockReturnValue({ id: "f3", category: "skill", key: "ts", visibility: "proposed" });
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.create_fact.execute(
      { category: "skill", key: "ts", value: { name: "TypeScript" } },
      toolCtx,
    );
    expect(result.success).toBe(true);
  });

  it("TTL: expired pending is discarded", async () => {
    const { hashValue } = await import("@/lib/services/confirmation-service");
    const vh = hashValue({ full: "Giovanni Rossi" });

    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "identity_overwrite",
        category: "identity",
        key: "name",
        valueHash: vh,
        createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
      }],
    });
    mockFactExists.mockReturnValue(true);

    const { tools } = createAgentTools("en", "s1");
    // Pending expired → not matched → re-blocked
    const result = await tools.create_fact.execute(
      { category: "identity", key: "name", value: { full: "Giovanni Rossi" } },
      toolCtx,
    );
    expect(result.success).toBe(false);
  });

  it("identity/name pending doesn't authorize identity/role", async () => {
    const { hashValue } = await import("@/lib/services/confirmation-service");
    const vh = hashValue({ full: "Giovanni" });

    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "identity_overwrite",
        category: "identity",
        key: "name",
        valueHash: vh,
        createdAt: new Date().toISOString(),
      }],
    });
    mockFactExists.mockReturnValue(true);

    const { tools } = createAgentTools("en", "s1");
    // Try identity/role (different key)
    const result = await tools.create_fact.execute(
      { category: "identity", key: "role", value: { role: "Dev" } },
      toolCtx,
    );
    // The pending is for key="name" → no match → blocked
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });
});
