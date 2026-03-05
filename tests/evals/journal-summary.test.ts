/**
 * Tests for journal enrichment in summary generation (Circuit F1, Task 21).
 * Validates buildJournalDigest and journal injection into generateSummary prompt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("ai", async () => {
  const { z } = await import("zod");
  return {
    generateText: vi.fn().mockResolvedValue({
      text: "Summary text",
      usage: { promptTokens: 100, completionTokens: 50 },
    }),
    tool: vi.fn((def: any) => def),
    z,
  };
});
vi.mock("@/lib/ai/provider", () => ({
  getModelForTier: vi.fn(() => "mock-model"),
  getModelIdForTier: vi.fn(() => "mock-id"),
  getProviderName: vi.fn(() => "mock-provider"),
  getProviderForTier: vi.fn(() => "mock-provider"),
}));

const mockCheckBudget = vi.fn(() => ({ allowed: true }));
const mockRecordUsage = vi.fn();
vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: (...args: any[]) => mockCheckBudget(...args),
  recordUsage: (...args: any[]) => mockRecordUsage(...args),
}));

const mockEnqueueJob = vi.fn();
vi.mock("@/lib/worker/index", () => ({
  enqueueJob: (...args: any[]) => mockEnqueueJob(...args),
}));

const mockGetSessionMeta = vi.fn(() => ({}));
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: (...args: any[]) => mockGetSessionMeta(...args),
}));

const mockResolveOwnerScopeForWorker = vi.fn(() => ({
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: [],
  knowledgePrimaryKey: "owner-1",
  currentSessionId: "owner-1",
}));
vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: (...args: any[]) => mockResolveOwnerScopeForWorker(...args),
}));

// Mock DB for summary service
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => null),
          orderBy: vi.fn(() => ({
            all: vi.fn(() => []),
          })),
          all: vi.fn(() => []),
        })),
      })),
    })),
  },
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 0 })),
    })),
    transaction: vi.fn((fn: any) => fn),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  messages: { sessionId: "sessionId", createdAt: "createdAt", id: "id", role: "role", content: "content" },
  conversationSummaries: { ownerKey: "ownerKey", summary: "summary" },
}));

import {
  buildJournalDigest,
  enqueueSummaryJob,
  expandSummaryMessageKeys,
  generateSummary,
} from "@/lib/services/summary-service";
import { generateText } from "ai";
import type { JournalEntry } from "@/lib/services/session-metadata";

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckBudget.mockReturnValue({ allowed: true });
  mockGetSessionMeta.mockReturnValue({});
  mockResolveOwnerScopeForWorker.mockReturnValue({
    cognitiveOwnerKey: "owner-1",
    knowledgeReadKeys: [],
    knowledgePrimaryKey: "owner-1",
    currentSessionId: "owner-1",
  });
});

// ---------------------------------------------------------------------------
// buildJournalDigest — pure function
// ---------------------------------------------------------------------------

describe("buildJournalDigest", () => {
  it("returns empty string for empty journal", () => {
    expect(buildJournalDigest([])).toBe("");
  });

  it("groups by tool name and counts operations", () => {
    const journal: JournalEntry[] = [
      { toolName: "create_fact", timestamp: "2026-01-01T00:00:00Z", durationMs: 10, success: true },
      { toolName: "create_fact", timestamp: "2026-01-01T00:00:01Z", durationMs: 10, success: true },
      { toolName: "generate_page", timestamp: "2026-01-01T00:00:02Z", durationMs: 100, success: true },
    ];

    const digest = buildJournalDigest(journal);
    expect(digest).toContain("Actions taken in this conversation:");
    expect(digest).toContain("create_fact: 2x");
    expect(digest).toContain("generate_page: 1x");
  });

  it("limits to max 3 lines regardless of entry count", () => {
    const journal: JournalEntry[] = [
      { toolName: "create_fact", timestamp: "t1", durationMs: 10, success: true },
      { toolName: "update_fact", timestamp: "t2", durationMs: 10, success: true },
      { toolName: "delete_fact", timestamp: "t3", durationMs: 10, success: true },
      { toolName: "generate_page", timestamp: "t4", durationMs: 100, success: true },
      { toolName: "update_page_style", timestamp: "t5", durationMs: 50, success: true },
    ];

    const digest = buildJournalDigest(journal);
    const lines = digest.split("\n").filter(l => l.startsWith("- "));
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("includes both successful and failed entries in counts", () => {
    const journal: JournalEntry[] = [
      { toolName: "create_fact", timestamp: "t1", durationMs: 10, success: true },
      { toolName: "create_fact", timestamp: "t2", durationMs: 10, success: false },
    ];

    const digest = buildJournalDigest(journal);
    expect(digest).toContain("create_fact: 2x");
  });
});

// ---------------------------------------------------------------------------
// enqueueSummaryJob data flow
// ---------------------------------------------------------------------------

describe("enqueueSummaryJob data flow", () => {
  it("passes knowledgeReadKeys as messageKeys in job payload", () => {
    enqueueSummaryJob("owner-1", ["sess-1", "sess-2"]);
    expect(mockEnqueueJob).toHaveBeenCalledWith("memory_summary", {
      ownerKey: "owner-1",
      messageKeys: ["sess-1", "sess-2"],
    });
  });

  it("defaults messageKeys to [ownerKey] when not provided (backward compat)", () => {
    enqueueSummaryJob("owner-1");
    expect(mockEnqueueJob).toHaveBeenCalledWith("memory_summary", {
      ownerKey: "owner-1",
      messageKeys: ["owner-1"],
    });
  });
});

// ---------------------------------------------------------------------------
// expandSummaryMessageKeys
// ---------------------------------------------------------------------------

describe("expandSummaryMessageKeys", () => {
  it("merges worker scope keys with payload keys and deduplicates", () => {
    mockResolveOwnerScopeForWorker.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgeReadKeys: ["sess-1", "sess-2"],
      knowledgePrimaryKey: "sess-1",
      currentSessionId: "sess-1",
    });

    expect(expandSummaryMessageKeys("owner-1", ["sess-2", "sess-3"])).toEqual([
      "sess-1",
      "sess-2",
      "sess-3",
    ]);
  });

  it("falls back to ownerKey when both sources are empty", () => {
    expect(expandSummaryMessageKeys("owner-1", [])).toEqual(["owner-1"]);
  });
});

// ---------------------------------------------------------------------------
// generateSummary — journal integration
// ---------------------------------------------------------------------------

// Helper: set up DB mocks for generateSummary to succeed end-to-end
async function setupGenerateSummaryMocks(messageRows: Array<{ id: string; role: string; content: string; createdAt: string }>) {
  const { db, sqlite } = await import("@/lib/db");

  // Track calls to disambiguate first cursor SELECT (getUnsummarizedMessages)
  // from second cursor SELECT (inside CAS transaction)
  let cursorSelectCount = 0;
  vi.mocked(sqlite.prepare).mockImplementation((sqlStr: string) => {
    if (sqlStr.includes("cursor_created_at") && sqlStr.includes("SELECT")) {
      cursorSelectCount++;
      if (cursorSelectCount === 1) {
        // First call: getUnsummarizedMessages → no existing summary
        return { get: vi.fn(() => undefined), run: vi.fn(() => ({ changes: 0 })) } as any;
      }
      // Second call: CAS read inside transaction → return init cursor
      return {
        get: vi.fn(() => ({ cursor_created_at: "1970-01-01T00:00:00Z", cursor_message_id: "__init__" })),
        run: vi.fn(() => ({ changes: 0 })),
      } as any;
    }
    // INSERT (ensure row) + UPDATE (CAS)
    return {
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 1 })),
    } as any;
  });
  vi.mocked(sqlite.transaction).mockImplementation((fn: any) => () => fn());

  vi.mocked(db.select).mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          all: vi.fn(() => messageRows),
        })),
        get: vi.fn(() => null),
      })),
    })),
  } as any);
}

describe("generateSummary journal integration", () => {
  it("includes journal digest in LLM prompt when journal entries exist", async () => {
    await setupGenerateSummaryMocks([
      { id: "m1", role: "user", content: "Update my bio", createdAt: "2026-01-01T00:00:00Z" },
      { id: "m2", role: "assistant", content: "Done!", createdAt: "2026-01-01T00:00:01Z" },
      { id: "m3", role: "user", content: "Add skills", createdAt: "2026-01-01T00:00:02Z" },
      { id: "m4", role: "assistant", content: "Added", createdAt: "2026-01-01T00:00:03Z" },
      { id: "m5", role: "user", content: "Thanks", createdAt: "2026-01-01T00:00:04Z" },
    ]);

    mockGetSessionMeta.mockReturnValue({
      journal: [
        { toolName: "create_fact", timestamp: "2026-01-01T00:00:00Z", durationMs: 10, success: true },
        { toolName: "generate_page", timestamp: "2026-01-01T00:00:01Z", durationMs: 100, success: true },
      ],
    });

    const result = await generateSummary("owner-1", ["sess-1"]);
    expect(result).toBe(true);

    expect(vi.mocked(generateText)).toHaveBeenCalled();
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain("Actions taken in this conversation:");
    expect(callArgs.prompt).toContain("create_fact: 1x");
    expect(callArgs.prompt).toContain("generate_page: 1x");
  });

  it("omits journal section when no journal entries exist", async () => {
    await setupGenerateSummaryMocks([
      { id: "m1", role: "user", content: "Hello", createdAt: "2026-01-01T00:00:00Z" },
      { id: "m2", role: "assistant", content: "Hi!", createdAt: "2026-01-01T00:00:01Z" },
      { id: "m3", role: "user", content: "How?", createdAt: "2026-01-01T00:00:02Z" },
      { id: "m4", role: "assistant", content: "Sure", createdAt: "2026-01-01T00:00:03Z" },
      { id: "m5", role: "user", content: "Ok", createdAt: "2026-01-01T00:00:04Z" },
    ]);

    mockGetSessionMeta.mockReturnValue({}); // no journal

    const result = await generateSummary("owner-1", ["sess-1"]);
    expect(result).toBe(true);

    expect(vi.mocked(generateText)).toHaveBeenCalled();
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).not.toContain("Actions taken");
  });

  it("aggregates journal entries from multiple session keys", async () => {
    await setupGenerateSummaryMocks([
      { id: "m1", role: "user", content: "a", createdAt: "t1" },
      { id: "m2", role: "assistant", content: "b", createdAt: "t2" },
      { id: "m3", role: "user", content: "c", createdAt: "t3" },
      { id: "m4", role: "assistant", content: "d", createdAt: "t4" },
      { id: "m5", role: "user", content: "e", createdAt: "t5" },
    ]);

    // Two sessions, each with journal entries
    mockGetSessionMeta.mockImplementation((sessionKey: string) => {
      if (sessionKey === "sess-1") {
        return { journal: [{ toolName: "create_fact", timestamp: "t1", durationMs: 10, success: true }] };
      }
      if (sessionKey === "sess-2") {
        return { journal: [{ toolName: "create_fact", timestamp: "t2", durationMs: 10, success: true }] };
      }
      return {};
    });

    const result = await generateSummary("owner-1", ["sess-1", "sess-2"]);
    expect(result).toBe(true);

    expect(vi.mocked(generateText)).toHaveBeenCalled();
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain("create_fact: 2x");
  });

  it("expands payload keys with current owner scope before reading session metadata", async () => {
    await setupGenerateSummaryMocks([
      { id: "m1", role: "user", content: "a", createdAt: "t1" },
      { id: "m2", role: "assistant", content: "b", createdAt: "t2" },
      { id: "m3", role: "user", content: "c", createdAt: "t3" },
      { id: "m4", role: "assistant", content: "d", createdAt: "t4" },
      { id: "m5", role: "user", content: "e", createdAt: "t5" },
    ]);

    mockResolveOwnerScopeForWorker.mockReturnValue({
      cognitiveOwnerKey: "owner-1",
      knowledgeReadKeys: ["sess-1", "sess-2"],
      knowledgePrimaryKey: "sess-1",
      currentSessionId: "sess-1",
    });
    mockGetSessionMeta.mockImplementation((sessionKey: string) => {
      if (sessionKey === "sess-1") {
        return { journal: [{ toolName: "create_fact", timestamp: "t1", durationMs: 10, success: true }] };
      }
      if (sessionKey === "sess-2") {
        return { journal: [{ toolName: "create_fact", timestamp: "t2", durationMs: 10, success: true }] };
      }
      return {};
    });

    const result = await generateSummary("owner-1", ["sess-1"]);
    expect(result).toBe(true);

    expect(mockGetSessionMeta).toHaveBeenCalledWith("sess-1");
    expect(mockGetSessionMeta).toHaveBeenCalledWith("sess-2");

    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain("create_fact: 2x");
  });
});
