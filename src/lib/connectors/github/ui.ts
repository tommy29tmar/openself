import type { ConnectorUIDefinition } from "../types";

export const GitHubUIDefinition: ConnectorUIDefinition = {
  id: "github",
  displayName: "GitHub",
  description: "Import your repositories and open-source contributions.",
  authType: "oauth",
  connectUrl: "/api/connectors/github/connect",
  syncUrl: "/api/connectors/github/sync",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};
