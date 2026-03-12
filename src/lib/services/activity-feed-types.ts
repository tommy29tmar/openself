export type FeedItemType =
  | "connector_sync"
  | "connector_error"
  | "conformity_proposal"
  | "soul_proposal"
  | "episodic_pattern";

export type FeedCategory = "informational" | "actionable";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  category: FeedCategory;
  connectorType?: string;
  title: string;
  createdAt: string;
  status?: string;
  detail: FeedItemDetail;
}

export type FeedItemDetail =
  | SyncDetail
  | SyncErrorDetail
  | ConformityDetail
  | SoulDetail
  | EpisodicDetail;

export interface SyncDetail {
  type: "connector_sync";
  connectorType: string;
  factsCreated: number;
  factsUpdated: number;
  eventsCreated: number;
}

export interface SyncErrorDetail {
  type: "connector_error";
  connectorType: string;
  error: string;
  lastSuccessfulSync: string | null;
}

export interface ConformityDetail {
  type: "conformity_proposal";
  proposalId: number;
  sectionType: string;
  severity: string;
  reason: string;
  currentContent: string;
  proposedContent: string;
}

export interface SoulDetail {
  type: "soul_proposal";
  proposalId: string;
  proposedOverlay: Record<string, unknown>;
  reason: string | null;
}

export interface EpisodicDetail {
  type: "episodic_pattern";
  proposalId: string;
  actionType: string;
  patternSummary: string;
  eventCount: number;
}
