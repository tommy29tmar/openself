import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) }}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

const base: BootstrapPayload = {
  journeyState: "first_visit", situations: [], expertiseLevel: "novice",
  userName: null, lastSeenDaysAgo: null, publishedUsername: null,
  pendingProposalCount: 0, thinSections: [], staleFacts: [],
  openConflicts: [], archivableFacts: [], language: "en",
  conversationContext: null, archetype: "generalist",
};

describe("CORE_CHARTER invariants", () => {
  it("contains register guidance (tu/du)", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('"tu"');
    expect(p).toContain('"du"');
  });

  it("contains opening bans list", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("OPENING BANS");
    expect(p).toContain("Certamente");
    expect(p).toContain("Of course");
  });

  it("contains emoji policy", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("EMOJI POLICY");
    expect(p).toContain("user uses them first");
  });

  it("contains language switching instruction", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("switch seamlessly");
  });

  it("contains user preference override for register", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("User explicit preference");
    expect(p).toContain("overrides");
  });

  it("OUTPUT_CONTRACT contains PATTERN VARIATION block", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("PATTERN VARIATION");
    expect(p).toContain("consecutive");
  });
});
