import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

type Provider = "google" | "openai" | "anthropic" | "ollama";

/**
 * Model tier for cost-aware routing.
 *
 * | Tier      | Use case                                    | Default model      |
 * |-----------|---------------------------------------------|--------------------|
 * | fast      | Schema-constrained generateObject,          | Same as AI_MODEL   |
 * |           | translation, mechanical tasks               |                    |
 * | standard  | Chat conversation, summaries,               | Same as AI_MODEL   |
 * |           | text compression                            |                    |
 * | reasoning | Conformity analysis, complex multi-step     | gemini-2.5-pro /   |
 * |           | evaluation                                  | claude-sonnet-4-6  |
 *
 * By default, fast and standard resolve to AI_MODEL (= cheapest).
 * Override per tier with AI_MODEL_FAST, AI_MODEL_STANDARD, AI_MODEL_REASONING.
 */
export type ModelTier = "fast" | "standard" | "reasoning";

/** @deprecated Use "fast" | "standard" | "reasoning" */
export type LegacyModelTier = "cheap" | "medium" | "capable";

/** Maps legacy tier names to new names. */
const TIER_ALIAS: Record<string, ModelTier> = {
  cheap: "fast",
  medium: "standard",
  capable: "reasoning",
};

const FAST_MODELS: Record<Provider, string> = {
  google: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  ollama: "llama3.3",
};

const STANDARD_MODELS: Record<Provider, string> = {
  google: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  ollama: "llama3.3",
};

const REASONING_MODELS: Record<Provider, string> = {
  google: "gemini-2.5-pro",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-6",
  ollama: "llama3.3",
};

const TIER_MODEL_TABLES: Record<ModelTier, Record<Provider, string>> = {
  fast: FAST_MODELS,
  standard: STANDARD_MODELS,
  reasoning: REASONING_MODELS,
};

/** Env var overrides per tier (with legacy fallbacks). */
const TIER_ENV_KEYS: Record<ModelTier, string[]> = {
  fast: ["AI_MODEL_FAST"],
  standard: ["AI_MODEL_STANDARD", "AI_MODEL_MEDIUM"],
  reasoning: ["AI_MODEL_REASONING", "AI_MODEL_CAPABLE"],
};

function resolveTier(tier: ModelTier | LegacyModelTier): ModelTier {
  return TIER_ALIAS[tier] ?? tier as ModelTier;
}

function resolveModelIdForTier(resolved: ModelTier): string {
  const provider = getProvider();
  for (const envKey of TIER_ENV_KEYS[resolved]) {
    const val = process.env[envKey];
    if (val) return val;
  }
  // Fall back to AI_MODEL if set (single-model setup)
  return process.env.AI_MODEL ?? TIER_MODEL_TABLES[resolved][provider];
}

export function getModelForTier(tier: ModelTier | LegacyModelTier): LanguageModel {
  const resolved = resolveTier(tier);
  const provider = getProvider();
  const modelId = resolveModelIdForTier(resolved);

  switch (provider) {
    case "google": {
      const apiKey =
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        process.env.GOOGLE_API_KEY;
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case "openai":
      return openai(modelId);
    case "anthropic":
      return anthropic(modelId);
    case "ollama": {
      const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
      const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
      return ollama(modelId);
    }
  }
}

export function getModelIdForTier(tier: ModelTier | LegacyModelTier): string {
  return resolveModelIdForTier(resolveTier(tier));
}

const DEFAULT_MODELS: Record<Provider, string> = {
  google: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  ollama: "llama3.3",
};

function getProvider(): Provider {
  const raw = process.env.AI_PROVIDER ?? "google";
  const valid: Provider[] = ["google", "openai", "anthropic", "ollama"];
  if (!valid.includes(raw as Provider)) {
    throw new Error(
      `Invalid AI_PROVIDER "${raw}". Must be one of: ${valid.join(", ")}`,
    );
  }
  return raw as Provider;
}

export function getProviderName(): Provider {
  return getProvider();
}

export function getModelId(): string {
  const provider = getProvider();
  return process.env.AI_MODEL ?? DEFAULT_MODELS[provider];
}

export function getModel(): LanguageModel {
  const provider = getProvider();
  const modelId =
    process.env.AI_MODEL ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case "google": {
      const apiKey =
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        process.env.GOOGLE_API_KEY;
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }

    case "openai":
      return openai(modelId);

    case "anthropic":
      return anthropic(modelId);

    case "ollama": {
      const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
      const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
      return ollama(modelId);
    }
  }
}
