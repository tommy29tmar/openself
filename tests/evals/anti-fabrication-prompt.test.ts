/**
 * Tests for anti-fabrication prompt guards.
 *
 * Validates that buildSystemPrompt output contains explicit rules preventing
 * the agent from creating facts for unmentioned categories and inventing
 * optional fields.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all heavy policy dependencies so we only test prompt string composition
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
  language: "en",
  conversationContext: null,
});

describe("anti-fabrication prompt guards", () => {
  it("contains category-level prohibition against unmentioned categories", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain(
      "NEVER create facts for categories the user has NOT explicitly mentioned",
    );
  });

  it("contains prohibition against inventing optional fields", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain("NEVER invent optional fields");
  });

  it("contains explicit-source rule for fact creation", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain(
      "Only create facts from information the user explicitly stated",
    );
  });

  it("instructs to ask rather than assume", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain(
      "ASK rather than create a fact from assumption",
    );
  });

  it("prohibits inference-based fact creation", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toContain(
      'Do NOT create facts from your own assumptions, general knowledge, or inferences about what the user "might" like',
    );
  });
});
