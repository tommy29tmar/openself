import type { ConnectorDefinition } from "../types";
import { syncGitHub } from "./sync";

export const githubDefinition: ConnectorDefinition = {
  type: "github",
  displayName: "GitHub",
  supportsSync: true,
  supportsImport: false,
  syncFn: syncGitHub,
};
