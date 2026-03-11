const URL_PATTERN = /https?:\/\/[^\s,)>"]+/g;

const DOMAIN_TO_CONNECTOR: Record<string, string> = {
  "github.com": "github",
  "www.github.com": "github",
  "linkedin.com": "linkedin_zip",
  "www.linkedin.com": "linkedin_zip",
  "open.spotify.com": "spotify",
  "strava.com": "strava",
  "www.strava.com": "strava",
  "dev.to": "rss",
};

const PATTERN_MATCHERS: Array<{ pattern: RegExp; connectorId: string }> = [
  { pattern: /\/(feed|rss|atom\.xml|rss\.xml)$/i, connectorId: "rss" },
  { pattern: /\.substack\.com/i, connectorId: "rss" },
  { pattern: /medium\.com\/@/i, connectorId: "rss" },
];

export type DetectedConnector = {
  connectorId: string;
  url: string;
};

export function detectConnectorUrls(text: string): DetectedConnector[] {
  const urls = text.match(URL_PATTERN) ?? [];
  const results: DetectedConnector[] = [];
  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname;
      const connectorId = DOMAIN_TO_CONNECTOR[hostname];
      if (connectorId) {
        results.push({ connectorId, url });
        continue;
      }
      // Fall through to pattern matchers
      for (const { pattern, connectorId: patternConnectorId } of PATTERN_MATCHERS) {
        if (pattern.test(url)) {
          results.push({ connectorId: patternConnectorId, url });
          break;
        }
      }
    } catch { /* invalid URL */ }
  }
  return results;
}
