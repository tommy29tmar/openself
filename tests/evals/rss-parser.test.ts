import { describe, it, expect } from "vitest";
import { parseRssFeed } from "@/lib/connectors/rss/parser";

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>My Blog</title>
    <link>https://example.com</link>
    <description>A test blog</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <description>Hello world</description>
      <pubDate>Mon, 10 Mar 2026 12:00:00 GMT</pubDate>
      <guid>post-1</guid>
      <category>tech</category>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second</link>
      <description>Another post</description>
      <pubDate>Tue, 11 Mar 2026 12:00:00 GMT</pubDate>
      <guid>post-2</guid>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>My Atom Blog</title>
  <link href="https://example.com"/>
  <entry>
    <title>Atom Post</title>
    <link href="https://example.com/atom-post"/>
    <summary>Atom content</summary>
    <published>2026-03-10T12:00:00Z</published>
    <id>atom-1</id>
    <category term="science"/>
  </entry>
</feed>`;

describe("parseRssFeed", () => {
  it("parses RSS 2.0 feed", () => {
    const result = parseRssFeed(RSS_SAMPLE);
    expect(result.title).toBe("My Blog");
    expect(result.link).toBe("https://example.com");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe("First Post");
    expect(result.items[0].guid).toBe("post-1");
    expect(result.items[0].categories).toEqual(["tech"]);
  });

  it("parses Atom feed", () => {
    const result = parseRssFeed(ATOM_SAMPLE);
    expect(result.title).toBe("My Atom Blog");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Atom Post");
    expect(result.items[0].guid).toBe("atom-1");
    expect(result.items[0].categories).toEqual(["science"]);
  });

  it("returns empty items for invalid XML", () => {
    const result = parseRssFeed("not xml at all");
    expect(result.items).toHaveLength(0);
  });
});
