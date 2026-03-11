import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agent/policies", () => ({
  getJourneyPolicy: vi.fn(() => ""),
  getSituationDirectives: vi.fn(() => ""),
  getExpertiseCalibration: vi.fn(() => ""),
}));
vi.mock("@/lib/agent/policies/memory-directives", () => ({ memoryUsageDirectives: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/turn-management", () => ({ turnManagementRules: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/shared-rules", () => ({ sharedBehavioralRules: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/planning-protocol", () => ({ planningProtocol: vi.fn(() => "") }));
vi.mock("@/lib/agent/policies/undo-awareness", () => ({ undoAwarenessPolicy: vi.fn(() => "") }));
vi.mock("@/lib/presence/prompt-builder", () => ({ buildPresenceReference: vi.fn(() => "") }));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

const makeBootstrap = (): BootstrapPayload => ({
  journeyState: "active_fresh",
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

describe("TOOL_POLICY UAT Round 3 additions", () => {
  const prompt = buildSystemPrompt(makeBootstrap());

  it("contains confirmationId instruction for batch_facts (BUG-1)", () => {
    expect(prompt).toContain("confirmationId");
    expect(prompt).toContain("batch_facts");
  });

  it("retains delete_fact retry guidance alongside batch_facts confirmationId", () => {
    // delete_fact still uses the old confirmation flow (no confirmationId)
    // The prompt must keep both paths documented
    expect(prompt).toContain("delete_fact");
    expect(prompt).toMatch(/delete_fact.*confirm|confirm.*delete_fact/i);
  });

  it("contains duplicate prevention instruction (BUG-4)", () => {
    expect(prompt).toContain("DUPLICATE PREVENTION");
    expect(prompt).toContain("do NOT create a replacement fact with a different key");
  });

  it("contains mixed-outcome reporting instruction (BUG-5)", () => {
    expect(prompt).toContain("MIXED OUTCOMES");
    expect(prompt).toContain("report each result individually");
  });

  it("TOOL_POLICY references PENDING CONFIRMATIONS context block", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/PENDING CONFIRMATIONS/);
    expect(prompt).toMatch(/confirmationId/);
  });

  it("TOOL_POLICY has NEVER-batch identity delete instruction", () => {
    const prompt = buildSystemPrompt(makeBootstrap());
    expect(prompt).toMatch(/NEVER.*batch_facts.*identity/i);
  });
});
