import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────
const {
  mockGetDraft,
  mockGetActiveFacts,
  mockResolveLayoutTemplate,
  mockGroupSectionsBySlot,
  mockIsSectionComplete,
  mockClassifySectionRichness,
} = vi.hoisted(() => ({
  mockGetDraft: vi.fn(),
  mockGetActiveFacts: vi.fn(),
  mockResolveLayoutTemplate: vi.fn(),
  mockGroupSectionsBySlot: vi.fn(),
  mockIsSectionComplete: vi.fn(),
  mockClassifySectionRichness: vi.fn(),
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
  getActiveFacts: mockGetActiveFacts,
  getFactById: vi.fn(),
  factExistsAcrossReadKeys: vi.fn(() => false),
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));

vi.mock("@/lib/services/session-metadata", () => ({
  getSessionMeta: vi.fn(() => ({})),
  mergeSessionMeta: vi.fn(),
  setSessionMeta: vi.fn(),
}));
vi.mock("@/lib/services/confirmation-service", () => ({
  hashValue: vi.fn(() => "mock-hash"),
  pruneUnconfirmedPendings: vi.fn(),
}));

vi.mock("@/lib/services/session-service", () => ({
  isMultiUserEnabled: vi.fn(() => false),
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
  LAYOUT_TEMPLATES: ["monolith", "curator", "architect"] as const,
}));

vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn(),
  resolveLayoutTemplate: mockResolveLayoutTemplate,
}));

vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn((_t: any, sections: any) => ({ sections, issues: [] })),
}));

vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn(() => ({})),
}));

vi.mock("@/lib/layout/group-slots", () => ({
  groupSectionsBySlot: mockGroupSectionsBySlot,
}));

vi.mock("@/lib/page-config/section-completeness", () => ({
  isSectionComplete: mockIsSectionComplete,
}));

vi.mock("@/lib/services/section-richness", () => ({
  classifySectionRichness: mockClassifySectionRichness,
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn((facts: any[]) => facts),
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
  validatePageConfig: vi.fn(),
}));

vi.mock("@/lib/page-config/usernames", () => ({
  validateUsernameFormat: vi.fn(() => ({ ok: true })),
}));

vi.mock("ai", () => ({
  tool: vi.fn((config: any) => config),
}));

import { createAgentTools } from "@/lib/agent/tools";

const verticalTemplate = {
  id: "monolith",
  name: "Vertical",
  heroSlot: "hero",
  footerSlot: "footer",
  slots: [
    { id: "hero", size: "wide", accepts: ["hero"] },
    { id: "main", size: "wide", accepts: ["bio", "skills", "projects"] },
    { id: "footer", size: "wide", accepts: ["footer"] },
  ],
};

function makeDraft(overrides?: any) {
  return {
    config: {
      version: 1,
      username: "testuser",
      surface: "canvas",
      voice: "signal",
      light: "day",
      layoutTemplate: "monolith",
      style: { primaryColor: "#000", layout: "centered" },
      sections: [
        { id: "hero-1", type: "hero", content: { name: "Test" } },
        { id: "bio-1", type: "bio", content: { text: "Hello" } },
        { id: "skills-1", type: "skills", widgetId: "skills-chips", content: { groups: [] } },
        { id: "footer-1", type: "footer", content: {} },
      ],
      ...overrides?.config,
    },
    username: "testuser",
    status: "draft",
    ...overrides,
  };
}

describe("inspect_page_state tool", () => {
  let tools: ReturnType<typeof createAgentTools>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    tools = createAgentTools("en", "session-1", "owner-1", "req-1", ["session-1"]).tools;
    mockResolveLayoutTemplate.mockReturnValue(verticalTemplate);
    mockGroupSectionsBySlot.mockReturnValue({
      hero: [{ id: "hero-1", type: "hero" }],
      main: [
        { id: "bio-1", type: "bio" },
        { id: "skills-1", type: "skills" },
      ],
      footer: [{ id: "footer-1", type: "footer" }],
    });
    mockIsSectionComplete.mockReturnValue(true);
    mockClassifySectionRichness.mockReturnValue("rich");
    mockGetActiveFacts.mockReturnValue([]);
  });

  it("exists in the tools object", () => {
    expect(tools.inspect_page_state).toBeDefined();
    expect(tools.inspect_page_state.execute).toBeDefined();
  });

  it("returns error when no draft exists", async () => {
    mockGetDraft.mockReturnValue(null);

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.error).toBe("No draft found");
  });

  it("returns layout information", async () => {
    mockGetDraft.mockReturnValue(makeDraft());

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.layout).toBeDefined();
    expect(result.layout.template).toBe("monolith");
    expect(result.layout.surface).toBe("canvas");
    expect(result.layout.voice).toBe("signal");
    expect(result.layout.light).toBe("day");
  });

  it("returns per-section details with slot assignment", async () => {
    mockGetDraft.mockReturnValue(makeDraft());

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.sections).toHaveLength(4);

    const heroSection = result.sections.find((s: any) => s.type === "hero");
    expect(heroSection.slot).toBe("hero");
    expect(heroSection.complete).toBe(true);

    const bioSection = result.sections.find((s: any) => s.type === "bio");
    expect(bioSection.slot).toBe("main");

    const skillsSection = result.sections.find((s: any) => s.type === "skills");
    expect(skillsSection.widget).toBe("skills-chips");
  });

  it("reports locked sections", async () => {
    const draftWithLock = makeDraft();
    draftWithLock.config.sections[1].lock = { position: true, widget: true, content: false, lockedBy: "user" };
    mockGetDraft.mockReturnValue(draftWithLock);

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    const bioSection = result.sections.find((s: any) => s.type === "bio");
    expect(bioSection.locked).toBe(true);
  });

  it("reports completeness and richness per section", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockIsSectionComplete.mockImplementation(
      (s: any) => s.type !== "skills",
    );
    mockClassifySectionRichness.mockImplementation(
      (_f: any, type: string) => (type === "skills" ? "thin" : "rich"),
    );

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    const skillsSection = result.sections.find((s: any) => s.type === "skills");
    expect(skillsSection.complete).toBe(false);
    expect(skillsSection.richness).toBe("thin");
  });

  it("returns available slots from the template", async () => {
    mockGetDraft.mockReturnValue(makeDraft());

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.availableSlots).toEqual(["hero", "main", "footer"]);
  });

  it("generates warnings for thin and incomplete sections", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockIsSectionComplete.mockImplementation(
      (s: any) => s.type !== "skills",
    );
    mockClassifySectionRichness.mockImplementation(
      (_f: any, type: string) => (type === "skills" ? "thin" : "rich"),
    );
    mockGetActiveFacts.mockReturnValue([]);

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.warnings).toContain("skills section is thin");
    expect(result.warnings).toContain("skills section is incomplete");
  });

  it("warns about missing public contact information", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "identity", visibility: "public" },
      // No contact facts
    ]);

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.warnings).toContain("No public contact information");
  });

  it("does not warn about contact when public contact exists", async () => {
    mockGetDraft.mockReturnValue(makeDraft());
    mockGetActiveFacts.mockReturnValue([
      { id: "f1", category: "contact", visibility: "proposed" },
    ]);

    const result = await tools.inspect_page_state.execute(
      {},
      { toolCallId: "test", messages: [], abortSignal: undefined as any },
    );

    expect(result.warnings).not.toContain("No public contact information");
  });
});
