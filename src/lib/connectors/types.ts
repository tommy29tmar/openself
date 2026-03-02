export type ConnectorType = "github" | "linkedin_zip";

export type ConnectorStatus = "connected" | "paused" | "error" | "disconnected";

export type SyncResult = {
  factsCreated: number;
  factsUpdated: number;
  error?: string;
};

export type ConnectorDefinition = {
  type: string;
  displayName: string;
  supportsSync: boolean; // periodic worker sync (GitHub)
  supportsImport: boolean; // one-shot import (LinkedIn ZIP)
  syncFn?: (connectorId: string, ownerKey: string) => Promise<SyncResult>;
};

export type ConnectorRow = {
  id: string;
  connectorType: string;
  ownerKey: string | null;
  status: ConnectorStatus;
  credentials: string | null; // AES-256-GCM ciphertext (base64)
  config: Record<string, unknown> | null;
  syncCursor: string | null;
  lastSync: string | null;
  lastError: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ImportReport = {
  factsWritten: number;
  factsSkipped: number;
  errors: Array<{ file?: string; key?: string; reason: string }>;
};
