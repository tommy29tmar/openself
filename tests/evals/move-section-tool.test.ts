/**
 * Tests for move_section tool — cross-slot section movement
 * with auto-widget-switch, lock validation, capacity check.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageConfig, Section } from "@/lib/page-config/schema";

// Mock DB and services
const mockDraft: { config: PageConfig | null } = { config: null };

vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(() => mockDraft.config ? { config: mockDraft.config, publishStatus: "draft" } : null),
  upsertDraft: vi.fn((username: string, config: PageConfig) => {
    mockDraft.config = config;
  }),
  getPublishedUsername: vi.fn(() => null),
}));
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: vi.fn(() => []),
  searchFacts: vi.fn(() => []),
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  getFactById: vi.fn(),
  factExistsAcrossReadKeys: vi.fn(() => false),
  setFactVisibility: vi.fn(),
  archiveFact: vi.fn(),
  unarchiveFact: vi.fn(),
  batchFactOperations: vi.fn(),
  reorderFacts: vi.fn(),
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
vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));
vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn(),
  getSoulProfile: vi.fn(() => null),
  getActiveSoul: vi.fn(() => null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn(),
}));
vi.mock("@/lib/db/event-log", () => ({
  logEvent: vi.fn(),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn(() => ({ sections: [], theme: "minimal", style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" } })),
}));
vi.mock("@/lib/services/page-projection", () => ({
  projectCanonicalConfig: vi.fn(() => ({ sections: [], theme: "minimal", style: { colorScheme: "light", primaryColor: "#000", fontFamily: "inter", layout: "centered" } })),
  filterPublishableFacts: vi.fn(() => []),
}));
vi.mock("@/lib/ai/translate", () => ({
  translatePageConfig: vi.fn(),
}));

import { createAgentTools } from "@/lib/agent/tools";

function makeSidebarLeftDraft(sections: Section[]): PageConfig {
  return {
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#111", fontFamily: "inter", layout: "centered" },
    layoutTemplate: "curator",
    sections,
  };
}

describe("move_section tool", () => {
  beforeEach(() => {
    mockDraft.config = null;
    vi.clearAllMocks();
  });

  it("moves section to target slot", async () => {
    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] }, slot: "main", widgetId: "skills-grid" },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "skills-1", targetSlot: "sidebar" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);
    expect(result.movedTo).toBe("sidebar");
    // Verify the draft was updated
    const skills = mockDraft.config!.sections.find(s => s.id === "skills-1");
    expect(skills!.slot).toBe("sidebar");
  });

  it("auto-switches widget when current doesn't fit target slot size", async () => {
    // architect-standard: feature-right is "half", card-1 is "third"
    // skills-list fits wide/half but NOT third → should switch to skills-chips (fits third)
    mockDraft.config = {
      theme: "minimal",
      style: { colorScheme: "light", primaryColor: "#111", fontFamily: "inter", layout: "centered" },
      layoutTemplate: "architect",
      sections: [
        { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
        { id: "skills-1", type: "skills", variant: "list", content: { groups: [] }, slot: "feature-right", widgetId: "skills-list" },
      ],
    };

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "skills-1", targetSlot: "card-1" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);
    expect(result.widgetChanged).toBe(true);
    expect(result.previousWidget).toBe("skills-list");
    // New widget should fit "third"
    expect(result.newWidget).toBeTruthy();
  });

  it("returns error when target slot doesn't accept section type", async () => {
    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
      { id: "projects-1", type: "projects", variant: "grid", content: { items: [] }, slot: "main", widgetId: "projects-grid" },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "projects-1", targetSlot: "sidebar" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("TYPE_NOT_ACCEPTED");
  });

  it("returns error when target slot is full", async () => {
    // Sidebar has maxSections: 6 — fill it up
    const sidebarSections: Section[] = Array.from({ length: 6 }, (_, i) => ({
      id: `skills-${i + 1}`,
      type: "skills" as const,
      variant: "grid",
      content: { groups: [] },
      slot: "sidebar",
      widgetId: "skills-grid",
    }));

    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
      ...sidebarSections,
      { id: "interests-1", type: "interests", variant: "grid", content: { items: [] }, slot: "main", widgetId: "interests-grid" },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "interests-1", targetSlot: "sidebar" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("SLOT_FULL");
  });

  it("respects user position locks", async () => {
    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
      {
        id: "skills-1", type: "skills", variant: "grid", content: { groups: [] }, slot: "main",
        lock: { position: true, lockedBy: "user", lockedAt: new Date().toISOString() },
      },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "skills-1", targetSlot: "sidebar" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("POSITION_LOCKED");
  });

  it("move to same slot is no-op", async () => {
    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] }, slot: "sidebar", widgetId: "skills-grid" },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "skills-1", targetSlot: "sidebar" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(true);
    expect(result.movedTo).toBe("sidebar");
  });

  it("non-existent sectionId returns error", async () => {
    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "does-not-exist", targetSlot: "curator" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("SECTION_NOT_FOUND");
  });

  it("non-existent target slot returns error", async () => {
    mockDraft.config = makeSidebarLeftDraft([
      { id: "hero-1", type: "hero", variant: "large", content: { name: "Test" }, slot: "hero" },
      { id: "skills-1", type: "skills", variant: "grid", content: { groups: [] }, slot: "main" },
    ]);

    const { tools } = createAgentTools("en", "sess1");
    const result = await tools.move_section.execute(
      { sectionId: "skills-1", targetSlot: "nonexistent" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as any },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("SLOT_NOT_FOUND");
  });
});
