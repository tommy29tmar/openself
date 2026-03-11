import type { ConnectorDefinition } from "../types";
import { syncStrava } from "./sync";

export const stravaDefinition: ConnectorDefinition = {
  type: "strava",
  displayName: "Strava",
  supportsSync: true,
  supportsImport: false,
  syncFn: syncStrava,
};
