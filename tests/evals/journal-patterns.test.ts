/**
 * Tests for journal pattern analysis (Circuit F2, Task 22).
 * detectJournalPatterns: deterministic pattern detection from journal entries.
 * Integration: patterns saved as meta-memories via deep heartbeat.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectJournalPatterns, type JournalPattern } from "@/lib/services/journal-patterns";
import type { JournalEntry } from "@/lib/services/session-metadata";

// --- Helpers ---

function makeEntry(toolName: string, args?: Record<string, unknown>): JournalEntry {
  return {
    toolName,
    timestamp: new Date().toISOString(),
    durationMs: 10,
    success: true,
    args,
  };
}

describe("detectJournalPatterns", () => {
  it("returns empty when journal has <5 entries total", () => {
    const entries = [
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("generate_page"),
    ];
    expect(detectJournalPatterns(entries)).toEqual([]);
  });

  it("detects repeated_tool: same tool called 5+ times", () => {
    const entries = [
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("generate_page"),
    ];
    const patterns = detectJournalPatterns(entries);
    const repeated = patterns.find(p => p.type === "repeated_tool");
    expect(repeated).toBeDefined();
    expect(repeated!.evidence.tool).toBe("create_fact");
    expect(repeated!.evidence.frequency).toBe(5);
    expect(repeated!.description).toContain("create_fact");
    expect(repeated!.suggestion).toBeTruthy();
  });

  it("does not flag repeated_tool below threshold", () => {
    const entries = [
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("create_fact"),
      makeEntry("generate_page"),
    ];
    const patterns = detectJournalPatterns(entries);
    const repeated = patterns.find(p => p.type === "repeated_tool" && p.evidence.tool === "create_fact");
    expect(repeated).toBeUndefined();
  });

  it("detects tool_sequence: same A→B pattern 3+ times", () => {
    const entries = [
      makeEntry("create_fact"),
      makeEntry("generate_page"),
      makeEntry("create_fact"),
      makeEntry("generate_page"),
      makeEntry("create_fact"),
      makeEntry("generate_page"),
    ];
    const patterns = detectJournalPatterns(entries);
    const seq = patterns.find(p => p.type === "tool_sequence");
    expect(seq).toBeDefined();
    expect(seq!.evidence.sequence).toEqual(["create_fact", "generate_page"]);
    expect(seq!.evidence.frequency).toBe(3);
  });

  it("detects correction_pattern: create→delete for same category 2+ times", () => {
    const entries = [
      makeEntry("create_fact", { category: "skill", key: "react" }),
      makeEntry("delete_fact", { category: "skill", key: "react" }),
      makeEntry("create_fact", { category: "skill", key: "ts" }),
      makeEntry("delete_fact", { category: "skill", key: "ts" }),
      makeEntry("generate_page"),
    ];
    const patterns = detectJournalPatterns(entries);
    const correction = patterns.find(p => p.type === "correction_pattern");
    expect(correction).toBeDefined();
    expect(correction!.evidence.category).toBe("skill");
    expect(correction!.evidence.frequency).toBe(2);
    expect(correction!.suggestion).toContain("skill");
  });

  it("returns max 2 patterns per analysis", () => {
    // Generate enough entries to trigger 3+ patterns
    const entries = [
      // repeated_tool: create_fact (6x)
      makeEntry("create_fact"), makeEntry("create_fact"), makeEntry("create_fact"),
      makeEntry("create_fact"), makeEntry("create_fact"), makeEntry("create_fact"),
      // tool_sequence: create_fact→generate_page (triggered by interleaving)
      makeEntry("generate_page"), makeEntry("create_fact"), makeEntry("generate_page"),
      makeEntry("create_fact"), makeEntry("generate_page"),
      // another repeated_tool: generate_page (4x... not enough for 5)
      makeEntry("generate_page"),
    ];
    const patterns = detectJournalPatterns(entries);
    expect(patterns.length).toBeLessThanOrEqual(2);
  });

  it("sorts by frequency descending", () => {
    const entries = [
      // tool_sequence: a→b appears 3 times (frequency 3)
      makeEntry("a"), makeEntry("b"),
      makeEntry("a"), makeEntry("b"),
      makeEntry("a"), makeEntry("b"),
      // repeated_tool: a appears 6 times (frequency 6)
      makeEntry("a"), makeEntry("a"), makeEntry("a"),
    ];
    const patterns = detectJournalPatterns(entries);
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    if (patterns.length >= 2) {
      expect(patterns[0].evidence.frequency!).toBeGreaterThanOrEqual(patterns[1].evidence.frequency!);
    }
  });

  it("handles unknown category in correction_pattern gracefully", () => {
    const entries = [
      makeEntry("create_fact"), // no args
      makeEntry("delete_fact"),
      makeEntry("create_fact"),
      makeEntry("delete_fact"),
      makeEntry("generate_page"),
    ];
    const patterns = detectJournalPatterns(entries);
    const correction = patterns.find(p => p.type === "correction_pattern");
    expect(correction).toBeDefined();
    expect(correction!.evidence.category).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// getRecentJournalEntries — unit test (mocked DB)
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(() => null) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })) })),
  },
  sqlite: {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 0 })),
    })),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  sessions: { id: "id", metadata: "metadata" },
}));

import { getRecentJournalEntries } from "@/lib/services/session-metadata";
import { sqlite } from "@/lib/db";

describe("getRecentJournalEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockRecentJournalQueries(
    sessionRows: Array<{ id: string }>,
    messageRows: Array<{ tool_calls: string | null }>,
  ) {
    vi.mocked(sqlite.prepare).mockImplementation((sql: string) => {
      if (sql.includes("SELECT id FROM sessions")) {
        return {
          all: vi.fn(() => sessionRows),
          get: vi.fn(),
          run: vi.fn(),
        } as any;
      }
      if (sql.includes("SELECT tool_calls")) {
        return {
          all: vi.fn(() => messageRows),
          get: vi.fn(),
          run: vi.fn(),
        } as any;
      }
      return {
        all: vi.fn(() => []),
        get: vi.fn(),
        run: vi.fn(() => ({ changes: 0 })),
      } as any;
    });
  }

  it("aggregates journal entries from assistant message toolCalls", () => {
    mockRecentJournalQueries(
      [{ id: "sess-1" }, { id: "sess-2" }],
      [
        { tool_calls: JSON.stringify([{ toolName: "create_fact", timestamp: "t1", durationMs: 10, success: true }]) },
        { tool_calls: JSON.stringify([{ toolName: "generate_page", timestamp: "t2", durationMs: 50, success: true }]) },
      ],
    );

    const entries = getRecentJournalEntries("owner-1", 5);
    expect(entries).toHaveLength(2);
    expect(entries[0].toolName).toBe("create_fact");
    expect(entries[1].toolName).toBe("generate_page");
  });

  it("skips messages with no toolCalls payload", () => {
    mockRecentJournalQueries(
      [{ id: "sess-1" }],
      [
        { tool_calls: null },
        { tool_calls: JSON.stringify([{ toolName: "a", timestamp: "t", durationMs: 1, success: true }]) },
      ],
    );

    const entries = getRecentJournalEntries("owner-1", 5);
    expect(entries).toHaveLength(1);
  });

  it("skips malformed toolCalls gracefully", () => {
    mockRecentJournalQueries(
      [{ id: "sess-1" }],
      [
        { tool_calls: "not-json{{{" },
        { tool_calls: JSON.stringify([{ toolName: "b", timestamp: "t", durationMs: 1, success: true }]) },
      ],
    );

    const entries = getRecentJournalEntries("owner-1", 5);
    expect(entries).toHaveLength(1);
    expect(entries[0].toolName).toBe("b");
  });

  it("returns empty when no sessions found", () => {
    mockRecentJournalQueries([], []);

    const entries = getRecentJournalEntries("owner-1", 5);
    expect(entries).toHaveLength(0);
  });
});
