import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist all mock functions
const {
  mockGenerateObject,
  mockGetModel,
  mockGetModelForTier,
  mockGetCachedCopy,
  mockPutCachedCopy,
  mockGetActiveCopy,
  mockUpsertState,
  mockLogEvent,
} = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGetModel: vi.fn(() => "mock-model"),
  mockGetModelForTier: vi.fn(() => "mock-model"),
  mockGetCachedCopy: vi.fn(),
  mockPutCachedCopy: vi.fn(),
  mockGetActiveCopy: vi.fn(),
  mockUpsertState: vi.fn(),
  mockLogEvent: vi.fn(),
}));

// Mock the AI SDK
vi.mock("ai", () => ({
  generateObject: mockGenerateObject,
}));

// Mock the AI provider
vi.mock("@/lib/ai/provider", () => ({
  getModel: mockGetModel,
  getModelForTier: mockGetModelForTier,
  getThinkingProviderOptions: vi.fn(() => ({})),
}));

// Mock cache service
vi.mock("@/lib/services/section-cache-service", () => ({
  getCachedCopy: mockGetCachedCopy,
  putCachedCopy: mockPutCachedCopy,
}));

// Mock state service
vi.mock("@/lib/services/section-copy-state-service", () => ({
  getActiveCopy: mockGetActiveCopy,
  upsertState: mockUpsertState,
}));

// Mock event service
vi.mock("@/lib/services/event-service", () => ({
  logEvent: mockLogEvent,
}));

import { personalizeSection } from "@/lib/services/section-personalizer";
import type { PersonalizeSectionInput } from "@/lib/services/section-personalizer";
import type { FactRow } from "@/lib/services/kb-service";
import type { Section } from "@/lib/page-config/schema";

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

function makeSection(type: string, content: Record<string, unknown> = {}): Section {
  return {
    id: `section-${type}`,
    type: type as Section["type"],
    content,
  };
}

function makeInput(overrides: Partial<PersonalizeSectionInput> = {}): PersonalizeSectionInput {
  return {
    section: overrides.section ?? makeSection("bio", { description: "Original bio text." }),
    ownerKey: overrides.ownerKey ?? "test-owner",
    language: overrides.language ?? "en",
    publishableFacts: overrides.publishableFacts ?? [
      makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
    ],
    soulCompiled: overrides.soulCompiled ?? "Warm and friendly voice with a touch of humor.",
    username: overrides.username ?? "alice",
  };
}

beforeEach(() => {
  mockGenerateObject.mockReset();
  mockGetModel.mockReset().mockReturnValue("mock-model");
  mockGetModelForTier.mockReset().mockReturnValue("mock-model");
  mockGetCachedCopy.mockReset();
  mockPutCachedCopy.mockReset();
  mockGetActiveCopy.mockReset();
  mockUpsertState.mockReset();
  mockLogEvent.mockReset();
});

