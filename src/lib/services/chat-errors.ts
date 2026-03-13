import { APICallError, LoadAPIKeyError, NoSuchModelError, NoContentGeneratedError } from "@ai-sdk/provider";

/**
 * Structured error codes for chat errors.
 * Server classifies, client maps to L10N messages.
 */
export type ChatErrorCode =
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "BUDGET_EXCEEDED"
  | "MODEL_NOT_CONFIGURED"
  | "CONTEXT_TOO_LONG"
  | "CONTENT_FILTERED"
  | "AI_NO_CONTENT"
  | "CHAT_INTERNAL_ERROR";

/**
 * Classify a chat error into a structured code.
 * Priority: AI SDK typed errors (most reliable) → string matching fallback (native fetch/abort only).
 */
export function classifyChatError(error: unknown): ChatErrorCode {
  // AI SDK typed errors — structured, reliable
  if (APICallError.isInstance(error)) {
    const { statusCode } = error;
    if (statusCode === 429) return "AI_RATE_LIMITED";
    if (statusCode === 408) return "AI_TIMEOUT";
    if (statusCode === 413) return "CONTEXT_TOO_LONG";
    if (statusCode === 401 || statusCode === 403) return "MODEL_NOT_CONFIGURED";
    if (statusCode != null && statusCode >= 500) return "AI_PROVIDER_UNAVAILABLE";
    // Check for content filter in error data (provider-specific)
    const data = error.data as Record<string, unknown> | undefined;
    const errType = (data?.error as Record<string, unknown>)?.type;
    if (errType === "content_filter" || errType === "content_policy_violation") {
      return "CONTENT_FILTERED";
    }
    // Anthropic content policy errors surface as 400 with message text (no structured type)
    if (error.message?.toLowerCase().includes("content policy")) {
      return "CONTENT_FILTERED";
    }
    return "CHAT_INTERNAL_ERROR";
  }
  if (LoadAPIKeyError.isInstance(error)) return "MODEL_NOT_CONFIGURED";
  if (NoSuchModelError.isInstance(error)) return "MODEL_NOT_CONFIGURED";
  if (NoContentGeneratedError.isInstance(error)) return "AI_NO_CONTENT";

  // String matching fallback — only for native JS errors (fetch, AbortError, etc.)
  const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (msg.includes("budget") || msg.includes("monthly limit")) return "BUDGET_EXCEEDED";
  if (
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("aborterror")
  )
    return "AI_TIMEOUT";
  if (
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up")
  )
    return "AI_PROVIDER_UNAVAILABLE";

  return "CHAT_INTERNAL_ERROR";
}

/**
 * Format a chat error as a JSON string for stream error responses.
 * Includes the classified code and requestId for client-side mapping.
 */
export function formatChatErrorResponse(error: unknown, requestId: string): string {
  const code = classifyChatError(error);
  return JSON.stringify({ code, requestId });
}
