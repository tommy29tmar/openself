import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions so they're available in vi.mock factories
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

// Mock the AI provider before importing translate module
vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
  getModelId: vi.fn(() => "mock-model-id"),
  getModelForTier: vi.fn(() => "mock-model"),
  getModelIdForTier: vi.fn(() => "mock-model-id"),
}));

// Mock generateObject from the ai package
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  tool: vi.fn((config) => config),
}));

// Mock event service
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

// Mock the DB module for cache operations
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

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
  sql: {},
}));

import { translatePageContent } from "@/lib/ai/translate";
import { generateObject } from "ai";
import { logEvent } from "@/lib/services/event-service";
import type { PageConfig } from "@/lib/page-config/schema";

const mockGenerateObject = vi.mocked(generateObject);
const mockLogEvent = vi.mocked(logEvent);

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
          text: "Marco Rossi è ingegnere di software presso Google. Appassionato/a di Tennis, Pianoforte.",
        },
      },
      {
        id: "skills-1",
        type: "skills",
        variant: "chips",
        content: {
          groups: [{ label: "Competenze", skills: ["TypeScript", "Economia"] }],
        },
      },
      {
        id: "interests-1",
        type: "interests",
        variant: "chips",
        content: {
          title: "Interessi",
          items: [
            { name: "Tennis" },
            { name: "Pianoforte" },
          ],
        },
      },
      {
        id: "social-1",
        type: "social",
        variant: "icons",
        content: {
          links: [{ platform: "GitHub", url: "https://github.com/marco" }],
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

describe("translatePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cache hit
    mockGet.mockReturnValue(undefined);
  });

  it("skips translation when source === target", async () => {
    const config = makeConfig();
    const result = await translatePageContent(config, "it", "it");

    expect(result).toBe(config); // Same reference — no copy
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("skips translation when sourceLanguage is null but targetLanguage given", async () => {
    // When sourceLanguage is null/undefined, translation SHOULD proceed
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome to Marco Rossi's page" },
      },
    ];
    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", null);

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("translates section content and merges back", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome to Marco Rossi's page" },
      },
      {
        sectionId: "bio-1",
        type: "bio",
        content: { text: "Marco Rossi is a software engineer at Google. Passionate about Tennis, Piano." },
      },
      {
        sectionId: "skills-1",
        type: "skills",
        content: { groups: [{ label: "Skills", skills: ["TypeScript", "Economics"] }] },
      },
      {
        sectionId: "interests-1",
        type: "interests",
        content: { title: "Interests", items: [{ name: "Tennis" }, { name: "Piano" }] },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    // Translated sections should have new content
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome to Marco Rossi's page");

    const bio = result.sections.find((s) => s.id === "bio-1")!;
    expect((bio.content as any).text).toContain("software engineer");

    const skills = result.sections.find((s) => s.id === "skills-1")!;
    expect((skills.content as any).groups[0].label).toBe("Skills");
    expect((skills.content as any).groups[0].skills).toContain("Economics");

    const interests = result.sections.find((s) => s.id === "interests-1")!;
    expect((interests.content as any).items[1].name).toBe("Piano");

    // Social and footer should be unchanged (not sent to LLM)
    const social = result.sections.find((s) => s.id === "social-1")!;
    expect((social.content as any).links[0].url).toBe("https://github.com/marco");

    const footer = result.sections.find((s) => s.id === "footer-1")!;
    expect(footer.content).toEqual({});
  });

  it("does not send social and footer sections to the LLM", async () => {
    mockGenerateObject.mockResolvedValue({ object: [] } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("social-1");
    expect(prompt).not.toContain("footer-1");
    expect(prompt).toContain("hero-1");
    expect(prompt).toContain("bio-1");
  });

  it("handles structured output directly without text parsing", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco", tagline: "Welcome to Marco's page" },
      },
    ];

    mockGenerateObject.mockResolvedValue({
      object: translatedPayload,
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome to Marco's page");
  });

  it("returns original config on LLM error (graceful fallback)", async () => {
    mockGenerateObject.mockRejectedValue(new Error("API rate limit"));

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    // Should return original config unchanged
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Benvenuto nella pagina di Marco Rossi");
  });

  it("returns original config when generateObject throws validation error", async () => {
    mockGenerateObject.mockRejectedValue(
      new Error("Failed to parse structured output"),
    );

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    const bio = result.sections.find((s) => s.id === "bio-1")!;
    expect((bio.content as any).text).toContain("ingegnere di software");
  });

  it("preserves theme and style through translation", async () => {
    mockGenerateObject.mockResolvedValue({ object: [] } as any);

    const config = makeConfig({ theme: "warm", style: { colorScheme: "dark", primaryColor: "#ff0000", fontFamily: "serif", layout: "centered" } });
    const result = await translatePageContent(config, "en", "it");

    expect(result.theme).toBe("warm");
    expect(result.style.colorScheme).toBe("dark");
    expect(result.style.fontFamily).toBe("serif");
  });

  it("includes target and source language names in the prompt", async () => {
    mockGenerateObject.mockResolvedValue({ object: [] } as any);

    const config = makeConfig();
    await translatePageContent(config, "de", "it");

    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("German");
    expect(prompt).toContain("Italian");
  });

  it("instructs to keep tech acronyms in English", async () => {
    mockGenerateObject.mockResolvedValue({ object: [] } as any);

    const config = makeConfig();
    await translatePageContent(config, "de", "it");

    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("AI, API, IT");
  });
});

