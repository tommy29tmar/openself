/**
 * Tests for journal resume injection (INCOMPLETE_OPERATION block in assembleContext).
 * Verifies that pending operations from step exhaustion are injected into the system prompt,
 * and stale entries (>1h) are cleaned up.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies before importing ---

const mockSessionMeta: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn((sessionId: string) => mockSessionMeta[sessionId] ?? {}),
  mergeSessionMeta: vi.fn((sessionId: string, partial: Record<string, unknown>) => {
    const current = mockSessionMeta[sessionId] ?? {};
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) delete current[k];
      else current[k] = v;
    }
    mockSessionMeta[sessionId] = current;
    return current;
  }),
}));

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: vi.fn(() => []),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
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

import { assembleContext } from "@/lib/agent/context";
import { mergeSessionMeta } from "@/lib/services/session-metadata";
import type { OwnerScope } from "@/lib/auth/session";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-a",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Clear session meta
  for (const k of Object.keys(mockSessionMeta)) delete mockSessionMeta[k];
});

describe("journal resume injection", () => {
  it("injects INCOMPLETE_OPERATION when session has pending operations", () => {
    mockSessionMeta["sess-a"] = {
      pendingOperations: {
        timestamp: new Date().toISOString(),
        journal: [
          { toolName: "create_fact", summary: "skill/typescript", success: true },
          { toolName: "generate_page", summary: "composed page", success: true },
        ],
        finishReason: "step_exhaustion",
      },
    };

    const { systemPrompt } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hello" },
    ]);

    expect(systemPrompt).toContain("INCOMPLETE_OPERATION");
    expect(systemPrompt).toContain("create_fact: skill/typescript");
    expect(systemPrompt).toContain("generate_page: composed page");
    expect(systemPrompt).toContain("Resume where you left off");
  });

  it("skips injection when pendingOperations is older than 1 hour", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockSessionMeta["sess-a"] = {
      pendingOperations: {
        timestamp: twoHoursAgo,
        journal: [
          { toolName: "create_fact", summary: "skill/typescript", success: true },
        ],
        finishReason: "step_exhaustion",
      },
    };

    const { systemPrompt } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hello" },
    ]);

    expect(systemPrompt).not.toContain("INCOMPLETE_OPERATION");
  });

  it("cleans up stale pendingOperations from session metadata", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockSessionMeta["sess-a"] = {
      pendingOperations: {
        timestamp: twoHoursAgo,
        journal: [
          { toolName: "create_fact", summary: "old", success: true },
        ],
        finishReason: "step_exhaustion",
      },
    };

    assembleContext(SCOPE, "en", [{ role: "user", content: "hello" }]);

    // mergeSessionMeta should have been called to clean up
    expect(mergeSessionMeta).toHaveBeenCalledWith("sess-a", { pendingOperations: undefined });
  });

  it("does not inject when no pendingOperations exist", () => {
    mockSessionMeta["sess-a"] = {};

    const { systemPrompt } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hello" },
    ]);

    expect(systemPrompt).not.toContain("INCOMPLETE_OPERATION");
  });
});
