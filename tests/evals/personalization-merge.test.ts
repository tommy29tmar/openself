import { describe, it, expect } from "vitest";
import { mergePersonalized } from "@/lib/services/personalization-merge";

describe("mergePersonalized", () => {
  it("overwrites personalizable text field (bio text)", () => {
    const original = {
      text: "Original bio text.",
      items: [{ name: "TypeScript" }],
    };
    const personalized = { text: "A creative soul building open-source tools." };
    const result = mergePersonalized(original, personalized, "bio");

    expect(result.text).toBe("A creative soul building open-source tools.");
    // Non-personalizable field preserved
    expect(result.items).toEqual([{ name: "TypeScript" }]);
  });

  it("handles hero tagline", () => {
    const original = { tagline: "Default tagline", name: "Alice" };
    const personalized = { tagline: "Building the future, one commit at a time" };
    const result = mergePersonalized(original, personalized, "hero");

    expect(result.tagline).toBe("Building the future, one commit at a time");
    expect(result.name).toBe("Alice");
  });

  it("ignores non-personalizable fields in personalized input", () => {
    const original = {
      text: "Old",
      items: [{ name: "JavaScript" }],
    };
    const personalized = {
      text: "New text",
      items: [{ name: "HACKED" }],
    };
    const result = mergePersonalized(original, personalized, "bio");

    expect(result.text).toBe("New text");
    // items is NOT in PERSONALIZABLE_FIELDS for bio, so must be preserved
    expect(result.items).toEqual([{ name: "JavaScript" }]);
  });

  it("returns original for non-personalizable section type", () => {
    const original = { links: [{ url: "https://example.com" }] };
    const personalized = { links: [] };
    const result = mergePersonalized(original, personalized, "footer");

    expect(result).toEqual(original);
  });

  it("returns original for unknown section type", () => {
    const original = { foo: "bar" };
    const personalized = { foo: "overwritten" };
    const result = mergePersonalized(original, personalized, "nonexistent");

    expect(result).toEqual(original);
  });

  it("returns original when personalized is empty", () => {
    const original = { text: "Stays the same." };
    const result = mergePersonalized(original, {}, "bio");

    expect(result.text).toBe("Stays the same.");
  });

  it("ignores non-string values in personalized fields", () => {
    const original = { text: "Original" };
    const personalized = { text: 42 };
    const result = mergePersonalized(original, personalized, "bio");

    expect(result.text).toBe("Original");
  });

  it("does not mutate the original object", () => {
    const original = { text: "Immutable" };
    const personalized = { text: "Changed" };
    mergePersonalized(original, personalized, "bio");

    expect(original.text).toBe("Immutable");
  });

  it("works for all personalizable section types", () => {
    const fieldMap: Record<string, string> = {
      hero: "tagline",
      bio: "text",
    };
    const types = [
      "hero", "bio", "skills", "projects", "interests",
      "achievements", "experience", "education", "reading", "music", "activities",
    ];
    for (const type of types) {
      const field = fieldMap[type] ?? "title";
      const original = { [field]: "old" };
      const personalized = { [field]: "new" };
      const result = mergePersonalized(original, personalized, type);
      expect(result[field]).toBe("new");
    }
  });
});
