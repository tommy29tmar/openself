// tests/evals/journey-stale-pin.test.ts

/**
 * Tests that stale pre-publish journey state pins are invalidated after publish.
 *
 * BUG-10: After register+publish, the cached pin (e.g. "draft_ready") is never
 * invalidated. Subsequent requests use the stale pin → mode = "onboarding"
 * instead of "steady_state" → agent lacks post-publish context.
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
  countFacts: vi.fn(() => 5),
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

import { getOrDetectJourneyState } from "@/lib/agent/journey";
import type { OwnerScope } from "@/lib/auth/session";
import { hasAnyPublishedPage } from "@/lib/services/page-service";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-anchor", "sess-current"],
  knowledgePrimaryKey: "sess-anchor",
  currentSessionId: "sess-current",
};

function setupSqliteMocks(opts: {
  cachedState?: string | null;
  quotaCount?: number;
}) {
  const runMock = vi.fn();
  mockPrepare.mockImplementation((sql: string) => {
    if (/SELECT.*journey_state/i.test(sql)) {
      return {
        get: vi.fn(() =>
          opts.cachedState != null
            ? { journey_state: opts.cachedState }
            : undefined,
        ),
      };
    }
    if (/UPDATE.*sessions.*journey_state/i.test(sql)) {
      return { run: runMock };
    }
    if (/profile_message_usage/i.test(sql)) {
      return {
        get: vi.fn(() =>
          opts.quotaCount != null ? { count: opts.quotaCount } : undefined,
        ),
      };
    }
    // page table — for getPublishedUpdatedAt
    if (/SELECT.*updated_at.*FROM.*page.*published/i.test(sql)) {
      return {
        get: vi.fn(() => ({ updated_at: new Date().toISOString() })),
      };
    }
    return {
      get: vi.fn(() => undefined),
      run: vi.fn(),
    };
  });
  return { runMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasAnyPublishedPage).mockReturnValue(false);
  mockPrepare.mockImplementation(() => ({
    get: vi.fn(() => undefined),
    run: vi.fn(),
  }));
});

describe("stale journey state pin invalidation", () => {
  it("invalidates draft_ready pin when user has published", () => {
    // Pin says draft_ready, but user has since published
    const { runMock } = setupSqliteMocks({ cachedState: "draft_ready" });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    // Should NOT return stale "draft_ready" — should re-detect as active_fresh/active_stale
    expect(state).not.toBe("draft_ready");
    expect(["active_fresh", "active_stale"]).toContain(state);

    // Should have written the fresh state
    expect(runMock).toHaveBeenCalled();
  });

  it("invalidates first_visit pin when user has published", () => {
    const { runMock } = setupSqliteMocks({ cachedState: "first_visit" });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    expect(state).not.toBe("first_visit");
    expect(["active_fresh", "active_stale"]).toContain(state);
    expect(runMock).toHaveBeenCalled();
  });

  it("invalidates returning_no_page pin when user has published", () => {
    const { runMock } = setupSqliteMocks({ cachedState: "returning_no_page" });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    expect(state).not.toBe("returning_no_page");
    expect(["active_fresh", "active_stale"]).toContain(state);
    expect(runMock).toHaveBeenCalled();
  });

  it("keeps active_fresh pin when user has published (not stale)", () => {
    setupSqliteMocks({ cachedState: "active_fresh" });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    // active_fresh is NOT a pre-publish state — should be returned as-is
    expect(state).toBe("active_fresh");
  });

  it("does NOT invalidate draft_ready pin when user has NOT published", () => {
    setupSqliteMocks({ cachedState: "draft_ready" });
    vi.mocked(hasAnyPublishedPage).mockReturnValue(false);

    const state = getOrDetectJourneyState(SCOPE, {
      authenticated: true,
      username: "alice",
    });

    // No publish → pin is still valid
    expect(state).toBe("draft_ready");
  });
});
