import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────
const { mockGetDraft, mockGetAllFacts, mockIsMultiUserEnabled } = vi.hoisted(() => ({
  mockGetDraft: vi.fn(),
  mockGetAllFacts: vi.fn(),
  mockIsMultiUserEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/services/page-service", () => ({
  getDraft: mockGetDraft,
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
}));

vi.mock("@/lib/services/kb-service", () => ({
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getAllFacts: mockGetAllFacts,
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: mockIsMultiUserEnabled,
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn(() => "en"),
}));

vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn((config: any) => config),
}));

vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));

vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn(),
  getActiveSoul: vi.fn(),
}));

vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn(),
}));

vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {},
}));

vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["vertical", "sidebar-left", "bento-standard"] as const,
}));

vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(),
  resolveLayoutTemplate: vi.fn(() => ({
    id: "vertical",
    slots: [{ id: "hero" }, { id: "main" }, { id: "footer" }],
  })),
}));

vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn((_t: any, sections: any) => ({ sections, issues: [] })),
}));

vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn(() => ({})),
}));

vi.mock("@/lib/layout/group-slots", () => ({
  groupSectionsBySlot: vi.fn(() => ({})),
}));

vi.mock("@/lib/page-config/section-completeness", () => ({
  isSectionComplete: vi.fn((s: any) => s.type === "hero" || s.type === "footer"),
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: vi.fn(() => "rich"),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: any[]) => facts.filter((f: any) => f.visibility !== "private")),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    hero: ["identity"],
    bio: ["identity", "interest"],
    skills: ["skill"],
  },
  computeHash: vi.fn(),
}));

vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: vi.fn(() => []),
}));

vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: vi.fn(),
}));

vi.mock("@/lib/page-config/schema", () => ({
  AVAILABLE_THEMES: ["minimal", "warm", "editorial-360"],
  validatePageConfig: vi.fn(),
}));

vi.mock("@/lib/page-config/usernames", () => ({
  validateUsernameFormat: vi.fn(() => ({ ok: true })),
}));

vi.mock("ai", () => ({
  tool: vi.fn((config: any) => config),
}));

import { createAgentTools } from "@/lib/agent/tools";
import { isSectionComplete } from "@/lib/page-config/section-completeness";
import { classifySectionRichness } from "@/lib/services/section-richness";

function makeDraft(overrides?: any) {
  return {
    config: {
      version: 1,
      username: "testuser",
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" },
      sections: [
        { id: "hero-1", type: "hero", content: { name: "Test" } },
        { id: "bio-1", type: "bio", content: { text: "Hello world" } },
        { id: "skills-1", type: "skills", content: { groups: [{ label: "Skills", skills: ["TS"] }] } },
        { id: "footer-1", type: "footer", content: {} },
      ],
      ...overrides?.config,
    },
    username: "testuser",
    status: "draft",
    configHash: "abc123",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFact(overrides?: any) {
  return {
    id: "fact-1",
    category: "identity",
    key: "name",
    value: { full: "Test User" },
    visibility: "proposed",
    confidence: 1,
    ...overrides,
  };
}

describe("publish_preflight tool", () => {
  let tools: ReturnType<typeof createAgentTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createAgentTools("en", "session-1", "owner-1", "req-1", ["session-1"]);
  });

  it("exists in the tools object", () => {
    expect(tools.publish_preflight).toBeDefined();
    expect(tools.publish_preflight.execute).toBeDefined();
  });

  it("returns readyToPublish=false when no draft exists", async () => {
    mockGetDraft.mockReturnValue(null);
    mockGetAllFacts.mockReturnValue([]);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.readyToPublish).toBe(false);
    expect(result.gates.hasDraft).toBe(false);
    expect(result.summary).toContain("No draft");
  });

  it("returns readyToPublish=true with valid draft and username (single-user mode)", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact(),
      makeFact({ id: "fact-2", category: "skill", key: "ts", value: { name: "TS" } }),
      makeFact({ id: "fact-3", category: "contact", key: "email", value: { type: "email", value: "a@b.com" } }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.readyToPublish).toBe(true);
    expect(result.gates.hasDraft).toBe(true);
    expect(result.gates.hasUsername).toBe(true);
  });

  it("returns readyToPublish=false when username is empty", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([makeFact()]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.readyToPublish).toBe(false);
    expect(result.gates.hasUsername).toBe(false);
  });

  it("reports incomplete sections in quality.incompleteSections", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([makeFact()]);
    mockIsMultiUserEnabled.mockReturnValue(false);
    vi.mocked(isSectionComplete).mockImplementation(
      (s: any) => s.type === "hero" || s.type === "footer",
    );

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.incompleteSections).toContain("bio");
    expect(result.quality.incompleteSections).toContain("skills");
    expect(result.quality.incompleteSections).not.toContain("hero");
  });

  it("reports thin sections in quality.thinSections", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([makeFact()]);
    mockIsMultiUserEnabled.mockReturnValue(false);
    vi.mocked(classifySectionRichness).mockImplementation(
      (_facts: any, type: string) => (type === "skills" ? "thin" : "rich"),
    );

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.thinSections).toContain("skills");
    expect(result.quality.thinSections).not.toContain("hero");
  });

  it("reports proposed fact count in quality.proposedFacts", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact({ visibility: "proposed" }),
      makeFact({ id: "f2", visibility: "proposed" }),
      makeFact({ id: "f3", visibility: "public" }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.proposedFacts).toBe(2);
  });

  it("reports missing contact in quality.missingContact", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact({ category: "identity" }),
      // No contact facts
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.missingContact).toBe(true);
  });

  it("reports contact present when public contact fact exists", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact({ category: "contact", key: "email", visibility: "proposed" }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.quality.missingContact).toBe(false);
  });

  it("returns section and fact counts in info", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetAllFacts.mockReturnValue([
      makeFact(),
      makeFact({ id: "f2" }),
      makeFact({ id: "f3" }),
    ]);
    mockIsMultiUserEnabled.mockReturnValue(false);

    const result = await tools.publish_preflight.execute(
      { username: "testuser" },
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.info.sectionCount).toBe(4);
    expect(result.info.factCount).toBe(3);
  });
});
