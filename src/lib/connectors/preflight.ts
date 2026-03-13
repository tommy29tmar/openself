export type PreflightResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Pre-flight check for OAuth connect endpoints.
 *
 * Strategy:
 * - fetch() with default redirect: "follow"
 * - Error responses (404 NOT_CONFIGURED, 403 AUTH_REQUIRED) return JSON → we parse and show inline
 * - Successful OAuth endpoints return 302 → fetch follows → cross-origin CORS TypeError → we catch
 *   and return ok:true (let the browser navigate natively)
 */
export async function preflightConnectCheck(url: string): Promise<PreflightResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Connection failed" }));
      return { ok: false, error: data.error ?? "Connection failed" };
    }
    // Unexpected success (shouldn't happen for connect endpoints) — navigate anyway
    return { ok: true };
  } catch {
    // CORS TypeError from cross-origin OAuth redirect, or network error
    // In both cases: let the browser handle it via native navigation
    return { ok: true };
  }
}
