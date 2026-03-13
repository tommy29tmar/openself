import { getUiL10n } from "./ui-strings";
import type { UiStrings } from "./ui-strings";

/**
 * Map an API error code to a user-friendly localized message.
 * Covers ALL error codes from /api/register, /api/publish, /api/draft/request-publish.
 */
export function friendlyError(code: string | undefined, t: UiStrings): string {
  const map: Record<string, string> = {
    // Form validation
    USERNAME_INVALID: t.usernameInvalid,
    USERNAME_RESERVED: t.usernameReserved,
    USERNAME_TAKEN: t.usernameTaken,
    EMAIL_INVALID: t.emailInvalid,
    EMAIL_TAKEN: t.emailTaken,
    PASSWORD_TOO_SHORT: t.passwordTooShort,
    PASSWORD_MISMATCH: t.passwordMismatch,
    RATE_LIMITED: t.rateLimited,
    // Auth
    UNAUTHORIZED: t.authRequired,
    AUTH_REQUIRED: t.authRequired,
    // Publish pipeline
    LAYOUT_CONFIG_INVALID: t.publishErrorLayout,
    LAYOUT_INVALID: t.publishErrorLayout,
    LAYOUT_VALIDATION_INCOMPLETE: t.publishErrorLayout,
    NO_FACTS: t.publishErrorNoContent,
    NO_PUBLISHABLE_FACTS: t.publishErrorNoContent,
    STALE_PREVIEW_HASH: t.publishErrorStale,
    USERNAME_MISMATCH: t.publishErrorGeneric,
    NO_DRAFT: t.publishErrorNoContent,
    INTERNAL: t.publishErrorGeneric,
  };
  return map[code ?? ""] ?? t.publishErrorGeneric;
}

/**
 * Parse a JSON error string from the chat stream.
 * Returns { code, requestId } if valid, null otherwise.
 */
export function parseChatErrorJson(raw: string): { code: string; requestId?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === "string") {
      // Validate requestId format (UUID v4) to prevent text injection in error banner
      const rid = typeof parsed.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.requestId)
        ? parsed.requestId
        : undefined;
      return { code: parsed.code, requestId: rid };
    }
  } catch { /* not JSON */ }
  return null;
}

/**
 * Map a chat error code to a user-friendly localized message.
 * Specific codes get actionable messages; everything else gets generic + requestId for traceability.
 */
export function chatFriendlyError(code: string | null, language: string, requestId?: string): string {
  const t = getUiL10n(language);

  const map: Record<string, string> = {
    AI_PROVIDER_UNAVAILABLE: t.chatErrorProviderDown,
    AI_RATE_LIMITED: t.chatErrorRateLimit,
    AI_TIMEOUT: t.chatErrorTimeout,
    BUDGET_EXCEEDED: t.chatErrorBudget,
    MODEL_NOT_CONFIGURED: t.chatErrorModelConfig,
    CONTEXT_TOO_LONG: t.chatErrorContextTooLong,
    CONTENT_FILTERED: t.chatErrorContentFiltered,
    // AI_NO_CONTENT intentionally omitted — falls through to generic+requestId for traceability
  };

  // Specific code matched — return actionable message (no requestId needed)
  if (code && map[code]) return map[code];

  // Generic fallback — append requestId for traceability
  const generic = t.chatErrorGeneric;
  if (requestId) {
    return `${generic} Ref: ${requestId}`;
  }
  return generic;
}
