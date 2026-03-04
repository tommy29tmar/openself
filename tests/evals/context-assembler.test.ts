/**
 * Tests for the context assembler module (Sub-Phase 1).
 * Pure-function tests for estimateTokens, detectMode, assembleContext.
 * Service imports are mocked via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies before importing the module under test ---

vi.mock("@/lib/services/kb-service", () => {
  const mockFn = vi.fn(() => []);
  return {
    getActiveFacts: mockFn,
    countFacts: vi.fn(() => 0),
  };
});
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
}));
vi.mock("@/lib/services/summary-service", () => ({
  getSummary: vi.fn(() => null),
}));
vi.mock("@/lib/services/memory-service", () => ({
  getActiveMemories: vi.fn(() => []),
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn(() => []),
}));
vi.mock("@/lib/agent/prompts", () => ({
  buildSystemPrompt: vi.fn(() => "BOOTSTRAP_PROMPT"),
}));
vi.mock("@/lib/agent/journey", () => ({
  // Module exists but we only import types — no runtime mock needed
  computeRelevance: vi.fn(() => 0.5),
}));

import { estimateTokens, detectMode, assembleContext } from "@/lib/agent/context";
import type { OwnerScope } from "@/lib/auth/session";
import { countFacts, getActiveFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage } from "@/lib/services/page-service";
import { getSummary } from "@/lib/services/summary-service";
import { getActiveMemories } from "@/lib/services/memory-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { buildSystemPrompt } from "@/lib/agent/prompts";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a", "sess-b"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-b",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset defaults
  vi.mocked(countFacts).mockReturnValue(0);
  vi.mocked(hasAnyPublishedPage).mockReturnValue(false);
  vi.mocked(getActiveFacts).mockReturnValue([]);
  vi.mocked(getSummary).mockReturnValue(null);
  vi.mocked(getActiveMemories).mockReturnValue([]);
  vi.mocked(getActiveSoul).mockReturnValue(null);
  vi.mocked(getOpenConflicts).mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------
describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 100 for 400-char string", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("rounds up for non-divisible lengths", () => {
    // 5 chars -> ceil(5/4) = 2
    expect(estimateTokens("hello")).toBe(2);
  });

  it("handles exact boundary (4 chars = 1 token)", () => {
    expect(estimateTokens("abcd")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectMode
// ---------------------------------------------------------------------------
describe("detectMode", () => {
  it("returns 'onboarding' with no facts and no published page", () => {
    expect(detectMode(SCOPE.knowledgeReadKeys)).toBe("onboarding");
  });

  it("returns 'steady_state' when >= 5 facts", () => {
    vi.mocked(countFacts).mockReturnValue(5);
    expect(detectMode(SCOPE.knowledgeReadKeys)).toBe("steady_state");
  });

  it("returns 'steady_state' when a published page exists (even with 0 facts)", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    expect(detectMode(SCOPE.knowledgeReadKeys)).toBe("steady_state");
  });

  it("returns 'onboarding' with 4 facts and no published page", () => {
    vi.mocked(countFacts).mockReturnValue(4);
    expect(detectMode(SCOPE.knowledgeReadKeys)).toBe("onboarding");
  });
});

// ---------------------------------------------------------------------------
// assembleContext — basic shape
// ---------------------------------------------------------------------------
describe("assembleContext", () => {
  it("produces valid ContextResult with systemPrompt, trimmedMessages, mode", () => {
    const result = assembleContext(SCOPE, "en", [
      { role: "user", content: "Hi" },
    ]);
    expect(result).toHaveProperty("systemPrompt");
    expect(result).toHaveProperty("trimmedMessages");
    expect(result).toHaveProperty("mode");
    expect(typeof result.systemPrompt).toBe("string");
    expect(Array.isArray(result.trimmedMessages)).toBe(true);
    expect(["onboarding", "steady_state"]).toContain(result.mode);
  });

  it("includes facts block when facts exist", () => {
    vi.mocked(getActiveFacts).mockReturnValue([
      { id: "f1", sessionId: "s", profileId: null, category: "identity", key: "name", value: '{"full":"Alice"}', source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
    ] as any);

    const result = assembleContext(SCOPE, "en", []);
    expect(result.systemPrompt).toContain("KNOWN FACTS ABOUT THE USER");
    expect(result.systemPrompt).toContain("identity/name");
  });

  it("includes soul block when soul is active", () => {
    vi.mocked(getActiveSoul).mockReturnValue({
      compiled: "Soul: warm creative introvert",
    } as any);

    const result = assembleContext(SCOPE, "en", []);
    expect(result.systemPrompt).toContain("SOUL PROFILE:");
    expect(result.systemPrompt).toContain("warm creative introvert");
  });

  it("includes summary block when summary exists", () => {
    vi.mocked(getSummary).mockReturnValue("User discussed career goals.");

    const result = assembleContext(SCOPE, "en", []);
    expect(result.systemPrompt).toContain("CONVERSATION SUMMARY:");
    expect(result.systemPrompt).toContain("User discussed career goals.");
  });

  it("includes memories block when memories exist", () => {
    vi.mocked(getActiveMemories).mockReturnValue([
      { memoryType: "preference", content: "Loves TypeScript" },
    ] as any);

    const result = assembleContext(SCOPE, "en", []);
    expect(result.systemPrompt).toContain("AGENT MEMORIES:");
    expect(result.systemPrompt).toContain("[preference] Loves TypeScript");
  });

  it("includes conflicts block when open conflicts exist", () => {
    vi.mocked(getOpenConflicts).mockReturnValue([
      { id: "c1", category: "identity", key: "name", factAId: "f1", sourceA: "chat", factBId: "f2", sourceB: "chat" },
    ] as any);

    const result = assembleContext(SCOPE, "en", []);
    expect(result.systemPrompt).toContain("PENDING CONFLICTS:");
    expect(result.systemPrompt).toContain("[c1]");
  });

  it("truncates oversized facts block to budget", () => {
    // Generate 200 facts with large values so top-120 (cap) still exceed 17000-token budget.
    // 120 facts × ~730 chars each ≈ 87600 chars ≈ 21900 tokens > 17000
    const bigFacts = Array.from({ length: 200 }, (_, i) => ({
      id: `f${i}`, sessionId: "s", profileId: null,
      category: "skill", key: `skill_${i}`,
      value: JSON.stringify({ name: "x".repeat(700) }),
      source: "chat", confidence: 1, visibility: "public",
      createdAt: "", updatedAt: "",
    }));
    vi.mocked(getActiveFacts).mockReturnValue(bigFacts as any);

    const result = assembleContext(SCOPE, "en", []);
    // Verify truncation marker is present
    expect(result.systemPrompt).toContain("...");
    // Total facts-related text should be bounded within budget (17000 tokens = 68000 chars)
    const factsMatch = result.systemPrompt.match(/KNOWN FACTS[\s\S]*?(?=\n\n---|\n*$)/);
    if (factsMatch) {
      expect(estimateTokens(factsMatch[0])).toBeLessThanOrEqual(17000);
    }
  });
});

// ---------------------------------------------------------------------------
// Post-assembly guard
// ---------------------------------------------------------------------------
describe("post-assembly guard", () => {
  it("truncates when total system prompt exceeds 7500 tokens", () => {
    // Inject large content into multiple blocks to blow past 7500 tokens (30000 chars)
    vi.mocked(getActiveFacts).mockReturnValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: `f${i}`, sessionId: "s", profileId: null,
        category: "bio", key: `k${i}`,
        value: JSON.stringify({ text: "y".repeat(200) }),
        source: "chat", confidence: 1, visibility: "public",
        createdAt: "", updatedAt: "",
      })) as any,
    );
    vi.mocked(getActiveSoul).mockReturnValue({
      compiled: "Z".repeat(6000), // 1500 tokens worth
    } as any);
    vi.mocked(getSummary).mockReturnValue("S".repeat(3200)); // 800 tokens
    vi.mocked(getActiveMemories).mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        memoryType: "note",
        content: "M".repeat(160),
      })) as any,
    );

    const result = assembleContext(SCOPE, "en", []);
    const totalTokens = estimateTokens(result.systemPrompt);
    expect(totalTokens).toBeLessThanOrEqual(7500);
  });
});

// ---------------------------------------------------------------------------
// Message trimming
// ---------------------------------------------------------------------------
describe("message trimming", () => {
  it("keeps at most 20 most recent messages", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg-${i}`,
    }));

    const result = assembleContext(SCOPE, "en", msgs);
    expect(result.trimmedMessages.length).toBeLessThanOrEqual(20);
    // The last message should be preserved
    expect(result.trimmedMessages[result.trimmedMessages.length - 1].content).toBe("msg-24");
  });

  it("stays within char budget for messages (large messages trigger trimming)", () => {
    // Each message is ~10000 chars = 2500 tokens; 12 of them = 30000 tokens >> budget
    // recentTurns budget is 22000 tokens = 88000 chars; 12 * 10000 = 120000 chars exceeds it
    const msgs = Array.from({ length: 12 }, (_i) => ({
      role: "user",
      content: "x".repeat(10000),
    }));

    const result = assembleContext(SCOPE, "en", msgs);
    const totalChars = result.trimmedMessages.reduce(
      (sum, m) => sum + m.content.length,
      0,
    );
    // Should have trimmed below the full set due to char budget
    expect(result.trimmedMessages.length).toBeLessThan(12);
    // At most budget chars + 1 mandatory extra message
    expect(totalChars).toBeLessThanOrEqual(88000 + 10000); // 2 mandatory msgs can exceed
  });

  it("always keeps at least 2 most recent messages even if over budget", () => {
    const msgs = [
      { role: "user", content: "a".repeat(6000) },
      { role: "assistant", content: "b".repeat(6000) },
    ];

    const result = assembleContext(SCOPE, "en", msgs);
    expect(result.trimmedMessages.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// assembleContext with BootstrapPayload
// ---------------------------------------------------------------------------
describe("assembleContext with bootstrap", () => {
  it("uses onboarding mode when bootstrap.journeyState is first_visit", () => {
    const bootstrap = {
      journeyState: "first_visit" as const,
      situations: [],
      expertiseLevel: "novice" as const,
      userName: null,
      lastSeenDaysAgo: null,
      publishedUsername: null,
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("onboarding");
    // detectMode should NOT have been called
    expect(countFacts).not.toHaveBeenCalled();
    expect(hasAnyPublishedPage).not.toHaveBeenCalled();
  });

  it("uses steady_state mode when bootstrap.journeyState is active_fresh", () => {
    const bootstrap = {
      journeyState: "active_fresh" as const,
      situations: [],
      expertiseLevel: "familiar" as const,
      userName: "Alice",
      lastSeenDaysAgo: 2,
      publishedUsername: "alice",
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("steady_state");
  });

  it("uses steady_state mode when bootstrap.journeyState is draft_ready", () => {
    const bootstrap = {
      journeyState: "draft_ready" as const,
      situations: [],
      expertiseLevel: "novice" as const,
      userName: null,
      lastSeenDaysAgo: null,
      publishedUsername: null,
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("steady_state");
  });

  it("uses steady_state mode when bootstrap.journeyState is blocked", () => {
    const bootstrap = {
      journeyState: "blocked" as const,
      situations: [],
      expertiseLevel: "expert" as const,
      userName: "Bob",
      lastSeenDaysAgo: 0,
      publishedUsername: "bob",
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("steady_state");
  });

  it("falls back to detectMode when no bootstrap provided (backward compat)", () => {
    vi.mocked(countFacts).mockReturnValue(0);
    vi.mocked(hasAnyPublishedPage).mockReturnValue(false);

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
    );

    expect(result.mode).toBe("onboarding");
    // detectMode WAS called (countFacts or hasAnyPublishedPage invoked)
    expect(countFacts).toHaveBeenCalled();
  });

  it("uses buildSystemPrompt when bootstrap is provided", () => {
    const bootstrap = {
      journeyState: "first_visit" as const,
      situations: [] as never[],
      expertiseLevel: "novice" as const,
      userName: null,
      lastSeenDaysAgo: null,
      publishedUsername: null,
      pendingProposalCount: 0,
      thinSections: [] as string[],
      staleFacts: [] as string[],
      openConflicts: [] as string[],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(SCOPE, "en", [], undefined, bootstrap);
    expect(buildSystemPrompt).toHaveBeenCalledWith(bootstrap, expect.objectContaining({ schemaMode: expect.stringMatching(/^(full|minimal|none)$/) }));
    expect(result.systemPrompt).toContain("BOOTSTRAP_PROMPT");
  });

  it("uses buildSystemPrompt with minimal first_visit bootstrap when no bootstrap provided", () => {
    vi.mocked(countFacts).mockReturnValue(0);
    vi.mocked(hasAnyPublishedPage).mockReturnValue(false);

    const result = assembleContext(SCOPE, "en", []);
    expect(buildSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ journeyState: "first_visit" }),
      expect.objectContaining({ schemaMode: "minimal" }),
    );
    expect(result.systemPrompt).toContain("BOOTSTRAP_PROMPT");
  });
});
