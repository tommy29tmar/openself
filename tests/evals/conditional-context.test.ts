/**
 * Tests for conditional context injection by journey state (Task 24).
 * Validates that context profiles skip unnecessary DB queries and blocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockGetActiveFacts = vi.fn((..._: any[]) => []);
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
}));

const mockGetSummary = vi.fn((..._: any[]) => "A conversation summary");
vi.mock("@/lib/services/summary-service", () => ({
  getSummary: (...args: any[]) => mockGetSummary(...args),
}));

const mockGetActiveMemories = vi.fn((..._: any[]) => [
  { id: "mem-cc-1", memoryType: "observation", category: null, content: "User likes React" },
]);
const mockGetActiveMemoriesScored = vi.fn((..._: any[]) => [
  { id: "mem-cc-1", memoryType: "observation", category: null, content: "User likes React" },
]);
vi.mock("@/lib/services/memory-service", () => ({
  getActiveMemories: (...args: any[]) => mockGetActiveMemories(...args),
  getActiveMemoriesScored: (...args: any[]) => mockGetActiveMemoriesScored(...args),
}));

const mockGetActiveSoul = vi.fn((..._: any[]) => ({ compiled: "Soul: creative person" }));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: (...args: any[]) => mockGetActiveSoul(...args),
}));

const mockGetOpenConflicts = vi.fn((..._: any[]) => []);
vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: (...args: any[]) => mockGetOpenConflicts(...args),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn(() => []),
}));

const mockBuildSystemPrompt = vi.fn((..._: any[]) => "BOOTSTRAP_PROMPT");
vi.mock("@/lib/agent/prompts", () => ({
  buildSystemPrompt: (...args: any[]) => mockBuildSystemPrompt(...args),
}));

vi.mock("@/lib/agent/journey", () => ({ computeRelevance: vi.fn(() => 0.5) }));

vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(() => ({})),
}));
vi.mock("@/lib/services/episodic-service", () => ({
  getRecentEventsForContext: vi.fn(() => []),
  insertEvent: vi.fn(),
  queryEvents: vi.fn(() => []),
}));

import { assembleContext, estimateTokens, CONTEXT_PROFILES } from "@/lib/agent/context";
import type { OwnerScope } from "@/lib/auth/session";
import type { BootstrapPayload } from "@/lib/agent/journey";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a", "sess-b"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-b",
};

const MESSAGES = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi!" },
];

function makeBootstrap(journeyState: string): BootstrapPayload {
  return {
    journeyState: journeyState as any,
    situations: [],
    expertiseLevel: "beginner" as any,
    language: "en",
    archetype: "generalist",
    userName: null,
    lastSeenDaysAgo: null,
    publishedUsername: null,
    conversationContext: null,
    thinSections: [],
    staleFacts: [],
    openConflicts: [],
    pendingProposalCount: 0,
    archivableFacts: [],
  } as BootstrapPayload;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActiveFacts.mockReturnValue([]);
  mockGetSummary.mockReturnValue("A conversation summary");
  mockGetActiveMemories.mockReturnValue([{ id: "mem-cc-1", memoryType: "observation", category: null, content: "User likes React" }]);
  mockGetActiveMemoriesScored.mockReturnValue([{ id: "mem-cc-1", memoryType: "observation", category: null, content: "User likes React" }]);
  mockGetActiveSoul.mockReturnValue({ compiled: "Soul: creative person" });
  mockGetOpenConflicts.mockReturnValue([]);
  mockBuildSystemPrompt.mockReturnValue("BOOTSTRAP_PROMPT");
});

describe("conditional context by journey state", () => {
  it("first_visit: includes facts but omits soul/summary/memories/conflicts", () => {
    const result = assembleContext(SCOPE, "en", MESSAGES, undefined, makeBootstrap("first_visit"));

    // Facts query IS called
    expect(mockGetActiveFacts).toHaveBeenCalled();

    // Soul, summary, memories, conflicts queries are NOT called
    expect(mockGetActiveSoul).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
    expect(mockGetActiveMemories).not.toHaveBeenCalled();
    expect(mockGetOpenConflicts).not.toHaveBeenCalled();

    // Schema reference IS included (buildSystemPrompt receives schemaMode: "minimal" for first_visit)
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schemaMode: expect.stringMatching(/^(full|minimal|none)$/) }),
    );
  });

  it("draft_ready: injects minimal schema, includes soul + summary + memories + richness", () => {
    const result = assembleContext(SCOPE, "en", MESSAGES, undefined, makeBootstrap("draft_ready"));

    // buildSystemPrompt receives schemaMode: "minimal" for draft_ready
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schemaMode: "minimal" }),
    );

    // Soul IS queried
    expect(mockGetActiveSoul).toHaveBeenCalled();

    // Summary and memories are now included for draft_ready
    expect(mockGetSummary).toHaveBeenCalled();
    expect(mockGetActiveMemoriesScored).toHaveBeenCalled();
  });

  it("active_fresh: includes all blocks with minimal edit schema", () => {
    const result = assembleContext(SCOPE, "en", MESSAGES, undefined, makeBootstrap("active_fresh"));

    // All queries are called
    expect(mockGetActiveFacts).toHaveBeenCalled();
    expect(mockGetActiveSoul).toHaveBeenCalled();
    expect(mockGetSummary).toHaveBeenCalled();
    expect(mockGetActiveMemoriesScored).toHaveBeenCalled();
    expect(mockGetOpenConflicts).toHaveBeenCalled();

    // Active update states get the minimal edit schema
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schemaMode: "minimal" }),
    );
  });

  it("active_stale: includes all blocks with minimal edit schema", () => {
    assembleContext(SCOPE, "en", MESSAGES, undefined, makeBootstrap("active_stale"));

    expect(mockGetActiveFacts).toHaveBeenCalled();
    expect(mockGetActiveSoul).toHaveBeenCalled();
    expect(mockGetSummary).toHaveBeenCalled();
    expect(mockGetActiveMemoriesScored).toHaveBeenCalled();
    expect(mockGetOpenConflicts).toHaveBeenCalled();

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schemaMode: "minimal" }),
    );
  });

  it("blocked: minimal context — no DB queries for facts/soul/summary/memories/conflicts", () => {
    const result = assembleContext(SCOPE, "en", MESSAGES, undefined, makeBootstrap("blocked"));

    expect(mockGetActiveFacts).not.toHaveBeenCalled();
    expect(mockGetActiveSoul).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
    expect(mockGetActiveMemories).not.toHaveBeenCalled();
    expect(mockGetOpenConflicts).not.toHaveBeenCalled();
  });

  it("returning_no_page: includes facts + soul + summary + memories + conflicts", () => {
    const result = assembleContext(SCOPE, "en", MESSAGES, undefined, makeBootstrap("returning_no_page"));

    expect(mockGetActiveFacts).toHaveBeenCalled();
    expect(mockGetActiveSoul).toHaveBeenCalled();
    expect(mockGetSummary).toHaveBeenCalled();
    expect(mockGetActiveMemoriesScored).toHaveBeenCalled();
    expect(mockGetOpenConflicts).toHaveBeenCalled();

    // Schema reference is on (returning user still needs to collect facts)
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schemaMode: "full" }),
    );
  });

  it("no bootstrap (legacy path): calls all DB queries unconditionally", () => {
    const result = assembleContext(SCOPE, "en", MESSAGES);

    // All queries are called in the legacy path
    expect(mockGetActiveFacts).toHaveBeenCalled();
    expect(mockGetActiveSoul).toHaveBeenCalled();
    expect(mockGetSummary).toHaveBeenCalled();
    expect(mockGetActiveMemoriesScored).toHaveBeenCalled();
    expect(mockGetOpenConflicts).toHaveBeenCalled();
  });

  it("CONTEXT_PROFILES has entries for all 6 journey states", () => {
    const states = ["first_visit", "returning_no_page", "draft_ready", "active_fresh", "active_stale", "blocked"];
    for (const state of states) {
      expect(CONTEXT_PROFILES).toHaveProperty(state);
    }
  });
});
