/**
 * RSS URL validator with SSRF protection.
 * Validates URL format + blocks private/reserved IPs + DNS resolution check.
 */

const PRIVATE_IP_RANGES = [
  /^127\./,                          // loopback
  /^10\./,                           // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,     // Class B private
  /^192\.168\./,                     // Class C private
  /^169\.254\./,                     // link-local
  /^0\./,                            // current network
  /^\[?::1\]?$/,                     // IPv6 loopback
  /^\[?fc/i,                         // IPv6 unique local
  /^\[?fd/i,                         // IPv6 unique local
  /^\[?fe80/i,                       // IPv6 link-local
];

type ValidationResult = { valid: true } | { valid: false; error: string };

export function validateRssUrl(url: string): ValidationResult {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "Empty URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Malformed URL" };
  }

  // Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Unsupported protocol: ${parsed.protocol}` };
  }

  // Port check — only 80 and 443 (or default)
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    return { valid: false, error: `Non-standard port: ${parsed.port}` };
  }

  // IP/hostname check — block private ranges
  const hostname = parsed.hostname;
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }
  if (isPrivateIp(hostname)) {
    return { valid: false, error: `Private/reserved IP: ${hostname}` };
  }

  return { valid: true };
}

function isPrivateIp(ip: string): boolean {
  // Strip brackets from IPv6 (URL parser keeps them)
  const cleaned = ip.replace(/^\[|\]$/g, "");

  // Check raw cleaned form first (catches ::1, fc*, fd*, fe80*)
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(cleaned)) return true;
  }

  // Also check ::ffff:-mapped IPv4 (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
  const mapped = cleaned.replace(/^::ffff:/i, "");
  if (mapped !== cleaned) {
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(mapped)) return true;
    }
  }

  return false;
}

/**
 * DNS resolution check: resolve hostname and verify all addresses are public.
 * Call AFTER validateRssUrl() passes.
 */
export async function validateResolvedIp(hostname: string): Promise<ValidationResult> {
  const { resolve4, resolve6 } = await import("node:dns/promises");
  try {
    const addresses: string[] = [];
    try { addresses.push(...await resolve4(hostname)); } catch { /* no A records */ }
    try { addresses.push(...await resolve6(hostname)); } catch { /* no AAAA records */ }

    if (addresses.length === 0) {
      return { valid: false, error: `DNS resolution failed for ${hostname}` };
    }

    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return { valid: false, error: `Hostname resolves to private IP: ${addr}` };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `DNS resolution failed for ${hostname}` };
  }
}

/** Max items to process per feed per sync */
export const RSS_MAX_ITEMS_PER_SYNC = 50;
export const RSS_MAX_FEEDS_PER_USER = 1;
export const RSS_FETCH_TIMEOUT_MS = 10_000;
export const RSS_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
