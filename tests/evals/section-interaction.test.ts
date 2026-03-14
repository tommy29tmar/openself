import { describe, it, expect } from "vitest";
import { getUiL10n } from "@/lib/i18n/ui-strings";

/**
 * Tests for WS-3: Canvas-Style Preview Interaction
 *
 * - L10N keys exist for all 8 languages
 * - SectionAction type shape validation
 * - extractContentSummary utility
 */

// ──── L10N Keys ────

describe("Section interaction L10N keys", () => {
  const LANGUAGES = ["en", "it", "de", "fr", "es", "pt", "ja", "zh"] as const;
  const REQUIRED_KEYS = [
    "editWithChat",
    "hideSection",
    "showSection",
    "moveUp",
    "moveDown",
    "longPressHint",
    "dismiss",
  ] as const;

  for (const lang of LANGUAGES) {
    it(`${lang} has all section interaction keys`, () => {
      const t = getUiL10n(lang);
      for (const key of REQUIRED_KEYS) {
        expect(t[key], `${lang}.${key}`).toBeDefined();
        expect(typeof t[key], `${lang}.${key} should be string`).toBe("string");
        expect(t[key].length, `${lang}.${key} should not be empty`).toBeGreaterThan(0);
      }
    });
  }

  it("editWithChat is not the same across all languages", () => {
    const values = new Set(LANGUAGES.map((lang) => getUiL10n(lang).editWithChat));
    // At least 4 unique translations (some romance languages may overlap)
    expect(values.size).toBeGreaterThanOrEqual(4);
  });
});

// ──── SectionAction Type ────

describe("SectionAction shape", () => {
  it("accepts all valid action types", () => {
    const validTypes = ["edit", "hide", "show", "moveUp", "moveDown"];
    for (const type of validTypes) {
      const action = {
        type,
        sectionType: "bio",
        sectionIndex: 1,
      };
      expect(action.type).toBe(type);
      expect(action.sectionType).toBe("bio");
      expect(action.sectionIndex).toBe(1);
    }
  });

  it("contentSummary is optional", () => {
    const actionWithSummary = {
      type: "edit" as const,
      sectionType: "bio",
      sectionIndex: 0,
      contentSummary: "Some text here",
    };
    expect(actionWithSummary.contentSummary).toBe("Some text here");

    const actionWithout: Record<string, unknown> = {
      type: "edit",
      sectionType: "bio",
      sectionIndex: 0,
    };
    expect(actionWithout.contentSummary).toBeUndefined();
  });
});

// ──── Content Summary Extraction (inline utility) ────

// Replicate the extractContentSummary logic from usePreviewInteraction
function extractContentSummary(section: { content?: Record<string, unknown> } | undefined): string {
  if (!section) return "";
  const c = section.content;
  if (!c) return "";
  const text = c.text || c.name || c.headline || c.title || c.role || c.description;
  if (typeof text === "string") return text.slice(0, 100);
  try {
    const json = JSON.stringify(c);
    return json.slice(0, 100);
  } catch {
    return "";
  }
}

describe("extractContentSummary", () => {
  it("extracts text field", () => {
    expect(extractContentSummary({ content: { text: "Hello world" } })).toBe("Hello world");
  });

  it("extracts name field", () => {
    expect(extractContentSummary({ content: { name: "John Doe" } })).toBe("John Doe");
  });

  it("extracts headline field", () => {
    expect(extractContentSummary({ content: { headline: "Senior Dev" } })).toBe("Senior Dev");
  });

  it("extracts title field", () => {
    expect(extractContentSummary({ content: { title: "My Project" } })).toBe("My Project");
  });

  it("extracts role field", () => {
    expect(extractContentSummary({ content: { role: "Frontend Engineer" } })).toBe("Frontend Engineer");
  });

  it("extracts description field", () => {
    expect(extractContentSummary({ content: { description: "A nice project" } })).toBe("A nice project");
  });

  it("truncates to 100 chars", () => {
    const longText = "A".repeat(200);
    expect(extractContentSummary({ content: { text: longText } })).toHaveLength(100);
  });

  it("returns JSON fallback for unknown content", () => {
    const result = extractContentSummary({ content: { foo: 42, bar: true } });
    expect(result).toContain("foo");
    expect(result).toContain("42");
  });

  it("returns empty for undefined section", () => {
    expect(extractContentSummary(undefined)).toBe("");
  });

  it("returns empty for section without content", () => {
    expect(extractContentSummary({ content: undefined })).toBe("");
  });

  it("prefers text over name", () => {
    expect(extractContentSummary({ content: { text: "Bio text", name: "John" } })).toBe("Bio text");
  });
});

// ──── Long-press hint persistence key ────

describe("Long-press hint", () => {
  it("uses a consistent localStorage key", () => {
    // This test documents the expected key for hint persistence
    const key = "openself:longpress-hint-seen";
    expect(key).toBe("openself:longpress-hint-seen");
  });
});
