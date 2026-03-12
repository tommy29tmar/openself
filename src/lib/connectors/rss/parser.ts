/**
 * RSS / Atom feed parser.
 * Supports RSS 2.0 and Atom 1.0 formats.
 * Uses fast-xml-parser for efficient XML parsing.
 *
 * Also exports `validateFeedUrl` for subscribe-time feed validation
 * (fetch + parse probe without full sync).
 */

import { XMLParser } from "fast-xml-parser";
import { fetchFeedSafe } from "./fetch";

export type RssFeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  guid: string;
  categories: string[];
};

export type RssFeed = {
  title: string;
  link: string;
  description: string;
  items: RssFeedItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (_name: string, jpath: string | unknown) => {
    // Force array for item/entry/category at any depth
    const jp = String(jpath);
    return (
      jp === "rss.channel.item" ||
      jp === "feed.entry" ||
      /\.category$/.test(jp)
    );
  },
});

export function parseRssFeed(xml: string): RssFeed {
  try {
    const doc = parser.parse(xml);
    if (doc.rss?.channel) return parseRss2(doc.rss.channel);
    if (doc.feed) return parseAtom(doc.feed);
    return { title: "", link: "", description: "", items: [] };
  } catch {
    return { title: "", link: "", description: "", items: [] };
  }
}

function parseRss2(channel: Record<string, unknown>): RssFeed {
  const rawItems = (channel.item ?? []) as Record<string, unknown>[];
  const items = rawItems.map((item): RssFeedItem => ({
    title: String(item.title ?? ""),
    link: String(item.link ?? ""),
    description: truncate(stripHtml(String(item.description ?? "")), 200),
    pubDate: item.pubDate ? String(item.pubDate) : null,
    guid: String(
      (item.guid as Record<string, unknown>)?.["#text"] ??
      item.guid ??
      item.link ??
      "",
    ),
    categories: extractCategories(item.category),
  }));

  return {
    title: String(channel.title ?? ""),
    link: String(channel.link ?? ""),
    description: String(channel.description ?? ""),
    items,
  };
}

function parseAtom(feed: Record<string, unknown>): RssFeed {
  const rawEntries = (feed.entry ?? []) as Record<string, unknown>[];
  const entries = rawEntries.map((entry): RssFeedItem => {
    const link = entry.link as Record<string, unknown> | undefined;
    const categories = entry.category as Record<string, unknown>[] | undefined;

    return {
      title: String(entry.title ?? ""),
      link: String(link?.["@_href"] ?? entry.link ?? ""),
      description: truncate(
        stripHtml(String(entry.summary ?? entry.content ?? "")),
        200,
      ),
      pubDate: (entry.published ?? entry.updated ?? null) as string | null,
      guid: String(entry.id ?? link?.["@_href"] ?? ""),
      categories: categories
        ? categories.map((c) => String(c["@_term"] ?? c)).filter(Boolean)
        : [],
    };
  });

  const feedLink = feed.link as Record<string, unknown> | undefined;
  return {
    title: String(feed.title ?? ""),
    link: String(feedLink?.["@_href"] ?? ""),
    description: String(feed.subtitle ?? ""),
    items: entries,
  };
}

function extractCategories(raw: unknown): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((c) => String((c as Record<string, unknown>)?.["#text"] ?? c ?? ""))
    .filter(Boolean);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

// ---------------------------------------------------------------------------
// Subscribe-time feed validation
// ---------------------------------------------------------------------------

export type FeedValidationResult =
  | { ok: true; feed: { title?: string; items: RssFeedItem[] } }
  | { ok: false; reason: "parse_error" | "network_error"; message: string };

/**
 * Probe a URL to check whether it serves a recognizable RSS/Atom feed.
 * Uses the same SSRF-protected fetch as the sync path.
 *
 * Rejection criteria:
 *  - Network/fetch failures → `network_error` (retriable)
 *  - No recognizable feed structure (no title AND no link) → `parse_error` (definitive)
 *
 * Feeds with zero items are accepted — a new/quiet feed is still valid.
 */
export async function validateFeedUrl(
  url: string,
): Promise<FeedValidationResult> {
  let xml: string;
  try {
    xml = await fetchFeedSafe(url);
  } catch (error) {
    return {
      ok: false,
      reason: "network_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const feed = parseRssFeed(xml);

  // A valid feed must have at least a title or a link — this distinguishes
  // a real feed (even an empty one) from an HTML page or random XML.
  if (!feed.title && !feed.link) {
    return {
      ok: false,
      reason: "parse_error",
      message: "No recognizable RSS or Atom feed structure found.",
    };
  }

  return {
    ok: true,
    feed: {
      title: feed.title || undefined,
      items: feed.items,
    },
  };
}
