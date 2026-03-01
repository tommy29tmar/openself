/**
 * Tests for the drill-down context block (section richness in assembleContext).
 * Verifies that steady_state mode includes EXPLORATION PRIORITIES and
 * that onboarding mode does not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock all service dependencies before importing the module under test ---

vi.mock("@/lib/services/kb-service", () => ({
  getAllFacts: vi.fn(() => []),
  countFacts: vi.fn(() => 0),
}));
vi.mock("@/lib/services/page-service", () => ({
  hasAnyPublishedPage: vi.fn(() => false),
}));
vi.mock("@/lib/services/summary-service", () => ({
  getSummary: vi.fn(() => null),
}));
vi.mock("@/lib/services/memory-service", () => ({
  getActiveMemories: vi.fn(() => []),
}));
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: vi.fn(() => null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  getOpenConflicts: vi.fn(() => []),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn(() => []),
}));

import { assembleContext } from "@/lib/agent/context";
import type { OwnerScope } from "@/lib/auth/session";
import { countFacts, getAllFacts } from "@/lib/services/kb-service";
import { hasAnyPublishedPage } from "@/lib/services/page-service";
import { filterPublishableFacts } from "@/lib/services/page-projection";

const SCOPE: OwnerScope = {
  cognitiveOwnerKey: "cog-1",
  knowledgeReadKeys: ["sess-a", "sess-b"],
  knowledgePrimaryKey: "sess-a",
  currentSessionId: "sess-b",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: steady_state via published page
  vi.mocked(countFacts).mockReturnValue(10);
  vi.mocked(hasAnyPublishedPage).mockReturnValue(true);
  vi.mocked(getAllFacts).mockReturnValue([]);
  vi.mocked(filterPublishableFacts).mockReturnValue([]);
});

describe("drill-down context block", () => {
  it("includes EXPLORATION PRIORITIES block in steady_state mode", () => {
    const identityFact = {
      id: "f1",
      category: "identity",
      key: "name",
      value: { name: "Alice" },
      source: "chat",
      confidence: 1.0,
      visibility: "public",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    vi.mocked(getAllFacts).mockReturnValue([identityFact] as any);
    vi.mocked(filterPublishableFacts).mockReturnValue([identityFact] as any);

    const { systemPrompt, mode } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hello" },
    ]);

    expect(mode).toBe("steady_state");
    expect(systemPrompt).toContain("EXPLORATION PRIORITIES");
  });

  it("lists thin/empty sections but not rich ones", () => {
    // 3 skill facts -> skills should be "rich" (omitted from list)
    // 1 identity fact -> hero should be "thin" (included)
    const facts = [
      { id: "f1", category: "identity", key: "name", value: { full: "Alice" }, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f2", category: "skill", key: "js", value: { name: "JS" }, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f3", category: "skill", key: "ts", value: { name: "TS" }, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f4", category: "skill", key: "py", value: { name: "Python" }, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
    ];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(filterPublishableFacts).mockReturnValue(facts as any);

    const { systemPrompt } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hi" },
    ]);

    // skills is rich (3 facts) — should NOT appear in the exploration priorities
    expect(systemPrompt).not.toMatch(/skills: rich/);
    // Archetype-weighted priorities show numbered format (e.g., "1. projects: empty")
    // projects has 0 facts — should be "empty" in the priorities
    expect(systemPrompt).toContain("projects: empty");
  });

  it("includes ARCHETYPE label in onboarding mode exploration block", () => {
    // Force onboarding mode
    vi.mocked(countFacts).mockReturnValue(0);
    vi.mocked(hasAnyPublishedPage).mockReturnValue(false);

    const { systemPrompt, mode } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hello" },
    ]);

    expect(mode).toBe("onboarding");
    // Onboarding now includes archetype-weighted exploration with ARCHETYPE prefix
    expect(systemPrompt).toContain("ARCHETYPE:");
  });

  it("steady_state prompt includes layout intelligence", () => {
    const { systemPrompt, mode } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hello" },
    ]);

    expect(mode).toBe("steady_state");
    expect(systemPrompt).toContain("PAGE LAYOUT INTELLIGENCE");
    expect(systemPrompt).toContain("Profile archetype:");
  });

  it("omits richness block when all sections are rich", () => {
    // Create enough facts to make every section "rich"
    const facts = [
      // hero (identity) — 3 facts
      { id: "f1", category: "identity", key: "name", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f2", category: "identity", key: "location", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f3", category: "identity", key: "tagline", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // bio (identity + interest) — already 3 identity above, plus interests below
      // skills — 3 facts
      { id: "f10", category: "skill", key: "js", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f11", category: "skill", key: "ts", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f12", category: "skill", key: "py", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // projects — 3 facts
      { id: "f20", category: "project", key: "p1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f21", category: "project", key: "p2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f22", category: "project", key: "p3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // interests (interest + hobby) — 3 facts
      { id: "f30", category: "interest", key: "i1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f31", category: "interest", key: "i2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f32", category: "hobby", key: "h1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // achievements — 3
      { id: "f40", category: "achievement", key: "a1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f41", category: "achievement", key: "a2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f42", category: "achievement", key: "a3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // stats — 3
      { id: "f50", category: "stat", key: "s1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f51", category: "stat", key: "s2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f52", category: "stat", key: "s3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // reading — 3
      { id: "f60", category: "reading", key: "r1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f61", category: "reading", key: "r2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f62", category: "reading", key: "r3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // music — 3
      { id: "f70", category: "music", key: "m1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f71", category: "music", key: "m2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f72", category: "music", key: "m3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // experience — 3
      { id: "f80", category: "experience", key: "e1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f81", category: "experience", key: "e2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f82", category: "experience", key: "e3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // education — 3
      { id: "f90", category: "education", key: "ed1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f91", category: "education", key: "ed2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f92", category: "education", key: "ed3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // languages — 3
      { id: "f100", category: "language", key: "l1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f101", category: "language", key: "l2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f102", category: "language", key: "l3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      // activities (activity + hobby) — already have hobby above, add more
      { id: "f110", category: "activity", key: "act1", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f111", category: "activity", key: "act2", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
      { id: "f112", category: "activity", key: "act3", value: {}, source: "chat", confidence: 1, visibility: "public", createdAt: "", updatedAt: "" },
    ];
    vi.mocked(getAllFacts).mockReturnValue(facts as any);
    vi.mocked(filterPublishableFacts).mockReturnValue(facts as any);

    const { systemPrompt } = assembleContext(SCOPE, "en", [
      { role: "user", content: "hi" },
    ]);

    // All sections are rich — exploration priorities block should be omitted
    // (it only appears when at least one section is not rich)
    expect(systemPrompt).not.toContain("EXPLORATION PRIORITIES");
  });
});
