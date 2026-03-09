import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const heartbeatRunValues: Record<string, unknown>[] = [];

const {
  mockDbInsert,
  mockGetHeartbeatConfig,
  mockComputeOwnerDay,
  mockCheckOwnerBudget,
  mockCheckBudget,
  mockExpireStaleProposals,
  mockGetActiveSoul,
  mockLogEvent,
  mockGetAllActiveCopies,
  mockAnalyzeConformity,
  mockGenerateRewrite,
  mockCreateProposal,
  mockMarkStaleProposals,
  mockCleanupExpiredCache,
  mockComputeHash,
  mockGetPreferences,
  mockResolveOwnerScopeForWorker,
} = vi.hoisted(() => ({
  mockDbInsert: vi.fn(),
  mockGetHeartbeatConfig: vi.fn(),
  mockComputeOwnerDay: vi.fn(),
  mockCheckOwnerBudget: vi.fn(),
  mockCheckBudget: vi.fn(),
  mockExpireStaleProposals: vi.fn(),
  mockGetActiveSoul: vi.fn(),
  mockLogEvent: vi.fn(),
  mockGetAllActiveCopies: vi.fn(),
  mockAnalyzeConformity: vi.fn(),
  mockGenerateRewrite: vi.fn(),
  mockCreateProposal: vi.fn(),
  mockMarkStaleProposals: vi.fn(),
  mockCleanupExpiredCache: vi.fn(),
  mockComputeHash: vi.fn(),
  mockGetPreferences: vi.fn(),
  mockResolveOwnerScopeForWorker: vi.fn(),
}));

mockDbInsert.mockImplementation(() => ({
  values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
    heartbeatRunValues.push(vals);
    return { run: vi.fn() };
  }),
}));

vi.mock("@/lib/db", () => ({
  db: { insert: mockDbInsert },
  sqlite: {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0 }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  heartbeatRuns: "heartbeatRuns",
}));
vi.mock("@/lib/services/heartbeat-config-service", () => ({
  getHeartbeatConfig: mockGetHeartbeatConfig,
  computeOwnerDay: mockComputeOwnerDay,
  checkOwnerBudget: mockCheckOwnerBudget,
}));
vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: mockCheckBudget,
}));
vi.mock("@/lib/services/soul-service", () => ({
  expireStaleProposals: mockExpireStaleProposals,
  getActiveSoul: mockGetActiveSoul,
}));
vi.mock("@/lib/services/event-service", () => ({
  logEvent: mockLogEvent,
}));
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getAllActiveCopies: mockGetAllActiveCopies,
}));
vi.mock("@/lib/services/conformity-analyzer", () => ({
  analyzeConformity: mockAnalyzeConformity,
  generateRewrite: mockGenerateRewrite,
}));
vi.mock("@/lib/services/proposal-service", () => ({
  createProposal: mockCreateProposal,
  markStaleProposals: mockMarkStaleProposals,
}));
vi.mock("@/lib/services/section-cache-service", () => ({
  cleanupExpiredCache: mockCleanupExpiredCache,
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: mockComputeHash,
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: mockGetPreferences,
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: mockResolveOwnerScopeForWorker,
}));
vi.mock("@/lib/services/session-metadata", () => ({
  mergeSessionMeta: vi.fn(),
  getRecentJournalEntries: vi.fn(() => []),
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(() => null),
}));
vi.mock("@/lib/services/kb-service", () => ({
  // Return enough facts to pass the DEEP_HEARTBEAT_MIN_FACTS gate
  getActiveFacts: vi.fn(() => Array.from({ length: 30 }, (_, i) => ({
    id: `fact-${i}`,
    category: `cat-${i}`,
    key: `key-${i}`,
    value: { v: true },
  }))),
}));
vi.mock("@/lib/services/coherence-check", () => ({
  checkPageCoherence: vi.fn(async () => []),
}));
vi.mock("@/lib/services/journal-patterns", () => ({
  detectJournalPatterns: vi.fn(() => []),
}));
vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(() => null),
}));

// ── Import under test (after all mocks) ─────────────────────────────────────

import { handleHeartbeatDeep } from "@/lib/worker/heartbeat";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeActiveCopy(sectionType: string, content: string, language = "it") {
  return {
    id: 1,
    ownerKey: "owner1",
    sectionType,
    language,
    personalizedContent: content,
    factsHash: "fh-abc",
    soulHash: "sh-xyz",
    approvedAt: "2026-01-01",
    source: "live",
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  heartbeatRunValues.length = 0;
  // Reset defaults
  mockDbInsert.mockImplementation(() => ({
    values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
      heartbeatRunValues.push(vals);
      return { run: vi.fn() };
    }),
  }));
  mockGetHeartbeatConfig.mockReturnValue({
    timezone: "UTC",
    lightPerDay: 1,
    deepPerWeek: 1,
    llmBudgetPerMonth: 10,
  });
  mockComputeOwnerDay.mockReturnValue("2026-01-01");
  mockCheckBudget.mockReturnValue({ allowed: true });
  mockCheckOwnerBudget.mockReturnValue({ allowed: true });
  mockExpireStaleProposals.mockReturnValue(0);
  mockGetAllActiveCopies.mockReturnValue([]);
  mockGetPreferences.mockReturnValue({ language: "it", factLanguage: "en" });
  mockResolveOwnerScopeForWorker.mockReturnValue({
    cognitiveOwnerKey: "owner1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  });
  mockGetActiveSoul.mockReturnValue(null);
  mockAnalyzeConformity.mockResolvedValue([]);
  mockGenerateRewrite.mockResolvedValue(null);
  mockMarkStaleProposals.mockReturnValue(0);
  mockCleanupExpiredCache.mockReturnValue(0);
  mockComputeHash.mockImplementation((s: string) => `hash-of-${s.slice(0, 10)}`);
});

