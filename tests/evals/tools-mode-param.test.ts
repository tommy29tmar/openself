import { describe, it, expect, vi } from "vitest";

// Mock all tool dependencies
vi.mock("@/lib/services/kb-service", () => ({
  createFact: vi.fn(),
  updateFact: vi.fn(),
  deleteFact: vi.fn(),
  searchFacts: vi.fn(),
  getAllFacts: vi.fn().mockReturnValue([]),
  setFactVisibility: vi.fn(),
  VisibilityTransitionError: class extends Error {},
}));
vi.mock("@/lib/services/page-service", () => ({
  getDraft: vi.fn(),
  upsertDraft: vi.fn(),
  requestPublish: vi.fn(),
}));
vi.mock("@/lib/services/page-composer", () => ({
  composeOptimisticPage: vi.fn().mockReturnValue({
    version: 1,
    username: "test",
    theme: "minimal",
    style: { colorScheme: "light", primaryColor: "#000", fontFamily: "sans-serif", layout: "centered" },
    sections: [],
  }),
}));
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));
vi.mock("@/lib/services/preferences-service", () => ({
  getFactLanguage: vi.fn().mockReturnValue("en"),
}));
vi.mock("@/lib/ai/translate", () => ({
  translatePageContent: vi.fn().mockImplementation((config: unknown) => Promise.resolve(config)),
}));
vi.mock("@/lib/services/memory-service", () => ({
  saveMemory: vi.fn(),
}));
vi.mock("@/lib/services/soul-service", () => ({
  proposeSoulChange: vi.fn().mockReturnValue({ id: "proposal-1" }),
  getActiveSoul: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/services/conflict-service", () => ({
  resolveConflict: vi.fn().mockReturnValue({ success: true }),
}));
vi.mock("@/lib/services/fact-validation", () => ({
  FactValidationError: class extends Error {},
}));
vi.mock("@/lib/layout/contracts", () => ({
  LAYOUT_TEMPLATES: ["vertical", "sidebar-left", "bento-standard"] as const,
}));
vi.mock("@/lib/layout/registry", () => ({
  getLayoutTemplate: vi.fn().mockReturnValue({ id: "vertical", slots: [] }),
}));
vi.mock("@/lib/layout/assign-slots", () => ({
  assignSlotsFromFacts: vi.fn().mockReturnValue({ sections: [], issues: [] }),
}));
vi.mock("@/lib/layout/lock-policy", () => ({
  extractLocks: vi.fn().mockReturnValue(new Map()),
}));
vi.mock("@/lib/services/section-personalizer", () => ({
  personalizeSection: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: vi.fn().mockReturnValue("hash"),
}));

import { createAgentTools } from "@/lib/agent/tools";

describe("createAgentTools mode parameter", () => {
  it("accepts mode as 6th parameter without error", () => {
    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "steady_state");
    expect(tools).toHaveProperty("generate_page");
    expect(tools).toHaveProperty("create_fact");
    expect(tools).toHaveProperty("request_publish");
  });

  it("accepts mode as undefined (backward compatible)", () => {
    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"]);
    expect(tools).toHaveProperty("generate_page");
    expect(tools).toHaveProperty("create_fact");
  });

  it("accepts onboarding mode", () => {
    const { tools } = createAgentTools("en", "session1", "owner1", "req1", ["session1"], "onboarding");
    expect(tools).toHaveProperty("generate_page");
  });

  it("works with minimal arguments (backward compatible)", () => {
    const { tools } = createAgentTools();
    expect(tools).toHaveProperty("generate_page");
  });
});