describe("translatePageContent — cache behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(undefined);
  });

  it("returns cached sections without LLM call on cache hit", async () => {
    const cachedSections = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Willkommen auf Marco Rossis Seite" },
      },
      {
        sectionId: "bio-1",
        type: "bio",
        content: { text: "Marco Rossi ist Softwareingenieur bei Google." },
      },
    ];

    mockGet.mockReturnValue({
      contentHash: "somehash",
      targetLanguage: "de",
      translatedSections: cachedSections,
      model: "mock-model-id",
    });

    const config = makeConfig();
    const result = await translatePageContent(config, "de", "it");

    // LLM should NOT have been called
    expect(mockGenerateObject).not.toHaveBeenCalled();

    // Cached content should be merged
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Willkommen auf Marco Rossis Seite");

    const bio = result.sections.find((s) => s.id === "bio-1")!;
    expect((bio.content as any).text).toContain("Softwareingenieur");

    // Non-translated sections preserved
    const social = result.sections.find((s) => s.id === "social-1")!;
    expect((social.content as any).links[0].url).toBe("https://github.com/marco");
  });

  it("logs cache_hit event on cache hit", async () => {
    mockGet.mockReturnValue({
      contentHash: "somehash",
      targetLanguage: "de",
      translatedSections: [],
      model: "mock-model-id",
    });

    const config = makeConfig();
    await translatePageContent(config, "de", "it");

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "translation_cache_hit" }),
    );
  });

  it("calls LLM and stores result on cache miss", async () => {
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

    // LLM should have been called
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    // Cache insert should have been called
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        targetLanguage: "en",
        model: "mock-model-id",
      }),
    );
  });

  it("logs cache_miss event on cache miss", async () => {
    mockGenerateObject.mockResolvedValue({ object: [] } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "translation_cache_miss" }),
    );
  });

  it("same content + same language returns cache hit", async () => {
    const cachedSections = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome" },
      },
    ];

    mockGet.mockReturnValue({
      contentHash: "hash1",
      targetLanguage: "en",
      translatedSections: cachedSections,
      model: "mock-model-id",
    });

    const config = makeConfig();

    // Call twice with same config + language
    const result1 = await translatePageContent(config, "en", "it");
    const result2 = await translatePageContent(config, "en", "it");

    // LLM should never have been called
    expect(mockGenerateObject).not.toHaveBeenCalled();

    // Both results should have translated content
    const hero1 = result1.sections.find((s) => s.id === "hero-1")!;
    const hero2 = result2.sections.find((s) => s.id === "hero-1")!;
    expect((hero1.content as any).tagline).toBe("Welcome");
    expect((hero2.content as any).tagline).toBe("Welcome");
  });

  it("different content triggers new LLM call (cache miss)", async () => {
    // First call: cache miss, LLM called
    mockGenerateObject.mockResolvedValue({
      object: [{
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco Rossi", tagline: "Welcome" },
      }],
    } as any);

    const config1 = makeConfig();
    await translatePageContent(config1, "en", "it");
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    // Second call with different content: still cache miss
    const config2 = makeConfig({
      sections: [
        {
          id: "hero-1",
          type: "hero",
          variant: "large",
          content: {
            name: "Marco Rossi",
            tagline: "Ciao! Sono Marco, un nuovo tagline",
          },
        },
      ],
    });

    await translatePageContent(config2, "en", "it");
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("does not fail translation when cache write errors", async () => {
    mockRun.mockImplementation(() => { throw new Error("DB write error"); });

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
    const result = await translatePageContent(config, "en", "it");

    // Translation should still succeed despite cache write failure
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome");
  });

  it("does not fail translation when cache read errors", async () => {
    mockFrom.mockImplementation(() => { throw new Error("DB read error"); });

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
    const result = await translatePageContent(config, "en", "it");

    // LLM should have been called as fallback
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome");

    // Restore normal behavior for other tests
    mockFrom.mockReturnValue({ where: mockDbWhere });
  });
});
