import {
  DEFAULT_SESSION_ID,
  isMultiUserEnabled,
} from "@/lib/services/session-service";

const COOKIE_NAME = "os_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export { COOKIE_NAME, COOKIE_MAX_AGE };

/**
 * Extract session ID from request.
 * - Multi-user: reads `os_session` cookie.
 * - Single-user: returns "__default__".
 */
export function getSessionIdFromRequest(req: Request): string {
  if (!isMultiUserEnabled()) {
    return DEFAULT_SESSION_ID;
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  return match?.[1] ?? "";
}

/**
 * Build a Set-Cookie header value for the session cookie.
 */
export function createSessionCookie(sessionId: string): string {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}
