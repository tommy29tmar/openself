import { describe, it, expect } from "vitest";
import { classifyChatError, formatChatErrorResponse, type ChatErrorCode } from "@/lib/services/chat-errors";

// Mock AI SDK error classes for testing (they use Symbol-based isInstance)
import { APICallError, LoadAPIKeyError, NoSuchModelError, NoContentGeneratedError } from "@ai-sdk/provider";

describe("classifyChatError", () => {
  // --- AI SDK typed errors ---
  it("classifies APICallError with 429 as AI_RATE_LIMITED", () => {
    const err = new APICallError({
      message: "Rate limit exceeded",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 429,
    });
    expect(classifyChatError(err)).toBe("AI_RATE_LIMITED" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 408 as AI_TIMEOUT", () => {
    const err = new APICallError({
      message: "Request timeout",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 408,
    });
    expect(classifyChatError(err)).toBe("AI_TIMEOUT" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 413 as CONTEXT_TOO_LONG", () => {
    const err = new APICallError({
      message: "Request too large",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 413,
    });
    expect(classifyChatError(err)).toBe("CONTEXT_TOO_LONG" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 500 as AI_PROVIDER_UNAVAILABLE", () => {
    const err = new APICallError({
      message: "Internal server error",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 500,
    });
    expect(classifyChatError(err)).toBe("AI_PROVIDER_UNAVAILABLE" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 503 as AI_PROVIDER_UNAVAILABLE", () => {
    const err = new APICallError({
      message: "Service unavailable",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 503,
    });
    expect(classifyChatError(err)).toBe("AI_PROVIDER_UNAVAILABLE" satisfies ChatErrorCode);
  });

  it("classifies APICallError with 400 and content_filter as CONTENT_FILTERED", () => {
    const err = new APICallError({
      message: "Content filter triggered",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 400,
      data: { error: { type: "content_filter" } },
    });
    expect(classifyChatError(err)).toBe("CONTENT_FILTERED" satisfies ChatErrorCode);
  });

  it("classifies APICallError with unknown 400 as CHAT_INTERNAL_ERROR", () => {
    const err = new APICallError({
      message: "Bad request",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 400,
    });
    expect(classifyChatError(err)).toBe("CHAT_INTERNAL_ERROR" satisfies ChatErrorCode);
  });

  it("classifies LoadAPIKeyError as MODEL_NOT_CONFIGURED", () => {
    const err = new LoadAPIKeyError({ message: "API key missing" });
    expect(classifyChatError(err)).toBe("MODEL_NOT_CONFIGURED" satisfies ChatErrorCode);
  });

  it("classifies NoSuchModelError as MODEL_NOT_CONFIGURED", () => {
    const err = new NoSuchModelError({
      modelId: "gpt-nonexistent",
      modelType: "languageModel",
    });
    expect(classifyChatError(err)).toBe("MODEL_NOT_CONFIGURED" satisfies ChatErrorCode);
  });

  it("classifies NoContentGeneratedError as AI_NO_CONTENT", () => {
    const err = new NoContentGeneratedError();
    expect(classifyChatError(err)).toBe("AI_NO_CONTENT" satisfies ChatErrorCode);
  });

  // --- Native JS errors (string matching fallback) ---
  it("classifies fetch failed as AI_PROVIDER_UNAVAILABLE", () => {
    expect(classifyChatError(new TypeError("fetch failed"))).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("classifies ECONNREFUSED as AI_PROVIDER_UNAVAILABLE", () => {
    expect(classifyChatError(new Error("connect ECONNREFUSED 127.0.0.1:11434"))).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("classifies AbortError as AI_TIMEOUT", () => {
    const err = new DOMException("The operation was aborted", "AbortError");
    expect(classifyChatError(err)).toBe("AI_TIMEOUT");
  });

  it("classifies timeout string as AI_TIMEOUT", () => {
    expect(classifyChatError(new Error("Request timeout after 30000ms"))).toBe("AI_TIMEOUT");
  });

  it("classifies budget exceeded as BUDGET_EXCEEDED", () => {
    expect(classifyChatError(new Error("Monthly budget exceeded"))).toBe("BUDGET_EXCEEDED");
  });

  it("classifies unknown error as CHAT_INTERNAL_ERROR", () => {
    expect(classifyChatError(new Error("Something unexpected"))).toBe("CHAT_INTERNAL_ERROR");
  });

  it("classifies non-Error values as CHAT_INTERNAL_ERROR", () => {
    expect(classifyChatError("string error")).toBe("CHAT_INTERNAL_ERROR");
    expect(classifyChatError(42)).toBe("CHAT_INTERNAL_ERROR");
    expect(classifyChatError(null)).toBe("CHAT_INTERNAL_ERROR");
  });

  // --- formatChatErrorResponse ---
  describe("formatChatErrorResponse", () => {
    it("returns JSON with code and requestId", () => {
      const result = formatChatErrorResponse(new Error("test"), "req-123");
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("code");
      expect(parsed).toHaveProperty("requestId", "req-123");
    });
  });
});
