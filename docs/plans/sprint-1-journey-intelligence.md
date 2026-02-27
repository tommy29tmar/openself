# Sprint 1: Journey Intelligence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a deterministic Journey Intelligence layer that detects user state, situations, and expertise level *before* the LLM sees anything. This replaces the simple binary `detectMode()` with a rich `BootstrapPayload` that the context assembler can use to craft better system prompts. The bootstrap data is also exposed via a GET endpoint for future frontend consumption (smart welcome messages, UI state).

**Architecture:** New file `src/lib/agent/journey.ts` owns all detection logic. It reads from existing services (kb-service, page-service, proposal-service, soul-service, conflict-service, section-richness) but never writes. A new `GET /api/chat/bootstrap` endpoint exposes the payload. `assembleContext()` gains an optional `bootstrap` parameter for forward compatibility — when provided, it uses `bootstrap.journeyState` instead of calling `detectMode()` internally.

**Tech Stack:** TypeScript, Vitest (unit tests), Next.js App Router (API route), SQLite raw queries via `sqlite` for session counting and timestamp lookups, Drizzle ORM services for everything else.

---

## Task 1: Create `src/lib/agent/journey.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `src/lib/agent/journey.ts` |

### Steps

1. Write failing test (Task 2 — see below)
2. Run tests — confirm they fail
3. Implement `journey.ts`
4. Run tests — confirm they pass
5. Commit: `feat: add journey state detection (journey.ts)`

### Implementation

