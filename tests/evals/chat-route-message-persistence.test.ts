import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedRows: Array<Record<string, unknown>> = [];
let mockAssistantText = "Assistant reply";
let mockFinishReason = "stop";
let mockJournal: Array<Record<string, unknown>> = [];

vi.mock("ai", () => ({
  streamText: vi.fn((opts: Record<string, unknown>) => {
    const onFinish = opts.onFinish as ((result: {
      text: string;
      usage?: { promptTokens?: number; completionTokens?: number };
      finishReason: string;
    }) => Promise<void>) | undefined;
    if (onFinish) {
      void onFinish({
        text: mockAssistantText,
        usage: { promptTokens: 0, completionTokens: 0 },
        finishReason: mockFinishReason,
      });
    }
    return {
      toDataStreamResponse: () => new Response("ok"),
    };
  }),
  generateText: vi.fn(async () => ({ text: "{}" })),
}));

vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => ({})),
  getModelForTier: vi.fn(() => ({})),
  getProviderName: vi.fn(() => "mock"),
  getProviderForTier: vi.fn(() => "mock-provider"),
  getModelId: vi.fn(() => "mock-model"),
  getModelIdForTier: vi.fn(() => "mock-model"),
}));

vi.mock("@/lib/agent/tools", () => ({
  createAgentTools: vi.fn(() => ({ tools: {}, getJournal: () => mockJournal })),
}));

vi.mock("@/lib/agent/tool-filter", () => ({
  filterToolsByJourneyState: vi.fn((tools: unknown) => tools),
}));

vi.mock("@/lib/agent/context", () => ({
  assembleContext: vi.fn(() => ({
    systemPrompt: "SYSTEM_PROMPT",
    trimmedMessages: [{ role: "user", content: "Ciao" }],
    mode: "onboarding",
  })),
}));

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({
    payload: {
      journeyState: "first_visit",
      situations: [],
      expertiseLevel: "novice",
      userName: null,
      lastSeenDaysAgo: null,
      publishedUsername: null,
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      openConflicts: [],
      archivableFacts: [],
      language: "it",
      conversationContext: null,
      archetype: "generalist",
    },
    data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [], childCountMap: new Map() },
  })),
  computeRelevance: vi.fn(() => 0.5),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "__default__",
    knowledgeReadKeys: ["__default__"],
    knowledgePrimaryKey: "__default__",
    currentSessionId: "__default__",
  })),
  getAuthContext: vi.fn(() => null),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
  tryIncrementMessageCount: vi.fn(() => true),
  getMessageLimit: vi.fn(() => 50),
  getMessageCount: vi.fn(() => 0),
  DEFAULT_SESSION_ID: "__default__",
}));

vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: vi.fn(() => ({ allowed: true })),
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/services/summary-service", () => ({
  enqueueSummaryJob: vi.fn(),
}));

vi.mock("@/lib/services/confirmation-service", () => ({
  pruneUnconfirmedPendings: vi.fn(),
}));

vi.mock("@/lib/connectors/import-event", () => ({
  consumeImportEvent: vi.fn(() => null),
  markImportEventConsumed: vi.fn(),
  revertImportEvent: vi.fn(),
}));

vi.mock("@/lib/connectors/import-gap-analyzer", () => ({
  analyzeImportGaps: vi.fn(() => ({ summary: {}, gaps: [] })),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
}));

vi.mock("@/lib/services/session-metadata", () => ({
  mergeSessionMeta: vi.fn(),
  getSessionMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/worker/index", () => ({
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => ({
        run: vi.fn(() => {
          insertedRows.push(row);
        }),
      })),
    })),
  },
  sqlite: {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 0 })),
      get: vi.fn(() => ({ count: 0 })),
    })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  messages: "messages_table",
}));

function makeRequest() {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Ciao" }], language: "it" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
  mockAssistantText = "Assistant reply";
  mockFinishReason = "stop";
  mockJournal = [];
});

describe("chat route assistant message persistence", () => {
  it("persists toolCalls alongside assistant text when journal entries exist", async () => {
    mockJournal = [
      {
        toolName: "create_fact",
        timestamp: "2026-03-05T21:15:30.216Z",
        durationMs: 14,
        success: true,
        args: { category: "identity", key: "name" },
        summary: "identity/name",
      },
    ];

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    const assistantInsert = insertedRows.find((row) => row.role === "assistant");
    expect(assistantInsert).toEqual(
      expect.objectContaining({
        content: "Assistant reply",
        toolCalls: mockJournal,
      }),
    );
  });

  it("persists synthetic fallback with toolCalls when the model returns no text", async () => {
    mockAssistantText = "";
    mockFinishReason = "tool-calls";
    mockJournal = [
      {
        toolName: "generate_page",
        timestamp: "2026-03-05T21:16:02.278Z",
        durationMs: 120,
        success: true,
        summary: "composed page",
      },
    ];

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    const assistantInsert = insertedRows.find((row) => row.role === "assistant");
    expect(assistantInsert).toEqual(
      expect.objectContaining({
        content: expect.stringContaining("Sto ancora"),
        toolCalls: mockJournal,
      }),
    );
  });

  it("sanitizes unsupported success claims when no write tool ran", async () => {
    mockAssistantText = "Salvato. Ora lo vedi in anteprima.";
    mockJournal = [
      {
        toolName: "search_facts",
        timestamp: "2026-03-05T21:16:30.000Z",
        durationMs: 12,
        success: true,
        summary: "searched \"bio\" (1 results)",
      },
    ];

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    const assistantInsert = insertedRows.find((row) => row.role === "assistant");
    expect(assistantInsert).toEqual(
      expect.objectContaining({
        content: "Non l'ho ancora eseguito. Se vuoi, lo faccio adesso.",
        toolCalls: mockJournal,
      }),
    );
  });
});
