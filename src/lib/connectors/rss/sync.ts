/**
 * RSS feed sync orchestration.
 * Fetches feed XML → parses → maps to facts + events → batch writes.
 *
 * First sync is BASELINE: creates facts but NO episodic events.
 * Seeds connector_items for dedup on subsequent syncs.
 */

import { createHash } from "node:crypto";
import {
  getConnectorWithCredentials,
  updateConnectorStatus,
} from "../connector-service";
import { batchCreateFacts } from "../connector-fact-writer";
import { batchRecordEvents } from "../connector-event-writer";
import { resolveOwnerScopeForWorker } from "@/lib/auth/session";
import { getDraft } from "@/lib/services/page-service";
import { getFactLanguage } from "@/lib/services/preferences-service";
import { parseRssFeed } from "./parser";
import { mapRssFeed, mapRssEvents } from "./mapper";
import {
  validateRssUrl,
  validateResolvedIp,
  RSS_FETCH_TIMEOUT_MS,
  RSS_MAX_RESPONSE_BYTES,
  RSS_MAX_ITEMS_PER_SYNC,
} from "./url-validator";
import type { SyncResult } from "../types";
import { db, sqlite } from "@/lib/db";
import { connectors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const MAX_REDIRECTS = 3;

export async function syncRss(
  connectorId: string,
  ownerKey: string,
): Promise<SyncResult> {
  const connector = getConnectorWithCredentials(connectorId);
  if (!connector?.decryptedCredentials) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "No credentials" };
  }

  const creds =
    typeof connector.decryptedCredentials === "string"
      ? JSON.parse(connector.decryptedCredentials)
      : connector.decryptedCredentials;
  const feedUrl = creds.feed_url as string;

  if (!feedUrl) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "No feed URL" };
  }

  // SSRF validation
  const urlCheck = validateRssUrl(feedUrl);
  if (!urlCheck.valid) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: urlCheck.error };
  }

  const dnsCheck = await validateResolvedIp(new URL(feedUrl).hostname);
  if (!dnsCheck.valid) {
    return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: dnsCheck.error };
  }

  const scope = resolveOwnerScopeForWorker(ownerKey);
  const factLanguage = getFactLanguage(scope.knowledgePrimaryKey) ?? "en";
  const existingDraft = getDraft(scope.knowledgePrimaryKey);

  try {
    // Fetch feed with redirect following + SSRF checks per hop
    const xml = await fetchFeedSafe(feedUrl);

    // Parse
    const feed = parseRssFeed(xml);
    if (feed.items.length === 0 && !feed.title) {
      return { factsCreated: 0, factsUpdated: 0, eventsCreated: 0, error: "Invalid or empty feed" };
    }

    // Limit items per sync
    feed.items = feed.items.slice(0, RSS_MAX_ITEMS_PER_SYNC);

    // Map to facts
    const facts = mapRssFeed(feed, feedUrl);
    const username = existingDraft?.username ?? "draft";
    const report = await batchCreateFacts(facts, scope, username, factLanguage);

    // Determine if first sync (baseline)
    const isFirstSync = connector.lastSync === null;

    let eventsCreated = 0;

    if (isFirstSync) {
      // BASELINE: seed connector_items for dedup, but NO episodic events
      for (const item of feed.items) {
        const guidHash = hashGuid(item.guid || item.link);
        const externalId = `rss-post-${guidHash}`;
        sqlite
          .prepare(
            `INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, last_seen_at)
             VALUES (?, ?, ?, datetime('now'))`,
          )
          .run(randomUUID(), connectorId, externalId);
      }
    } else {
      // Subsequent sync: create episodic events for new items
      const events = mapRssEvents(feed.items);
      if (events.length > 0) {
        const eventReport = await batchRecordEvents(events, {
          ownerKey,
          connectorId,
          connectorType: "rss",
          sessionId: scope.knowledgePrimaryKey,
        });
        eventsCreated = eventReport.eventsWritten;
      }
    }

    // Update lastSync + syncCursor
    const latestPubDate = feed.items
      .map((i) => i.pubDate)
      .filter((d): d is string => d !== null)
      .sort()
      .pop();

    db.update(connectors)
      .set({
        lastSync: new Date().toISOString(),
        syncCursor: latestPubDate ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(connectors.id, connectorId))
      .run();

    return {
      factsCreated: report.factsWritten,
      factsUpdated: 0,
      eventsCreated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateConnectorStatus(connectorId, "error", message);
    return {
      factsCreated: 0,
      factsUpdated: 0,
      eventsCreated: 0,
      error: message,
    };
  }
}

/**
 * Fetch feed with manual redirect following (max 3 hops).
 * Per-hop SSRF validation on redirect targets.
 * Streaming body with size limit.
 */
async function fetchFeedSafe(url: string): Promise<string> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "OpenSelf/1.0 RSS Connector",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
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
      if (!dnsCheck.valid) throw new Error(`Redirect blocked: ${dnsCheck.error}`);

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

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
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
  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") +
    decoder.decode();
}

function hashGuid(guid: string): string {
  return createHash("sha256").update(guid).digest("hex").slice(0, 12);
}