```typescript
// src/lib/agent/journey.ts

import { sqlite } from "@/lib/db";
import { countFacts, getAllFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft, getPublishedUsername } from "@/lib/services/page-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { createProposalService } from "@/lib/services/proposal-service";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { filterPublishableFacts } from "@/lib/services/page-projection";
import { SECTION_FACT_CATEGORIES } from "@/lib/services/personalization-hashing";
import type { OwnerScope } from "@/lib/auth/session";
import type { AuthInfo } from "@/lib/agent/context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JourneyState =
  | "first_visit"
  | "returning_no_page"
  | "draft_ready"
  | "active_fresh"
  | "active_stale"
  | "blocked";

export type Situation =
  | "has_pending_proposals"
  | "has_thin_sections"
  | "has_stale_facts"
  | "has_open_conflicts"
  | "has_name"
  | "has_soul";

export type ExpertiseLevel = "novice" | "familiar" | "expert";

export interface BootstrapPayload {
  journeyState: JourneyState;
  situations: Situation[];
  expertiseLevel: ExpertiseLevel;
  userName: string | null;
  lastSeenDaysAgo: number | null;
  publishedUsername: string | null;
  pendingProposalCount: number;
  thinSections: string[];
  staleFacts: string[];
  language: string;
  conversationContext: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Facts older than this are considered stale. */
const STALE_FACT_DAYS = 30;

/** Published page updated more recently than this is "fresh". */
const FRESH_PAGE_DAYS = 7;

// ---------------------------------------------------------------------------
// Detection: Journey State
// ---------------------------------------------------------------------------

/**
 * Deterministic priority chain:
 * blocked > draft_ready > active_fresh > active_stale > returning_no_page > first_visit
 */
export function detectJourneyState(
  scope: OwnerScope,
  authInfo?: AuthInfo,
): JourneyState {
  const readKeys = scope.knowledgeReadKeys;
  const factCount = countFacts(readKeys);
  const hasPublished = hasAnyPublishedPage(readKeys);

  // Blocked: quota exhausted (authenticated users only — anonymous handled by session-service).
  // We check if the profile is at/over the quota limit.
  if (authInfo?.authenticated) {
    const row = sqlite
      .prepare(
        "SELECT count FROM profile_message_usage WHERE profile_key = ?",
      )
      .get(scope.cognitiveOwnerKey) as { count: number } | undefined;
    if (row && row.count >= 200) {
      return "blocked";
    }
  }

  // Active states: has a published page
  if (hasPublished) {
    const publishedUpdatedAt = getPublishedUpdatedAt(readKeys);
    if (publishedUpdatedAt) {
      const daysSinceUpdate = daysBetween(new Date(publishedUpdatedAt), new Date());
      if (daysSinceUpdate <= FRESH_PAGE_DAYS) {
        return "active_fresh";
      }
      return "active_stale";
    }
    // Published exists but no updatedAt — treat as stale
    return "active_stale";
  }

  // Draft ready: has a draft row (not published)
  const draft = getDraft(scope.knowledgePrimaryKey);
  if (draft) {
    return "draft_ready";
  }

  // Returning: has facts but no draft and no published page
  if (factCount > 0) {
    return "returning_no_page";
  }

  // Check for prior conversation (messages exist but no facts yet)
  const hasPriorMessages = getDistinctSessionCount(readKeys) > 0;
  if (hasPriorMessages) {
    // Had a conversation before but no facts extracted — still returning
    const messageCount = getTotalMessageCount(readKeys);
    if (messageCount > 0) {
      return "returning_no_page";
    }
  }

  return "first_visit";
}

// ---------------------------------------------------------------------------
// Detection: Situations
// ---------------------------------------------------------------------------

export function detectSituations(
  scope: OwnerScope,
  facts: Array<{ id: string; category: string; key: string; value: unknown; updatedAt: string | null }>,
  ownerKey: string,
): Situation[] {
  const situations: Situation[] = [];

  // Pending proposals
  const proposalSvc = createProposalService();
  const pendingProposals = proposalSvc.getPendingProposals(ownerKey);
  if (pendingProposals.length > 0) {
    situations.push("has_pending_proposals");
  }

  // Thin sections
  const publishable = filterPublishableFacts(facts);
  for (const sectionType of Object.keys(SECTION_FACT_CATEGORIES)) {
    const level = classifySectionRichness(publishable, sectionType);
    if (level === "thin" || level === "empty") {
      // At least one thin section — flag it once
      situations.push("has_thin_sections");
      break;
    }
  }

  // Stale facts (updatedAt older than 30 days)
  const now = new Date();
  const staleFacts = facts.filter((f) => {
    if (!f.updatedAt) return false;
    return daysBetween(new Date(f.updatedAt), now) > STALE_FACT_DAYS;
  });
  if (staleFacts.length > 0) {
    situations.push("has_stale_facts");
  }

  // Open conflicts
  const openConflicts = getOpenConflicts(ownerKey);
  if (openConflicts.length > 0) {
    situations.push("has_open_conflicts");
  }

  // Has name
  const hasName = facts.some(
    (f) => f.category === "identity" && f.key === "name",
  );
  if (hasName) {
    situations.push("has_name");
  }

  // Has soul
  const soul = getActiveSoul(ownerKey);
  if (soul) {
    situations.push("has_soul");
  }

  return situations;
}

// ---------------------------------------------------------------------------
// Detection: Expertise Level
// ---------------------------------------------------------------------------

/**
 * Expertise based on how many distinct sessions this owner has used.
 * 1-2 sessions = novice, 3-5 = familiar, 6+ = expert.
 */
export function detectExpertiseLevel(readKeys: string[]): ExpertiseLevel {
  const sessionCount = getDistinctSessionCount(readKeys);
  if (sessionCount <= 2) return "novice";
  if (sessionCount <= 5) return "familiar";
  return "expert";
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function assembleBootstrapPayload(
  scope: OwnerScope,
  language: string,
  authInfo?: AuthInfo,
): BootstrapPayload {
  const readKeys = scope.knowledgeReadKeys;
  const ownerKey = scope.cognitiveOwnerKey;

  const journeyState = detectJourneyState(scope, authInfo);

  const facts = getAllFacts(scope.knowledgePrimaryKey, readKeys);
  const situations = detectSituations(scope, facts, ownerKey);
  const expertiseLevel = detectExpertiseLevel(readKeys);

  // User name from facts
  const nameFact = facts.find(
    (f) => f.category === "identity" && f.key === "name",
  );
  const userName = nameFact
    ? extractNameString(nameFact.value)
    : null;

  // Last seen (most recent message timestamp)
  const lastSeenDaysAgo = getLastSeenDaysAgo(readKeys);

  // Published username
  const publishedUsername = getPublishedUsername(readKeys);

  // Pending proposal count
  const proposalSvc = createProposalService();
  const pendingProposals = proposalSvc.getPendingProposals(ownerKey);
  const pendingProposalCount = pendingProposals.length;

  // Thin sections list
  const publishable = filterPublishableFacts(facts);
  const thinSections: string[] = [];
  for (const sectionType of Object.keys(SECTION_FACT_CATEGORIES)) {
    const level = classifySectionRichness(publishable, sectionType);
    if (level === "thin" || level === "empty") {
      thinSections.push(sectionType);
    }
  }

  // Stale facts list (category/key)
  const now = new Date();
  const staleFacts: string[] = facts
    .filter((f) => f.updatedAt && daysBetween(new Date(f.updatedAt), now) > STALE_FACT_DAYS)
    .map((f) => `${f.category}/${f.key}`);

  // Conversation context (latest summary or null)
  // Lightweight — we don't load the full summary here, just indicate if one exists
  const conversationContext = null; // Reserved for future use

  return {
    journeyState,
    situations,
    expertiseLevel,
    userName,
    lastSeenDaysAgo,
    publishedUsername,
    pendingProposalCount,
    thinSections,
    staleFacts,
    language,
    conversationContext,
  };
}

// ---------------------------------------------------------------------------
// Helpers (DB queries)
// ---------------------------------------------------------------------------

/**
 * Count distinct session IDs that have messages in the given read keys.
 */
export function getDistinctSessionCount(readKeys: string[]): number {
  if (readKeys.length === 0) return 0;
  const placeholders = readKeys.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT COUNT(DISTINCT session_id) AS cnt FROM messages WHERE session_id IN (${placeholders})`,
    )
    .get(...readKeys) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Total message count across all read keys.
 */
