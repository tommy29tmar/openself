import { describe, it, expect } from "vitest";
import {
  PERSONALIZABLE_FIELDS,
  MAX_WORDS,
  isPersonalizableSection,
  getPersonalizerSchema,
} from "@/lib/services/personalizer-schemas";

describe("PERSONALIZABLE_FIELDS", () => {
  it("includes bio with description field", () => {
    expect(PERSONALIZABLE_FIELDS.bio).toContain("description");
  });

  it("includes hero with tagline field", () => {
    expect(PERSONALIZABLE_FIELDS.hero).toContain("tagline");
  });

  it("does not include footer", () => {
    expect(PERSONALIZABLE_FIELDS).not.toHaveProperty("footer");
  });

  it("does not include social", () => {
    expect(PERSONALIZABLE_FIELDS).not.toHaveProperty("social");
  });

  it("does not include contact", () => {
    expect(PERSONALIZABLE_FIELDS).not.toHaveProperty("contact");
  });
});

describe("MAX_WORDS", () => {
  it("has an entry for every personalizable section type", () => {
    for (const type of Object.keys(PERSONALIZABLE_FIELDS)) {
      expect(MAX_WORDS).toHaveProperty(type);
      expect(typeof MAX_WORDS[type]).toBe("number");
    }
  });

  it("hero budget is small (tagline only)", () => {
    expect(MAX_WORDS.hero).toBeLessThanOrEqual(20);
  });

  it("bio budget is the largest", () => {
    expect(MAX_WORDS.bio).toBeGreaterThanOrEqual(100);
  });
});

describe("isPersonalizableSection", () => {
  it("returns true for bio", () => {
    expect(isPersonalizableSection("bio")).toBe(true);
  });

  it("returns true for hero", () => {
    expect(isPersonalizableSection("hero")).toBe(true);
  });

  it("returns false for footer", () => {
    expect(isPersonalizableSection("footer")).toBe(false);
  });

  it("returns false for social", () => {
    expect(isPersonalizableSection("social")).toBe(false);
  });

  it("returns false for unknown type", () => {
    expect(isPersonalizableSection("nonexistent")).toBe(false);
  });
});

describe("getPersonalizerSchema", () => {
  it("returns a Zod schema for bio", () => {
    const schema = getPersonalizerSchema("bio");
    expect(schema).not.toBeNull();
    const result = schema!.safeParse({ description: "A creative developer." });
    expect(result.success).toBe(true);
  });

  it("returns a Zod schema for hero with tagline", () => {
    const schema = getPersonalizerSchema("hero");
    expect(schema).not.toBeNull();
    const result = schema!.safeParse({ tagline: "Building the future" });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields (strict mode)", () => {
    const schema = getPersonalizerSchema("bio");
    expect(schema).not.toBeNull();
    const result = schema!.safeParse({ description: "ok", extra: "nope" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const schema = getPersonalizerSchema("bio");
    expect(schema).not.toBeNull();
    const result = schema!.safeParse({});
    expect(result.success).toBe(false);
  });

  it("returns null for non-personalizable section type", () => {
    expect(getPersonalizerSchema("footer")).toBeNull();
  });

  it("returns null for unknown section type", () => {
    expect(getPersonalizerSchema("unknown")).toBeNull();
  });
});
