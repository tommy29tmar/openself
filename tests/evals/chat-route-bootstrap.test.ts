/**
 * Tests that POST /api/chat wires the bootstrap payload through to assembleContext.
 *
 * NOTE: Mocks must match the real route.ts imports:
 *   - usage-service (checkBudget, recordUsage) — NOT quota-service
 *   - session-service (isMultiUserEnabled, tryIncrementMessageCount, getMessageLimit,
 *     getMessageCount, DEFAULT_SESSION_ID) — NOT getOrCreateSession
 *   - assembleContext returns { systemPrompt, trimmedMessages, mode } — NOT contextParts/messages
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
  assembleBootstrapPayload: vi.fn(() => ({ payload: { ...mockBootstrapPayload }, data: { facts: [], soul: null, openConflictRecords: [], publishableFacts: [] } })),
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
  createAgentTools: vi.fn(() => ({ tools: {} })),
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

import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { assembleContext } from "@/lib/agent/context";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/chat bootstrap wiring", () => {
  it("calls assembleBootstrapPayload and passes result to assembleContext", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const req = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    await POST(req);

    // Bootstrap was called with the resolved scope
    // In single-user mode (isMultiUserEnabled=false), chatAuthCtx is null,
    // so the authInfo ternary resolves to undefined
    expect(assembleBootstrapPayload).toHaveBeenCalledWith(
      expect.objectContaining({ cognitiveOwnerKey: "cog-1" }),
      "en",
      undefined, // single-user: no auth context
      "hello",   // lastUserMessage extracted from messages
    );

    // assembleContext received the bootstrap payload as 5th argument + data as 6th + quotaInfo as 7th
    expect(assembleContext).toHaveBeenCalledWith(
      expect.any(Object),  // scope
      "en",                 // language
      expect.any(Array),    // messages
      undefined,            // single-user: chatAuthCtx is null → ternary yields undefined
      expect.objectContaining({ journeyState: "first_visit" }), // bootstrap payload
      expect.objectContaining({ facts: [], soul: null }),        // bootstrap data
      undefined,            // quotaInfo: single-user mode, no quota tracking
    );
  });
});
