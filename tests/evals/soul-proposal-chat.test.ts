import { describe, it, expect, vi, beforeEach } from "vitest";
import { pendingSoulProposalsDirective } from "@/lib/agent/policies/situations";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn(), all: vi.fn(() => []) })) },
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => undefined), all: vi.fn(() => []) })) })) })),
  },
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
  getPendingProposals: vi.fn(() => []),
  proposeSoulChange: vi.fn(),
  reviewProposal: vi.fn(),
}));
vi.mock("@/lib/services/kb-service", () => ({
  countFacts: vi.fn(() => 0),
  getActiveFacts: vi.fn(() => []),
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getFactById: vi.fn(),
  factExistsAcrossReadKeys: vi.fn(() => false),
  findFactsByOwnerCategoryKey: vi.fn(() => []),
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({ getPendingProposals: vi.fn(() => []) })),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
  resolveConflict: vi.fn(() => ({ success: true })),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
  getPublishedUsername: vi.fn(() => null),
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
  computeConfigHash: vi.fn(() => "hash"),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: unknown[]) => facts),
  projectCanonicalConfig: vi.fn(() => null),
}));
vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(),
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: { hero: ["identity"], bio: ["identity"] },
  computeHash: vi.fn(() => "hash"),
}));
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn(() => "en"),
}));
vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn((config: unknown) => Promise.resolve(config)),
}));
vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));
vi.mock("@/lib/services/trust-ledger-service", () => ({
  logTrustAction: vi.fn(),
}));
vi.mock("@/lib/services/fact-constraints", () => ({
  FactConstraintError: class extends Error {},
}));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {},
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({
    version: 1,
    username: "test",
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
    sections: [],
  })),
}));
vi.mock("@/lib/presence", () => ({
  listSurfaces: vi.fn(() => []),
  listVoices: vi.fn(() => []),
}));
vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["monolith", "curator", "architect"],
  resolveLayoutAlias: vi.fn((id: string) => id),
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(() => ({ id: "monolith", slots: [] })),
  resolveLayoutTemplate: vi.fn(() => ({ id: "monolith", slots: [] })),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn(() => ({ sections: [], issues: [] })),
}));
vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn(() => new Map()),
}));
vi.mock("@/lib/layout/group-slots", () => ({
  groupSectionsBySlot: vi.fn(() => ({})),
}));
vi.mock("@/lib/layout/validate-adapter", () => ({
  toSlotAssignments: vi.fn(() => []),
}));
vi.mock("@/lib/layout/quality", () => ({
  validateLayoutComposition: vi.fn(() => ({ valid: true, issues: [] })),
}));
vi.mock("@/lib/layout/widgets", () => ({
  buildWidgetMap: vi.fn(() => new Map()),
  getBestWidget: vi.fn(() => null),
  getWidgetById: vi.fn(() => null),
}));
vi.mock("@/lib/page-config/section-completeness", () => ({
  isSectionComplete: vi.fn(() => true),
}));
vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/page-config/usernames", () => ({
  validateUsernameFormat: vi.fn(() => ({ valid: true })),
}));
vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: vi.fn(() => Promise.resolve(null)),
  prioritizeSections: vi.fn((sections: unknown[]) => sections),
}));
vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: vi.fn(() => []),
}));
vi.mock("@/lib/agent/journey", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/agent/journey")>();
  return {
    ...actual,
    updateJourneyStatePin: vi.fn(),
  };
});
vi.mock("@/lib/services/coherence-check", () => ({
  checkPageCoherence: vi.fn(() => ({ issues: [] })),
}));
vi.mock("@/lib/services/confirmation-service", () => ({
  hashValue: vi.fn(() => "mock-hash"),
  pruneUnconfirmedPendings: vi.fn(),
}));

import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { getPendingProposals, reviewProposal } from "@/lib/services/soul-service";
import { createAgentTools } from "@/lib/agent/tools";
import type { OwnerScope } from "@/lib/auth/session";

const mockScope: OwnerScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgePrimaryKey: "owner-1",
  knowledgeReadKeys: ["owner-1"],
} as any;

// --- Directive unit tests ---

