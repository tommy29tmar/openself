import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { withRetry } from "./retry-model";

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

interface ModelSpec {
  provider: Provider | null;
  modelId: string;
}

/**
 * Parses "provider:model-id" or bare "model-id".
 * A known provider prefix (google|openai|anthropic|ollama) triggers cross-provider dispatch.
 * Unknown prefix (e.g. "llama3.2:latest", "ft:gpt-4:xxx") → plain model id, uses AI_PROVIDER.
 * Throws only when a KNOWN provider prefix is found but model-id is empty.
 */
function parseTierEnvValue(val: string): ModelSpec {
  const colonIdx = val.indexOf(":");
  if (colonIdx === -1) return { provider: null, modelId: val };
  const prefix = val.slice(0, colonIdx);
  const id = val.slice(colonIdx + 1);
  const valid: Provider[] = ["google", "openai", "anthropic", "ollama"];
  if (!valid.includes(prefix as Provider)) {
    // Not a provider prefix → treat full value as model id (e.g. llama3.2:latest, ft:gpt-4:xxx)
    return { provider: null, modelId: val };
  }
  if (!id) {
    throw new Error(
      `Invalid AI_MODEL_* value "${val}": known provider prefix "${prefix}" has empty model-id after ":".`
    );
  }
  return { provider: prefix as Provider, modelId: id };
}

function resolveModelSpecForTier(resolved: ModelTier): ModelSpec {
  for (const envKey of TIER_ENV_KEYS[resolved]) {
    const val = process.env[envKey];
    if (val) return parseTierEnvValue(val);
  }
  const globalOverride = process.env.AI_MODEL;
  if (globalOverride) return { provider: null, modelId: globalOverride };
  const provider = getProvider();
  return { provider, modelId: TIER_MODEL_TABLES[resolved][provider] };
}

function resolveTier(tier: ModelTier | LegacyModelTier): ModelTier {
  return TIER_ALIAS[tier] ?? tier as ModelTier;
}

function resolveModelIdForTier(resolved: ModelTier): string {
  return resolveModelSpecForTier(resolved).modelId;
}

function buildModel(provider: Provider, modelId: string): LanguageModel {
  let base: LanguageModel;
  switch (provider) {
    case "google": {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
      base = createGoogleGenerativeAI(apiKey ? { apiKey } : {})(modelId);
      break;
    }
    case "openai":
      base = openai(modelId);
      break;
    case "anthropic":
      base = anthropic(modelId);
      break;
    case "ollama": {
      const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
      base = createOpenAI({ baseURL, apiKey: "ollama" })(modelId);
      break;
    }
  }
  return withRetry(base);
}

export function getModelForTier(tier: ModelTier | LegacyModelTier): LanguageModel {
  const resolved = resolveTier(tier);
  const { provider: specProvider, modelId } = resolveModelSpecForTier(resolved);
  return buildModel(specProvider ?? getProvider(), modelId);
}

/** Returns the effective provider for a tier, respecting provider:model prefix overrides. */
export function getProviderForTier(tier: ModelTier | LegacyModelTier): string {
  const resolved = resolveTier(tier);
  const { provider: specProvider } = resolveModelSpecForTier(resolved);
  return specProvider ?? getProvider();
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
  const modelId = process.env.AI_MODEL ?? DEFAULT_MODELS[provider];
  return buildModel(provider, modelId);
}
