import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PageConfig, Section } from "@/lib/page-config/schema";

// Mock state service
const mockGetAllActiveCopies = vi.fn();
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getAllActiveCopies: (...args: unknown[]) => mockGetAllActiveCopies(...args),
}));

// Mock hashing — return predictable values
const mockComputeSectionFactsHash = vi.fn().mockReturnValue("mock-facts-hash");
const mockComputeHash = vi.fn().mockReturnValue("mock-soul-hash");
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeSectionFactsHash: (...args: unknown[]) => mockComputeSectionFactsHash(...args),
  computeHash: (...args: unknown[]) => mockComputeHash(...args),
  SECTION_FACT_CATEGORIES: { bio: ["identity"], skills: ["skill"], hero: ["identity"] },
}));

// Mock KB service
const mockGetActiveFacts = vi.fn().mockReturnValue([]);
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: unknown[]) => mockGetActiveFacts(...args),
}));

// Mock projection
const mockFilterPublishableFacts = vi.fn().mockReturnValue([]);
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: (...args: unknown[]) => mockFilterPublishableFacts(...args),
}));

// Mock soul service
const mockGetActiveSoul = vi.fn().mockReturnValue({ compiled: "mock-soul" });
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: (...args: unknown[]) => mockGetActiveSoul(...args),
}));

import { mergeActiveSectionCopy } from "@/lib/services/personalization-projection";

function makeConfig(sections: Section[]): PageConfig {
  return {
    version: 1,
    username: "testuser",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#000",
      fontFamily: "sans-serif",
      layout: "centered",
    },
    sections,
  };
}

function makeSection(type: string, content: Record<string, unknown>): Section {
  return {
    id: `section-${type}`,
    type: type as Section["type"],
    content,
  };
}

describe("mergeActiveSectionCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults
    mockGetAllActiveCopies.mockReturnValue([]);
    mockGetActiveFacts.mockReturnValue([]);
    mockFilterPublishableFacts.mockReturnValue([]);
    mockGetActiveSoul.mockReturnValue({ compiled: "mock-soul" });
    mockComputeSectionFactsHash.mockReturnValue("mock-facts-hash");
    mockComputeHash.mockReturnValue("mock-soul-hash");
  });

  it("returns config unchanged when no active copies exist", () => {
    const config = makeConfig([
      makeSection("bio", { description: "Original bio." }),
      makeSection("skills", { description: "Skill desc.", items: [{ name: "TS" }] }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].content.description).toBe("Original bio.");
    expect(result.sections[1].content.description).toBe("Skill desc.");
  });

  it("merges personalized text fields when hashes match", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ description: "A creative soul who builds." }),
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("bio", { description: "Original bio.", items: [{ name: "TS" }] }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    expect(result.sections[0].content.description).toBe("A creative soul who builds.");
    // Non-personalizable fields preserved
    expect(result.sections[0].content.items).toEqual([{ name: "TS" }]);
  });

  it("keeps deterministic content when facts hash does not match (stale)", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ description: "Stale personalized text." }),
        factsHash: "old-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("bio", { description: "Deterministic bio." }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    // Stale — deterministic content preserved
    expect(result.sections[0].content.description).toBe("Deterministic bio.");
  });

  it("keeps deterministic content when soul hash does not match (stale)", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ description: "Stale personalized text." }),
        factsHash: "mock-facts-hash",
        soulHash: "old-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("bio", { description: "Deterministic bio." }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    expect(result.sections[0].content.description).toBe("Deterministic bio.");
  });

  it("does not modify non-personalizable sections", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "footer",
        language: "en",
        personalizedContent: JSON.stringify({ links: [] }),
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("footer", { links: [{ url: "https://example.com" }] }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    // footer is not personalizable, content unchanged
    expect(result.sections[0].content.links).toEqual([{ url: "https://example.com" }]);
  });

  it("merges multiple sections independently", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ description: "Personalized bio." }),
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
      {
        id: 2,
        ownerKey: "owner1",
        sectionType: "skills",
        language: "en",
        personalizedContent: JSON.stringify({ description: "Personalized skills." }),
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("bio", { description: "Original bio.", items: [] }),
      makeSection("skills", { description: "Original skills.", items: [{ name: "TS" }] }),
      makeSection("footer", { links: [] }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    expect(result.sections[0].content.description).toBe("Personalized bio.");
    expect(result.sections[1].content.description).toBe("Personalized skills.");
    // footer untouched
    expect(result.sections[2].content.links).toEqual([]);
  });

  it("does not mutate the original config object", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ description: "Personalized." }),
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("bio", { description: "Original." }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    expect(config.sections[0].content.description).toBe("Original.");
    expect(result.sections[0].content.description).toBe("Personalized.");
  });

  it("passes ownerKey and language to getAllActiveCopies", () => {
    const config = makeConfig([makeSection("bio", { description: "Test." })]);

    mergeActiveSectionCopy(config, "owner-abc", "it");

    expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner-abc", "it");
  });

  it("handles sections not present in copies gracefully", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: JSON.stringify({ description: "Personalized bio." }),
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("skills", { description: "Original skills." }),
    ]);

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    // No copy for skills, stays unchanged
    expect(result.sections[0].content.description).toBe("Original skills.");
  });

  it("handles invalid JSON in personalizedContent gracefully", () => {
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1,
        ownerKey: "owner1",
        sectionType: "bio",
        language: "en",
        personalizedContent: "not-valid-json",
        factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash",
        approvedAt: null,
        source: "live",
      },
    ]);

    const config = makeConfig([
      makeSection("bio", { description: "Original." }),
    ]);

    // Should not throw, should fall back to deterministic
    const result = mergeActiveSectionCopy(config, "owner1", "en");
    expect(result.sections[0].content.description).toBe("Original.");
  });

  it("uses soul compiled string for soul hash computation", () => {
    mockGetActiveSoul.mockReturnValue({ compiled: "voice: warm" });
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1, ownerKey: "owner1", sectionType: "bio", language: "en",
        personalizedContent: '{"description":"P"}', factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash", approvedAt: null, source: "live",
      },
    ]);

    const config = makeConfig([makeSection("bio", { description: "Bio." })]);
    mergeActiveSectionCopy(config, "owner1", "en");

    expect(mockGetActiveSoul).toHaveBeenCalledWith("owner1");
    expect(mockComputeHash).toHaveBeenCalledWith("voice: warm");
  });

  it("uses empty string for soul hash when no active soul", () => {
    mockGetActiveSoul.mockReturnValue(null);
    mockGetAllActiveCopies.mockReturnValue([
      {
        id: 1, ownerKey: "owner1", sectionType: "bio", language: "en",
        personalizedContent: '{"description":"P"}', factsHash: "mock-facts-hash",
        soulHash: "mock-soul-hash", approvedAt: null, source: "live",
      },
    ]);

    const config = makeConfig([makeSection("bio", { description: "Bio." })]);
    mergeActiveSectionCopy(config, "owner1", "en");

    expect(mockComputeHash).toHaveBeenCalledWith("");
  });

  it("preserves all non-section config properties", () => {
    mockGetAllActiveCopies.mockReturnValue([]);

    const config = makeConfig([makeSection("bio", { description: "Bio." })]);
    config.theme = "warm";
    config.layoutTemplate = "curator";

    const result = mergeActiveSectionCopy(config, "owner1", "en");

    expect(result.theme).toBe("warm");
    expect(result.layoutTemplate).toBe("curator");
    expect(result.username).toBe("testuser");
    expect(result.version).toBe(1);
  });
});
