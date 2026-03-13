export type ConnectorType = "github" | "linkedin_zip" | "rss" | "spotify" | "strava";

export type ConnectorStatus = "connected" | "paused" | "error" | "disconnected";

export type SyncResult = {
  factsCreated: number;
  factsUpdated: number;
  factsArchived?: number;
  eventsCreated: number;
  error?: string;
};

export type ConnectorDefinition = {
  type: string;
  displayName: string;
  supportsSync: boolean; // periodic worker sync (GitHub)
  supportsImport: boolean; // one-shot import (LinkedIn ZIP)
  syncFn?: (connectorId: string, ownerKey: string) => Promise<SyncResult>;
  eventMapperFn?: (ctx: EventMapperContext) => Promise<EpisodicEventInput[]>;
};

export type EventMapperContext = {
  connectorType: string;
  connectorId: string;
  ownerKey: string;
  syncCursor?: string;
  rawData?: unknown;
};

export type EpisodicEventInput = {
  externalId: string;   // MUST use event-namespaced form: "repo-{nodeId}", "activity-{id}", "pr-{id}"
  eventAtUnix: number;
  eventAtHuman: string;
  actionType: string;
  narrativeSummary: string;
  entities?: string[];
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
  factsClustered?: number;  // NEW — optional
  errors: Array<{ file?: string; key?: string; reason: string }>;
  createdFacts: Array<{ key: string; factId: string }>;
};

export type ConnectorStatusRow = {
  id: string;
  connectorType: string;
  status: string;
  enabled: boolean;
  lastSync: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Episodic event input for connector dual-write.
 * Connectors write notable discrete events to episodic memory (Tier 4).
 */
export type ConnectorEpisodicInput = {
  actionType: string;
  eventAtUnix: number;
  eventAtHuman: string;
  narrativeSummary: string;
  entities?: string[];
  source: string; // 'github', 'linkedin', etc.
};

export type ConnectorUIDefinition = {
  id: string;
  displayName: string;
  description: string;
  authType: "oauth" | "zip_upload" | "url_input";
  connectUrl?: string;
  importUrl?: string;
  syncUrl?: string;
  disconnectUrl: string;
};
