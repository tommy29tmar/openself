import type { ConnectorDefinition } from "../types";
import { syncRss } from "./sync";

export const rssDefinition: ConnectorDefinition = {
  type: "rss",
  displayName: "RSS / Blog",
  supportsSync: true,
  supportsImport: false,
  syncFn: syncRss,
};