function getTotalMessageCount(readKeys: string[]): number {
  if (readKeys.length === 0) return 0;
  const placeholders = readKeys.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS cnt FROM messages WHERE session_id IN (${placeholders})`,
    )
    .get(...readKeys) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Days since the most recent message across all read keys. Returns null if no messages.
 */
function getLastSeenDaysAgo(readKeys: string[]): number | null {
  if (readKeys.length === 0) return null;
  const placeholders = readKeys.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT MAX(created_at) AS latest FROM messages WHERE session_id IN (${placeholders})`,
    )
    .get(...readKeys) as { latest: string | null } | undefined;
  if (!row?.latest) return null;
  return daysBetween(new Date(row.latest), new Date());
}

/**
 * Get the updatedAt timestamp of the most recent published page for these session IDs.
 */
function getPublishedUpdatedAt(sessionIds: string[]): string | null {
  if (sessionIds.length === 0) return null;
  const placeholders = sessionIds.map(() => "?").join(",");
  const row = sqlite
    .prepare(
      `SELECT updated_at FROM page WHERE session_id IN (${placeholders}) AND status = 'published' ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(...sessionIds) as { updated_at: string | null } | undefined;
  return row?.updated_at ?? null;
}

/**
 * Calculate whole days between two dates.
 */
export function daysBetween(earlier: Date, later: Date): number {
  const diffMs = later.getTime() - earlier.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Extract a display name string from a fact value.
 * Handles both {full: "..."} and plain string values.
 */
function extractNameString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.full === "string") return v.full;
    if (typeof v.name === "string") return v.name;
  }
  return null;
}
```

### Test command

```bash
npx vitest run tests/evals/journey-state-detection.test.ts --reporter=verbose
```

---

## Task 2: Tests for `journey.ts`

### Files

| Action | Path |
|--------|------|
| **create** | `tests/evals/journey-state-detection.test.ts` |

### Steps

1. Write full test file (below)
2. Run tests — confirm they fail (module not yet implemented)
3. Implement Task 1
4. Run tests — confirm all pass
5. Commit together with Task 1

### Implementation

```typescript
// tests/evals/journey-state-detection.test.ts

/**
 * Tests for the Journey Intelligence module.
 * Covers: detectJourneyState, detectSituations, detectExpertiseLevel,
 *         assembleBootstrapPayload, daysBetween.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies before importing ---

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
    })),
  },
  db: {},
}));

vi.mock("@/lib/services/kb-service", () => ({
  countFacts: vi.fn(() => 0),
  getAllFacts: vi.fn(() => []),
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
  detectJourneyState,
  detectSituations,
  detectExpertiseLevel,
  assembleBootstrapPayload,
  daysBetween,
  getDistinctSessionCount,
} from "@/lib/agent/journey";
import type { OwnerScope } from "@/lib/auth/session";
import { countFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage, getDraft, getPublishedUsername } from "@/lib/services/page-service";
import { getActiveSoul } from "@/lib/services/soul-service";
import { getOpenConflicts } from "@/lib/services/conflict-service";
import { createProposalService } from "@/lib/services/proposal-service";
import { classifySectionRichness } from "@/lib/services/section-richness";
import { sqlite } from "@/lib/db";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a", "sess-b"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-b",
};

// Helper to mock sqlite.prepare().get() for specific queries
function mockSqliteQuery(pattern: RegExp, result: unknown) {
  const getMock = vi.fn(() => result);
  const originalPrepare = vi.mocked(sqlite.prepare);
  originalPrepare.mockImplementation((sql: string) => {
    if (pattern.test(sql)) {
      return { get: getMock } as unknown as ReturnType<typeof sqlite.prepare>;
    }
    // Default: return undefined
    return {
      get: vi.fn(() => undefined),
    } as unknown as ReturnType<typeof sqlite.prepare>;
  });
  return getMock;
}

// Helper: create a mock pending proposals service
function mockPendingProposals(count: number) {
  const proposals = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    ownerKey: "cog-1",
    sectionType: "bio",
    status: "pending",
  }));
  vi.mocked(createProposalService).mockReturnValue({
    getPendingProposals: vi.fn(() => proposals),
  } as unknown as ReturnType<typeof createProposalService>);
}

beforeEach(() => {
  vi.clearAllMocks();

  // Reset defaults
  vi.mocked(countFacts).mockReturnValue(0);
  vi.mocked(hasAnyPublishedPage).mockReturnValue(false);
  vi.mocked(getDraft).mockReturnValue(null);
  vi.mocked(getPublishedUsername).mockReturnValue(null);
  vi.mocked(getActiveSoul).mockReturnValue(null);
  vi.mocked(getOpenConflicts).mockReturnValue([]);
  vi.mocked(createProposalService).mockReturnValue({
    getPendingProposals: vi.fn(() => []),
  } as unknown as ReturnType<typeof createProposalService>);
  vi.mocked(classifySectionRichness).mockReturnValue("rich");

  // Default sqlite mock: all queries return undefined
  vi.mocked(sqlite.prepare).mockImplementation(() => ({
    get: vi.fn(() => undefined),
  }) as unknown as ReturnType<typeof sqlite.prepare>);
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------
describe("daysBetween", () => {
  it("returns 0 for same day", () => {
    const d = new Date("2026-02-27T12:00:00Z");
    expect(daysBetween(d, d)).toBe(0);
  });

  it("returns 1 for exactly 24 hours apart", () => {
    const a = new Date("2026-02-26T12:00:00Z");
    const b = new Date("2026-02-27T12:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });

  it("returns 30 for 30 days apart", () => {
    const a = new Date("2026-01-28T00:00:00Z");
    const b = new Date("2026-02-27T00:00:00Z");
    expect(daysBetween(a, b)).toBe(30);
  });

  it("floors partial days", () => {
    const a = new Date("2026-02-26T00:00:00Z");
    const b = new Date("2026-02-27T12:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectJourneyState
// ---------------------------------------------------------------------------
describe("detectJourneyState", () => {
  it("returns first_visit when 0 facts, no messages, no draft, no published", () => {
    expect(detectJourneyState(SCOPE)).toBe("first_visit");
  });

  it("returns returning_no_page when facts exist but no draft or published", () => {
    vi.mocked(countFacts).mockReturnValue(5);
    expect(detectJourneyState(SCOPE)).toBe("returning_no_page");
  });

  it("returns draft_ready when draft exists but no published page", () => {
    vi.mocked(getDraft).mockReturnValue({
      config: {} as never,
      username: "draft",
      status: "draft",
      configHash: null,
      updatedAt: null,
    });
    expect(detectJourneyState(SCOPE)).toBe("draft_ready");
  });

  it("returns active_fresh when published page updated 3 days ago", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    mockSqliteQuery(/published.*ORDER BY updated_at/, {
      updated_at: threeDaysAgo.toISOString(),
    });
    expect(detectJourneyState(SCOPE)).toBe("active_fresh");
  });

  it("returns active_stale when published page updated 10 days ago", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    mockSqliteQuery(/published.*ORDER BY updated_at/, {
      updated_at: tenDaysAgo.toISOString(),
    });
    expect(detectJourneyState(SCOPE)).toBe("active_stale");
  });

  it("returns blocked when authenticated user has exhausted quota (200 messages)", () => {
    mockSqliteQuery(/profile_message_usage/, { count: 200 });
    expect(
      detectJourneyState(SCOPE, { authenticated: true, username: "alice" }),
    ).toBe("blocked");
  });

  it("blocked takes priority over active_fresh", () => {
    vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
    mockSqliteQuery(/profile_message_usage/, { count: 200 });
    expect(
      detectJourneyState(SCOPE, { authenticated: true, username: "alice" }),
    ).toBe("blocked");
  });

  it("draft_ready takes priority over returning_no_page", () => {
    vi.mocked(countFacts).mockReturnValue(3);
    vi.mocked(getDraft).mockReturnValue({
      config: {} as never,
      username: "draft",
      status: "draft",
      configHash: null,
      updatedAt: null,
    });
    expect(detectJourneyState(SCOPE)).toBe("draft_ready");
  });
});

// ---------------------------------------------------------------------------
// detectSituations
// ---------------------------------------------------------------------------
describe("detectSituations", () => {
  const baseFacts = [
    { id: "f1", category: "identity", key: "name", value: { full: "Alice" }, updatedAt: new Date().toISOString() },
  ];

  it("returns has_name when name fact exists", () => {
    const result = detectSituations(SCOPE, baseFacts, "cog-1");
    expect(result).toContain("has_name");
  });

  it("returns has_pending_proposals when proposals exist", () => {
    mockPendingProposals(2);
    const result = detectSituations(SCOPE, [], "cog-1");
    expect(result).toContain("has_pending_proposals");
  });

  it("returns has_thin_sections when a section is thin", () => {
    vi.mocked(classifySectionRichness).mockReturnValue("thin");
    const result = detectSituations(SCOPE, [], "cog-1");
    expect(result).toContain("has_thin_sections");
  });

  it("returns has_stale_facts when facts are older than 30 days", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const staleFact = {
      id: "f1",
      category: "skill",
      key: "typescript",
      value: { name: "TypeScript" },
      updatedAt: oldDate.toISOString(),
    };
    const result = detectSituations(SCOPE, [staleFact], "cog-1");
    expect(result).toContain("has_stale_facts");
  });

  it("returns has_open_conflicts when conflicts exist", () => {
    vi.mocked(getOpenConflicts).mockReturnValue([
      { id: "c1", category: "skill", key: "ts", factAId: "f1", sourceA: "chat", factBId: "f2", sourceB: "chat" },
    ] as never);
    const result = detectSituations(SCOPE, [], "cog-1");
    expect(result).toContain("has_open_conflicts");
  });

  it("returns has_soul when active soul exists", () => {
    vi.mocked(getActiveSoul).mockReturnValue({ compiled: "test soul" } as never);
    const result = detectSituations(SCOPE, [], "cog-1");
    expect(result).toContain("has_soul");
  });

  it("returns empty array when nothing special is detected", () => {
    const result = detectSituations(SCOPE, [], "cog-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectExpertiseLevel
// ---------------------------------------------------------------------------
describe("detectExpertiseLevel", () => {
  it("returns novice for 1 session", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 1 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("novice");
  });

  it("returns novice for 2 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 2 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("novice");
  });

  it("returns familiar for 3 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 3 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("familiar");
  });

  it("returns familiar for 5 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 5 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("familiar");
  });

  it("returns expert for 6 sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 6 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("expert");
  });

  it("returns expert for 10+ sessions", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 10 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("expert");
  });

  it("returns novice when no messages exist (0 sessions)", () => {
    mockSqliteQuery(/COUNT\(DISTINCT session_id\)/, { cnt: 0 });
    expect(detectExpertiseLevel(SCOPE.knowledgeReadKeys)).toBe("novice");
  });
});

// ---------------------------------------------------------------------------
// assembleBootstrapPayload
// ---------------------------------------------------------------------------
describe("assembleBootstrapPayload", () => {
  it("returns a complete payload for first_visit", () => {
    const payload = assembleBootstrapPayload(SCOPE, "en");

    expect(payload.journeyState).toBe("first_visit");
    expect(payload.language).toBe("en");
    expect(payload.userName).toBeNull();
    expect(payload.publishedUsername).toBeNull();
    expect(payload.pendingProposalCount).toBe(0);
    expect(payload.thinSections).toEqual(expect.any(Array));
    expect(payload.staleFacts).toEqual([]);
    expect(payload.conversationContext).toBeNull();
    expect(payload.expertiseLevel).toBe("novice");
    expect(Array.isArray(payload.situations)).toBe(true);
  });

  it("includes userName when name fact exists", () => {
    const { getAllFacts } = await import("@/lib/services/kb-service");
    vi.mocked(getAllFacts).mockReturnValue([
      {
        id: "f1",
        sessionId: "sess-a",
        profileId: null,
        category: "identity",
        key: "name",
        value: { full: "Marco Rossi" },
        source: "chat",
        confidence: 1.0,
        visibility: "proposed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as never);

    const payload = assembleBootstrapPayload(SCOPE, "it");
    expect(payload.userName).toBe("Marco Rossi");
  });

  it("includes publishedUsername when page is published", () => {
    vi.mocked(getPublishedUsername).mockReturnValue("marco");
    const payload = assembleBootstrapPayload(SCOPE, "it");
    expect(payload.publishedUsername).toBe("marco");
  });

  it("counts pending proposals", () => {
    mockPendingProposals(3);
    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.pendingProposalCount).toBe(3);
  });

  it("lists thin sections", () => {
    vi.mocked(classifySectionRichness).mockReturnValue("thin");
    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.thinSections.length).toBeGreaterThan(0);
    expect(payload.thinSections).toContain("hero");
  });

  it("lists stale facts", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);
    const { getAllFacts } = await import("@/lib/services/kb-service");
    vi.mocked(getAllFacts).mockReturnValue([
      {
        id: "f1",
        sessionId: "sess-a",
        profileId: null,
        category: "skill",
        key: "react",
        value: { name: "React" },
        source: "chat",
        confidence: 1.0,
        visibility: "proposed",
        createdAt: oldDate.toISOString(),
        updatedAt: oldDate.toISOString(),
      },
    ] as never);

    const payload = assembleBootstrapPayload(SCOPE, "en");
    expect(payload.staleFacts).toContain("skill/react");
  });
});
```

### Test command

```bash
npx vitest run tests/evals/journey-state-detection.test.ts --reporter=verbose
```

---

## Task 3: Create `GET /api/chat/bootstrap` endpoint

### Files

| Action | Path |
|--------|------|
| **create** | `src/app/api/chat/bootstrap/route.ts` |

### Steps

1. Write failing test (Task 4)
2. Run tests — confirm they fail
3. Implement the route
4. Run tests — confirm they pass
5. Commit: `feat: add bootstrap endpoint (GET /api/chat/bootstrap)`

### Implementation

```typescript
// src/app/api/chat/bootstrap/route.ts

import { resolveOwnerScope, getAuthContext } from "@/lib/auth/session";
import {
  isMultiUserEnabled,
  DEFAULT_SESSION_ID,
} from "@/lib/services/session-service";
import { assembleBootstrapPayload } from "@/lib/agent/journey";

export async function GET(req: Request) {
  const multiUser = isMultiUserEnabled();
  const scope = resolveOwnerScope(req);

  if (multiUser && !scope) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const effectiveScope = scope ?? {
    cognitiveOwnerKey: DEFAULT_SESSION_ID,
    knowledgeReadKeys: [DEFAULT_SESSION_ID],
    knowledgePrimaryKey: DEFAULT_SESSION_ID,
    currentSessionId: DEFAULT_SESSION_ID,
  };

  // Resolve auth for blocked detection
  const chatAuthCtx = multiUser ? getAuthContext(req) : null;
  const authInfo = chatAuthCtx
    ? { authenticated: !!chatAuthCtx.userId, username: chatAuthCtx.username ?? null }
    : undefined;

  // Extract language from query string (default: "en")
  const url = new URL(req.url);
  const language = url.searchParams.get("language") ?? "en";

  const payload = assembleBootstrapPayload(effectiveScope, language, authInfo);

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

### Test command

```bash
npx vitest run tests/evals/bootstrap-endpoint.test.ts --reporter=verbose
```

---

## Task 4: Tests for bootstrap endpoint

### Files

| Action | Path |
|--------|------|
| **create** | `tests/evals/bootstrap-endpoint.test.ts` |

### Steps

1. Write test file (below)
2. Run tests — confirm they fail (endpoint not yet created)
3. Implement Task 3
4. Run tests — confirm they pass
5. Commit together with Task 3

### Implementation

```typescript
// tests/evals/bootstrap-endpoint.test.ts

/**
 * Tests for GET /api/chat/bootstrap endpoint.
 * Mocks journey module and auth to verify the endpoint wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock dependencies ---

const mockBootstrapPayload = {
  journeyState: "first_visit" as const,
  situations: [],
  expertiseLevel: "novice" as const,
  userName: null,
  lastSeenDaysAgo: null,
  publishedUsername: null,
  pendingProposalCount: 0,
  thinSections: [],
  staleFacts: [],
  language: "en",
  conversationContext: null,
};

vi.mock("@/lib/agent/journey", () => ({
  assembleBootstrapPayload: vi.fn(() => ({ ...mockBootstrapPayload })),
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
  DEFAULT_SESSION_ID: "__default__",
}));

import { GET } from "@/app/api/chat/bootstrap/route";
import { assembleBootstrapPayload } from "@/lib/agent/journey";
import { resolveOwnerScope } from "@/lib/auth/session";
import { isMultiUserEnabled } from "@/lib/services/session-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chat/bootstrap", () => {
  it("returns 200 with bootstrap payload in single-user mode", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.journeyState).toBe("first_visit");
    expect(body.expertiseLevel).toBe("novice");
    expect(body.language).toBe("en");
  });

  it("passes language query param through to payload", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap?language=it");
    await GET(req);

    expect(vi.mocked(assembleBootstrapPayload)).toHaveBeenCalledWith(
      expect.any(Object),
      "it",
      undefined,
    );
  });

  it("defaults language to en when not provided", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    await GET(req);

    expect(vi.mocked(assembleBootstrapPayload)).toHaveBeenCalledWith(
      expect.any(Object),
      "en",
      undefined,
    );
  });

  it("returns 401 in multi-user mode when scope is null", async () => {
    vi.mocked(isMultiUserEnabled).mockReturnValue(true);
    vi.mocked(resolveOwnerScope).mockReturnValue(null as never);

    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("uses effectiveScope from resolveOwnerScope in multi-user mode", async () => {
    vi.mocked(isMultiUserEnabled).mockReturnValue(true);
    vi.mocked(resolveOwnerScope).mockReturnValue({
      cognitiveOwnerKey: "profile-1",
      knowledgeReadKeys: ["sess-x", "sess-y"],
      knowledgePrimaryKey: "sess-x",
      currentSessionId: "sess-y",
    });

    const req = new Request("http://localhost:3000/api/chat/bootstrap?language=de");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(vi.mocked(assembleBootstrapPayload)).toHaveBeenCalledWith(
      {
        cognitiveOwnerKey: "profile-1",
        knowledgeReadKeys: ["sess-x", "sess-y"],
        knowledgePrimaryKey: "sess-x",
        currentSessionId: "sess-y",
      },
      "de",
      expect.any(Object), // authInfo
    );
  });

  it("returns correct Content-Type header", async () => {
    const req = new Request("http://localhost:3000/api/chat/bootstrap");
    const res = await GET(req);

    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});
```

### Test command

```bash
npx vitest run tests/evals/bootstrap-endpoint.test.ts --reporter=verbose
```

---

## Task 5: Refactor `assembleContext()` to accept BootstrapPayload

### Files

| Action | Path |
|--------|------|
| **modify** | `src/lib/agent/context.ts` |

### Steps

1. Write failing test additions (Task 6)
2. Run tests — confirm they fail
3. Modify `assembleContext()` to accept optional `bootstrap` parameter
4. Run ALL context tests — confirm they pass (backward compat + new path)
5. Commit: `feat: wire bootstrap payload into assembleContext()`

### Implementation

In `src/lib/agent/context.ts`, apply these changes:

**1. Add import at top:**

```typescript
import type { BootstrapPayload } from "@/lib/agent/journey";
```

**2. Change the `assembleContext` signature:**

Replace:

```typescript
export function assembleContext(
  scope: OwnerScope,
  language: string,
  clientMessages: Array<{ role: string; content: string }>,
  authInfo?: AuthInfo,
): ContextResult {
  const mode = detectMode(scope.knowledgeReadKeys);
```

With:

```typescript
export function assembleContext(
  scope: OwnerScope,
  language: string,
  clientMessages: Array<{ role: string; content: string }>,
  authInfo?: AuthInfo,
  bootstrap?: BootstrapPayload,
): ContextResult {
  // Use bootstrap journeyState when available, fall back to detectMode()
  const mode: PromptMode = bootstrap
    ? mapJourneyStateToMode(bootstrap.journeyState)
    : detectMode(scope.knowledgeReadKeys);
```

**3. Add the mapping function (before `assembleContext`):**

```typescript
/**
 * Map JourneyState to PromptMode for backward compatibility.
 * first_visit → onboarding, all others → steady_state.
 */
function mapJourneyStateToMode(state: JourneyState): PromptMode {
  if (state === "first_visit") return "onboarding";
  return "steady_state";
}
```

**4. Add JourneyState type import:**

```typescript
import type { JourneyState, BootstrapPayload } from "@/lib/agent/journey";
```

### Test command

```bash
npx vitest run tests/evals/context-assembler.test.ts --reporter=verbose
```

---

## Task 6: Update existing context-assembler tests

### Files

| Action | Path |
|--------|------|
| **modify** | `tests/evals/context-assembler.test.ts` |

### Steps

1. Add new test block for bootstrap path
2. Run tests — confirm the new tests fail (context.ts not yet updated)
3. Implement Task 5
4. Run tests — confirm all pass (old + new)
5. Commit together with Task 5

### Implementation

Add the following mock at the top of the file (alongside existing mocks):

```typescript
vi.mock("@/lib/agent/journey", () => ({
  // Module exists but we only import types — no runtime mock needed
}));
```

Add this test block at the end of the file (after the existing `assembleContext` describe block):

```typescript
// ---------------------------------------------------------------------------
// assembleContext with BootstrapPayload
// ---------------------------------------------------------------------------
describe("assembleContext with bootstrap", () => {
  it("uses onboarding mode when bootstrap.journeyState is first_visit", () => {
    const bootstrap = {
      journeyState: "first_visit" as const,
      situations: [],
      expertiseLevel: "novice" as const,
      userName: null,
      lastSeenDaysAgo: null,
      publishedUsername: null,
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("onboarding");
    // detectMode should NOT have been called
    expect(countFacts).not.toHaveBeenCalled();
    expect(hasAnyPublishedPage).not.toHaveBeenCalled();
  });

  it("uses steady_state mode when bootstrap.journeyState is active_fresh", () => {
    const bootstrap = {
      journeyState: "active_fresh" as const,
      situations: [],
      expertiseLevel: "familiar" as const,
      userName: "Alice",
      lastSeenDaysAgo: 2,
      publishedUsername: "alice",
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("steady_state");
  });

  it("uses steady_state mode when bootstrap.journeyState is draft_ready", () => {
    const bootstrap = {
      journeyState: "draft_ready" as const,
      situations: [],
      expertiseLevel: "novice" as const,
      userName: null,
      lastSeenDaysAgo: null,
      publishedUsername: null,
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("steady_state");
  });

  it("uses steady_state mode when bootstrap.journeyState is blocked", () => {
    const bootstrap = {
      journeyState: "blocked" as const,
      situations: [],
      expertiseLevel: "expert" as const,
      userName: "Bob",
      lastSeenDaysAgo: 0,
      publishedUsername: "bob",
      pendingProposalCount: 0,
      thinSections: [],
      staleFacts: [],
      language: "en",
      conversationContext: null,
    };

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
      undefined,
      bootstrap,
    );

    expect(result.mode).toBe("steady_state");
  });

  it("falls back to detectMode when no bootstrap provided (backward compat)", () => {
    vi.mocked(countFacts).mockReturnValue(0);
    vi.mocked(hasAnyPublishedPage).mockReturnValue(false);

    const result = assembleContext(
      SCOPE,
      "en",
      [{ role: "user", content: "hello" }],
    );

    expect(result.mode).toBe("onboarding");
    // detectMode WAS called (countFacts or hasAnyPublishedPage invoked)
    expect(countFacts).toHaveBeenCalled();
  });
});
```

### Test command

```bash
npx vitest run tests/evals/context-assembler.test.ts --reporter=verbose
```

---

## Execution Order

Tasks are ordered by dependency:

```
Task 2 (test) + Task 1 (impl)  →  commit 1
Task 4 (test) + Task 3 (impl)  →  commit 2
Task 6 (test) + Task 5 (impl)  →  commit 3
```

Each pair follows TDD: write tests first, confirm red, implement, confirm green.

## Full Test Suite Validation

After all 3 commits, run the entire test suite to verify no regressions:

```bash
npx vitest run --reporter=verbose
```

## Files Created/Modified Summary

| File | Action |
|------|--------|
| `src/lib/agent/journey.ts` | **create** |
| `tests/evals/journey-state-detection.test.ts` | **create** |
| `src/app/api/chat/bootstrap/route.ts` | **create** |
| `tests/evals/bootstrap-endpoint.test.ts` | **create** |
| `src/lib/agent/context.ts` | **modify** (add optional `bootstrap` param) |
| `tests/evals/context-assembler.test.ts` | **modify** (add bootstrap tests) |
