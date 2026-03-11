import type { ConnectorUIDefinition } from "./types";
import { GitHubUIDefinition } from "./github/ui";
import { LinkedInUIDefinition } from "./linkedin-zip/ui";
import { SpotifyUIDefinition } from "./spotify/ui";
import { StravaUIDefinition } from "./strava/ui";
import { RssUIDefinition } from "./rss/ui";

const uiRegistry = new Map<string, ConnectorUIDefinition>();

export function registerConnectorUI(def: ConnectorUIDefinition): void {
  uiRegistry.set(def.id, def);
}

export function listConnectorUIs(): ConnectorUIDefinition[] {
  return [...uiRegistry.values()];
}

// Register built-in connectors
registerConnectorUI(GitHubUIDefinition);
registerConnectorUI(LinkedInUIDefinition);
registerConnectorUI(SpotifyUIDefinition);
registerConnectorUI(StravaUIDefinition);
registerConnectorUI(RssUIDefinition);
