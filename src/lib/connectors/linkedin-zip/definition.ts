import type { ConnectorDefinition } from "../types";

export const linkedinZipDefinition: ConnectorDefinition = {
  type: "linkedin_zip",
  displayName: "LinkedIn (ZIP Export)",
  supportsSync: false,
  supportsImport: true,
};
