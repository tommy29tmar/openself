/**
 * Shared setup for cross-provider eval tests.
 *
 * Provides:
 * - Provider parameterization via AI_PROVIDER env var
 * - Test data (seed facts for test profiles)
 * - Helper functions for asserting LLM output quality
 */

// ---------------------------------------------------------------------------
// Provider Parameterization
// ---------------------------------------------------------------------------

/**
 * Providers to test across. When AI_PROVIDER env var is set,
 * only that provider runs. Otherwise, all available providers run.
 *
 * Provider availability is determined by API key presence:
 * - google: GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_API_KEY
 * - openai: OPENAI_API_KEY
 * - anthropic: ANTHROPIC_API_KEY
 * - ollama: OLLAMA_BASE_URL (defaults to localhost)
 */
export type TestProvider = "google" | "openai" | "anthropic" | "ollama";

export function getTestProviders(): TestProvider[] {
  const envProvider = process.env.AI_PROVIDER;
  if (envProvider) {
    return [envProvider as TestProvider];
  }

  const available: TestProvider[] = [];
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    available.push("google");
  }
  if (process.env.OPENAI_API_KEY) {
    available.push("openai");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    available.push("anthropic");
  }
  // Ollama is always "available" (local) but may not be running
  // Only include if explicitly requested
  if (process.env.OLLAMA_BASE_URL || process.env.TEST_OLLAMA === "true") {
    available.push("ollama");
  }

  if (available.length === 0) {
    throw new Error(
      "No AI providers configured for cross-provider tests. " +
      "Set AI_PROVIDER or provide API keys in env."
    );
  }

  return available;
}

/**
 * Set the provider env var for a test block.
 * Returns a cleanup function to restore the original value.
 */
export function setProvider(provider: TestProvider): () => void {
  const original = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = provider;
  return () => {
    if (original === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = original;
    }
  };
}

// ---------------------------------------------------------------------------
// Test Data Seeding
// ---------------------------------------------------------------------------

/**
 * Minimal fact set for a test profile.
 * Covers the most common sections: identity, experience, skills, interests.
 */
export const SEED_FACTS = [
  { category: "identity", key: "full-name", value: { full: "Maria Rossi" } },
  { category: "identity", key: "role", value: { role: "UX Designer" } },
  { category: "identity", key: "location", value: { city: "Milan", country: "Italy" } },
  { category: "identity", key: "tagline", value: { tagline: "Designing for humans, not pixels" } },
  { category: "experience", key: "design-studio", value: { role: "Senior UX Designer", company: "Design Studio Milano", start: "2022-03", end: null, status: "current" } },
  { category: "experience", key: "tech-corp", value: { role: "UX Designer", company: "TechCorp", start: "2019-06", end: "2022-02", status: "past" } },
  { category: "skill", key: "figma", value: { name: "Figma", level: "expert" } },
  { category: "skill", key: "user-research", value: { name: "User Research", level: "advanced" } },
  { category: "skill", key: "prototyping", value: { name: "Prototyping", level: "advanced" } },
  { category: "interest", key: "typography", value: { name: "Typography" } },
  { category: "interest", key: "accessibility", value: { name: "Accessibility" } },
  { category: "project", key: "design-system", value: { name: "Milan Design System", description: "A comprehensive design system for the city of Milan's digital services", status: "active", role: "Lead Designer" } },
  { category: "social", key: "linkedin", value: { platform: "LinkedIn", url: "https://linkedin.com/in/mariarossi" } },
  { category: "education", key: "polimi", value: { institution: "Politecnico di Milano", degree: "MSc", field: "Communication Design", period: "2017-2019" } },
] as const;

/**
 * Sparse fact set for testing low-signal scenarios.
 */
export const SPARSE_FACTS = [
  { category: "identity", key: "full-name", value: { full: "Luca Bianchi" } },
] as const;

// ---------------------------------------------------------------------------
// Output Assertions
// ---------------------------------------------------------------------------

/**
 * Assert that LLM text output contains at least N of the given keywords.
 * Useful for behavioral assertions where exact wording varies.
 */
export function assertContainsAtLeast(
  text: string,
  keywords: string[],
  minCount: number,
  message?: string,
): void {
  const found = keywords.filter((k) => text.toLowerCase().includes(k.toLowerCase()));
  if (found.length < minCount) {
    throw new Error(
      `${message ?? "Assertion failed"}: expected at least ${minCount} of [${keywords.join(", ")}] ` +
      `but found ${found.length}: [${found.join(", ")}]. Full text:\n${text.slice(0, 500)}`
    );
  }
}

/**
 * Assert that LLM output does NOT contain any of the given forbidden phrases.
 */
export function assertNoneOf(
  text: string,
  forbidden: string[],
  message?: string,
): void {
  const found = forbidden.filter((f) => text.toLowerCase().includes(f.toLowerCase()));
  if (found.length > 0) {
    throw new Error(
      `${message ?? "Assertion failed"}: found forbidden phrases [${found.join(", ")}]. ` +
      `Full text:\n${text.slice(0, 500)}`
    );
  }
}

/**
 * Assert that LLM output is within expected word count range.
 */
export function assertWordCount(
  text: string,
  min: number,
  max: number,
  message?: string,
): void {
  const words = text.trim().split(/\s+/).length;
  if (words < min || words > max) {
    throw new Error(
      `${message ?? "Assertion failed"}: expected ${min}-${max} words but got ${words}. ` +
      `Full text:\n${text.slice(0, 300)}`
    );
  }
}
