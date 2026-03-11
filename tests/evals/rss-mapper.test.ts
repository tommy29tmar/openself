import { describe, it, expect } from "vitest";
import { mapRssFeed, mapRssEvents } from "@/lib/connectors/rss/mapper";
import type { RssFeed } from "@/lib/connectors/rss/parser";

const feed: RssFeed = {
  title: "My Blog",
  link: "https://example.com",
  description: "A test blog",
  items: [
    { title: "Post 1", link: "https://example.com/1", description: "First", pubDate: "2026-03-10T12:00:00Z", guid: "post-1", categories: ["tech"] },
    { title: "Post 2", link: "https://example.com/2", description: "Second", pubDate: "2026-03-11T12:00:00Z", guid: "post-2", categories: ["science", "ai"] },
  ],
};

describe("mapRssFeed", () => {
  it("maps feed to facts", () => {
    const facts = mapRssFeed(feed, "https://example.com/feed");
    expect(facts.some((f) => f.category === "social" && f.key === "rss-feed")).toBe(true);
    expect(facts.some((f) => f.category === "stat" && f.key === "rss-posts")).toBe(true);
    const projects = facts.filter((f) => f.category === "project");
    expect(projects).toHaveLength(2);
    expect(projects[0].key).toMatch(/^rss-/);
    expect((projects[0].value as Record<string, unknown>).tags).toEqual(["tech"]);
  });
});

describe("mapRssEvents", () => {
  it("maps feed items to episodic events", () => {
    const events = mapRssEvents(feed.items);
    expect(events).toHaveLength(2);
    expect(events[0].actionType).toBe("writing");
    expect(events[0].narrativeSummary).toContain("Post 1");
    expect(events[0].entities).toEqual(["tech"]);
    expect(events[0].externalId).toMatch(/^rss-post-/);
  });
});
