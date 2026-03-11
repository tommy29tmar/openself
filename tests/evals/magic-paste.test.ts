import { describe, it, expect } from "vitest";
import { detectConnectorUrls } from "@/lib/connectors/magic-paste";

describe("detectConnectorUrls", () => {
  // Existing connectors (regression)
  it("detects GitHub URL", () => {
    const result = detectConnectorUrls("My code: https://github.com/myuser");
    expect(result).toContainEqual({ connectorId: "github", url: expect.stringContaining("github.com") });
  });

  it("detects LinkedIn URL", () => {
    const result = detectConnectorUrls("My profile: https://www.linkedin.com/in/myuser");
    expect(result).toContainEqual({ connectorId: "linkedin_zip", url: expect.stringContaining("linkedin.com") });
  });

  // New connectors
  it("detects Spotify profile URL", () => {
    const result = detectConnectorUrls("Check my music at https://open.spotify.com/user/myuser");
    expect(result).toContainEqual({ connectorId: "spotify", url: expect.stringContaining("spotify.com") });
  });

  it("detects Strava athlete URL", () => {
    const result = detectConnectorUrls("My runs: https://www.strava.com/athletes/12345");
    expect(result).toContainEqual({ connectorId: "strava", url: expect.stringContaining("strava.com") });
  });

  it("detects Strava URL without www", () => {
    const result = detectConnectorUrls("My runs: https://strava.com/athletes/12345");
    expect(result).toContainEqual({ connectorId: "strava", url: expect.stringContaining("strava.com") });
  });

  it("detects dev.to URL as RSS", () => {
    const result = detectConnectorUrls("My posts: https://dev.to/myuser");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("dev.to") });
  });

  // Pattern-based matchers
  it("detects RSS feed URLs", () => {
    const result = detectConnectorUrls("My blog: https://example.com/feed");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("/feed") });
  });

  it("detects atom.xml feed URL", () => {
    const result = detectConnectorUrls("My blog: https://example.com/atom.xml");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("/atom.xml") });
  });

  it("detects rss.xml feed URL", () => {
    const result = detectConnectorUrls("My blog: https://example.com/rss.xml");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("/rss.xml") });
  });

  it("detects /rss path URL", () => {
    const result = detectConnectorUrls("My blog: https://example.com/rss");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("/rss") });
  });

  it("detects Substack URLs", () => {
    const result = detectConnectorUrls("Read me at https://myname.substack.com");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("substack.com") });
  });

  it("detects Medium URLs", () => {
    const result = detectConnectorUrls("My articles: https://medium.com/@myuser");
    expect(result).toContainEqual({ connectorId: "rss", url: expect.stringContaining("medium.com") });
  });

  // Edge cases
  it("returns empty array for text without URLs", () => {
    const result = detectConnectorUrls("Just some text without any links");
    expect(result).toEqual([]);
  });

  it("detects multiple connector URLs in one message", () => {
    const result = detectConnectorUrls(
      "Check my GitHub https://github.com/me and Spotify https://open.spotify.com/user/me"
    );
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ connectorId: "github", url: expect.stringContaining("github.com") });
    expect(result).toContainEqual({ connectorId: "spotify", url: expect.stringContaining("spotify.com") });
  });

  it("does not duplicate when domain and pattern both match", () => {
    // dev.to is in DOMAIN_TO_CONNECTOR; should not also match pattern matchers
    const result = detectConnectorUrls("My posts: https://dev.to/myuser");
    const rssMatches = result.filter(r => r.connectorId === "rss");
    expect(rssMatches).toHaveLength(1);
  });
});
