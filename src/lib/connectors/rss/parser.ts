/**
 * RSS / Atom feed parser.
 * Supports RSS 2.0 and Atom 1.0 formats.
 * Uses fast-xml-parser for efficient XML parsing.
 */

import { XMLParser } from "fast-xml-parser";

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
  isArray: (_name, jpath) => {
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
