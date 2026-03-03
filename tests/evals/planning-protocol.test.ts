/**
 * Tests for the Planning Protocol policy.
 * Validates classification (SIMPLE/COMPOUND/STRUCTURAL), tool references,
 * expertise modulation, and integration in buildSystemPrompt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { planningProtocol } from "@/lib/agent/policies/planning-protocol";

// Mock all policy modules for buildSystemPrompt tests
vi.mock("@/lib/agent/policies/first-visit", () => ({
  firstVisitPolicy: vi.fn((lang: string) => `FIRST_VISIT_POLICY_${lang}`),
}));
vi.mock("@/lib/agent/policies/returning-no-page", () => ({
  returningNoPagePolicy: vi.fn(() => "RETURNING_NO_PAGE"),
}));
vi.mock("@/lib/agent/policies/draft-ready", () => ({
  draftReadyPolicy: vi.fn(() => "DRAFT_READY"),
}));
vi.mock("@/lib/agent/policies/active-fresh", () => ({
  activeFreshPolicy: vi.fn(() => "ACTIVE_FRESH"),
}));
vi.mock("@/lib/agent/policies/active-stale", () => ({
  activeStalePolicy: vi.fn(() => "ACTIVE_STALE"),
}));
vi.mock("@/lib/agent/policies/blocked", () => ({
  blockedPolicy: vi.fn(() => "BLOCKED"),
}));
vi.mock("@/lib/agent/policies/situations", () => ({
  pendingProposalsDirective: vi.fn(() => ""),
  thinSectionsDirective: vi.fn(() => ""),
  staleFactsDirective: vi.fn(() => ""),
  openConflictsDirective: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({
  memoryUsageDirectives: vi.fn(() => "MEMORY_USAGE_DIRECTIVES_BLOCK"),
}));
vi.mock("@/lib/agent/policies/turn-management", () => ({
  turnManagementRules: vi.fn(() => "TURN_MANAGEMENT_RULES_BLOCK"),
}));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({
  undoAwarenessPolicy: vi.fn(() => "UNDO_AWARENESS_POLICY_BLOCK"),
}));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

beforeEach(() => {
  vi.clearAllMocks();
});

const makeBootstrap = (overrides?: Partial<BootstrapPayload>): BootstrapPayload => ({
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
  ...overrides,
});

describe("planningProtocol", () => {
  const text = planningProtocol();

  it("returns a non-empty string", () => {
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(100);
  });

  it("includes SIMPLE/COMPOUND/STRUCTURAL classification", () => {
    expect(text).toContain("SIMPLE");
    expect(text).toContain("COMPOUND");
    expect(text).toContain("STRUCTURAL");
  });

  it("mentions batch_facts", () => {
    expect(text).toContain("batch_facts");
  });

  it("mentions search_facts for COMPOUND", () => {
    expect(text).toContain("search_facts");
  });

  it("mentions inspect_page_state for STRUCTURAL", () => {
    expect(text).toContain("inspect_page_state");
  });

  it("mentions save_memory for post-operation learning", () => {
    expect(text).toContain("save_memory");
  });

  it("defines expertise modulation (novice, familiar, expert)", () => {
    expect(text).toMatch(/novice/i);
    expect(text).toMatch(/familiar/i);
    expect(text).toMatch(/expert/i);
  });

  it("mentions blocked tool response handling", () => {
    expect(text).toContain("blocked");
  });

  it("exempts SIMPLE fact saves from novice verbalization", () => {
    expect(text).toMatch(/SIMPLE.*fact.*save.*silent|novice.*fact.*save.*no\s*verbalization|SIMPLE.*fact.*save.*move\s*forward/i);
  });

  it("SIMPLE fact save silence preserves all 4 OUTPUT_CONTRACT error exceptions", () => {
    // One assertion per exception — no OR to mask missing exceptions
    expect(text).toMatch(/success.*false/i);
    expect(text).toMatch(/REQUIRES_CONFIRMATION/);
    expect(text).toMatch(/pageVisible.*false/i);
    expect(text).toMatch(/recomposeOk.*false/i);
  });
});

describe("buildSystemPrompt — planning protocol integration", () => {
  it("includes planning protocol in system prompt", () => {
    const result = buildSystemPrompt(makeBootstrap());
    expect(result).toContain("PLANNING PROTOCOL");
  });

  it("does NOT include ACTION AWARENESS (old policy)", () => {
    const result = buildSystemPrompt(makeBootstrap());
    expect(result).not.toContain("ACTION AWARENESS");
  });

  it("planning protocol comes after memory directives", () => {
    const result = buildSystemPrompt(makeBootstrap());
    const memIdx = result.indexOf("MEMORY_USAGE_DIRECTIVES_BLOCK");
    const planIdx = result.indexOf("PLANNING PROTOCOL");
    expect(memIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(memIdx);
  });

  it("undo awareness comes after planning protocol", () => {
    const result = buildSystemPrompt(makeBootstrap());
    const planIdx = result.indexOf("PLANNING PROTOCOL");
    const undoIdx = result.indexOf("UNDO_AWARENESS_POLICY_BLOCK");
    expect(planIdx).toBeGreaterThan(-1);
    expect(undoIdx).toBeGreaterThan(planIdx);
  });
});
