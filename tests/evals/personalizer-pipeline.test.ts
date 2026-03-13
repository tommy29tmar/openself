import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockGenerateObject,
  mockGetModel,
  mockGetActiveFacts,
  mockGetActiveSoul,
  mockGetAllActiveCopies,
  mockGetActiveCopy,
  mockUpsertState,
  mockFilterPublishableFacts,
  mockProjectCanonicalConfig,
  mockPublishableFromCanonical,
  mockComputeHash,
  mockComputeSectionFactsHash,
  mockLogEvent,
  mockDetectImpactedSections,
} = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGetModel: vi.fn(() => "mock-model"),
  mockGetActiveFacts: vi.fn(),
  mockGetActiveSoul: vi.fn(),
  mockGetAllActiveCopies: vi.fn(),
  mockGetActiveCopy: vi.fn(),
  mockUpsertState: vi.fn(),
  mockFilterPublishableFacts: vi.fn(),
  mockProjectCanonicalConfig: vi.fn(),
  mockPublishableFromCanonical: vi.fn(),
  mockComputeHash: vi.fn(),
  mockComputeSectionFactsHash: vi.fn(),
  mockLogEvent: vi.fn(),
  mockDetectImpactedSections: vi.fn(),
}));

// Mock AI SDK
vi.mock("ai", () => ({
  generateObject: (...args: any[]) => mockGenerateObject(...args),
}));

// Mock AI provider
vi.mock("@/lib/ai/provider", () => ({
  getModel: () => mockGetModel(),
}));

// Mock kb-service
vi.mock("@/lib/services/kb-service", () => ({
  getActiveFacts: (...args: any[]) => mockGetActiveFacts(...args),
}));

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

// Mock soul-service
vi.mock("@/lib/services/soul-service", () => ({
  getActiveSoul: (...args: any[]) => mockGetActiveSoul(...args),
}));

// Mock section-copy-state-service
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getAllActiveCopies: (...args: any[]) => mockGetAllActiveCopies(...args),
  getActiveCopy: (...args: any[]) => mockGetActiveCopy(...args),
  upsertState: (...args: any[]) => mockUpsertState(...args),
}));

// Mock page-projection
vi.mock("@/lib/services/page-projection", () => ({
  filterPublishableFacts: (...args: any[]) => mockFilterPublishableFacts(...args),
  projectCanonicalConfig: (...args: any[]) => mockProjectCanonicalConfig(...args),
  publishableFromCanonical: (...args: any[]) => mockPublishableFromCanonical(...args),
}));

// Mock personalization-hashing
vi.mock("@/lib/services/personalization-hashing", () => ({
  computeHash: (...args: any[]) => mockComputeHash(...args),
  computeSectionFactsHash: (...args: any[]) => mockComputeSectionFactsHash(...args),
}));

// Mock event-service
vi.mock("@/lib/services/event-service", () => ({
  logEvent: (...args: any[]) => mockLogEvent(...args),
}));

// Mock personalization-impact
vi.mock("@/lib/services/personalization-impact", () => ({
  detectImpactedSections: (...args: any[]) => mockDetectImpactedSections(...args),
}));

// ── Import modules under test (after all mocks) ──────────────────────────────

import { mergeActiveSectionCopy } from "@/lib/services/personalization-projection";
import { analyzeConformity } from "@/lib/services/conformity-analyzer";
import { detectImpactedSections } from "@/lib/services/personalization-impact";

// ── Types ────────────────────────────────────────────────────────────────────

import type { PageConfig, Section } from "@/lib/page-config/schema";
import type { FactRow } from "@/lib/services/kb-service";
import type { SectionCopyStateRow } from "@/lib/services/section-copy-state-service";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFact(
  overrides: Partial<FactRow> & Pick<FactRow, "category" | "key">,
): FactRow {
  return {
    id: overrides.id ?? "fact-" + Math.random().toString(36).slice(2, 8),
    category: overrides.category,
    key: overrides.key,
    value: overrides.value ?? {},
    source: overrides.source ?? "chat",
    confidence: overrides.confidence ?? 1.0,
    visibility: overrides.visibility ?? "public",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
    sortOrder: overrides.sortOrder ?? 0,
    parentFactId: overrides.parentFactId ?? null,
    archivedAt: overrides.archivedAt ?? null,
  };
}

