import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI provider before importing translate module
vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

// Mock generateText from the ai package
vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((config) => config),
}));

// Mock event service
vi.mock("@/lib/services/event-service", () => ({
  logEvent: vi.fn(),
}));

import { translatePageContent } from "@/lib/ai/translate";
import { generateText } from "ai";
import type { PageConfig } from "@/lib/page-config/schema";

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
  });

  it("skips translation when source === target", async () => {
    const config = makeConfig();
    const result = await translatePageContent(config, "it", "it");

    expect(result).toBe(config); // Same reference — no copy
    expect(mockGenerateText).not.toHaveBeenCalled();
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
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(translatedPayload),
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", null);

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
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

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(translatedPayload),
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
    mockGenerateText.mockResolvedValue({ text: "[]" } as any);

    const config = makeConfig();
    await translatePageContent(config, "en", "it");

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("social-1");
    expect(prompt).not.toContain("footer-1");
    expect(prompt).toContain("hero-1");
    expect(prompt).toContain("bio-1");
  });

  it("handles markdown code fences in LLM response", async () => {
    const translatedPayload = [
      {
        sectionId: "hero-1",
        type: "hero",
        content: { name: "Marco", tagline: "Welcome to Marco's page" },
      },
    ];

    mockGenerateText.mockResolvedValue({
      text: "```json\n" + JSON.stringify(translatedPayload) + "\n```",
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Welcome to Marco's page");
  });

  it("returns original config on LLM error (graceful fallback)", async () => {
    mockGenerateText.mockRejectedValue(new Error("API rate limit"));

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    // Should return original config unchanged
    const hero = result.sections.find((s) => s.id === "hero-1")!;
    expect((hero.content as any).tagline).toBe("Benvenuto nella pagina di Marco Rossi");
  });

  it("returns original config on invalid JSON response", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Sorry, I cannot translate this content.",
    } as any);

    const config = makeConfig();
    const result = await translatePageContent(config, "en", "it");

    // Should return original config unchanged
    const bio = result.sections.find((s) => s.id === "bio-1")!;
    expect((bio.content as any).text).toContain("ingegnere di software");
  });

  it("preserves theme and style through translation", async () => {
    mockGenerateText.mockResolvedValue({ text: "[]" } as any);

    const config = makeConfig({ theme: "warm", style: { colorScheme: "dark", primaryColor: "#ff0000", fontFamily: "serif", layout: "centered" } });
    const result = await translatePageContent(config, "en", "it");

    expect(result.theme).toBe("warm");
    expect(result.style.colorScheme).toBe("dark");
    expect(result.style.fontFamily).toBe("serif");
  });

  it("includes target language name in the prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "[]" } as any);

    const config = makeConfig();
    await translatePageContent(config, "de", "it");

    const prompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("German");
  });
});
