import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/ai/retry-model";
import type { LanguageModel } from "ai";

function makeFakeModel(overrides: Partial<LanguageModel> = {}): LanguageModel {
  return {
    specificationVersion: "v1",
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: "json",
    doGenerate: vi.fn().mockResolvedValue({ text: "ok" }),
    doStream: vi.fn().mockResolvedValue({ stream: "ok" }),
    ...overrides,
  } as unknown as LanguageModel;
}

describe("withRetry", () => {
  it("passes through on success", async () => {
    const model = makeFakeModel();
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    const result = await (wrapped as any).doGenerate({ prompt: "hi" });
    expect(result).toEqual({ text: "ok" });
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and eventually succeeds", async () => {
    const error429 = Object.assign(new Error("Rate limit"), { status: 429 });
    const doGenerate = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce({ text: "ok" });
    const model = makeFakeModel({ doGenerate } as any);
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });

    const result = await (wrapped as any).doGenerate({ prompt: "hi" });
    expect(result).toEqual({ text: "ok" });
    expect(doGenerate).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting retries", async () => {
    const error429 = Object.assign(new Error("Rate limit"), { status: 429 });
    const doGenerate = vi.fn().mockRejectedValue(error429);
    const model = makeFakeModel({ doGenerate } as any);
    const wrapped = withRetry(model, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 });

    await expect((wrapped as any).doGenerate({ prompt: "hi" })).rejects.toThrow("Rate limit");
    expect(doGenerate).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does NOT retry non-retryable errors", async () => {
    const error = new Error("Invalid API key");
    const doGenerate = vi.fn().mockRejectedValue(error);
    const model = makeFakeModel({ doGenerate } as any);
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });

    await expect((wrapped as any).doGenerate({ prompt: "hi" })).rejects.toThrow("Invalid API key");
    expect(doGenerate).toHaveBeenCalledTimes(1);
  });

  it("retries doStream on 429", async () => {
    const error429 = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const doStream = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce({ stream: "ok" });
    const model = makeFakeModel({ doStream } as any);
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });

    const result = await (wrapped as any).doStream({ prompt: "hi" });
    expect(result).toEqual({ stream: "ok" });
    expect(doStream).toHaveBeenCalledTimes(2);
  });

  it("retries on 529 (overloaded)", async () => {
    const error529 = Object.assign(new Error("Overloaded"), { status: 529 });
    const doGenerate = vi.fn()
      .mockRejectedValueOnce(error529)
      .mockResolvedValueOnce({ text: "ok" });
    const model = makeFakeModel({ doGenerate } as any);
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });

    const result = await (wrapped as any).doGenerate({ prompt: "hi" });
    expect(result).toEqual({ text: "ok" });
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });

  it("retries on message-only rate limit detection", async () => {
    const error = new Error("Request failed: 429 Too many requests");
    const doGenerate = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ text: "ok" });
    const model = makeFakeModel({ doGenerate } as any);
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });

    const result = await (wrapped as any).doGenerate({ prompt: "hi" });
    expect(result).toEqual({ text: "ok" });
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });

  it("preserves model properties", () => {
    const model = makeFakeModel();
    const wrapped = withRetry(model, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 });
    expect(wrapped.provider).toBe("test");
    expect(wrapped.modelId).toBe("test-model");
    expect(wrapped.specificationVersion).toBe("v1");
  });
});
