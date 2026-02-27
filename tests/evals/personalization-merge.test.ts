import { describe, it, expect } from "vitest";
import { mergePersonalized } from "@/lib/services/personalization-merge";

describe("mergePersonalized", () => {
  it("overwrites personalizable text field (bio description)", () => {
    const original = {
      description: "Original bio text.",
      items: [{ name: "TypeScript" }],
    };
    const personalized = { description: "A creative soul building open-source tools." };
    const result = mergePersonalized(original, personalized, "bio");

    expect(result.description).toBe("A creative soul building open-source tools.");
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
      description: "Old",
      items: [{ name: "JavaScript" }],
    };
    const personalized = {
      description: "New description",
      items: [{ name: "HACKED" }],
    };
    const result = mergePersonalized(original, personalized, "bio");

    expect(result.description).toBe("New description");
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
    const original = { description: "Stays the same." };
    const result = mergePersonalized(original, {}, "bio");

    expect(result.description).toBe("Stays the same.");
  });

  it("ignores non-string values in personalized fields", () => {
    const original = { description: "Original" };
    const personalized = { description: 42 };
    const result = mergePersonalized(original, personalized, "bio");

    expect(result.description).toBe("Original");
  });

  it("does not mutate the original object", () => {
    const original = { description: "Immutable" };
    const personalized = { description: "Changed" };
    mergePersonalized(original, personalized, "bio");

    expect(original.description).toBe("Immutable");
  });

  it("works for all personalizable section types", () => {
    const types = [
      "hero", "bio", "skills", "projects", "interests",
      "achievements", "experience", "education", "reading", "music", "activities",
    ];
    for (const type of types) {
      const field = type === "hero" ? "tagline" : "description";
      const original = { [field]: "old" };
      const personalized = { [field]: "new" };
      const result = mergePersonalized(original, personalized, type);
      expect(result[field]).toBe("new");
    }
  });
});
