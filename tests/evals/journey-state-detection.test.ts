// tests/evals/journey-state-detection.test.ts

/**
 * Tests for the Journey Intelligence module.
 * Covers: detectJourneyState, detectSituations, detectExpertiseLevel,
 *         assembleBootstrapPayload, daysBetween.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies before importing ---

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
    })),
  },
  db: {},
}));

vi.mock("@/lib/services/kb-service", () => ({
  countFacts: vi.fn(() => 0),
  getAllFacts: vi.fn(() => []),
}));

vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
  getPublishedUsername: vi.fn(() => null),
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));

vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({
    getPendingProposals: vi.fn(() => []),
  })),
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: unknown[]) => facts),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
    projects: ["project"],
  },
}));

// --- Import module under test and mocked deps ---

import {
  detectJourneyState,
  detectSituations,
  detectExpertiseLevel,
  assembleBootstrapPayload,
  daysBetween,
  getDistinctSessionCount,
} from "@/lib/agent/journey";
import type { OwnerScope } from "@/lib/auth/session";
import { countFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft, getPublishedUsername } from "@/lib/services/page-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { createProposalService } from "@/lib/services/proposal-service";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { sqlite } from "@/lib/db";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a", "sess-b"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-b",
};

// Helper to mock sqlite.prepare().get() for specific queries
function mockSqliteQuery(pattern: RegExp, result: unknown) {
  const getMock = vi.fn(() => result);
  const originalPrepare = vi.mocked(sqlite.prepare);
  originalPrepare.mockImplementation((sql: string) => {
    if (pattern.test(sql)) {
      return { get: getMock } as unknown as ReturnType<typeof sqlite.prepare>;
    }
    // Default: return undefined
    return {
      get: vi.fn(() => undefined),
    } as unknown as ReturnType<typeof sqlite.prepare>;
  });
  return getMock;
}

// Helper: create a mock pending proposals service
function mockPendingProposals(count: number) {
  const proposals = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ownerKey: "cog-1",
    sectionType: "bio",
    status: "pending",
  }));
  vi.mocked(createProposalService).mockReturnValue({
    getPendingProposals: vi.fn(() => proposals),
  } as unknown as ReturnType<typeof createProposalService>);
}

beforeEach(() => {
  vi.clearAllMocks();

  // Reset defaults
  vi.mocked(countFacts).mockReturnValue(0);
  vi.mocked(hasAnyPublishedPage).mockReturnValue(false);
  vi.mocked(getDraft).mockReturnValue(null);
  vi.mocked(getPublishedUsername).mockReturnValue(null);
  vi.mocked(getActiveSoul).mockReturnValue(null);
  vi.mocked(getOpenConflicts).mockReturnValue([]);
  vi.mocked(createProposalService).mockReturnValue({
    getPendingProposals: vi.fn(() => []),
  } as unknown as ReturnType<typeof createProposalService>);
  vi.mocked(classifySectionRichness).mockReturnValue("rich");

  // Default sqlite mock: all queries return undefined
  vi.mocked(sqlite.prepare).mockImplementation(() => ({
    get: vi.fn(() => undefined),
  }) as unknown as ReturnType<typeof sqlite.prepare>);
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------
describe("daysBetween", () => {
  it("returns 0 for same day", () => {
    const d = new Date("2026-02-27T12:00:00Z");
    expect(daysBetween(d, d)).toBe(0);
  });

  it("returns 1 for exactly 24 hours apart", () => {
    const a = new Date("2026-02-26T12:00:00Z");
    const b = new Date("2026-02-27T12:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });

  it("returns 30 for 30 days apart", () => {
    const a = new Date("2026-01-28T00:00:00Z");
    const b = new Date("2026-02-27T00:00:00Z");
    expect(daysBetween(a, b)).toBe(30);
  });

  it("floors partial days", () => {
    const a = new Date("2026-02-26T00:00:00Z");
    const b = new Date("2026-02-27T12:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectJourneyState
// ---------------------------------------------------------------------------
describe("detectJourneyState", () => {
  it("returns first_visit when 0 facts, no messages, no draft, no published", () => {
    expect(detectJourneyState(SCOPE)).toBe("first_visit");
  });

  it("returns returning_no_page when facts exist but no draft or published", () => {
    vi.mocked(countFacts).mockReturnValue(5);
    expect(detectJourneyState(SCOPE)).toBe("returning_no_page");
  });

  it("returns draft_ready when draft exists but no published page", () => {
    vi.mocked(getDraft).mockReturnValue({
      config: {} as never,
      username: "draft",
      status: "draft",
      configHash: null,
      updatedAt: null,
    });
    expect(detectJourneyState(SCOPE)).toBe("draft_ready");
  });

  it("returns active_fresh when published page updated 3 days ago", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    mockSqliteQuery(/published.*ORDER BY updated_at/, {
      updated_at: threeDaysAgo.toISOString(),
    });
    expect(detectJourneyState(SCOPE)).toBe("active_fresh");
  });

  it("returns active_stale when published page updated 10 days ago", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    mockSqliteQuery(/published.*ORDER BY updated_at/, {
      updated_at: tenDaysAgo.toISOString(),
    });
    expect(detectJourneyState(SCOPE)).toBe("active_stale");
  });

  it("returns blocked when authenticated user has exhausted quota (200 messages)", () => {
    mockSqliteQuery(/profile_message_usage/, { count: 200 });
    expect(
      detectJourneyState(SCOPE, { authenticated: true, username: "alice" }),
    ).toBe("blocked");
  });

  it("blocked takes priority over active_fresh", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    mockSqliteQuery(/profile_message_usage/, { count: 200 });
    expect(
      detectJourneyState(SCOPE, { authenticated: true, username: "alice" }),
    ).toBe("blocked");
  });

  it("draft_ready takes priority over returning_no_page", () => {
    vi.mocked(countFacts).mockReturnValue(3);
    vi.mocked(getDraft).mockReturnValue({
      config: {} as never,
      username: "draft",
      status: "draft",
      configHash: null,
      updatedAt: null,
    });
    expect(detectJourneyState(SCOPE)).toBe("draft_ready");
  });
});

// ---------------------------------------------------------------------------
// detectSituations
// ---------------------------------------------------------------------------
describe("detectSituations", () => {
  const baseFacts = [
    { id: "f1", category: "identity", key: "name", value: { full: "Alice" }, source: "chat", confidence: 1, visibility: "public", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  it("returns has_name when name fact exists", () => {
    const result = detectSituations(baseFacts, "cog-1");
    expect(result).toContain("has_name");
  });

  it("returns has_name when legacy full-name fact exists", () => {
    const legacyFacts = [
      { id: "f1", category: "identity", key: "full-name", value: { full: "Bob" }, source: "chat", confidence: 1, visibility: "public", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    const result = detectSituations(legacyFacts, "cog-1");
    expect(result).toContain("has_name");
  });

  it("returns has_pending_proposals when proposals exist", () => {
    mockPendingProposals(2);
    const result = detectSituations([], "cog-1");
    expect(result).toContain("has_pending_proposals");
  });

  it("returns has_thin_sections when a section is thin", () => {
    vi.mocked(classifySectionRichness).mockReturnValue("thin");
    const result = detectSituations([], "cog-1");
    expect(result).toContain("has_thin_sections");
  });

  it("returns has_stale_facts when facts are older than 30 days", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const staleFact = {
      id: "f1",
      category: "skill",
      key: "typescript",
      value: { name: "TypeScript" },
      source: "chat",
      confidence: 1,
      visibility: "public",
      createdAt: oldDate.toISOString(),
      updatedAt: oldDate.toISOString(),
    };
    const result = detectSituations([staleFact], "cog-1");
    expect(result).toContain("has_stale_facts");
  });

  it("returns has_open_conflicts when conflicts exist", () => {
    vi.mocked(getOpenConflicts).mockReturnValue([
      { id: "c1", category: "skill", key: "ts", factAId: "f1", sourceA: "chat", factBId: "f2", sourceB: "chat" },
    ] as never);
    const result = detectSituations([], "cog-1");
    expect(result).toContain("has_open_conflicts");
  });

  it("returns has_soul when active soul exists", () => {
    vi.mocked(getActiveSoul).mockReturnValue({ compiled: "test soul" } as never);
    const result = detectSituations([], "cog-1");
    expect(result).toContain("has_soul");
  });

  it("returns empty array when nothing special is detected", () => {
    const result = detectSituations([], "cog-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectExpertiseLevel
// ---------------------------------------------------------------------------
describe("detectExpertiseLevel", () => {
  it("returns novice for 1 session", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 1 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("novice");
  });

  it("returns novice for 2 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 2 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("novice");
  });

  it("returns familiar for 3 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 3 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("familiar");
  });

  it("returns familiar for 5 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 5 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("familiar");
  });

  it("returns expert for 6 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 6 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("expert");
  });

  it("returns expert for 10+ sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 10 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("expert");
  });

  it("returns novice when no messages exist (0 sessions)", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 0 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("novice");
  });
});

// ---------------------------------------------------------------------------
// assembleBootstrapPayload
// ---------------------------------------------------------------------------
describe("assembleBootstrapPayload", () => {
  it("returns a complete payload for first_visit", () => {
    const payload = assembleBootstrapPayload(SCOPE, "en");

    expect(payload.journeyState).toBe("first_visit");
    expect(payload.language).toBe("en");
    expect(payload.userName).toBeNull();
    expect(payload.publishedUsername).toBeNull();
    expect(payload.pendingProposalCount).toBe(0);
    expect(payload.thinSections).toEqual(expect.any(Array));
    expect(payload.staleFacts).toEqual([]);
    expect(payload.conversationContext).toBeNull();
    expect(payload.expertiseLevel).toBe("novice");
    expect(Array.isArray(payload.situations)).toBe(true);
  });

  it("includes userName when name fact exists", async () => {
    const { getAllFacts } = await import("@/lib/services/kb-service");
    vi.mocked(getAllFacts).mockReturnValue([
      {
        id: "f1",
        category: "identity",
        key: "name",
        value: { full: "Marco Rossi" },
        source: "chat",
        confidence: 1.0,
        visibility: "proposed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as never);

    const payload = assembleBootstrapPayload(SCOPE, "it");
    expect(payload.userName).toBe("Marco Rossi");
  });

  it("includes userName from legacy full-name fact", async () => {
    const { getAllFacts } = await import("@/lib/services/kb-service");
    vi.mocked(getAllFacts).mockReturnValue([
      {
        id: "f1",
        category: "identity",
        key: "full-name",
        value: { full: "Legacy User" },
        source: "chat",
        confidence: 1.0,
        visibility: "proposed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as never);

    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.userName).toBe("Legacy User");
  });

  it("includes publishedUsername when page is published", () => {
    vi.mocked(getPublishedUsername).mockReturnValue("marco");
    const payload = assembleBootstrapPayload(SCOPE, "it");
    expect(payload.publishedUsername).toBe("marco");
  });

  it("counts pending proposals", () => {
    mockPendingProposals(3);
    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.pendingProposalCount).toBe(3);
  });

  it("lists thin sections", () => {
    vi.mocked(classifySectionRichness).mockReturnValue("thin");
    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.thinSections.length).toBeGreaterThan(0);
    expect(payload.thinSections).toContain("hero");
  });

  it("lists stale facts", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const { getAllFacts } = await import("@/lib/services/kb-service");
    vi.mocked(getAllFacts).mockReturnValue([
      {
        id: "f1",
        category: "skill",
        key: "react",
        value: { name: "React" },
        source: "chat",
        confidence: 1.0,
        visibility: "proposed",
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
      },
    ] as never);

    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.staleFacts).toContain("skill/react");
  });
});
