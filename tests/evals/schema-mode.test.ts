import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sqlite: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn() })) },
}));
vi.mock("@/lib/services/event-service", () => ({ logEvent: vi.fn() }));

import { buildSystemPrompt } from "@/lib/agent/prompts";
import type { BootstrapPayload } from "@/lib/agent/journey";

function makeBootstrap(journeyState: string): BootstrapPayload {
  return {
    journeyState: journeyState as any,
    situations: [], expertiseLevel: "novice",
    userName: null, lastSeenDaysAgo: null, publishedUsername: null,
    pendingProposalCount: 0, thinSections: [], staleFacts: [],
    openConflicts: [], archivableFacts: [], language: "en",
    conversationContext: null, archetype: "generalist",
  };
}

// FACT_SCHEMA_REFERENCE contains "| experience |" — a signature string
const FULL_SCHEMA_MARKER = "| experience |";
// minimal schema contains "experience:" in a different format
const MINIMAL_SCHEMA_MARKER = "experience: {role, company";

describe("schemaMode per journey state", () => {
  it("first_visit: injects minimal schema, not full", () => {
    const prompt = buildSystemPrompt(makeBootstrap("first_visit"), { schemaMode: "minimal" });
    expect(prompt).toContain(MINIMAL_SCHEMA_MARKER);
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
  });

  it("returning_no_page: injects full schema", () => {
    const prompt = buildSystemPrompt(makeBootstrap("returning_no_page"), { schemaMode: "full" });
    expect(prompt).toContain(FULL_SCHEMA_MARKER);
  });

  it("draft_ready: injects minimal schema", () => {
    const prompt = buildSystemPrompt(makeBootstrap("draft_ready"), { schemaMode: "minimal" });
    expect(prompt).toContain(MINIMAL_SCHEMA_MARKER);
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
  });

  it("active_fresh: injects no schema", () => {
    const prompt = buildSystemPrompt(makeBootstrap("active_fresh"), { schemaMode: "none" });
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
  });

  it("active_stale: injects no schema (returning users don't need model explanation)", () => {
    const prompt = buildSystemPrompt(makeBootstrap("active_stale"), { schemaMode: "none" });
    expect(prompt).not.toContain(FULL_SCHEMA_MARKER);
    expect(prompt).not.toContain(MINIMAL_SCHEMA_MARKER);
    expect(prompt).not.toContain("call generate_page");
  });
});
