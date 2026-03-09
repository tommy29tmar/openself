/**
 * Tests for TOOL_POLICY and DATA_MODEL_REFERENCE prompt updates (Agent Brain v2).
 *
 * Validates that buildSystemPrompt output contains guidance for new tools
 * (batch_facts, reorder_items, archive_fact, unarchive_fact) and new fact fields
 * (sortOrder, parentFactId, archivedAt).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock policy modules so we only test prompt string composition
vi.mock("@/lib/agent/policies", () => ({
  getJourneyPolicy: vi.fn(() => ""),
  getSituationDirectives: vi.fn(() => ""),
  getExpertiseCalibration: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({
  memoryUsageDirectives: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/turn-management", () => ({
  turnManagementRules: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/planning-protocol", () => ({
  planningProtocol: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({
  undoAwarenessPolicy: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/shared-rules", () => ({
  sharedBehavioralRules: vi.fn(() => ""),
  IMMEDIATE_EXECUTION_RULE: "",
}));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

beforeEach(() => {
  vi.clearAllMocks();
});

const makeBootstrap = (): BootstrapPayload => ({
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
});

describe("TOOL_POLICY includes new tools", () => {
  it("mentions batch_facts", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("batch_facts");
  });

  it("mentions move_section", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("move_section");
  });

  it("mentions reorder_items", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("reorder_items");
  });

  it("mentions archive_fact and unarchive_fact", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("archive_fact");
    expect(prompt).toContain("unarchive_fact");
  });

  it("mentions batch_facts runs sequentially with partial-failure semantics", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/batch_facts.*sequential|sequential.*batch_facts/i);
    expect(prompt).toMatch(/one op fails.*earlier.*persist|earlier.*persist/i);
  });

  it("mentions identity/tagline pattern for text customization", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/identity\/tagline|tagline.*fact/i);
  });
});

describe("DATA_MODEL_REFERENCE includes new fields", () => {
  it("mentions sortOrder", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("sortOrder");
  });

  it("mentions parentFactId", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("parentFactId");
  });

  it("mentions archivedAt", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("archivedAt");
  });

  it("describes sortOrder usage for item ordering", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/sortOrder.*order|order.*sortOrder/i);
  });

  it("describes parentFactId for child-parent fact relationships", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/parentFactId.*parent|parent.*parentFactId/i);
  });
});
