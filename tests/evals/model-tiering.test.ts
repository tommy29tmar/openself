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

import { getModelForTier, getModelIdForTier, getProviderForTier } from "@/lib/ai/provider";

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

describe("multi-provider tier routing", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.AI_MODEL_FAST;
    delete process.env.AI_MODEL_STANDARD;
    delete process.env.AI_MODEL_REASONING;
    delete process.env.AI_MODEL_MEDIUM;
    delete process.env.AI_MODEL_CAPABLE;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("AI_MODEL_FAST with known provider prefix returns model from that provider", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL_FAST = "google:gemini-2.0-flash";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    const model = getModelForTier("fast") as any;
    expect(model.modelId).toBe("gemini-2.0-flash");
    expect(model.provider).toBe("google");
  });

  it("AI_MODEL_STANDARD with known provider prefix overrides AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL_STANDARD = "anthropic:claude-sonnet-4-6";
    const model = getModelForTier("standard") as any;
    expect(model.modelId).toBe("claude-sonnet-4-6");
    expect(model.provider).toBe("anthropic");
  });

  it("getModelIdForTier strips known provider prefix", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_MODEL_FAST = "google:gemini-2.0-flash";
    expect(getModelIdForTier("fast")).toBe("gemini-2.0-flash");
  });

  it("backward compat: plain model id without prefix uses AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL_FAST = "gemini-2.0-flash-lite";
    const model = getModelForTier("fast") as any;
    expect(model.modelId).toBe("gemini-2.0-flash-lite");
    expect(model.provider).toBe("google");
  });

  it("backward compat: model id with unknown prefix (e.g. ollama tag) treated as plain id", () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.AI_MODEL_FAST = "llama3.2:latest";
    const model = getModelForTier("fast") as any;
    // unknown prefix → whole value is modelId, provider = AI_PROVIDER (ollama)
    expect(model.modelId).toBe("llama3.2:latest");
    expect(model.provider).toBe("ollama");
  });

  it("getProviderForTier returns overridden provider when known prefix is set", () => {
    process.env.AI_PROVIDER = "google";
    process.env.AI_MODEL_STANDARD = "anthropic:claude-sonnet-4-6";
    expect(getProviderForTier("standard")).toBe("anthropic");
  });

  it("getProviderForTier falls back to AI_PROVIDER without known prefix", () => {
    process.env.AI_PROVIDER = "anthropic";
    delete process.env.AI_MODEL_FAST;
    expect(getProviderForTier("fast")).toBe("anthropic");
  });

  it("throws only when known provider prefix is followed by empty model id", () => {
    process.env.AI_MODEL_FAST = "google:";
    expect(() => getModelForTier("fast")).toThrow(/empty model-id/);
  });

  it("does NOT throw on unknown prefix (treats as plain id)", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL_FAST = "ft:gpt-4:my-fine-tune";
    expect(() => getModelForTier("fast")).not.toThrow();
  });
});
