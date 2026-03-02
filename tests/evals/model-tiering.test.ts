/**
 * Tests for systematic model tiering (Task 26).
 * Validates fast/standard/reasoning tier resolution with legacy alias support.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the AI SDK providers to avoid real API calls
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId, provider: "google" })),
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn((modelId: string) => ({ modelId, provider: "openai" })),
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: "ollama" })),
}));
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn((modelId: string) => ({ modelId, provider: "anthropic" })),
}));

import { getModelForTier, getModelIdForTier } from "@/lib/ai/provider";

describe("model tiering", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Ensure Google provider for consistent testing
    process.env.AI_PROVIDER = "google";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    // Clear any tier overrides
    delete process.env.AI_MODEL;
    delete process.env.AI_MODEL_FAST;
    delete process.env.AI_MODEL_STANDARD;
    delete process.env.AI_MODEL_REASONING;
    delete process.env.AI_MODEL_MEDIUM;
    delete process.env.AI_MODEL_CAPABLE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fast tier returns a valid model", () => {
    const model = getModelForTier("fast");
    expect(model).toBeDefined();
  });

  it("standard tier returns a valid model", () => {
    const model = getModelForTier("standard");
    expect(model).toBeDefined();
  });

  it("reasoning tier returns a valid model", () => {
    const model = getModelForTier("reasoning");
    expect(model).toBeDefined();
  });

  it("fast and standard default to same model (both use AI_MODEL fallback or cheap default)", () => {
    const fastId = getModelIdForTier("fast");
    const standardId = getModelIdForTier("standard");
    expect(fastId).toBe(standardId);
  });

  it("reasoning uses a different default model than fast", () => {
    const fastId = getModelIdForTier("fast");
    const reasoningId = getModelIdForTier("reasoning");
    // reasoning defaults to gemini-2.5-pro (google), fast to gemini-2.0-flash
    expect(reasoningId).not.toBe(fastId);
  });

  it("AI_MODEL_FAST env override is respected", () => {
    process.env.AI_MODEL_FAST = "custom-fast-model";
    const modelId = getModelIdForTier("fast");
    expect(modelId).toBe("custom-fast-model");
  });

  it("AI_MODEL_STANDARD env override is respected", () => {
    process.env.AI_MODEL_STANDARD = "custom-standard-model";
    const modelId = getModelIdForTier("standard");
    expect(modelId).toBe("custom-standard-model");
  });

  it("AI_MODEL_REASONING env override is respected", () => {
    process.env.AI_MODEL_REASONING = "custom-reasoning-model";
    const modelId = getModelIdForTier("reasoning");
    expect(modelId).toBe("custom-reasoning-model");
  });

  // Legacy alias support
  it("legacy 'cheap' tier maps to 'fast'", () => {
    const cheapId = getModelIdForTier("cheap" as any);
    const fastId = getModelIdForTier("fast");
    expect(cheapId).toBe(fastId);
  });

  it("legacy 'medium' tier maps to 'standard'", () => {
    const mediumId = getModelIdForTier("medium" as any);
    const standardId = getModelIdForTier("standard");
    expect(mediumId).toBe(standardId);
  });

  it("legacy 'capable' tier maps to 'reasoning'", () => {
    const capableId = getModelIdForTier("capable" as any);
    const reasoningId = getModelIdForTier("reasoning");
    expect(capableId).toBe(reasoningId);
  });

  it("AI_MODEL_MEDIUM env fallback works for standard tier", () => {
    process.env.AI_MODEL_MEDIUM = "legacy-medium-model";
    const modelId = getModelIdForTier("standard");
    expect(modelId).toBe("legacy-medium-model");
  });

  it("AI_MODEL env fallback applies to all tiers in single-model setup", () => {
    process.env.AI_MODEL = "single-model";
    const fastId = getModelIdForTier("fast");
    const standardId = getModelIdForTier("standard");
    const reasoningId = getModelIdForTier("reasoning");
    expect(fastId).toBe("single-model");
    expect(standardId).toBe("single-model");
    expect(reasoningId).toBe("single-model");
  });
});
