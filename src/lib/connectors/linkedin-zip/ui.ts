import type { ConnectorUIDefinition } from "../types";

export const LinkedInUIDefinition: ConnectorUIDefinition = {
  id: "linkedin_zip",
  displayName: "LinkedIn",
  description: "Import your work experience and education from a LinkedIn data export.",
  authType: "zip_upload",
  importUrl: "/api/connectors/linkedin-zip/import",
  disconnectUrl: "/api/connectors/{id}/disconnect",
};