describe("handleHeartbeatDeep — Phase 1c conformity integration", () => {
  it("calls conformity check when active copies and soul exist", async () => {
    const copies = [makeActiveCopy("bio", "A passionate developer")];
    mockGetAllActiveCopies.mockReturnValue(copies);
    mockGetActiveSoul.mockReturnValue({ compiled: "Warm and friendly" });
    mockAnalyzeConformity.mockResolvedValue([]);

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner1", "it");
    expect(mockGetActiveSoul).toHaveBeenCalledWith("owner1");
    expect(mockAnalyzeConformity).toHaveBeenCalledWith(
      copies,
      "Warm and friendly",
      "owner1",
    );
  });

  it("creates proposals when conformity issues found", async () => {
    const copies = [
      makeActiveCopy("bio", "A formal developer bio"),
      makeActiveCopy("skills", "Some skill content"),
    ];
    mockGetAllActiveCopies.mockReturnValue(copies);
    mockGetActiveSoul.mockReturnValue({ compiled: "Warm tone" });
    mockAnalyzeConformity.mockResolvedValue([
      {
        sectionType: "bio",
        issueType: "tone_drift",
        reason: "Too formal for warm tone",
        severity: "medium",
      },
    ]);
    mockGenerateRewrite.mockResolvedValue({ description: "Rewritten bio text" });

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockGenerateRewrite).toHaveBeenCalledWith(
      "bio",
      "A formal developer bio",
      expect.objectContaining({ issueType: "tone_drift" }),
      "Warm tone",
    );
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: "owner1",
        sectionType: "bio",
        language: "it",
        currentContent: "A formal developer bio",
        proposedContent: JSON.stringify({ description: "Rewritten bio text" }),
        issueType: "tone_drift",
        reason: "Too formal for warm tone",
        severity: "medium",
        factsHash: "fh-abc",
        soulHash: "sh-xyz",
      }),
    );
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "conformity_check",
        actor: "worker",
        payload: expect.objectContaining({ ownerKey: "owner1", issues: 1, proposals: 1 }),
      }),
    );
  });

  it("skips conformity when no active copies", async () => {
    mockGetAllActiveCopies.mockReturnValue([]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Warm tone" });

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockAnalyzeConformity).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it("skips conformity when no soul compiled", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue(null);

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockAnalyzeConformity).not.toHaveBeenCalled();
  });

  it("skips conformity when soul has no compiled text", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "" });

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockAnalyzeConformity).not.toHaveBeenCalled();
  });

  it("does NOT call markStaleProposals (moved to light heartbeat)", async () => {
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockMarkStaleProposals).not.toHaveBeenCalled();
  });

  it("does NOT call cleanupExpiredCache (moved to light heartbeat)", async () => {
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockCleanupExpiredCache).not.toHaveBeenCalled();
  });

  it("continues if conformity check throws but does NOT record run (allows retry)", async () => {
    mockGetAllActiveCopies.mockImplementation(() => {
      throw new Error("DB exploded");
    });

    // Should not throw — errors are caught internally
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    // Heartbeat run should NOT be recorded — conformity failed,
    // so weekly window stays open for retry
    expect(heartbeatRunValues.length).toBe(0);
  });

  it("continues if analyzeConformity rejects but does NOT record run (allows retry)", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Tone" });
    mockAnalyzeConformity.mockRejectedValue(new Error("LLM timeout"));

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    // Heartbeat run should NOT be recorded — conformity failed,
    // so weekly window stays open for retry
    expect(heartbeatRunValues.length).toBe(0);
  });

  it("does not create proposal when generateRewrite returns null", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Tone" });
    mockAnalyzeConformity.mockResolvedValue([
      {
        sectionType: "bio",
        issueType: "tone_drift",
        reason: "issue",
        severity: "low",
      },
    ]);
    mockGenerateRewrite.mockResolvedValue(null);

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it("does not create proposal when issue sectionType has no matching copy", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Tone" });
    mockAnalyzeConformity.mockResolvedValue([
      {
        sectionType: "skills", // no skills copy in activeCopies
        issueType: "tone_drift",
        reason: "issue",
        severity: "low",
      },
    ]);

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockGenerateRewrite).not.toHaveBeenCalled();
    expect(mockCreateProposal).not.toHaveBeenCalled();
  });

  it("falls back to fact language when preferred language is unset", async () => {
    mockGetPreferences.mockReturnValue({ language: null, factLanguage: "de" });
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text", "de")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Tone" });

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner1", "de");
  });

  it("reports action_taken when conformity proposals are created", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Tone" });
    mockAnalyzeConformity.mockResolvedValue([
      {
        sectionType: "bio",
        issueType: "tone_drift",
        reason: "Too formal",
        severity: "medium",
      },
    ]);
    mockGenerateRewrite.mockResolvedValue({ description: "Better" });

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    // The last insert into heartbeatRuns should have "action_taken" outcome
    const lastValues = heartbeatRunValues[heartbeatRunValues.length - 1];
    expect(lastValues).toBeDefined();
    expect(lastValues.outcome).toBe("action_taken");
    expect(lastValues.runType).toBe("deep");
    expect(lastValues.ownerKey).toBe("owner1");
  });
});
