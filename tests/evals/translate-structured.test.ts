import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions for DB
const {
  mockGet,
  mockRun,
  mockOnConflictDoUpdate,
  mockValues,
  mockInsert,
  mockDbWhere,
  mockFrom,
} = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockRun = vi.fn();
  const mockOnConflictDoUpdate = vi.fn(() => ({ run: mockRun }));
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockDbWhere = vi.fn(() => ({ get: mockGet }));
  const mockFrom = vi.fn(() => ({ where: mockDbWhere }));
  return { mockGet, mockRun, mockOnConflictDoUpdate, mockValues, mockInsert, mockDbWhere, mockFrom };
});

vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelId: vi.fn(() => "mock-model-id"),
  getModelForTier: vi.fn(() => "mock-model"),
  getModelIdForTier: vi.fn(() => "mock-model-id"),
}));

// Mock generateObject (NOT generateText) from the ai package
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  tool: vi.fn((config) => config),
}));

vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    insert: mockInsert,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  translationCache: {
    contentHash: "content_hash",
    targetLanguage: "target_language",
    translatedSections: "translated_sections",
    model: "model",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
  sql: {},
}));

import { translatePageContent } from "@/lib/ai/translate";
import { generateObject, generateText } from "ai";
import type { PageConfig } from "@/lib/page-config/schema";

const mockGenerateObject = vi.mocked(generateObject);
const mockGenerateText = vi.mocked(generateText);

function makeConfig(overrides?: Partial<PageConfig>): PageConfig {
  return {
    version: 1,
    username: "draft",
    theme: "minimal",
    style: {
      colorScheme: "light",
      primaryColor: "#6366f1",
      fontFamily: "inter",
      layout: "centered",
    },
    sections: [
      {
        id: "hero-1",
        type: "hero",
        variant: "large",
        content: {
          name: "Marco Rossi",
          tagline: "Benvenuto nella pagina di Marco Rossi",
        },
      },
      {
        id: "bio-1",
        type: "bio",
        variant: "full",
        content: {
          text: "Marco Rossi è ingegnere di software.",
        },
      },
      {
        id: "footer-1",
        type: "footer",
        content: {},
      },
    ],
    ...overrides,
  };
}

describe("translatePageContent — structured output (generateObject)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(undefined); // no cache hit
  });

  it("uses generateObject instead of generateText", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome to Marco Rossi's page" },
      },
      {
        sectionId: "bio-1",
        type: "bio",
        content: { text: "Marco Rossi is a software engineer." },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
      usage: { promptTokens: 100, completionTokens: 50 },
    } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("passes a Zod schema to generateObject", async () => {
    mockGenerateObject.mockResolvedValue({
      object: [],
      usage: { promptTokens: 10, completionTokens: 5 },
    } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call).toHaveProperty("schema");
    // The schema should be a Zod schema (has _def property)
    expect(call.schema).toBeDefined();
    expect(call.schema._def).toBeDefined();
  });

  it("merges structured output back into config", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome to Marco Rossi's page" },
      },
      {
        sectionId: "bio-1",
        type: "bio",
        content: { text: "Marco Rossi is a software engineer." },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
      usage: { promptTokens: 100, completionTokens: 50 },
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome to Marco Rossi's page");

    const bio = result.sections.find((s) => s.id === "bio-1")!;
    expect((bio.content as any).text).toBe("Marco Rossi is a software engineer.");

    // Footer should be unchanged (skipped)
    const footer = result.sections.find((s) => s.id === "footer-1")!;
    expect(footer.content).toEqual({});
  });

  it("returns original config on generateObject error (graceful fallback)", async () => {
    mockGenerateObject.mockRejectedValue(new Error("API rate limit"));

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    // Should return original config unchanged
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Benvenuto nella pagina di Marco Rossi");
  });

  it("does not use stripCodeFences (function should be removed)", async () => {
    // Verify stripCodeFences is not exported — import would fail
    // We indirectly test this by confirming generateObject is used (no text parsing needed)
    mockGenerateObject.mockResolvedValue({
      object: [
        {
          sectionId: "hero-1",
          type: "hero",
          content: { name: "Marco Rossi", tagline: "Welcome" },
        },
      ],
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome");
  });

  it("caches the structured output result", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome" },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
    } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    // Cache insert should have been called with the structured output
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLanguage: "en",
        translatedSections: translatedPayload,
        model: "mock-model-id",
      }),
    );
  });
});