describe("personalizeSection", () => {
  it("returns cached copy on cache hit (no LLM call)", async () => {
    const cachedContent = JSON.stringify({ description: "Cached personalized bio." });
    mockGetCachedCopy.mockReturnValue(cachedContent);

    const result = await personalizeSection(makeInput());

    expect(result).toEqual({ description: "Cached personalized bio." });
    // LLM should NOT be called
    expect(mockGenerateObject).not.toHaveBeenCalled();
    // State should still be updated
    expect(mockUpsertState).toHaveBeenCalledTimes(1);
    expect(mockUpsertState).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionType: "bio",
        source: "live",
      }),
    );
  });

  it("calls LLM on cache miss, writes to cache + state", async () => {
    mockGetCachedCopy.mockReturnValue(null);
    const llmResult = { description: "A creative developer building the future." };
    mockGenerateObject.mockResolvedValue({ object: llmResult });

    const result = await personalizeSection(makeInput());

    expect(result).toEqual(llmResult);
    // LLM should be called
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        prompt: expect.stringContaining("bio"),
      }),
    );
    // Cache should be written
    expect(mockPutCachedCopy).toHaveBeenCalledTimes(1);
    expect(mockPutCachedCopy).toHaveBeenCalledWith(
      "test-owner",
      "bio",
      expect.any(String), // factsHash
      expect.any(String), // soulHash
      "en",
      JSON.stringify(llmResult),
    );
    // State should be written
    expect(mockUpsertState).toHaveBeenCalledTimes(1);
    expect(mockUpsertState).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: "test-owner",
        sectionType: "bio",
        language: "en",
        source: "live",
      }),
    );
    // Event should be logged
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "personalize_section",
        actor: "system",
      }),
    );
  });

  it("returns null for non-personalizable section", async () => {
    const input = makeInput({
      section: makeSection("footer", { links: [] }),
    });

    const result = await personalizeSection(input);

    expect(result).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockGetCachedCopy).not.toHaveBeenCalled();
  });

  it("returns null when no soul compiled text", async () => {
    const input = makeInput({ soulCompiled: "" });

    const result = await personalizeSection(input);

    expect(result).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("skips personalization when section has agent-curated content", async () => {
    mockGetActiveCopy.mockReturnValue({
      id: 1,
      ownerKey: "test-owner",
      sectionType: "bio",
      language: "en",
      personalizedContent: JSON.stringify({ description: "Agent-curated bio." }),
      factsHash: "abc",
      soulHash: "def",
      approvedAt: null,
      source: "agent",
    });

    const result = await personalizeSection(makeInput());

    expect(result).toBeNull();
    // Neither cache nor LLM should be consulted
    expect(mockGetCachedCopy).not.toHaveBeenCalled();
    expect(mockGenerateObject).not.toHaveBeenCalled();
    // getActiveCopy should have been called with correct args
    expect(mockGetActiveCopy).toHaveBeenCalledWith("test-owner", "bio", "en");
  });

  it("proceeds normally when existing copy has source=live (not agent)", async () => {
    mockGetActiveCopy.mockReturnValue({
      id: 1,
      ownerKey: "test-owner",
      sectionType: "bio",
      language: "en",
      personalizedContent: JSON.stringify({ description: "Live bio." }),
      factsHash: "abc",
      soulHash: "def",
      approvedAt: null,
      source: "live",
    });
    mockGetCachedCopy.mockReturnValue(null);
    mockGenerateObject.mockResolvedValue({
      object: { description: "Fresh LLM bio." },
    });

    const result = await personalizeSection(makeInput());

    expect(result).toEqual({ description: "Fresh LLM bio." });
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("returns null when no relevant facts", async () => {
    mockGetCachedCopy.mockReturnValue(null);

    // skills section needs "skill" category facts, but we provide "identity"
    const input = makeInput({
      section: makeSection("skills", { description: "Skills here." }),
      publishableFacts: [
        makeFact({ category: "identity", key: "full-name" }),
      ],
    });

    const result = await personalizeSection(input);

    expect(result).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns null and logs error when LLM call fails", async () => {
    mockGetCachedCopy.mockReturnValue(null);
    mockGenerateObject.mockRejectedValue(new Error("LLM timeout"));

    const result = await personalizeSection(makeInput());

    expect(result).toBeNull();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "personalize_section_error",
        payload: expect.objectContaining({
          error: expect.stringContaining("LLM timeout"),
        }),
      }),
    );
    // Cache and state should NOT be written on error
    expect(mockPutCachedCopy).not.toHaveBeenCalled();
    expect(mockUpsertState).not.toHaveBeenCalled();
  });

  it("includes relevant facts in LLM prompt", async () => {
    mockGetCachedCopy.mockReturnValue(null);
    mockGenerateObject.mockResolvedValue({
      object: { description: "Skilled developer." },
    });

    const input = makeInput({
      section: makeSection("skills", { description: "Default skills." }),
      publishableFacts: [
        makeFact({ category: "skill", key: "typescript", value: { name: "TypeScript", level: "expert" } }),
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      ],
    });

    await personalizeSection(input);

    // Should include the skill fact but not identity (since skills section maps to "skill" category)
    const prompt = mockGenerateObject.mock.calls[0][0].prompt;
    expect(prompt).toContain("skill/typescript");
    expect(prompt).toContain("TypeScript");
  });

  it("passes correct schema to generateObject", async () => {
    mockGetCachedCopy.mockReturnValue(null);
    mockGenerateObject.mockResolvedValue({
      object: { tagline: "Building the future" },
    });

    const input = makeInput({
      section: makeSection("hero", { tagline: "Default", name: "Alice" }),
      publishableFacts: [
        makeFact({ category: "identity", key: "full-name", value: { full: "Alice" } }),
      ],
    });

    await personalizeSection(input);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.schema).toBeDefined();
    // The hero schema should accept { tagline: string }
    const parseResult = callArgs.schema.safeParse({ tagline: "test" });
    expect(parseResult.success).toBe(true);
  });

  it("falls through to LLM when cached JSON is invalid", async () => {
    mockGetCachedCopy.mockReturnValue("not-valid-json{{{");
    mockGenerateObject.mockResolvedValue({
      object: { description: "Fresh copy." },
    });

    const result = await personalizeSection(makeInput());

    expect(result).toEqual({ description: "Fresh copy." });
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });
});
