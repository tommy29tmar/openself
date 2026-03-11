import type { ConnectorUIDefinition } from "../types";

export const SpotifyUIDefinition: ConnectorUIDefinition = {
  id: "spotify",
  displayName: "Spotify",
  description: "Import your music taste — top artists, tracks, and genres",
  authType: "oauth",
  connectUrl: "/api/connectors/spotify/connect",
  syncUrl: "/api/connectors/spotify/sync",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};
