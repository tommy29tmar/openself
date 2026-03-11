import type { ConnectorDefinition } from "../types";
import { syncSpotify } from "./sync";

export const spotifyDefinition: ConnectorDefinition = {
  type: "spotify",
  displayName: "Spotify",
  supportsSync: true,
  supportsImport: false,
  syncFn: syncSpotify,
};
