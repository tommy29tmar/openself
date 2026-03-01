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

import { buildJournalDigest, enqueueSummaryJob, generateSummary } from "@/lib/services/summary-service";
import { generateText } from "ai";
import type { JournalEntry } from "@/lib/services/session-metadata";

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckBudget.mockReturnValue({ allowed: true });
  mockGetSessionMeta.mockReturnValue({});
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
      { toolName: "set_theme", timestamp: "t5", durationMs: 50, success: true },
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
// generateSummary — journal integration
// ---------------------------------------------------------------------------

describe("generateSummary journal integration", () => {
  it("includes journal digest in LLM prompt when journal entries exist", async () => {
    // Setup: mock DB to return enough messages
    const { db, sqlite } = await import("@/lib/db");
    vi.mocked(sqlite.prepare).mockImplementation((sql: string) => {
      if (sql.includes("cursor")) {
        return { get: vi.fn(() => undefined), run: vi.fn(() => ({ changes: 0 })) } as any;
      }
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
            all: vi.fn(() => [
              { id: "m1", role: "user", content: "Update my bio", createdAt: "2026-01-01T00:00:00Z" },
              { id: "m2", role: "assistant", content: "Done!", createdAt: "2026-01-01T00:00:01Z" },
              { id: "m3", role: "user", content: "Add skills", createdAt: "2026-01-01T00:00:02Z" },
              { id: "m4", role: "assistant", content: "Added", createdAt: "2026-01-01T00:00:03Z" },
              { id: "m5", role: "user", content: "Thanks", createdAt: "2026-01-01T00:00:04Z" },
            ]),
          })),
          get: vi.fn(() => null),
        })),
      })),
    } as any);

    // Mock getSessionMeta to return journal entries
    mockGetSessionMeta.mockReturnValue({
      journal: [
        { toolName: "create_fact", timestamp: "2026-01-01T00:00:00Z", durationMs: 10, success: true },
        { toolName: "generate_page", timestamp: "2026-01-01T00:00:01Z", durationMs: 100, success: true },
      ],
    });

    await generateSummary("owner-1", ["sess-1"]);

    // Verify LLM was called with prompt containing journal digest
    expect(vi.mocked(generateText)).toHaveBeenCalled();
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain("Actions taken in this conversation:");
    expect(callArgs.prompt).toContain("create_fact: 1x");
    expect(callArgs.prompt).toContain("generate_page: 1x");
  });

  it("omits journal section when no journal entries exist", async () => {
    const { db, sqlite } = await import("@/lib/db");
    vi.mocked(sqlite.prepare).mockImplementation(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 1 })),
    }) as any);
    vi.mocked(sqlite.transaction).mockImplementation((fn: any) => () => fn());

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            all: vi.fn(() => [
              { id: "m1", role: "user", content: "Hello", createdAt: "2026-01-01T00:00:00Z" },
              { id: "m2", role: "assistant", content: "Hi!", createdAt: "2026-01-01T00:00:01Z" },
              { id: "m3", role: "user", content: "How?", createdAt: "2026-01-01T00:00:02Z" },
              { id: "m4", role: "assistant", content: "Sure", createdAt: "2026-01-01T00:00:03Z" },
              { id: "m5", role: "user", content: "Ok", createdAt: "2026-01-01T00:00:04Z" },
            ]),
          })),
          get: vi.fn(() => null),
        })),
      })),
    } as any);

    mockGetSessionMeta.mockReturnValue({}); // no journal

    await generateSummary("owner-1", ["sess-1"]);

    expect(vi.mocked(generateText)).toHaveBeenCalled();
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).not.toContain("Actions taken");
  });

  it("aggregates journal entries from multiple session keys", async () => {
    const { db, sqlite } = await import("@/lib/db");
    vi.mocked(sqlite.prepare).mockImplementation(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 1 })),
    }) as any);
    vi.mocked(sqlite.transaction).mockImplementation((fn: any) => () => fn());

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            all: vi.fn(() => [
              { id: "m1", role: "user", content: "a", createdAt: "t1" },
              { id: "m2", role: "assistant", content: "b", createdAt: "t2" },
              { id: "m3", role: "user", content: "c", createdAt: "t3" },
              { id: "m4", role: "assistant", content: "d", createdAt: "t4" },
              { id: "m5", role: "user", content: "e", createdAt: "t5" },
            ]),
          })),
          get: vi.fn(() => null),
        })),
      })),
    } as any);

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

    await generateSummary("owner-1", ["sess-1", "sess-2"]);

    expect(vi.mocked(generateText)).toHaveBeenCalled();
    const callArgs = vi.mocked(generateText).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain("create_fact: 2x");
  });
});
