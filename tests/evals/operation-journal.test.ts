/**
 * Tests for operation journal — tool call tracking, export, and resume injection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageConfig } from "@/lib/page-config/schema";
import type { JournalEntry } from "@/lib/services/session-metadata";

// Mock DB and services
const mockDraft: { config: PageConfig | null } = { config: null };

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(() => mockDraft.config ? { config: mockDraft.config, publishStatus: "draft" } : null),
  upsertDraft: vi.fn((username: string, config: PageConfig) => {
    mockDraft.config = config;
  }),
  getPublishedUsername: vi.fn(() => null),
}));
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
  searchFacts: vi.fn(() => []),
  createFact: vi.fn(() => ({
    id: "new-fact-1",
    category: "skill",
    key: "typescript",
    value: { name: "TypeScript" },
    visibility: "proposed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  getFactById: vi.fn(),
  setFactVisibility: vi.fn(),
  archiveFact: vi.fn(),
  unarchiveFact: vi.fn(),
  batchFactOperations: vi.fn(),
  reorderFacts: vi.fn(),
}));
vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));
vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn(),
  getSoulProfile: vi.fn(() => null),
  getActiveSoul: vi.fn(() => null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn(),
}));
vi.mock("@/lib/db/event-log", () => ({
  logEvent: vi.fn(),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({
    sections: [],
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" },
  })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({
    sections: [],
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" },
  })),
  filterPublishableFacts: vi.fn(() => []),
}));
vi.mock("@/lib/ai/translate", () => ({
  translatePageConfig: vi.fn(),
}));

import { createAgentTools } from "@/lib/agent/tools";

describe("operation journal", () => {
  beforeEach(() => {
    mockDraft.config = null;
    vi.clearAllMocks();
  });

  it("createAgentTools returns tools and getJournal", () => {
    const result = createAgentTools("en", "sess1");
    expect(result.tools).toBeDefined();
    expect(result.getJournal).toBeInstanceOf(Function);
    expect(result.getJournal()).toEqual([]);
  });

  it("records tool calls in journal after create_fact", async () => {
    const { tools, getJournal } = createAgentTools("en", "sess1");
    await tools.create_fact.execute(
      { category: "skill", key: "typescript", value: { name: "TypeScript" } },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    const journal = getJournal();
    expect(journal.length).toBe(1);
    expect(journal[0].toolName).toBe("create_fact");
    expect(journal[0].success).toBe(true);
    expect(journal[0].args).toEqual({ category: "skill", key: "typescript" });
    expect(journal[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(journal[0].timestamp).toBeTruthy();
  });

  it("journal entry includes summary", async () => {
    const { tools, getJournal } = createAgentTools("en", "sess1");
    await tools.create_fact.execute(
      { category: "skill", key: "typescript", value: { name: "TypeScript" } },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    const journal = getJournal();
    expect(journal[0].summary).toContain("skill/typescript");
  });

  it("records failed tool calls with success: false", async () => {
    // Make searchFacts throw
    const { searchFacts } = await import("@/lib/services/kb-service");
    vi.mocked(searchFacts).mockImplementation(() => { throw new Error("DB error"); });

    const { tools, getJournal } = createAgentTools("en", "sess1");
    await tools.search_facts.execute(
      { query: "test" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );

    const journal = getJournal();
    expect(journal.length).toBe(1);
    expect(journal[0].toolName).toBe("search_facts");
    expect(journal[0].success).toBe(false);
  });

  it("accumulates multiple journal entries across tool calls", async () => {
    const { tools, getJournal } = createAgentTools("en", "sess1");

    await tools.create_fact.execute(
      { category: "skill", key: "ts", value: { name: "TypeScript" } },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    await tools.create_fact.execute(
      { category: "skill", key: "react", value: { name: "React" } },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as any },
    );

    const journal = getJournal();
    expect(journal.length).toBe(2);
    expect(journal[0].toolName).toBe("create_fact");
    expect(journal[1].toolName).toBe("create_fact");
  });
});
