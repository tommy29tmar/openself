import { describe, it, expect, vi, beforeEach } from "vitest";

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
  archivableFacts: [],
  language: "en",
  conversationContext: null,
  archetype: "generalist",
});

describe("SAFETY_POLICY — no URL fabrication rule", () => {
  it("assembled prompt must contain a rule against fabricating the OpenSelf page domain", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/NEVER.*(?:fabricat|invent|guess).*(?:domain|host).*OpenSelf/i);
  });
});
