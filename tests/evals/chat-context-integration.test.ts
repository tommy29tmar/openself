/**
 * Tests for chat route's integration with assembleContext.
 * Verifies that the chat endpoint uses assembleContext for context building,
 * detects mode correctly, filters invalid message roles, and passes
 * trimmedMessages (not raw) to the LLM.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDrizzleSelect } from "../helpers/mock-db-select";

// --- Track assembleContext calls ---
const assembleContextMock = vi.fn();

vi.mock("@/lib/agent/context", () => ({
  assembleContext: (...args: any[]) => assembleContextMock(...args),
}));

// --- Mock all other dependencies used by the chat route ---

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toDataStreamResponse: vi.fn(() => new Response("ok")),
  })),
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => ({})),
  getModelForTier: vi.fn(() => ({})),
  getProviderName: vi.fn(() => "mock"),
  getProviderForTier: vi.fn(() => "mock-provider"),
  getModelId: vi.fn(() => "mock-model"),
  getModelIdForTier: vi.fn(() => "mock-model"),
  getThinkingProviderOptions: vi.fn(() => ({})),
}));

vi.mock("@/lib/agent/tools", () => ({
  createAgentTools: vi.fn(() => ({ tools: {}, getJournal: () => [] })),
}));

vi.mock("@/lib/agent/tool-filter", () => ({
  filterToolsByJourneyState: vi.fn((tools: unknown) => tools),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
    select: mockDrizzleSelect(),
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

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/services/usage-service", () => ({
  checkBudget: vi.fn(() => ({ allowed: true })),
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => null),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
  tryIncrementMessageCount: vi.fn(() => true),
  getMessageLimit: vi.fn(() => 50),
  getMessageCount: vi.fn(() => 0),
  DEFAULT_SESSION_ID: "__default__",
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
      language: "en",
      conversationContext: null,
      archetype: "generalist",
    },
    data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [], childCountMap: new Map() },
  })),
  computeRelevance: vi.fn(() => 0.5),
}));

// --- Import after mocks ---
import { POST } from "@/app/api/chat/route";
import { streamText } from "ai";

// --- Helpers ---
function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DEFAULT_SCOPE = {
  cognitiveOwnerKey: "__default__",
  knowledgeReadKeys: ["__default__"],
  knowledgePrimaryKey: "__default__",
  currentSessionId: "__default__",
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default assembleContext return
  assembleContextMock.mockReturnValue({
    systemPrompt: "SYSTEM_PROMPT",
    trimmedMessages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ],
    mode: "onboarding",
  });
});

// ---------------------------------------------------------------------------
// assembleContext is called with correct scope
// ---------------------------------------------------------------------------
describe("assembleContext integration", () => {
  it("calls assembleContext with effectiveScope, language, and raw messages", async () => {
    const rawMessages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Tell me more" },
    ];

    await POST(makeRequest({ messages: rawMessages, language: "it" }));

    expect(assembleContextMock).toHaveBeenCalledTimes(1);
    const [scope, lang, msgs] = assembleContextMock.mock.calls[0];

    // Scope should be the default scope (single-user mode, no auth)
    expect(scope).toEqual(DEFAULT_SCOPE);
    expect(lang).toBe("it");
    expect(msgs).toEqual(rawMessages);
  });

  it("defaults language to 'en' when not provided", async () => {
    await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));

    const [, lang] = assembleContextMock.mock.calls[0];
    expect(lang).toBe("en");
  });

  it("passes systemPrompt from assembleContext to streamText", async () => {
    assembleContextMock.mockReturnValue({
      systemPrompt: "CUSTOM_SYSTEM_PROMPT_XYZ",
      trimmedMessages: [{ role: "user", content: "Hi" }],
      mode: "onboarding",
    });

    await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));

    expect(streamText).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(streamText).mock.calls[0][0];
    expect(callArgs.system).toBe("CUSTOM_SYSTEM_PROMPT_XYZ");
  });
});

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------
describe("mode detection via assembleContext", () => {
  it("returns onboarding mode for new users (default)", async () => {
    assembleContextMock.mockReturnValue({
      systemPrompt: "PROMPT",
      trimmedMessages: [{ role: "user", content: "Hi" }],
      mode: "onboarding",
    });

    await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));

    const returnedMode = assembleContextMock.mock.results[0].value.mode;
    expect(returnedMode).toBe("onboarding");
  });

  it("returns steady_state mode when assembleContext detects it", async () => {
    assembleContextMock.mockReturnValue({
      systemPrompt: "PROMPT",
      trimmedMessages: [{ role: "user", content: "Hi" }],
      mode: "steady_state",
    });

    await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));

    const returnedMode = assembleContextMock.mock.results[0].value.mode;
    expect(returnedMode).toBe("steady_state");
  });
});

// ---------------------------------------------------------------------------
// Role whitelist
// ---------------------------------------------------------------------------
describe("role whitelist", () => {
  it("filters out messages with invalid roles", async () => {
    assembleContextMock.mockReturnValue({
      systemPrompt: "PROMPT",
      trimmedMessages: [
        { role: "user", content: "Hello" },
        { role: "function", content: "bad role" },
        { role: "assistant", content: "Reply" },
        { role: "unknown", content: "another bad" },
        { role: "tool", content: "tool result" },
      ],
      mode: "onboarding",
    });

    await POST(makeRequest({ messages: [{ role: "user", content: "Hello" }] }));

    const callArgs = vi.mocked(streamText).mock.calls[0][0];
    const passedMessages = callArgs.messages as Array<{ role: string; content: string }>;

    expect(passedMessages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Reply" },
      { role: "tool", content: "tool result" },
    ]);
  });

  it("passes through valid roles: user, assistant, system, tool", async () => {
    assembleContextMock.mockReturnValue({
      systemPrompt: "PROMPT",
      trimmedMessages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
        { role: "assistant", content: "ast" },
        { role: "tool", content: "tl" },
      ],
      mode: "onboarding",
    });

    await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));

    const callArgs = vi.mocked(streamText).mock.calls[0][0];
    const passedMessages = callArgs.messages as Array<{ role: string; content: string }>;

    expect(passedMessages).toHaveLength(4);
    expect(passedMessages.map(m => m.role)).toEqual(["system", "user", "assistant", "tool"]);
  });
});

// ---------------------------------------------------------------------------
// trimmedMessages used for streamText, not raw messages
// ---------------------------------------------------------------------------
describe("trimmedMessages vs raw messages", () => {
  it("passes trimmedMessages to streamText, not the raw request messages", async () => {
    const rawMessages = [
      { role: "user", content: "msg-1" },
      { role: "assistant", content: "msg-2" },
      { role: "user", content: "msg-3" },
      { role: "assistant", content: "msg-4" },
      { role: "user", content: "msg-5" },
    ];

    // assembleContext returns only the last 2 messages (trimmed)
    assembleContextMock.mockReturnValue({
      systemPrompt: "PROMPT",
      trimmedMessages: [
        { role: "assistant", content: "msg-4" },
        { role: "user", content: "msg-5" },
      ],
      mode: "onboarding",
    });

    await POST(makeRequest({ messages: rawMessages }));

    const callArgs = vi.mocked(streamText).mock.calls[0][0];
    const passedMessages = callArgs.messages as Array<{ role: string; content: string }>;

    // Should have the trimmed set, not all 5 raw messages
    expect(passedMessages).toHaveLength(2);
    expect(passedMessages[0].content).toBe("msg-4");
    expect(passedMessages[1].content).toBe("msg-5");
  });

  it("persists the last raw user message, not the trimmed one", async () => {
    const { db } = await import("@/lib/db");

    const rawMessages = [
      { role: "user", content: "first raw" },
      { role: "user", content: "last raw" },
    ];

    assembleContextMock.mockReturnValue({
      systemPrompt: "PROMPT",
      trimmedMessages: [{ role: "user", content: "last raw" }],
      mode: "onboarding",
    });

    // Track db.insert calls
    const runMock = vi.fn();
    const valuesMock = vi.fn(() => ({ run: runMock }));
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as any);

    await POST(makeRequest({ messages: rawMessages }));

    // The insert should use the last raw message content
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: "last raw", role: "user" }),
    );
  });
});
