import type { ConnectorDefinition } from "../types";

export const githubDefinition: ConnectorDefinition = {
  type: "github",
  displayName: "GitHub",
  supportsSync: true,
  supportsImport: false,
  // syncFn will be set in Task 5 after client/mapper exist
};
