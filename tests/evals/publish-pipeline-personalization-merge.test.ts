import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Publish pipeline integration: personalized copy appears in published output.
 *
 * Tests the full chain: projectPublishableConfig -> mergeActiveSectionCopy
 * to verify that stored personalized section copy is merged into the
 * config that gets published.
 *
 * Uses mocks at the boundary (DB/KB) level, NOT at the projection level,
 * so the actual merge logic is exercised.
 */

// ---------------------------------------------------------------------------
// Hoisted mocks (boundary services only)
// ---------------------------------------------------------------------------
const {
  mockGetActiveFacts,
  mockGetAllActiveCopies,
  mockGetActiveSoul,
  mockComputeSectionFactsHash,
  mockComputeHash,
  mockFilterPublishableFacts,
  mockGetFactDisplayOverrideService,
  mockGetProfileAvatar,
} = vi.hoisted(() => ({
  mockGetActiveFacts: vi.fn(),
  mockGetAllActiveCopies: vi.fn(),
  mockGetActiveSoul: vi.fn(),
  mockComputeSectionFactsHash: vi.fn(),
  mockComputeHash: vi.fn(),
  mockFilterPublishableFacts: vi.fn((facts: unknown[]) => facts),
  mockGetFactDisplayOverrideService: vi.fn(() => ({
    getValidOverrides: vi.fn(() => new Map()),
  })),
  mockGetProfileAvatar: vi.fn(() => null),
}));

// Mock KB service — used by projectCanonicalConfig -> composeOptimisticPage
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: mockGetActiveFacts,
}));

// Mock fact-cluster-service — getProjectedFacts used by mergeActiveSectionCopy
vi.mock("@/lib/services/fact-cluster-service", () => ({
  getProjectedFacts: (...args: any[]) =>
    mockGetActiveFacts(...args).map((f: any) => ({
      ...f,
      sources: [f.source ?? "chat"],
      clusterSize: 1,
      clusterId: null,
      memberIds: [f.id],
    })),
}));

// Mock section copy state service (personalized content storage)
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getAllActiveCopies: (...args: any[]) => mockGetAllActiveCopies(...args),
}));

// Mock soul service
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: (...args: any[]) => mockGetActiveSoul(...args),
}));

// Mock hashing — return predictable values
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeSectionFactsHash: (...args: any[]) => mockComputeSectionFactsHash(...args),
  computeHash: (...args: any[]) => mockComputeHash(...args),
  SECTION_FACT_CATEGORIES: {
    bio: ["identity", "interest"],
    hero: ["identity"],
    skills: ["skill"],
    experience: ["experience"],
    education: ["education"],
  },
}));

// Mock fact display override service (no overrides in these tests)
vi.mock("@/lib/services/fact-display-override-service", () => ({
  getFactDisplayOverrideService: mockGetFactDisplayOverrideService,
  computeFactValueHash: vi.fn(() => "mock-hash"),
}));

// Mock media service (avatar)
vi.mock("@/lib/services/media-service", () => ({
  getProfileAvatar: mockGetProfileAvatar,
}));

// Mock event service
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

