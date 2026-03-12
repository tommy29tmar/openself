import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockScope = {
  cognitiveOwnerKey: "owner-1",
  knowledgeReadKeys: ["sess-1"],
  knowledgePrimaryKey: "sess-1",
  currentSessionId: "sess-1",
};

vi.mock("@/lib/auth/session", () => ({
  resolveOwnerScopeForWorker: () => mockScope,
}));

const mockFacts = [
  { id: "f1", category: "experience", key: "job-1", value: { role: "Dev", company: "Acme" }, visibility: "public" },
  { id: "f2", category: "project", key: "proj-1", value: { title: "OpenSelf", description: "Page builder" }, visibility: "public" },
];

vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: () => mockFacts,
}));

vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: () => ({ compiled: "Professional tone." }),
}));

vi.mock("@/lib/services/preferences-service", () => ({
  getPreferences: () => ({ language: "it", factLanguage: "it" }),
}));

const mockGetOverridesForOwner = vi.fn().mockReturnValue([]);
vi.mock("@/lib/services/fact-display-override-service", () => ({
  getFactDisplayOverrideService: () => ({
    getOverridesForOwner: (...args: any[]) => mockGetOverridesForOwner(...args),
  }),
}));

vi.mock("@/lib/services/section-copy-state-service", () => ({
  getActiveCopy: () => null,
}));

const mockCreateProposal = vi.fn();
vi.mock("@/lib/services/proposal-service", () => ({
  createProposal: (...args: any[]) => mockCreateProposal(...args),
}));

const mockAnalyze = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/services/page-curation-service", () => ({
  analyzeSectionForCuration: (...args: any[]) => mockAnalyze(...args),
}));

vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: (facts: any[]) => facts.filter((f: any) => f.visibility === "public"),
  projectCanonicalConfig: () => ({
    sections: [
      { type: "experience", content: { entries: [] } },
      { type: "projects", content: { entries: [] } },
    ],
  }),
}));

vi.mock("@/lib/services/personalization-hashing", () => ({
  SECTION_FACT_CATEGORIES: {
    experience: ["experience"],
    projects: ["project"],
  },
  computeSectionFactsHash: () => "hash-facts",
  computeHash: () => "hash-soul",
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

const { handlePageCuration } = await import("@/lib/worker/handlers/curate-page");

describe("curate-page handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyze.mockResolvedValue([]);
  });

  it("skips when no publishable facts", async () => {
    const mod = await import("@/lib/services/page-projection");
    const orig = mod.filterPublishableFacts;
    (mod as any).filterPublishableFacts = () => [];
    await handlePageCuration({ ownerKey: "owner-1" });
    expect(mockCreateProposal).not.toHaveBeenCalled();
    (mod as any).filterPublishableFacts = orig;
  });

  it("creates proposals from LLM suggestions", async () => {
    mockAnalyze.mockResolvedValue([
      { type: "section", sectionType: "experience", fields: { description: "Better text" }, reason: "Improve" },
    ]);
    await handlePageCuration({ ownerKey: "owner-1" });
    expect(mockCreateProposal).toHaveBeenCalled();
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        issueType: "curation",
        language: "it",
      }),
    );
  });

  it("uses owner language from preferences (not hardcoded 'en')", async () => {
    mockAnalyze.mockResolvedValue([
      { type: "item", factId: "f2", sectionType: "projects", fields: { title: "OpenSelf Platform" }, reason: "Better" },
    ]);
    await handlePageCuration({ ownerKey: "owner-1" });
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({ language: "it" }),
    );
  });

  it("skips agent-curated sections", async () => {
    const mod = await import("@/lib/services/section-copy-state-service");
    (mod.getActiveCopy as any) = () => ({ source: "agent", personalizedContent: "{}", factsHash: "", soulHash: "" });
    await handlePageCuration({ ownerKey: "owner-1" });
    expect(mockAnalyze).not.toHaveBeenCalled();
    // Restore
    (mod.getActiveCopy as any) = () => null;
  });

  it("respects MAX_PROPOSALS_PER_RUN cap", async () => {
    mockAnalyze.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        type: "section" as const,
        sectionType: "experience",
        fields: { description: `Suggestion ${i}` },
        reason: `Reason ${i}`,
      })),
    );
    await handlePageCuration({ ownerKey: "owner-1" });
    expect(mockCreateProposal.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
