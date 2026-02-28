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
