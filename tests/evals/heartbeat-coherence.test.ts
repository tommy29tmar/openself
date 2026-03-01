/**
 * Tests for deep heartbeat coherence check (Circuit D2, Task 20).
 * Validates that handleHeartbeatDeep runs checkPageCoherence and stores
 * warnings/infos in session metadata.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("ai", async () => {
  const { z } = await import("zod");
  return {
    generateObject: vi.fn(),
    tool: vi.fn((def: any) => def),
    z,
  };
});
vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const mockCheckBudget = vi.fn(() => ({ allowed: true }));
vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: (...args: any[]) => mockCheckBudget(...args),
}));

const mockGetHeartbeatConfig = vi.fn(() => ({
  timezone: "UTC",
  lightMaxPerDay: 1,
  deepMaxPerWeek: 1,
}));
const mockComputeOwnerDay = vi.fn(() => "2026-03-01");
const mockCheckOwnerBudget = vi.fn(() => ({ allowed: true }));
vi.mock("@/lib/services/heartbeat-config-service", () => ({
  getHeartbeatConfig: (...args: any[]) => mockGetHeartbeatConfig(...args),
  computeOwnerDay: (...args: any[]) => mockComputeOwnerDay(...args),
  checkOwnerBudget: (...args: any[]) => mockCheckOwnerBudget(...args),
}));

const mockExpireStaleProposals = vi.fn(() => 0);
const mockGetActiveSoul = vi.fn(() => ({ compiled: "Tone: professional" }));
vi.mock("@/lib/services/soul-service", () => ({
  expireStaleProposals: (...args: any[]) => mockExpireStaleProposals(...args),
  getActiveSoul: (...args: any[]) => mockGetActiveSoul(...args),
}));

const mockLogEvent = vi.fn();
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: any[]) => mockLogEvent(...args),
}));

const mockAnalyzeConformity = vi.fn(async () => []);
const mockGenerateRewrite = vi.fn(async () => null);
vi.mock("@/lib/services/conformity-analyzer", () => ({
  analyzeConformity: (...args: any[]) => mockAnalyzeConformity(...args),
  generateRewrite: (...args: any[]) => mockGenerateRewrite(...args),
}));

const mockGetAllActiveCopies = vi.fn(() => []);
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getAllActiveCopies: (...args: any[]) => mockGetAllActiveCopies(...args),
}));

vi.mock("@/lib/services/section-cache-service", () => ({
  cleanupExpiredCache: vi.fn(),
}));

const mockCreateProposal = vi.fn();
const mockMarkStaleProposals = vi.fn();
vi.mock("@/lib/services/proposal-service", () => ({
  createProposal: (...args: any[]) => mockCreateProposal(...args),
  markStaleProposals: (...args: any[]) => mockMarkStaleProposals(...args),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: vi.fn(() => "hash"),
}));

const mockResolveOwnerScope = vi.fn(() => ({
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1", "sess-2"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: any[]) => mockResolveOwnerScope(...args),
}));

const mockGetDraft = vi.fn();
vi.mock("@/lib/services/page-service", () => ({
  getDraft: (...args: any[]) => mockGetDraft(...args),
}));

const mockGetActiveFacts = vi.fn(() => []);
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
  getAllFacts: (...args: any[]) => mockGetActiveFacts(...args),
}));

const mockCheckPageCoherence = vi.fn(async () => []);
vi.mock("@/lib/services/coherence-check", () => ({
  checkPageCoherence: (...args: any[]) => mockCheckPageCoherence(...args),
}));

const mockMergeSessionMeta = vi.fn(() => ({}));
vi.mock("@/lib/services/session-metadata", () => ({
  mergeSessionMeta: (...args: any[]) => mockMergeSessionMeta(...args),
}));

// Mock DB for heartbeat_runs insert
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
  },
  sqlite: {
    prepare: vi.fn(() => ({ run: vi.fn(() => ({ changes: 0 })) })),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  heartbeatRuns: {},
}));

import { handleHeartbeatDeep } from "@/lib/worker/heartbeat";

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckBudget.mockReturnValue({ allowed: true });
  mockCheckOwnerBudget.mockReturnValue({ allowed: true });
  mockExpireStaleProposals.mockReturnValue(0);
  mockGetActiveSoul.mockReturnValue({ compiled: "Tone: professional" });
  mockGetDraft.mockReturnValue(null);
  mockGetActiveFacts.mockReturnValue([]);
  mockCheckPageCoherence.mockResolvedValue([]);
  mockResolveOwnerScope.mockReturnValue({
    cognitiveOwnerKey: "owner-1",
    knowledgeReadKeys: ["sess-1", "sess-2"],
    knowledgePrimaryKey: "sess-1",
    currentSessionId: "sess-1",
  });
});

describe("deep heartbeat coherence check (Circuit D2)", () => {
  it("runs checkPageCoherence on latest draft and stores warnings + infos in session metadata", async () => {
    const sections = [
      { id: "hero-1", type: "hero", content: { tagline: "CEO" } },
      { id: "exp-1", type: "experience", content: { items: ["a"] } },
      { id: "skills-1", type: "skills", content: { items: ["b"] } },
      { id: "projects-1", type: "projects", content: { items: ["c"] } },
    ];
    mockGetDraft.mockReturnValue({
      config: { sections },
    });

    const warningIssue = {
      type: "role_mismatch",
      severity: "warning",
      description: "Hero title mismatch",
      suggestion: "Update hero.",
      affectedSections: ["hero", "experience"],
    };
    const infoIssue = {
      type: "completeness_gap",
      severity: "info",
      description: "Skills section incomplete",
      suggestion: "Check visibility.",
      affectedSections: ["skills"],
    };
    mockCheckPageCoherence.mockResolvedValue([warningIssue, infoIssue]);

    await handleHeartbeatDeep({ ownerKey: "owner-1" });

    // checkPageCoherence called with sections + facts + soul
    expect(mockCheckPageCoherence).toHaveBeenCalledTimes(1);
    expect(mockCheckPageCoherence).toHaveBeenCalledWith(
      sections,
      expect.any(Array),
      "Tone: professional",
    );

    // mergeSessionMeta stores warnings and infos
    expect(mockMergeSessionMeta).toHaveBeenCalledWith("sess-1", {
      coherenceWarnings: [warningIssue],
      coherenceInfos: [infoIssue],
    });
  });

  it("skips coherence check when no draft exists", async () => {
    mockGetDraft.mockReturnValue(null);

    await handleHeartbeatDeep({ ownerKey: "owner-1" });

    expect(mockCheckPageCoherence).not.toHaveBeenCalled();
    expect(mockMergeSessionMeta).not.toHaveBeenCalled();
  });

  it("resolves scope via resolveOwnerScopeForWorker before reading facts", async () => {
    mockGetDraft.mockReturnValue({
      config: {
        sections: [
          { id: "hero-1", type: "hero", content: { tagline: "" } },
          { id: "bio-1", type: "bio", content: { text: "hello" } },
          { id: "skills-1", type: "skills", content: { items: ["a"] } },
          { id: "projects-1", type: "projects", content: { items: ["b"] } },
        ],
      },
    });
    mockCheckPageCoherence.mockResolvedValue([]);

    await handleHeartbeatDeep({ ownerKey: "owner-1" });

    // resolveOwnerScopeForWorker called with ownerKey
    expect(mockResolveOwnerScope).toHaveBeenCalledWith("owner-1");

    // getDraft called with scope.knowledgePrimaryKey
    expect(mockGetDraft).toHaveBeenCalledWith("sess-1");

    // getActiveFacts called with scope values
    expect(mockGetActiveFacts).toHaveBeenCalledWith("sess-1", ["sess-1", "sess-2"]);
  });

  it("logs heartbeat_coherence event on warnings", async () => {
    mockGetDraft.mockReturnValue({
      config: {
        sections: [
          { id: "hero-1", type: "hero", content: { tagline: "CEO" } },
          { id: "exp-1", type: "experience", content: { items: ["a"] } },
          { id: "skills-1", type: "skills", content: { items: ["b"] } },
        ],
      },
    });

    mockCheckPageCoherence.mockResolvedValue([{
      type: "role_mismatch",
      severity: "warning",
      description: "Mismatch",
      suggestion: "Fix it.",
      affectedSections: ["hero"],
    }]);

    await handleHeartbeatDeep({ ownerKey: "owner-1" });

    // logEvent called with heartbeat_coherence
    const coherenceCall = mockLogEvent.mock.calls.find(
      (c: any[]) => c[0]?.eventType === "heartbeat_coherence",
    );
    expect(coherenceCall).toBeDefined();
    expect(coherenceCall![0].payload).toEqual({
      ownerKey: "owner-1",
      warningsFound: 1,
      infosFound: 0,
    });
  });

  it("clears stale coherence data when no issues found", async () => {
    mockGetDraft.mockReturnValue({
      config: {
        sections: [
          { id: "hero-1", type: "hero", content: { tagline: "" } },
          { id: "bio-1", type: "bio", content: { text: "hello" } },
          { id: "skills-1", type: "skills", content: { items: ["a"] } },
        ],
      },
    });
    mockCheckPageCoherence.mockResolvedValue([]);

    await handleHeartbeatDeep({ ownerKey: "owner-1" });

    // Should store null to clear previous warnings/infos
    expect(mockMergeSessionMeta).toHaveBeenCalledWith("sess-1", {
      coherenceWarnings: null,
      coherenceInfos: null,
    });
  });

  it("does not log event when no issues found", async () => {
    mockGetDraft.mockReturnValue({
      config: {
        sections: [
          { id: "hero-1", type: "hero", content: {} },
          { id: "bio-1", type: "bio", content: { text: "x" } },
          { id: "skills-1", type: "skills", content: { items: ["a"] } },
        ],
      },
    });
    mockCheckPageCoherence.mockResolvedValue([]);

    await handleHeartbeatDeep({ ownerKey: "owner-1" });

    const coherenceCall = mockLogEvent.mock.calls.find(
      (c: any[]) => c[0]?.eventType === "heartbeat_coherence",
    );
    expect(coherenceCall).toBeUndefined();
  });

  it("handles coherence check error gracefully without breaking heartbeat", async () => {
    mockGetDraft.mockReturnValue({
      config: {
        sections: [
          { id: "hero-1", type: "hero", content: {} },
          { id: "bio-1", type: "bio", content: { text: "x" } },
          { id: "skills-1", type: "skills", content: { items: ["a"] } },
        ],
      },
    });
    mockCheckPageCoherence.mockRejectedValue(new Error("LLM timeout"));

    // Should not throw — error is caught
    await expect(handleHeartbeatDeep({ ownerKey: "owner-1" })).resolves.not.toThrow();
  });
});
