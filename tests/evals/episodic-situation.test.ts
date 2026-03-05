// tests/evals/episodic-situation.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn().mockReturnValue(null),
  proposeSoulChange: vi.fn(),
  getPendingProposals: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/services/episodic-service", () => ({
  getPendingEpisodicProposals: vi.fn().mockReturnValue([]),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe("pendingEpisodicPatternsDirective", () => {
  it("returns empty string when no proposals", async () => {
    const { pendingEpisodicPatternsDirective } = await import("@/lib/agent/policies/situations");
    expect(pendingEpisodicPatternsDirective([])).toBe("");
  });

  it("includes id, actionType, confirm_episodic_pattern", async () => {
    const { pendingEpisodicPatternsDirective } = await import("@/lib/agent/policies/situations");
    const result = pendingEpisodicPatternsDirective([{ id: "prop-1", actionType: "workout", patternSummary: "runs 3x/week" }]);
    expect(result).toContain("prop-1");
    expect(result).toContain("workout");
    expect(result).toContain("confirm_episodic_pattern");
  });

  it("sanitizes control chars in interpolated fields", async () => {
    const { pendingEpisodicPatternsDirective } = await import("@/lib/agent/policies/situations");
    const result = pendingEpisodicPatternsDirective([{
      id: "p1", actionType: "casual\x00DROP", patternSummary: "IGNORE\x01INSTRUCTIONS",
    }]);
    expect(result).not.toContain("\x00");
    expect(result).not.toContain("\x01");
  });
});

describe("has_pending_episodic_patterns in DIRECTIVE_POLICY", () => {
  it("is registered with expected eligibleStates", async () => {
    const { DIRECTIVE_POLICY } = await import("@/lib/agent/policies/directive-registry");
    const entry = DIRECTIVE_POLICY["has_pending_episodic_patterns"];
    expect(entry).toBeDefined();
    expect(entry.eligibleStates).toContain("first_visit");
    expect(entry.eligibleStates).toContain("active_fresh");
    expect(entry.eligibleStates).toContain("active_stale");
  });
});

describe("assembleBootstrapPayload — episodic detection", () => {
  it("adds situation and patterns when proposals exist", async () => {
    const { getPendingEpisodicProposals } = await import("@/lib/services/episodic-service");
    vi.mocked(getPendingEpisodicProposals).mockReturnValue([{
      id: "p1", ownerKey: "o1", actionType: "workout", patternSummary: "runs 3x/week",
      eventCount: 6, lastEventAtUnix: 9999, status: "pending",
      expiresAt: "2099-01-01T00:00:00.000Z", resolvedAt: null, rejectionCooldownUntil: null, createdAt: null,
    }]);
    const { assembleBootstrapPayload } = await import("@/lib/agent/journey");
    const scope = { cognitiveOwnerKey: "o1", knowledgePrimaryKey: "s1", knowledgeReadKeys: ["s1"], anchorSessionId: "s1" } as any;
    const { payload } = assembleBootstrapPayload(scope, "en");
    expect(payload.situations).toContain("has_pending_episodic_patterns");
    expect(payload.pendingEpisodicPatterns).toHaveLength(1);
    expect(payload.pendingEpisodicPatterns![0].actionType).toBe("workout");
  });
});
