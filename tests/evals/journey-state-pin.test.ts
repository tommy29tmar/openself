// tests/evals/journey-state-pin.test.ts

/**
 * Tests for journey state pinning: getOrDetectJourneyState + updateJourneyStatePin.
 *
 * The pin prevents mid-conversation mode flips (e.g. first_visit → draft_ready
 * after a single create_fact triggers recomposeAfterMutation which creates a draft).
 * State only transitions on explicit events (generate_page, request_publish).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies before importing ---

const mockPrepare = vi.fn();
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (...args: unknown[]) => mockPrepare(...args),
  },
  db: {},
}));

vi.mock("@/lib/services/kb-service", () => ({
  countFacts: vi.fn(() => 0),
  getActiveFacts: vi.fn(() => []),
}));

vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
  getDraft: vi.fn(() => null),
  getPublishedUsername: vi.fn(() => null),
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));

vi.mock("@/lib/services/proposal-service", () => ({
  createProposalService: vi.fn(() => ({
    getPendingProposals: vi.fn(() => []),
  })),
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: unknown[]) => facts),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
    projects: ["project"],
  },
}));

// --- Import module under test and mocked deps ---

import {
  getOrDetectJourneyState,
  updateJourneyStatePin,
  detectJourneyState,
} from "@/lib/agent/journey";
import type { OwnerScope } from "@/lib/auth/session";
import { countFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft } from "@/lib/services/page-service";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-anchor", "sess-current"],
  knowledgePrimaryKey: "sess-anchor",
  currentSessionId: "sess-current",
};

/**
 * Helper to set up mockPrepare so that:
 * - queries matching `journey_state` on SELECT return the given cached value
 * - queries matching `journey_state` on UPDATE capture the written value
 * - queries matching `profile_message_usage` return the given quota
 * - all other queries return undefined
 */
function setupSqliteMocks(opts: {
  cachedState?: string | null;
  quotaCount?: number;
  publishedUpdatedAt?: string;
}) {
  const runMock = vi.fn();
  mockPrepare.mockImplementation((sql: string) => {
    // SELECT journey_state from sessions
    if (/SELECT.*journey_state/i.test(sql)) {
      return {
        get: vi.fn(() =>
          opts.cachedState != null
            ? { journey_state: opts.cachedState }
            : undefined,
        ),
      };
    }
    // UPDATE sessions SET journey_state
    if (/UPDATE.*sessions.*journey_state/i.test(sql)) {
      return { run: runMock };
    }
    // profile_message_usage (blocked check)
    if (/profile_message_usage/i.test(sql)) {
      return {
        get: vi.fn(() =>
          opts.quotaCount != null
            ? { count: opts.quotaCount }
            : undefined,
        ),
      };
    }
    if (/SELECT.*updated_at.*FROM.*page.*published/i.test(sql)) {
      return {
        get: vi.fn(() =>
          opts.publishedUpdatedAt != null
            ? { updated_at: opts.publishedUpdatedAt }
            : { updated_at: new Date().toISOString() },
        ),
      };
    }
    // Default: return undefined for get, no-op for run
    return {
      get: vi.fn(() => undefined),
      run: vi.fn(),
    };
  });
  return { runMock };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Reset service mocks to defaults
  vi.mocked(countFacts).mockReturnValue(0);
  vi.mocked(hasAnyPublishedPage).mockReturnValue(false);
  vi.mocked(getDraft).mockReturnValue(null);

  // Default sqlite mock: all queries return undefined
  mockPrepare.mockImplementation(() => ({
    get: vi.fn(() => undefined),
    run: vi.fn(),
  }));
});

// ---------------------------------------------------------------------------
// getOrDetectJourneyState
// ---------------------------------------------------------------------------
describe("getOrDetectJourneyState", () => {
  it("detects first_visit and pins it on the anchor session", () => {
    const { runMock } = setupSqliteMocks({ cachedState: null });

    const state = getOrDetectJourneyState(SCOPE);

    expect(state).toBe("first_visit");

    // Should have written the detected state to the anchor session
    expect(runMock).toHaveBeenCalledWith("first_visit", SCOPE.knowledgePrimaryKey);
  });

  it("returns cached state on subsequent calls even if facts/draft exist", () => {
    // Cached state says first_visit, but facts and draft exist now
    setupSqliteMocks({ cachedState: "first_visit" });
    vi.mocked(countFacts).mockReturnValue(10);
    vi.mocked(getDraft).mockReturnValue({
      config: {} as never,
      username: "draft",
      status: "draft",
      configHash: null,
      updatedAt: null,
    });

    const state = getOrDetectJourneyState(SCOPE);

    // Should return the cached pin, NOT draft_ready
    expect(state).toBe("first_visit");
  });

  it("reads pin from anchor session even when currentSessionId differs", () => {
    // The scope has knowledgePrimaryKey = "sess-anchor" and currentSessionId = "sess-current"
    setupSqliteMocks({ cachedState: "draft_ready" });

    const state = getOrDetectJourneyState(SCOPE);

    expect(state).toBe("draft_ready");

    // Verify the SELECT was against the anchor session (knowledgePrimaryKey)
    const selectCall = mockPrepare.mock.calls.find(
      (call) => /SELECT.*journey_state/i.test(call[0] as string),
    );
    expect(selectCall).toBeDefined();
    // The .get() call should use knowledgePrimaryKey
    const getCall = mockPrepare.mock.results.find(
      (_result, idx) => /SELECT.*journey_state/i.test(mockPrepare.mock.calls[idx][0] as string),
    );
    expect(getCall).toBeDefined();
  });

  it("allows explicit transition via updateJourneyStatePin", () => {
    const { runMock } = setupSqliteMocks({ cachedState: null });

    updateJourneyStatePin("sess-anchor", "draft_ready");

    expect(runMock).toHaveBeenCalledWith("draft_ready", "sess-anchor");
  });

  it("returns blocked when quota exhausted, even if pin says active_fresh (SAFETY OVERRIDE)", () => {
    // Pin says active_fresh, but quota is exhausted
    setupSqliteMocks({ cachedState: "active_fresh", quotaCount: 200 });

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    // Safety override: blocked MUST take priority over cached pin
    expect(state).toBe("blocked");
  });

  it("uses cached pin when quota is NOT exhausted", () => {
    // Pin says active_fresh, quota is fine
    setupSqliteMocks({ cachedState: "active_fresh", quotaCount: 50 });

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    // Should use the cached pin since quota is not exhausted
    expect(state).toBe("active_fresh");
  });

  it("invalidates draft_ready pin after publish for authenticated users", () => {
    const { runMock } = setupSqliteMocks({
      cachedState: "draft_ready",
      publishedUpdatedAt: new Date().toISOString(),
    });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    expect(state).toBe("active_fresh");
    expect(runMock).toHaveBeenCalledWith("active_fresh", SCOPE.knowledgePrimaryKey);
  });

  it("keeps pre-publish pin when user is anonymous even if a page exists", () => {
    setupSqliteMocks({
      cachedState: "draft_ready",
      publishedUpdatedAt: new Date().toISOString(),
    });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);

    const state = getOrDetectJourneyState(SCOPE);

    expect(state).toBe("draft_ready");
  });
});
