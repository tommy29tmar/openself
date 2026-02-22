import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

type Provider = "google" | "openai" | "anthropic" | "ollama";

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
