import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies (same pattern as context-assembler.test.ts) ---
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
}));
vi.mock("@/lib/services/summary-service", () => ({
  getSummary: vi.fn(() => null),
}));
vi.mock("@/lib/services/memory-service", () => ({
  getActiveMemories: vi.fn(() => []),
  getActiveMemoriesScored: vi.fn(() => []),
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
vi.mock("@/lib/connectors/magic-paste", () => ({
  detectConnectorUrls: vi.fn(() => []),
}));
vi.mock("@/lib/services/episodic-service", () => ({
  getRecentEventsForContext: vi.fn(() => []),
  insertEvent: vi.fn(),
  queryEvents: vi.fn(() => []),
}));
vi.mock("@/lib/agent/journey", () => ({
  computeRelevance: vi.fn(() => 0.5),
}));
// Mock buildSystemPrompt to return minimal base — prevents TOOL_POLICY text from interfering
vi.mock("@/lib/agent/prompts", () => ({
  buildSystemPrompt: vi.fn(() => "BOOTSTRAP_PROMPT"),
}));

// Session metadata mock — keyed by sessionId so we can verify which session is read
const sessionMetaStore: Record<string, Record<string, unknown>> = {};
vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn((sessionId: string) => sessionMetaStore[sessionId] ?? {}),
  mergeSessionMeta: vi.fn(),
}));

import { assembleContext } from "@/lib/agent/context";
import type { OwnerScope } from "@/lib/auth/session";
import type { BootstrapPayload } from "@/lib/agent/journey";

const makeBootstrap = (state: string = "active_fresh"): BootstrapPayload => ({
  journeyState: state as BootstrapPayload["journeyState"],
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
});

const ANCHOR_SESSION = "anchor-session-id";
const CONV_SESSION = "conv-session-id";

const makeScope = (): OwnerScope => ({
  knowledgePrimaryKey: ANCHOR_SESSION,
  knowledgeReadKeys: [ANCHOR_SESSION],
  cognitiveOwnerKey: ANCHOR_SESSION,
  currentSessionId: ANCHOR_SESSION,
});

// Unique string that only appears in the injected context block, NOT in TOOL_POLICY
const CONTEXT_BLOCK_HEADER = "PENDING CONFIRMATIONS (from previous turn):";

describe("PENDING CONFIRMATIONS context block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(sessionMetaStore).forEach(k => delete sessionMetaStore[k]);
  });

  it("injects confirmationId from pending batch_delete into system prompt", () => {
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p1",
          type: "bulk_delete",
          factIds: ["f1", "f2"],
          confirmationId: "conf-abc-123",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì, confermo" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).toContain(CONTEXT_BLOCK_HEADER);
    expect(result.systemPrompt).toContain('confirmationId="conf-abc-123"');
    expect(result.systemPrompt).toContain("batch_facts");
  });

  it("does NOT inject non-bulk_delete pending types", () => {
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p2",
          type: "identity_delete",
          category: "identity",
          key: "name",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).not.toContain(CONTEXT_BLOCK_HEADER);
  });

  it("no block when no pending confirmations", () => {
    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Ciao" }],
      undefined,
      makeBootstrap("first_visit"),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).not.toContain(CONTEXT_BLOCK_HEADER);
  });

  it("reads from anchor session, not conversationSessionId", () => {
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p3",
          type: "bulk_delete",
          factIds: ["f3"],
          confirmationId: "conf-from-anchor",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    sessionMetaStore[CONV_SESSION] = {
      pendingConfirmations: [
        {
          id: "p-wrong",
          type: "bulk_delete",
          factIds: ["f-wrong"],
          confirmationId: "conf-from-conv-WRONG",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).toContain('confirmationId="conf-from-anchor"');
    expect(result.systemPrompt).not.toContain("conf-from-conv-WRONG");
  });

  it("filters out expired pending confirmations (5min TTL)", () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    sessionMetaStore[ANCHOR_SESSION] = {
      pendingConfirmations: [
        {
          id: "p-expired",
          type: "bulk_delete",
          factIds: ["f-old"],
          confirmationId: "conf-expired",
          createdAt: sixMinutesAgo,
        },
      ],
    };

    const result = assembleContext(
      makeScope(),
      "it",
      [{ role: "user", content: "Sì" }],
      undefined,
      makeBootstrap(),
      undefined,
      undefined,
      CONV_SESSION,
    );

    expect(result.systemPrompt).not.toContain(CONTEXT_BLOCK_HEADER);
    expect(result.systemPrompt).not.toContain("conf-expired");
  });
});
