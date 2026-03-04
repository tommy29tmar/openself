import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/services/kb-service", () => ({ getActiveFacts: vi.fn(() => []), countFacts: vi.fn(() => 0) }));
vi.mock("@/lib/services/page-service", () => ({ hasAnyPublishedPage: vi.fn(() => false), getDraft: vi.fn(() => null) }));
vi.mock("@/lib/services/summary-service", () => ({ getSummary: vi.fn(() => null) }));
vi.mock("@/lib/services/memory-service", () => ({ getActiveMemories: vi.fn(() => []) }));
vi.mock("@/lib/services/soul-service", () => ({ getActiveSoul: vi.fn(() => null) }));
vi.mock("@/lib/services/conflict-service", () => ({ getOpenConflicts: vi.fn(() => []) }));
vi.mock("@/lib/services/page-projection", () => ({ filterPublishableFacts: vi.fn(() => []) }));
vi.mock("@/lib/agent/prompts", () => ({ buildSystemPrompt: vi.fn(() => "PROMPT") }));
vi.mock("@/lib/agent/journey", () => ({ computeRelevance: vi.fn(() => 0.5) }));
vi.mock("@/lib/services/session-metadata", () => ({ getSessionMeta: vi.fn(() => ({})), mergeSessionMeta: vi.fn() }));
vi.mock("@/lib/connectors/magic-paste", () => ({ detectConnectorUrls: vi.fn(() => []) }));

import { assembleContext } from "@/lib/agent/context";
import { getDraft } from "@/lib/services/page-service";

const SCOPE = { cognitiveOwnerKey: "cog-1", knowledgeReadKeys: ["sess-a"], knowledgePrimaryKey: "sess-a", currentSessionId: "sess-a" };
const ACTIVE_FRESH_BOOTSTRAP = {
  journeyState: "active_fresh" as const, language: "en", situations: [], expertiseLevel: "novice" as const,
  userName: "Alice", lastSeenDaysAgo: 1, publishedUsername: null, pendingProposalCount: 0,
  thinSections: [], staleFacts: [], openConflicts: [], archivableFacts: [], conversationContext: null, archetype: "generalist" as const,
};

describe("Context expansion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pageState absent when draft is null", () => {
    vi.mocked(getDraft).mockReturnValue(null);
    const { systemPrompt } = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(systemPrompt).not.toContain("CURRENT DRAFT PAGE:");
  });

  it("pageState present with correct field names", () => {
    vi.mocked(getDraft).mockReturnValue({
      config: { layoutTemplate: "vertical", surface: "canvas", voice: "signal", light: "day", sections: [{ type: "hero", slot: "main", widgetId: "hero-default" }] } as never,
      username: "alice", status: "draft", configHash: "abc123", updatedAt: null,
    });
    const { systemPrompt } = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(systemPrompt).toContain("CURRENT DRAFT PAGE:");
    expect(systemPrompt).toContain("hero");
    expect(systemPrompt).toContain("canvas");
    expect(systemPrompt).toContain("signal");
    expect(systemPrompt).toContain("vertical");
  });

  it("pageState absent for first_visit", () => {
    vi.mocked(getDraft).mockReturnValue({ config: { sections: [], surface: "canvas", voice: "signal", light: "day" } as never, username: "x", status: "draft", configHash: null, updatedAt: null });
    const { systemPrompt } = assembleContext(SCOPE, "en", [{ role: "user", content: "hi" }], undefined, { ...ACTIVE_FRESH_BOOTSTRAP, journeyState: "first_visit" as const });
    expect(systemPrompt).not.toContain("CURRENT DRAFT PAGE:");
  });

  it("recent turns cap is at least 20", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` })) as Array<{ role: "user" | "assistant"; content: string }>;
    const { trimmedMessages } = assembleContext(SCOPE, "en", msgs, undefined, ACTIVE_FRESH_BOOTSTRAP);
    expect(trimmedMessages.length).toBeGreaterThanOrEqual(20);
  });
});
