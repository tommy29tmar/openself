/**
 * Cross-provider eval: Section personalization
 *
 * Scenario: Personalize a bio section given facts + soul.
 * Expected: Conforms to schema, text-only, within word limits.
 *
 * LLM usage: Direct generateObject with Zod schema (SDK-level).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getTestProviders, setProvider, SEED_FACTS, type TestProvider } from "./setup";

const providers = getTestProviders();

describe.each(providers)("personalization [%s]", (provider: TestProvider) => {
  let cleanup: () => void;

  beforeAll(() => {
    cleanup = setProvider(provider);
  });

  afterAll(() => {
    cleanup();
  });

  it("generates personalized bio text within word limits", async () => {
    const { getModel } = await import("@/lib/ai/provider");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const bioSchema = z.object({
      bio: z.string().describe("A personalized bio paragraph for the page"),
    });

    const facts = SEED_FACTS.map((f) => `[${f.category}/${f.key}]: ${JSON.stringify(f.value)}`).join("\n");

    const { object } = await generateObject({
      model: getModel(),
      schema: bioSchema,
      system: "You personalize web page sections. Write a warm, concise bio paragraph based on the provided facts. Max 80 words.",
      prompt: `Facts:\n${facts}\n\nWrite a personalized bio for this person's web page.`,
    });

    expect(object).toHaveProperty("bio");
    expect(typeof object.bio).toBe("string");

    const wordCount = object.bio.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThan(10);
    expect(wordCount).toBeLessThanOrEqual(100); // Allow some overshoot from LLM

    expect(object.bio).toContain("Maria");
    expect(object.bio.toLowerCase()).toMatch(/design|ux/i);
  });

  it("does not include non-text content in personalized output", async () => {
    const { getModel } = await import("@/lib/ai/provider");
    const { generateObject } = await import("ai");
    const { z } = await import("zod");

    const heroSchema = z.object({
      tagline: z.string().describe("A short, punchy tagline for the hero section"),
    });

    const facts = SEED_FACTS.filter((f) => f.category === "identity")
      .map((f) => `[${f.category}/${f.key}]: ${JSON.stringify(f.value)}`)
      .join("\n");

    const { object } = await generateObject({
      model: getModel(),
      schema: heroSchema,
      system: "You personalize web page hero sections. Write a short tagline (max 10 words). Text only — no HTML, no markdown, no URLs.",
      prompt: `Facts:\n${facts}\n\nWrite a personalized tagline.`,
    });

    expect(object).toHaveProperty("tagline");
    expect(object.tagline).not.toMatch(/<[^>]+>/); // No HTML
    expect(object.tagline).not.toMatch(/https?:\/\//); // No URLs
    expect(object.tagline).not.toMatch(/[#*_`]/); // No markdown
  });
});
