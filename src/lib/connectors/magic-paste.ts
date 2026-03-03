const URL_PATTERN = /https?:\/\/[^\s,)>"]+/g;

const DOMAIN_TO_CONNECTOR: Record<string, string> = {
  "github.com": "github",
  "www.github.com": "github",
  "linkedin.com": "linkedin_zip",
  "www.linkedin.com": "linkedin_zip",
};

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
      if (connectorId) results.push({ connectorId, url });
    } catch { /* invalid URL */ }
  }
  return results;
}
