import type { ConnectorUIDefinition } from "../types";

export const RssUIDefinition: ConnectorUIDefinition = {
  id: "rss",
  displayName: "Blog / RSS",
  description: "Import posts from any RSS or Atom feed",
  authType: "url_input",
  syncUrl: "/api/connectors/rss/sync",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};
