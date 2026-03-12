/**
 * Build a redirect URL for OAuth callbacks using NEXT_PUBLIC_BASE_URL.
 *
 * In Docker containers, req.url resolves to the internal binding address
 * (e.g., 0.0.0.0:3000) instead of the public domain. This helper ensures
 * callbacks always redirect to the correct public origin.
 */
export function buildCallbackRedirectUrl(path: string): URL {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return new URL(path, base);
}