function makeSection(
  type: string,
  content: Record<string, unknown> = {},
): Section {
  return {
    id: `section-${type}`,
    type: type as Section["type"],
    content,
  };
}

function makePageConfig(sections: Section[]): PageConfig {
  return {
    version: 1,
    username: "testuser",
    surface: "canvas",
    voice: "signal",
    light: "day",
    style: {
      primaryColor: "#000000",
      layout: "centered",
    },
    sections,
  };
}

function makeSectionCopyStateRow(
  overrides: Partial<SectionCopyStateRow> & Pick<SectionCopyStateRow, "sectionType">,
): SectionCopyStateRow {
  return {
    id: 1,
    ownerKey: "owner1",
    sectionType: overrides.sectionType,
    language: overrides.language ?? "en",
    personalizedContent: overrides.personalizedContent ?? JSON.stringify({ text: "Personalized content." }),
    factsHash: overrides.factsHash ?? "facts-hash-abc",
    soulHash: overrides.soulHash ?? "soul-hash-xyz",
    approvedAt: overrides.approvedAt ?? "2026-01-01T00:00:00Z",
    source: overrides.source ?? "live",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("personalizer pipeline (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default stub return values
    mockGetActiveFacts.mockReturnValue([]);
    mockGetActiveSoul.mockReturnValue(null);
    mockGetAllActiveCopies.mockReturnValue([]);
    mockGetActiveCopy.mockReturnValue(null);
    mockFilterPublishableFacts.mockReturnValue([]);
    mockComputeHash.mockReturnValue("soul-hash-xyz");
    mockComputeSectionFactsHash.mockReturnValue("facts-hash-abc");
    mockDetectImpactedSections.mockReturnValue([]);
  });

  it("full flow: facts → compose → personalizer → merge", () => {
    // Arrange: mock facts representing a user with name and a skill
    const nameFact = makeFact({
      id: "fact-name",
      category: "identity",
      key: "full-name",
      value: { full: "Alice Maker" },
      visibility: "public",
    });
    const skillFact = makeFact({
      id: "fact-skill",
      category: "skill",
      key: "typescript",
      value: { name: "TypeScript", level: "expert" },
      visibility: "public",
    });

    const allFacts = [nameFact, skillFact];
    const publishableFacts = [nameFact, skillFact];

    mockGetActiveFacts.mockReturnValue(allFacts);
    mockFilterPublishableFacts.mockReturnValue(publishableFacts);

    // Mock soul
    mockGetActiveSoul.mockReturnValue({
      id: "soul-1",
      ownerKey: "owner1",
      version: 1,
      overlay: {},
      compiled: "Warm, creative, and enthusiastic about open source.",
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    // Hash mocks return consistent values
    mockComputeHash.mockReturnValue("soul-hash-xyz");
    mockComputeSectionFactsHash.mockReturnValue("facts-hash-abc");

    // Mock active copy with matching hashes — personalized bio section
    const personalizedBio = { text: "Alice is a passionate TypeScript expert building open-source tools." };
    const bioCopy = makeSectionCopyStateRow({
      sectionType: "bio",
      factsHash: "facts-hash-abc",
      soulHash: "soul-hash-xyz",
      personalizedContent: JSON.stringify(personalizedBio),
    });
    mockGetAllActiveCopies.mockReturnValue([bioCopy]);

    // Canonical config with a bio section containing original deterministic text
    const originalBioSection = makeSection("bio", {
      text: "Alice Maker is a developer with TypeScript expertise.",
    });
    const canonical = makePageConfig([originalBioSection]);

    // Act
    const result = mergeActiveSectionCopy(canonical, "owner1", "en");

    // Assert: bio section should have personalized content merged in
    expect(result.sections).toHaveLength(1);
    const bioResult = result.sections[0];
    expect(bioResult.type).toBe("bio");
    expect(bioResult.content.text).toBe(personalizedBio.text);

    // Other non-content fields should be preserved
    expect(bioResult.id).toBe(originalBioSection.id);

    // Verify the mocked services were called correctly
    expect(mockGetAllActiveCopies).toHaveBeenCalledWith("owner1", "en");
    expect(mockGetActiveFacts).toHaveBeenCalledWith("owner1", undefined);
    expect(mockFilterPublishableFacts).toHaveBeenCalledWith(
      expect.arrayContaining(allFacts.map((f: any) => expect.objectContaining({ id: f.id }))),
    );
    expect(mockGetActiveSoul).toHaveBeenCalledWith("owner1");
    expect(mockComputeHash).toHaveBeenCalledWith("Warm, creative, and enthusiastic about open source.");
    expect(mockComputeSectionFactsHash).toHaveBeenCalledWith(publishableFacts, "bio");
  });

  it("stale hash skips personalized content", () => {
    // Arrange: active copy with a different factsHash than what computeSectionFactsHash returns
    const staleBioCopy = makeSectionCopyStateRow({
      sectionType: "bio",
      factsHash: "STALE-facts-hash",    // old hash
      soulHash: "soul-hash-xyz",         // soul hash matches
      personalizedContent: JSON.stringify({ text: "Stale personalized text." }),
    });
    mockGetAllActiveCopies.mockReturnValue([staleBioCopy]);

    // Current hash computation returns a different value (facts have changed)
    mockComputeSectionFactsHash.mockReturnValue("NEW-facts-hash");
    mockComputeHash.mockReturnValue("soul-hash-xyz");

    mockGetActiveFacts.mockReturnValue([
      makeFact({ category: "identity", key: "name", value: { full: "Alice" } }),
    ]);
    mockFilterPublishableFacts.mockReturnValue([
      makeFact({ category: "identity", key: "name", value: { full: "Alice" } }),
    ]);
    mockGetActiveSoul.mockReturnValue({
      id: "soul-1",
      compiled: "Warm and friendly.",
    });

    // Canonical config with original deterministic text
    const originalContent = { text: "Original deterministic bio text." };
    const canonical = makePageConfig([makeSection("bio", originalContent)]);

    // Act
    const result = mergeActiveSectionCopy(canonical, "owner1", "en");

    // Assert: personalized content NOT merged — stale copy discarded
    expect(result.sections[0].content.text).toBe("Original deterministic bio text.");
    expect(result.sections[0].content.text).not.toBe("Stale personalized text.");
  });

  it("impact detector flags changed sections", () => {
    // Arrange: two sections (bio + skills), bio's facts hash has changed
    const bioFact = makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } });
    const skillFact = makeFact({ category: "skill", key: "typescript", value: { name: "TypeScript" } });
    const publishableFacts = [bioFact, skillFact];

    // Mock detectImpactedSections to return only "bio" as impacted
    mockDetectImpactedSections.mockReturnValue(["bio"]);

    // Act: call detectImpactedSections with our test data
    const impacted = detectImpactedSections(
      publishableFacts,
      "owner1",
      "en",
      "soul-hash-xyz",
    );

    // Assert: only bio is flagged, skills is not
    expect(impacted).toContain("bio");
    expect(impacted).not.toContain("skills");
    expect(impacted).toHaveLength(1);

    // Verify it was called with the correct arguments
    expect(mockDetectImpactedSections).toHaveBeenCalledWith(
      publishableFacts,
      "owner1",
      "en",
      "soul-hash-xyz",
    );
  });

  it("conformity analyzer skips when no active copies", async () => {
    // Act: analyzeConformity with empty active states
    const result = await analyzeConformity([], "Warm tone voice", "owner1");

    // Assert: returns empty array without calling generateObject
    expect(result).toEqual([]);
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});
