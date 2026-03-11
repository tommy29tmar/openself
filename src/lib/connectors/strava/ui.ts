import type { ConnectorUIDefinition } from "../types";

export const StravaUIDefinition: ConnectorUIDefinition = {
  id: "strava",
  displayName: "Strava",
  description:
    "Import your fitness activities — runs, rides, and personal records",
  authType: "oauth",
  connectUrl: "/api/connectors/strava/connect",
  syncUrl: "/api/connectors/strava/sync",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};
