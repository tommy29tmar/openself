/**
 * RSS feed → facts + episodic events mapper.
 * Facts: social link, project per post, stat count.
 * Events: one per item with "writing" action type.
 */

import { createHash } from "node:crypto";
import type { RssFeed, RssFeedItem } from "./parser";
import type { EpisodicEventInput } from "../types";

export type FactInput = {
  category: string;
  key: string;
  value: Record<string, unknown>;
};

export function mapRssFeed(feed: RssFeed, feedUrl: string): FactInput[] {
  const facts: FactInput[] = [];

  // Feed link fact
  facts.push({
    category: "social",
    key: "rss-feed",
    value: { platform: "blog", url: feedUrl, label: feed.title || "Blog" },
  });

  // Per-item project facts
  for (const item of feed.items) {
    const guidHash = hashGuid(item.guid || item.link);
    facts.push({
      category: "project",
      key: `rss-${guidHash}`,
      value: {
        name: item.title,
        description: item.description,
        url: item.link,
        tags: item.categories,
      },
    });
  }

  // Aggregate stat
  facts.push({
    category: "stat",
    key: "rss-posts",
    value: { label: "Blog posts", value: String(feed.items.length) },
  });

  return facts;
}

export function mapRssEvents(items: RssFeedItem[]): EpisodicEventInput[] {
  return items.map((item) => {
    const guidHash = hashGuid(item.guid || item.link);
    const now = Date.now();
    let pubUnix = Math.floor(now / 1000);
    let pubHuman = new Date(now).toISOString();
    if (item.pubDate) {
      const parsed = new Date(item.pubDate);
      if (Number.isFinite(parsed.getTime())) {
        pubUnix = Math.floor(parsed.getTime() / 1000);
        pubHuman = parsed.toISOString();
      }
    }

    return {
      externalId: `rss-post-${guidHash}`,
      eventAtUnix: pubUnix,
      eventAtHuman: pubHuman,
      actionType: "writing",
      narrativeSummary: `Published: ${item.title}`,
      entities: item.categories.length > 0 ? item.categories : undefined,
    };
  });
}

function hashGuid(guid: string): string {
  return createHash("sha256").update(guid).digest("hex").slice(0, 12);
}
