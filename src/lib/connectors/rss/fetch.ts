/**
 * SSRF-protected RSS/Atom feed fetcher.
 * Follows redirects (max 3 hops), validates each hop against SSRF rules,
 * and enforces a streaming body size limit.
 *
 * Extracted from sync.ts so both sync and subscribe-time validation can reuse it.
 */

import {
  validateRssUrl,
  validateResolvedIp,
  RSS_FETCH_TIMEOUT_MS,
  RSS_MAX_RESPONSE_BYTES,
} from "./url-validator";

const MAX_REDIRECTS = 3;

/**
 * Fetch feed with manual redirect following (max 3 hops).
 * Per-hop SSRF validation on redirect targets.
 * Streaming body with size limit.
 */
export async function fetchFeedSafe(url: string): Promise<string> {
  // DNS-level SSRF check before first fetch
  const hostname = new URL(url).hostname;
  const dnsCheck = await validateResolvedIp(hostname);
  if (!dnsCheck.valid) throw new Error(`SSRF blocked: ${dnsCheck.error}`);

  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "OpenSelf/1.0 RSS Connector",
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect without Location header");

      // Resolve relative redirects
      const redirectUrl = new URL(location, currentUrl).toString();

      // SSRF check on redirect target
      const check = validateRssUrl(redirectUrl);
      if (!check.valid) throw new Error(`Redirect blocked: ${check.error}`);

      const dnsCheck = await validateResolvedIp(new URL(redirectUrl).hostname);
      if (!dnsCheck.valid)
        throw new Error(`Redirect blocked: ${dnsCheck.error}`);

      currentUrl = redirectUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Feed fetch failed: HTTP ${response.status}`);
    }

    // Stream body with size limit
    return await readBodyWithLimit(response, RSS_MAX_RESPONSE_BYTES);
  }

  throw new Error("Too many redirects");
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        throw new Error(`Feed exceeds size limit (${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder();
  return (
    chunks.map((c) => decoder.decode(c, { stream: true })).join("") +
    decoder.decode()
  );
}
