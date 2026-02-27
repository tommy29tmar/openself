import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const heartbeatRunValues: Record<string, unknown>[] = [];
const mockDbInsert = vi.fn().mockImplementation(() => ({
  values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
    heartbeatRunValues.push(vals);
    return { run: vi.fn() };
  }),
}));
vi.mock("@/lib/db", () => ({
  db: { insert: (...args: unknown[]) => mockDbInsert(...args) },
  sqlite: {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ changes: 0 }),
    }),
  },
}));

const mockGetHeartbeatConfig = vi.fn(() => ({
  timezone: "UTC",
  lightPerDay: 1,
  deepPerWeek: 1,
  llmBudgetPerMonth: 10,
}));
const mockComputeOwnerDay = vi.fn(() => "2026-01-01");
const mockCheckOwnerBudget = vi.fn(() => ({ allowed: true }));
vi.mock("@/lib/services/heartbeat-config-service", () => ({
  getHeartbeatConfig: (...args: unknown[]) => mockGetHeartbeatConfig(...args),
  computeOwnerDay: (...args: unknown[]) => mockComputeOwnerDay(...args),
  checkOwnerBudget: (...args: unknown[]) => mockCheckOwnerBudget(...args),
}));

const mockCheckBudget = vi.fn(() => ({ allowed: true }));
vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: (...args: unknown[]) => mockCheckBudget(...args),
}));

const mockExpireStaleProposals = vi.fn(() => 0);
const mockGetActiveSoul = vi.fn();
vi.mock("@/lib/services/soul-service", () => ({
  expireStaleProposals: (...args: unknown[]) => mockExpireStaleProposals(...args),
  getActiveSoul: (...args: unknown[]) => mockGetActiveSoul(...args),
}));

const mockLogEvent = vi.fn();
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

const mockGetAllActiveCopies = vi.fn();
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getAllActiveCopies: (...args: unknown[]) => mockGetAllActiveCopies(...args),
}));

const mockAnalyzeConformity = vi.fn();
const mockGenerateRewrite = vi.fn();
vi.mock("@/lib/services/conformity-analyzer", () => ({
  analyzeConformity: (...args: unknown[]) => mockAnalyzeConformity(...args),
  generateRewrite: (...args: unknown[]) => mockGenerateRewrite(...args),
}));

const mockCreateProposal = vi.fn();
const mockMarkStaleProposals = vi.fn();
vi.mock("@/lib/services/proposal-service", () => ({
  createProposal: (...args: unknown[]) => mockCreateProposal(...args),
  markStaleProposals: (...args: unknown[]) => mockMarkStaleProposals(...args),
}));

const mockCleanupExpiredCache = vi.fn();
vi.mock("@/lib/services/section-cache-service", () => ({
  cleanupExpiredCache: (...args: unknown[]) => mockCleanupExpiredCache(...args),
}));

const mockComputeHash = vi.fn((s: string) => `hash-of-${s.slice(0, 10)}`);
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: (...args: unknown[]) => mockComputeHash(...args),
}));

// ── Import under test (after all mocks) ─────────────────────────────────────

import { handleHeartbeatDeep } from "@/lib/worker/heartbeat";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeActiveCopy(sectionType: string, content: string) {
  return {
    id: 1,
    ownerKey: "owner1",
    sectionType,
    language: "en",
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
  mockCheckBudget.mockReturnValue({ allowed: true });
  mockCheckOwnerBudget.mockReturnValue({ allowed: true });
  mockExpireStaleProposals.mockReturnValue(0);
  mockGetAllActiveCopies.mockReturnValue([]);
  mockGetActiveSoul.mockReturnValue(null);
  mockAnalyzeConformity.mockResolvedValue([]);
  mockGenerateRewrite.mockResolvedValue(null);
  mockMarkStaleProposals.mockReturnValue(0);
  mockCleanupExpiredCache.mockReturnValue(0);
});

describe("handleHeartbeatDeep — Phase 1c conformity integration", () => {
  it("calls conformity check when active copies and soul exist", async () => {
    const copies = [makeActiveCopy("bio", "A passionate developer")];
    mockGetAllActiveCopies.mockReturnValue(copies);
    mockGetActiveSoul.mockReturnValue({ compiled: "Warm and friendly" });
    mockAnalyzeConformity.mockResolvedValue([]);

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner1", "en");
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
        language: "en",
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

  it("calls markStaleProposals", async () => {
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockMarkStaleProposals).toHaveBeenCalledWith("owner1");
  });

  it("calls cleanupExpiredCache with 30 day TTL", async () => {
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockCleanupExpiredCache).toHaveBeenCalledWith(30);
  });

  it("continues if conformity check throws", async () => {
    mockGetAllActiveCopies.mockImplementation(() => {
      throw new Error("DB exploded");
    });

    // Should not throw — errors are caught internally
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    // Stale proposals and cache cleanup should still run
    expect(mockMarkStaleProposals).toHaveBeenCalledWith("owner1");
    expect(mockCleanupExpiredCache).toHaveBeenCalledWith(30);
  });

  it("continues if analyzeConformity rejects", async () => {
    mockGetAllActiveCopies.mockReturnValue([makeActiveCopy("bio", "text")]);
    mockGetActiveSoul.mockReturnValue({ compiled: "Tone" });
    mockAnalyzeConformity.mockRejectedValue(new Error("LLM timeout"));

    await handleHeartbeatDeep({ ownerKey: "owner1" });

    expect(mockMarkStaleProposals).toHaveBeenCalledWith("owner1");
    expect(mockCleanupExpiredCache).toHaveBeenCalledWith(30);
  });

  it("continues if cache cleanup throws", async () => {
    mockCleanupExpiredCache.mockImplementation(() => {
      throw new Error("Cache cleanup exploded");
    });

    // Should not throw
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    // markStaleProposals runs before cache cleanup, so it should have been called
    expect(mockMarkStaleProposals).toHaveBeenCalledWith("owner1");
  });

  it("continues if markStaleProposals throws", async () => {
    mockMarkStaleProposals.mockImplementation(() => {
      throw new Error("Stale check exploded");
    });

    // Should not throw
    await handleHeartbeatDeep({ ownerKey: "owner1" });

    // Cache cleanup runs after, should still be called
    expect(mockCleanupExpiredCache).toHaveBeenCalledWith(30);
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
