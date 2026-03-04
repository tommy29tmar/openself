/**
 * Tests that POST /api/chat consumes the import event flag and wires
 * importGapReport through to assembleContext's bootstrap payload.
 *
 * Follows the same mock structure as chat-route-bootstrap.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (hoisted, matching real route.ts imports) ---

const mockBootstrapPayload = {
  journeyState: "first_visit" as const,
  situations: [] as string[],
  expertiseLevel: "novice" as const,
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [] as string[],
  staleFacts: [] as string[],
  openConflicts: [] as string[],
  archivableFacts: [],
  language: "en",
  conversationContext: null,
  archetype: "generalist" as const,
};

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({
    payload: { ...mockBootstrapPayload },
    data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [], childCountMap: new Map() },
  })),
  computeRelevance: vi.fn(() => 0.5),
}));

vi.mock("@/lib/agent/context", () => ({
  assembleContext: vi.fn(() => ({
    systemPrompt: "test prompt",
    trimmedMessages: [{ role: "user", content: "hello" }],
    mode: "onboarding",
  })),
}));

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScope: vi.fn(() => ({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
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

vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelForTier: vi.fn(() => "mock-model"),
  getProviderName: vi.fn(() => "anthropic"),
  getProviderForTier: vi.fn(() => "mock-provider"),
  getModelId: vi.fn(() => "mock-model-id"),
  getModelIdForTier: vi.fn(() => "mock-model-id"),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toDataStreamResponse: vi.fn(() => new Response("ok")),
  })),
  generateText: vi.fn(() => ({ text: "" })),
}));

vi.mock("@/lib/agent/tools", () => ({
  createAgentTools: vi.fn(() => ({ tools: {}, getJournal: () => [] })),
}));

vi.mock("@/lib/agent/tool-filter", () => ({
  filterToolsByJourneyState: vi.fn((tools: unknown) => tools),
}));

vi.mock("@/lib/db", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })) },
  sqlite: { prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(() => ({ count: 0 })) })) },
}));

vi.mock("@/lib/db/schema", () => ({
  messages: {},
}));

vi.mock("@/lib/services/summary-service", () => ({
  enqueueSummaryJob: vi.fn(),
}));

vi.mock("@/lib/services/confirmation-service", () => ({
  pruneUnconfirmedPendings: vi.fn(),
}));

// Mock import-event: controllable flag
const mockConsumeImportEvent = vi.fn();
const mockMarkImportEventConsumed = vi.fn();
const mockRevertImportEvent = vi.fn();
vi.mock("@/lib/connectors/import-event", () => ({
  consumeImportEvent: (...args: unknown[]) => mockConsumeImportEvent(...args),
  markImportEventConsumed: (...args: unknown[]) => mockMarkImportEventConsumed(...args),
  revertImportEvent: (...args: unknown[]) => mockRevertImportEvent(...args),
}));

// Mock gap analyzer
const mockAnalyzeImportGaps = vi.fn(() => ({
  summary: { currentRole: "CTO at Startup", pastRoles: 2, educationCount: 1, languageCount: 1, skillCount: 5, certificationCount: 0 },
  gaps: [{ priority: 1, type: "no_interests", description: "No interests found." }],
}));
vi.mock("@/lib/connectors/import-gap-analyzer", () => ({
  analyzeImportGaps: (...args: unknown[]) => mockAnalyzeImportGaps(...args),
}));

// Mock getActiveFacts (may already be imported by route; mock to return empty)
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
}));

import { assembleContext } from "@/lib/agent/context";
import { streamText } from "ai";

beforeEach(async () => {
  vi.clearAllMocks();
  mockConsumeImportEvent.mockReturnValue(null); // default: no flag

  // Reset mocks that individual tests may override back to defaults.
  const { resolveOwnerScope, getAuthContext } = await import("@/lib/auth/session");
  vi.mocked(resolveOwnerScope).mockReturnValue({
    cognitiveOwnerKey: "cog-1",
    knowledgeReadKeys: ["sess-a"],
    knowledgePrimaryKey: "sess-a",
    currentSessionId: "sess-a",
  } as any);
  vi.mocked(getAuthContext).mockReturnValue(null);

  const sessionService = await import("@/lib/services/session-service");
  vi.mocked(sessionService.isMultiUserEnabled).mockReturnValue(false);
  vi.mocked(sessionService.getMessageCount).mockReturnValue(0);
  vi.mocked(sessionService.getMessageLimit).mockReturnValue(50);
});

function makeRequest(body?: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Ho importato il mio profilo LinkedIn" }],
      ...body,
    }),
  });
}

describe("POST /api/chat import flag wiring", () => {
  it("calls consumeImportEvent with writeSessionId", async () => {
    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    // writeSessionId = effectiveScope.knowledgePrimaryKey = "sess-a"
    expect(mockConsumeImportEvent).toHaveBeenCalledWith("sess-a");
  });

  it("populates bootstrap.importGapReport when flag is consumed", async () => {
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-1",
      factsWritten: 10,
      timestamp: Date.now(),
      status: "processing",
    });

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    // assembleContext args in single-user mode:
    // (scope, language, messages, authInfo=undefined, bootstrap, bootstrapData, quotaInfo=undefined)
    expect(assembleContext).toHaveBeenCalledWith(
      expect.any(Object),      // scope
      expect.any(String),       // language
      expect.any(Array),        // messages
      undefined,                // authInfo: single-user → chatAuthCtx is null → undefined
      expect.objectContaining({
        importGapReport: expect.objectContaining({
          summary: expect.objectContaining({ currentRole: "CTO at Startup" }),
        }),
      }),                       // bootstrap
      expect.any(Object),       // bootstrapData
      undefined,                // quotaInfo: single-user → no quota tracking
    );
  });

  it("does not call analyzeImportGaps when no flag present", async () => {
    mockConsumeImportEvent.mockReturnValue(null);

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    expect(mockAnalyzeImportGaps).not.toHaveBeenCalled();
  });

  it("forces has_recent_import situation when flag is consumed", async () => {
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-2",
      factsWritten: 5,
      timestamp: Date.now(),
      status: "processing",
    });

    const { POST } = await import("@/app/api/chat/route");
    await POST(makeRequest());

    expect(assembleContext).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      expect.any(Array),
      undefined,                // single-user: no auth context
      expect.objectContaining({
        situations: expect.arrayContaining(["has_recent_import"]),
      }),
      expect.any(Object),
      undefined,                // single-user: no quotaInfo
    );
  });

  it("does not consume flag if quota rejects (429 path)", async () => {
    // Use anonymous multi-user path for 429.
    const { resolveOwnerScope } = await import("@/lib/auth/session");
    vi.mocked(resolveOwnerScope).mockReturnValue({
      cognitiveOwnerKey: "sess-anon",
      knowledgeReadKeys: ["sess-anon"],
      knowledgePrimaryKey: "sess-anon",
      currentSessionId: "sess-anon",
    } as any);

    const sessionService = await import("@/lib/services/session-service");
    vi.mocked(sessionService.isMultiUserEnabled).mockReturnValue(true);
    vi.mocked(sessionService.getMessageCount).mockReturnValue(50); // at limit
    vi.mocked(sessionService.getMessageLimit).mockReturnValue(50);

    // Set up flag (should never be consumed)
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-3",
      factsWritten: 5,
      timestamp: Date.now(),
      status: "processing",
    });

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makeRequest());

    // Route returns 429 via anonymous getMessageCount path before consume point
    expect(res.status).toBe(429);
    // consumeImportEvent must NOT have been called
    expect(mockConsumeImportEvent).not.toHaveBeenCalled();
  });

  it("reverts flag on pre-stream error", async () => {
    mockConsumeImportEvent.mockReturnValue({
      importId: "imp-4",
      factsWritten: 5,
      timestamp: Date.now(),
      status: "processing",
    });

    // Make streamText throw to simulate pre-stream error
    vi.mocked(streamText).mockImplementationOnce(() => { throw new Error("LLM unavailable"); });

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(mockRevertImportEvent).toHaveBeenCalledWith("sess-a");
    expect(mockMarkImportEventConsumed).not.toHaveBeenCalled();
  });
});
