import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock SDK providers before importing
vi.mock("@ai-sdk/google", () => {
  const mockModel = { modelId: "mock-google-model" };
  return {
    createGoogleGenerativeAI: vi.fn(() => vi.fn(() => mockModel)),
  };
});

vi.mock("@ai-sdk/openai", () => {
  const mockModel = { modelId: "mock-openai-model" };
  return {
    openai: vi.fn(() => mockModel),
    createOpenAI: vi.fn(() => vi.fn(() => mockModel)),
  };
});

vi.mock("@ai-sdk/anthropic", () => {
  const mockModel = { modelId: "mock-anthropic-model" };
  return {
    anthropic: vi.fn(() => mockModel),
  };
});

import {
  getModelForTier,
  getModelIdForTier,
  getProviderName,
  type ModelTier,
} from "@/lib/ai/provider";

describe("provider tiers", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AI_PROVIDER = "google";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("ModelTier type includes capable", () => {
    it("accepts 'capable' as a valid tier", () => {
      // This test validates that the type system accepts "capable"
      const tier: ModelTier = "capable";
      expect(tier).toBe("capable");
    });
  });

  describe("getModelIdForTier", () => {
    it("returns cheap model for 'cheap' tier", () => {
      process.env.AI_PROVIDER = "google";
      const modelId = getModelIdForTier("cheap");
      expect(modelId).toBe("gemini-2.0-flash");
    });

    it("returns medium model for 'medium' tier", () => {
      process.env.AI_PROVIDER = "google";
      const modelId = getModelIdForTier("medium");
      expect(modelId).toBe("gemini-2.5-flash");
    });

    it("returns capable model for 'capable' tier — google", () => {
      process.env.AI_PROVIDER = "google";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("gemini-2.5-pro");
    });

    it("returns capable model for 'capable' tier — openai", () => {
      process.env.AI_PROVIDER = "openai";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("gpt-4o");
    });

    it("returns capable model for 'capable' tier — anthropic", () => {
      process.env.AI_PROVIDER = "anthropic";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("claude-sonnet-4-6");
    });

    it("returns capable model for 'capable' tier — ollama", () => {
      process.env.AI_PROVIDER = "ollama";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("llama3.3");
    });

    it("respects AI_MODEL_CAPABLE env var override", () => {
      process.env.AI_PROVIDER = "google";
      process.env.AI_MODEL_CAPABLE = "gemini-2.5-pro-preview";
      const modelId = getModelIdForTier("capable");
      expect(modelId).toBe("gemini-2.5-pro-preview");
    });

    it("respects AI_MODEL_MEDIUM env var override", () => {
      process.env.AI_PROVIDER = "google";
      process.env.AI_MODEL_MEDIUM = "gemini-2.0-flash-lite";
      const modelId = getModelIdForTier("medium");
      expect(modelId).toBe("gemini-2.0-flash-lite");
    });
  });

  describe("getModelForTier", () => {
    it("returns a LanguageModel for 'capable' tier", () => {
      process.env.AI_PROVIDER = "google";
      const model = getModelForTier("capable");
      expect(model).toBeDefined();
    });

    it("returns a LanguageModel for all 3 tiers", () => {
      process.env.AI_PROVIDER = "google";
      expect(getModelForTier("cheap")).toBeDefined();
      expect(getModelForTier("medium")).toBeDefined();
      expect(getModelForTier("capable")).toBeDefined();
    });
  });

  describe("getProviderName", () => {
    it("returns the configured provider", () => {
      process.env.AI_PROVIDER = "anthropic";
      expect(getProviderName()).toBe("anthropic");
    });

    it("defaults to google", () => {
      delete process.env.AI_PROVIDER;
      expect(getProviderName()).toBe("google");
    });
  });
});