// Import the real modules — NOT mocked
import { projectPublishableConfig } from "@/lib/services/page-projection";
import { mergeActiveSectionCopy } from "@/lib/services/personalization-projection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFact(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "s1",
    category: "identity",
    key: "name",
    value: { name: "Elena" },
    visibility: "public" as const,
    confidence: 1,
    source: "chat" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
    parentFactId: null,
    archivedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("publish pipeline: personalized copy appears in published output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXTENDED_SECTIONS = "true";

    // Default: no personalized copies
    mockGetAllActiveCopies.mockReturnValue([]);
    mockGetActiveSoul.mockReturnValue({ compiled: "warm and creative voice" });
    mockComputeHash.mockReturnValue("soul-hash-abc");
    mockComputeSectionFactsHash.mockReturnValue("facts-hash-xyz");
  });

  it("merges personalized bio text into publishable config when hashes match", () => {
    const facts = [
      makeFact({ id: "f1", category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ id: "f2", category: "identity", key: "title", value: { value: "UX Designer" } }),
    ];

    // 1. Get canonical config (deterministic composition from facts)
    const canonical = projectPublishableConfig(facts, "elena", "en");
    const bioSection = canonical.sections.find((s) => s.type === "bio");
    expect(bioSection).toBeDefined();
    // Deterministic bio should contain the name/role
    expect(bioSection!.content.text).toBeDefined();

    // 2. Store personalized copy with matching hashes
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "profile-1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ text: "Elena crafts digital experiences that bridge aesthetics and usability." }),
        factsHash: "facts-hash-xyz",
        soulHash: "soul-hash-abc",
        approvedAt: null,
        source: "live",
      },
    ]);
    mockGetActiveFacts.mockReturnValue(facts);

    // 3. Merge personalized copy (same as publish pipeline does)
    const merged = mergeActiveSectionCopy(canonical, "profile-1", "en");

    // 4. Verify personalized text appears in output
    const mergedBio = merged.sections.find((s) => s.type === "bio");
    expect(mergedBio).toBeDefined();
    expect(mergedBio!.content.text).toBe(
      "Elena crafts digital experiences that bridge aesthetics and usability.",
    );
  });

  it("preserves deterministic content when personalized copy hashes are stale", () => {
    const facts = [
      makeFact({ id: "f1", category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ id: "f2", category: "identity", key: "title", value: { value: "UX Designer" } }),
    ];

    const canonical = projectPublishableConfig(facts, "elena", "en");
    const deterministicBioText = canonical.sections.find((s) => s.type === "bio")!.content.text;

    // Stale copy (facts hash doesn't match)
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "profile-1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ text: "Stale personalized text." }),
        factsHash: "old-facts-hash",
        soulHash: "soul-hash-abc",
        approvedAt: null,
        source: "live",
      },
    ]);
    mockGetActiveFacts.mockReturnValue(facts);

    const merged = mergeActiveSectionCopy(canonical, "profile-1", "en");

    const mergedBio = merged.sections.find((s) => s.type === "bio");
    expect(mergedBio!.content.text).toBe(deterministicBioText);
    expect(mergedBio!.content.text).not.toBe("Stale personalized text.");
  });

  it("merges personalized experience title while preserving items", () => {
    const facts = [
      makeFact({ id: "f1", category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({
        id: "f2",
        category: "experience",
        key: "job1",
        value: { role: "Lead Designer", company: "Studio X", startDate: "2021-03" },
      }),
    ];

    const canonical = projectPublishableConfig(facts, "elena", "en");
    const expSection = canonical.sections.find((s) => s.type === "experience");
    expect(expSection).toBeDefined();

    // Original deterministic title is "Experience"
    const originalTitle = expSection!.content.title;
    expect(originalTitle).toBe("Experience");

    // Store personalized title with matching hashes
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "profile-1",
        sectionType: "experience",
        language: "en",
        personalizedContent: JSON.stringify({ title: "My Creative Journey" }),
        factsHash: "facts-hash-xyz",
        soulHash: "soul-hash-abc",
        approvedAt: null,
        source: "live",
      },
    ]);
    mockGetActiveFacts.mockReturnValue(facts);

    const merged = mergeActiveSectionCopy(canonical, "profile-1", "en");

    const mergedExp = merged.sections.find((s) => s.type === "experience");
    expect(mergedExp).toBeDefined();
    // Personalized title merged
    expect(mergedExp!.content.title).toBe("My Creative Journey");
    // Items preserved (not overwritten by personalization)
    const items = (mergedExp!.content as any).items;
    expect(items).toBeDefined();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Lead Designer");
  });

  it("end-to-end: canonical config + personalization merge preserves all sections", () => {
    const facts = [
      makeFact({ id: "f1", category: "identity", key: "name", value: { name: "Elena Rossi" } }),
      makeFact({ id: "f2", category: "identity", key: "title", value: { value: "Designer" } }),
      makeFact({ id: "f3", category: "skill", key: "figma", value: { name: "Figma" } }),
      makeFact({
        id: "f4",
        category: "experience",
        key: "job1",
        value: { role: "Designer", company: "Acme", startDate: "2020-01-01" },
      }),
    ];

    // Step 1: Canonical composition
    const canonical = projectPublishableConfig(facts, "elena", "en");
    const sectionTypes = canonical.sections.map((s) => s.type);
    expect(sectionTypes).toContain("hero");
    expect(sectionTypes).toContain("bio");

    // Step 2: Personalize bio and experience
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "profile-1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ text: "Elena is a visionary designer." }),
        factsHash: "facts-hash-xyz",
        soulHash: "soul-hash-abc",
        approvedAt: null,
        source: "live",
      },
      {
        id: 2,
        ownerKey: "profile-1",
        sectionType: "experience",
        language: "en",
        personalizedContent: JSON.stringify({ title: "Where I've Made an Impact" }),
        factsHash: "facts-hash-xyz",
        soulHash: "soul-hash-abc",
        approvedAt: null,
        source: "live",
      },
    ]);
    mockGetActiveFacts.mockReturnValue(facts);

    const published = mergeActiveSectionCopy(canonical, "profile-1", "en");

    // All original sections still present
    expect(published.sections.length).toBeGreaterThanOrEqual(canonical.sections.length);

    // Personalized content merged
    const bio = published.sections.find((s) => s.type === "bio");
    expect(bio!.content.text).toBe("Elena is a visionary designer.");

    const exp = published.sections.find((s) => s.type === "experience");
    if (exp) {
      expect(exp.content.title).toBe("Where I've Made an Impact");
    }

    // Non-personalized sections unchanged
    const hero = published.sections.find((s) => s.type === "hero");
    expect(hero).toBeDefined();
    expect(hero!.content.name).toBe("Elena Rossi");
  });
});
