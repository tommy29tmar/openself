/**
 * Wraps any LanguageModel with retry + exponential backoff for rate-limit errors (429/529/503).
 * Applied transparently in buildModel() — every LLM call gets automatic retry.
 */
import type { LanguageModel } from "ai";

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 30_000;

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function isRetryableError(error: unknown): { retryable: boolean; retryAfterMs?: number } {
  // Check status code (Anthropic SDK, OpenAI SDK both expose .status)
  const status = (error as Record<string, unknown>)?.status ?? (error as Record<string, unknown>)?.statusCode;
  if (status === 429 || status === 529 || status === 503) {
    const headers = (error as Record<string, unknown>)?.headers as Record<string, string> | undefined;
    const retryAfterRaw = headers?.["retry-after"];
    const retryAfterMs = retryAfterRaw ? parseInt(retryAfterRaw, 10) * 1000 : undefined;
    return { retryable: true, retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined };
  }

  // Fallback: match common error messages
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate") || msg.includes("too many requests") || msg.includes("overloaded")) {
      return { retryable: true };
    }
  }

  return { retryable: false };
}

function getDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1_000;
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function withRetry(model: LanguageModel, opts?: RetryOptions): LanguageModel {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if ((prop === "doGenerate" || prop === "doStream") && typeof value === "function") {
        return async (...args: unknown[]) => {
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              return await value.apply(target, args);
            } catch (error) {
              const { retryable, retryAfterMs } = isRetryableError(error);
              if (!retryable || attempt === maxRetries) throw error;
              const delay = getDelay(attempt, baseDelayMs, maxDelayMs, retryAfterMs);
              console.warn(
                `[retry] ${String(prop)} ${target.modelId} attempt ${attempt + 1}/${maxRetries} failed (rate limit), retrying in ${Math.round(delay / 1000)}s...`,
              );
              await sleep(delay);
            }
          }
        };
      }

      return value;
    },
  });
}
