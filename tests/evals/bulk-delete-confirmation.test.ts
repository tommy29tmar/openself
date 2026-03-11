import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCreateFact,
  mockDeleteFact,
  mockGetActiveFacts,
  mockGetDraft,
  mockUpsertDraft,
  mockGetFactById,
  mockLogEvent,
  mockGetFactLanguage,
  mockGetSessionMeta,
  mockMergeSessionMeta,
} = vi.hoisted(() => ({
  mockCreateFact: vi.fn(),
  mockDeleteFact: vi.fn(),
  mockGetActiveFacts: vi.fn(() => []),
  mockGetDraft: vi.fn(),
  mockUpsertDraft: vi.fn(),
  mockGetFactById: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetFactLanguage: vi.fn(),
  mockGetSessionMeta: vi.fn(() => ({})),
  mockMergeSessionMeta: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: mockCreateFact,
  updateFact: vi.fn(),
  deleteFact: mockDeleteFact,
  searchFacts: vi.fn(),
  getActiveFacts: mockGetActiveFacts,
  getFactById: mockGetFactById,
  setFactVisibility: vi.fn(),
  factExistsAcrossReadKeys: vi.fn(() => false),
  findFactsByOwnerCategoryKey: vi.fn(() => []),
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

describe("bulk delete confirmation gate (Bug #6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFactLanguage.mockReturnValue("en");
    mockGetDraft.mockReturnValue(null);
    mockGetActiveFacts.mockReturnValue([]);
    mockGetSessionMeta.mockReturnValue({});
  });

  it("allows first delete_fact without confirmation", async () => {
    mockDeleteFact.mockReturnValue(true);
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    expect(result.success).toBe(true);
  });

  it("blocks 2nd delete_fact in same turn", async () => {
    mockDeleteFact.mockReturnValue(true);
    const { tools } = createAgentTools("en", "s1");
    // 1st: ok
    const r1 = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    expect(r1.success).toBe(true);
    // 2nd: blocked
    const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx) as any;
    expect(r2.success).toBe(false);
    expect(r2.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("latches: 3rd+ delete also blocked", async () => {
    mockDeleteFact.mockReturnValue(true);
    const { tools } = createAgentTools("en", "s1");
    await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    await tools.delete_fact.execute({ factId: "f2" }, toolCtx); // blocked
    const r3 = await tools.delete_fact.execute({ factId: "f3" }, toolCtx) as any;
    expect(r3.success).toBe(false);
    expect(r3.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("batch_facts with ≥2 deletes: all blocked pre-flight", async () => {
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx);
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
    expect(result.created).toBe(0);
    expect(result.deleted).toBe(0);
  });

  it("batch_facts with 1 delete: allowed (single delete OK)", async () => {
    mockCreateFact.mockReturnValue({ id: "f-new", category: "skill", key: "ts", visibility: "proposed" });
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "create" as const, category: "skill", key: "ts", value: { name: "TS" } },
        { action: "delete" as const, factId: "f1" },
      ],
    }, toolCtx);
    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    expect(result.deleted).toBe(1);
  });

  it("allows confirmed delete from previous turn", async () => {
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f2"],
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);

    const { tools } = createAgentTools("en", "s1");
    // 1st unconfirmed: ok
    const r1 = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    expect(r1.success).toBe(true);
    // 2nd: would be blocked, but f2 is confirmed via pending
    const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx);
    expect(r2.success).toBe(true);
  });

  it("confirmed delete increments count — next unconfirmed is blocked", async () => {
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1"],
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);

    const { tools } = createAgentTools("en", "s1");
    // f1: confirmed → ok (count goes to 1, but pending check runs first)
    const r1 = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    expect(r1.success).toBe(true);
    // f2: unconfirmed, count=1 → blocked (2nd+ delete, pending check finds no match)
    const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx) as any;
    expect(r2.success).toBe(false);
    expect(r2.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("blocked deletes accumulate all factIds in pending for confirmation", async () => {
    mockDeleteFact.mockReturnValue(true);
    const { tools } = createAgentTools("en", "s1");

    // First delete: allowed (count 0 → 1)
    await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    // Second delete: blocked, creates pending with ["f2"]
    const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx) as any;
    expect(r2.code).toBe("REQUIRES_CONFIRMATION");
    // Third delete: blocked, should accumulate "f3" into same pending
    const r3 = await tools.delete_fact.execute({ factId: "f3" }, toolCtx) as any;
    expect(r3.code).toBe("REQUIRES_CONFIRMATION");

    // Verify all blocked factIds are in the pending
    const lastMetaCall = mockMergeSessionMeta.mock.calls.at(-1);
    const pendingConfs = lastMetaCall?.[1]?.pendingConfirmations;
    const bulkPending = pendingConfs?.find((p: any) => p.type === "bulk_delete");
    expect(bulkPending?.factIds).toContain("f2");
    expect(bulkPending?.factIds).toContain("f3");
  });

  it("confirmed multi-delete: all factIds in pending are allowed sequentially", async () => {
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "pending-1",
        type: "bulk_delete",
        factIds: ["f1", "f2", "f3"],
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);

    const { tools } = createAgentTools("en", "s1");
    const r1 = await tools.delete_fact.execute({ factId: "f1" }, toolCtx);
    expect(r1.success).toBe(true);
    const r2 = await tools.delete_fact.execute({ factId: "f2" }, toolCtx);
    expect(r2.success).toBe(true);
    const r3 = await tools.delete_fact.execute({ factId: "f3" }, toolCtx);
    expect(r3.success).toBe(true);
  });

  it("batch_facts reject does not contaminate delete_fact pending", async () => {
    // Scenario: batch_facts blocks (creates pending with confirmationId),
    // then delete_fact runs in same turn. delete_fact should NOT append to
    // the batch-confirmation pending — it should create its own.
    const { tools } = createAgentTools("en", "s1");

    // Step 1: batch_facts blocks with 2+ deletes
    const batchResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;
    expect(batchResult.success).toBe(false);
    expect(batchResult.confirmationId).toBeDefined();

    // Step 2: delete_fact for a different fact (first delete in turn → allowed)
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f3", category: "skill", key: "ts" });
    const deleteResult = await tools.delete_fact.execute({
      factId: "f3",
    }, toolCtx);
    expect(deleteResult.success).toBe(true);

    // Step 3: second delete_fact → should be blocked with its OWN pending
    const deleteResult2 = await tools.delete_fact.execute({
      factId: "f4",
    }, toolCtx);
    expect(deleteResult2.success).toBe(false);
    expect(deleteResult2.code).toBe("REQUIRES_CONFIRMATION");

    // Verify: the batch-confirmation pending still has original factIds [f1, f2]
    // (not contaminated with f3 or f4)
    const lastMetaCall = mockMergeSessionMeta.mock.calls[mockMergeSessionMeta.mock.calls.length - 1];
    const storedPendings = lastMetaCall[1]?.pendingConfirmations;
    if (storedPendings) {
      const batchPending = storedPendings.find((p: any) => p.confirmationId);
      if (batchPending) {
        expect(batchPending.factIds).toEqual(["f1", "f2"]);
        expect(batchPending.factIds).not.toContain("f3");
        expect(batchPending.factIds).not.toContain("f4");
      }
    }
  });

  it("batch_facts with valid confirmationId bypasses pre-flight and executes all deletes", async () => {
    const confirmationId = "conf-abc-123";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });
    mockCreateFact.mockReturnValue({ id: "f-new", category: "skill", key: "ts", visibility: "proposed" });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
        { action: "create" as const, category: "skill", key: "ts", value: { name: "TS" } },
      ],
      confirmationId,
    }, toolCtx);

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(2);
    expect(result.created).toBe(1);
  });

  it("batch_facts with invalid confirmationId still blocks", async () => {
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId: "conf-abc-123",
        createdAt: new Date().toISOString(),
      }],
    });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId: "wrong-id",
    }, toolCtx);

    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("batch_facts with confirmationId but mismatched factIds rejects", async () => {
    const confirmationId = "conf-mismatch-test";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        // Different factIds than what was stored in pending
        { action: "delete" as const, factId: "f3" },
        { action: "delete" as const, factId: "f4" },
      ],
      confirmationId,
    }, toolCtx);

    // Should reject because factIds don't match the pending
    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("batch_facts without confirmationId returns confirmationId in response", async () => {
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;

    expect(result.success).toBe(false);
    expect(result.code).toBe("REQUIRES_CONFIRMATION");
    expect(result.confirmationId).toBeDefined();
    expect(typeof result.confirmationId).toBe("string");
  });

  it("batch_facts rejects duplicate factIds in delete operations", async () => {
    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;

    expect(result.success).toBe(false);
    expect(result.error).toBe("DUPLICATE_FACT_IDS");
  });

  it("confirmed batch_facts consumes pending AFTER execution, not before", async () => {
    const confirmationId = "conf-defer-test";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    // First delete succeeds, second throws
    let deleteCallCount = 0;
    mockDeleteFact.mockImplementation(() => {
      deleteCallCount++;
      if (deleteCallCount === 2) throw new Error("DB constraint failure");
      return true;
    });
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });

    const { tools } = createAgentTools("en", "s1");

    // Should throw or return error, but pending should NOT be consumed
    try {
      await tools.batch_facts.execute({
        operations: [
          { action: "delete" as const, factId: "f1" },
          { action: "delete" as const, factId: "f2" },
        ],
        confirmationId,
      }, toolCtx);
    } catch {
      // expected
    }

    // Verify pending was NOT consumed (mergeSessionMeta should not have been called
    // with empty pendingConfirmations)
    const consumeCalls = mockMergeSessionMeta.mock.calls.filter(
      (call: any[]) => call[1]?.pendingConfirmations === null
    );
    expect(consumeCalls.length).toBe(0);
  });

  it("confirmed batch_facts advances _deletionCountThisTurn so later delete_fact is gated", async () => {
    const confirmationId = "conf-turn-state";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    mockDeleteFact.mockReturnValue(true);
    mockGetFactById.mockReturnValue({ id: "f1", category: "experience", key: "old" });

    const { tools } = createAgentTools("en", "s1");

    // Confirmed batch should succeed
    const batchResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId,
    }, toolCtx);
    expect(batchResult.success).toBe(true);

    // Now a subsequent delete_fact in the same turn should be blocked
    const deleteResult = await tools.delete_fact.execute({
      factId: "f3",
    }, toolCtx);
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.code).toBe("REQUIRES_CONFIRMATION");
  });

  it("confirmed batch_facts consumes pending even when some deletes return false", async () => {
    const confirmationId = "conf-partial-delete";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f1", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    // f1 deletes successfully, f2 returns false (already gone / access denied)
    mockDeleteFact.mockImplementation((factId: string) => factId === "f1");
    mockGetFactById.mockReturnValue({ id: "f1", category: "skill", key: "old" });

    const { tools } = createAgentTools("en", "s1");
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId,
    }, toolCtx) as any;

    // Should succeed but with partial results
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
    // Pending IS consumed
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    // Verify pending was consumed
    const consumeCalls = mockMergeSessionMeta.mock.calls.filter(
      (call: any[]) => call[1]?.pendingConfirmations === null
    );
    expect(consumeCalls.length).toBe(1);
  });

  it("batch_facts with identity delete ops is rejected", async () => {
    const confirmationId = "conf-identity-test";
    mockGetSessionMeta.mockReturnValue({
      pendingConfirmations: [{
        id: "p1",
        type: "bulk_delete",
        factIds: ["f-identity", "f2"],
        confirmationId,
        createdAt: new Date().toISOString(),
      }],
    });
    // getFactById returns an identity fact for f-identity
    mockGetFactById.mockImplementation((id: string) => {
      if (id === "f-identity") return { id: "f-identity", category: "identity", key: "name" };
      return { id: "f2", category: "skill", key: "ts" };
    });

    const { tools } = createAgentTools("en", "s1");

    // Even with valid confirmationId, identity deletes should be rejected in batch
    const result = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f-identity" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId,
    }, toolCtx);

    expect(result.success).toBe(false);
    expect(result.message).toContain("identity");
  });

  it("batch_facts rejects same-turn self-confirmation", async () => {
    // Simulate: agent calls batch_facts → gets REQUIRES_CONFIRMATION → immediately retries
    const { tools } = createAgentTools("en", "s1");

    // First call: should block and return confirmationId
    const firstResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
    }, toolCtx) as any;
    expect(firstResult.success).toBe(false);
    expect(firstResult.confirmationId).toBeDefined();

    // Second call in same turn: should reject even with valid confirmationId
    const secondResult = await tools.batch_facts.execute({
      operations: [
        { action: "delete" as const, factId: "f1" },
        { action: "delete" as const, factId: "f2" },
      ],
      confirmationId: firstResult.confirmationId,
    }, toolCtx) as any;
    expect(secondResult.success).toBe(false);
    expect(secondResult.code).toBe("REQUIRES_CONFIRMATION");
    expect(secondResult.message).toContain("same turn");
  });
});