describe("pendingSoulProposalsDirective", () => {
  it("returns empty string for empty array", () => {
    expect(pendingSoulProposalsDirective([])).toBe("");
  });

  it("includes id, overlay, reason, and tool name", () => {
    const result = pendingSoulProposalsDirective([
      { id: "abc-123", overlay: { voice: "direct", tone: "professional" }, reason: "Pattern observed" },
    ]);
    expect(result).toContain("abc-123");
    expect(result).toContain("voice: direct");
    expect(result).toContain("Pattern observed");
    expect(result).toContain("review_soul_proposal");
  });

  it("surfaces only the first proposal", () => {
    const result = pendingSoulProposalsDirective([
      { id: "first", overlay: {}, reason: "" },
      { id: "second", overlay: {}, reason: "" },
    ]);
    expect(result).toContain("first");
    expect(result).not.toContain("second");
  });

  it("handles array values in overlay", () => {
    const result = pendingSoulProposalsDirective([
      { id: "xyz", overlay: { values: ["autonomy", "learning"] }, reason: "" },
    ]);
    expect(result).toContain("autonomy, learning");
  });

  it("does not throw on null overlay, shows fallback", () => {
    expect(() =>
      pendingSoulProposalsDirective([{ id: "bad", overlay: null as any, reason: "" }])
    ).not.toThrow();
    expect(pendingSoulProposalsDirective([{ id: "bad", overlay: null as any, reason: "" }]))
      .toContain("no details available");
  });

  it("sanitizes overlay values: control chars stripped, collapsed to single-line", () => {
    const result = pendingSoulProposalsDirective([
      { id: "inject", overlay: { voice: "direct\x00\x01evil\x0Bnewline\nline2" }, reason: "test\x08\nmore" },
    ]);
    // Check only the overlay line (dynamic content), not the whole result (template has \n)
    const voiceLine = result.split("\n").find(l => l.trimStart().startsWith("voice:"))!;
    expect(voiceLine).toBeDefined();
    const valueAfterColon = voiceLine.split(":").slice(1).join(":");
    expect(valueAfterColon).not.toMatch(/[\x00-\x1F\x7F]/);
    // Check reason line
    const reasonLine = result.split("\n").find(l => l.startsWith("Reason:"))!;
    expect(reasonLine).toBeDefined();
    expect(reasonLine).not.toMatch(/[\x00-\x1F\x7F]/);
  });

  it("truncates long overlay values to max 120 chars", () => {
    const longVal = "a".repeat(200);
    const result = pendingSoulProposalsDirective([
      { id: "long", overlay: { voice: longVal }, reason: "" },
    ]);
    const voiceLine = result.split("\n").find(l => l.trimStart().startsWith("voice:"))!;
    expect(voiceLine.length).toBeLessThan(160);
  });

  it("caps overlay keys at 5 and adds omitted note", () => {
    const manyKeys: Record<string, string> = {};
    for (let i = 0; i < 8; i++) manyKeys[`key${i}`] = `val${i}`;
    const result = pendingSoulProposalsDirective([{ id: "cap", overlay: manyKeys, reason: "" }]);
    expect(result).toContain("3 more omitted");
    expect(result).not.toContain("key5");
  });
});

// --- assembleBootstrapPayload production path ---

describe("assembleBootstrapPayload — post-Circuit-A patching", () => {
  beforeEach(() => vi.mocked(getPendingProposals).mockReturnValue([]));

  it("sets situation and payload when proposals exist post-Circuit-A", () => {
    vi.mocked(getPendingProposals).mockReturnValue([
      { id: "p1", proposedOverlay: { voice: "direct" }, reason: "test", status: "pending", createdAt: new Date().toISOString() } as any,
    ]);
    const result = assembleBootstrapPayload(mockScope, "en");
    expect(result.payload.situations).toContain("has_pending_soul_proposals");
    expect(result.payload.pendingSoulProposals).toHaveLength(1);
    expect(result.payload.pendingSoulProposals![0].id).toBe("p1");
  });

  it("omits field and situation when no proposals", () => {
    // getPendingProposals already returns [] via beforeEach
    const result = assembleBootstrapPayload(mockScope, "en");
    expect(result.payload.situations).not.toContain("has_pending_soul_proposals");
    expect(result.payload.pendingSoulProposals).toBeUndefined();
  });
});

// --- review_soul_proposal tool execution tests ---

describe("review_soul_proposal tool — execute()", () => {
  beforeEach(() => vi.mocked(reviewProposal).mockReset());

  function getReviewTool() {
    const { tools } = createAgentTools("en", "session-1", "owner-1", "req-1");
    return tools.review_soul_proposal;
  }

  it("accept path: calls reviewProposal with correct args and returns success+updated message", async () => {
    vi.mocked(reviewProposal).mockReturnValue({ success: true });
    const result = await getReviewTool().execute({ proposalId: "p1", accept: true }, { toolCallId: "t", messages: [] });
    expect(vi.mocked(reviewProposal)).toHaveBeenCalledWith("p1", "owner-1", true);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/updated/i);
  });

  it("reject path: calls reviewProposal with accept:false and returns rejection message", async () => {
    vi.mocked(reviewProposal).mockReturnValue({ success: true });
    const result = await getReviewTool().execute({ proposalId: "p1", accept: false }, { toolCallId: "t", messages: [] });
    expect(vi.mocked(reviewProposal)).toHaveBeenCalledWith("p1", "owner-1", false);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/rejected/i);
  });

  it("not-found / already-resolved: forwards error from reviewProposal", async () => {
    vi.mocked(reviewProposal).mockReturnValue({ success: false, error: "Proposal not found or already resolved" });
    const result = await getReviewTool().execute({ proposalId: "missing", accept: true }, { toolCallId: "t", messages: [] });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|already resolved/i);
  });
});
