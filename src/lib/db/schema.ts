import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// -- Users (auth identity)
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified").notNull().default(0),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Auth Identities (OAuth providers)
export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    providerEmail: text("provider_email"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uniq_auth_identity").on(table.provider, table.providerUserId),
  ],
);

// -- Profiles (data anchor: owns facts, pages, messages, agent_config)
export const profiles = sqliteTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    username: text("username"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("profiles_user_id_unique")
      .on(table.userId)
      .where(sql`user_id IS NOT NULL`),
  ],
);

// -- Sessions
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  inviteCode: text("invite_code").notNull(),
  username: text("username"),
  messageCount: integer("message_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  userId: text("user_id").references(() => users.id),
  profileId: text("profile_id").references(() => profiles.id),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  journeyState: text("journey_state"),
  metadata: text("metadata").notNull().default("{}"),
});

// -- Facts
export const facts = sqliteTable(
  "facts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().default("__default__"),
    profileId: text("profile_id"),
    category: text("category").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    source: text("source").default("chat"),
    confidence: real("confidence").default(1.0),
    visibility: text("visibility").default("private"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
    sortOrder: integer("sort_order").default(0),
    parentFactId: text("parent_fact_id"),
    archivedAt: text("archived_at"),
  },
  (table) => [uniqueIndex("uniq_facts_session_category_key").on(table.sessionId, table.category, table.key)],
);

// -- Taxonomy
export const categoryRegistry = sqliteTable("category_registry", {
  category: text("category").primaryKey(),
  status: text("status").default("active"),
  createdBy: text("created_by").default("system"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const categoryAliases = sqliteTable("category_aliases", {
  alias: text("alias").primaryKey(),
  category: text("category")
    .notNull()
    .references(() => categoryRegistry.category),
  source: text("source").default("system"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Conversation
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  profileId: text("profile_id"),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls", { mode: "json" }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Agent Events
export const agentEvents = sqliteTable(
  "agent_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull(),
    source: text("source"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: text("payload", { mode: "json" }).notNull(),
    correlationId: text("correlation_id"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_agent_events_type_created").on(table.eventType, table.createdAt),
    index("idx_agent_events_corr").on(table.correlationId),
  ],
);

// -- Page (two-row model: draft + published coexist)
// Draft id = session_id (e.g. '__default__' or a UUID). Published id = username.
export const page = sqliteTable("page", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().default("__default__"),
  profileId: text("profile_id"),
  username: text("username").notNull(),
  config: text("config", { mode: "json" }).notNull(),
  configHash: text("config_hash"),
  status: text("status").notNull().default("draft"),   // draft | approval_pending | published
  generatedAt: text("generated_at"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  sourceLanguage: text("source_language"),
});

// -- Agent Config
// Row id = session_id (e.g. '__default__' or a UUID).
export const agentConfig = sqliteTable("agent_config", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().default("__default__"),
  profileId: text("profile_id"),
  config: text("config", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Agent Memory (Tier 3 meta-memory)
export const agentMemory = sqliteTable(
  "agent_memory",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull().default("__default__"),
    content: text("content").notNull(),
    memoryType: text("memory_type").notNull().default("observation"),
    category: text("category"),
    contentHash: text("content_hash"),
    confidence: real("confidence").default(1.0),
    isActive: integer("is_active").notNull().default(1),
    userFeedback: text("user_feedback"),
    deactivatedAt: text("deactivated_at"),
    source: text("source").notNull().default("agent"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    lastReferencedAt: text("last_referenced_at"),
  },
  (table) => [
    index("idx_agent_memory_owner_active")
      .on(table.ownerKey, table.isActive)
      .where(sql`is_active = 1`),
  ],
);

// -- Connectors
export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey(),
  connectorType: text("connector_type").notNull(),
  credentials: text("credentials"), // AES-256-GCM ciphertext (base64 string), not JSON
  config: text("config", { mode: "json" }),
  lastSync: text("last_sync"),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  ownerKey: text("owner_key"),
  status: text("status").notNull().default("connected"),
  syncCursor: text("sync_cursor"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Connector Items (provenance tracking: external items → facts)
export const connectorItems = sqliteTable(
  "connector_items",
  {
    id: text("id").primaryKey(),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connectors.id),
    externalId: text("external_id").notNull(),
    externalHash: text("external_hash"),
    factId: text("fact_id"),
    eventId: text("event_id"),
    lastSeenAt: text("last_seen_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("uniq_connector_item").on(table.connectorId, table.externalId),
  ],
);

export const syncLog = sqliteTable("sync_log", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id")
    .notNull()
    .references(() => connectors.id),
  status: text("status").notNull(),
  factsCreated: integer("facts_created").default(0),
  factsUpdated: integer("facts_updated").default(0),
  eventsCreated: integer("events_created").default(0),
  error: text("error"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Media
export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id").notNull().default("main"),
    kind: text("kind").notNull(),
    storageBackend: text("storage_backend").notNull().default("sqlite"),
    storageKey: text("storage_key"),
    blobData: blob("blob_data"),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    visibility: text("visibility").default("private"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uniq_media_storage").on(table.storageBackend, table.storageKey),
    uniqueIndex("uniq_media_avatar_per_profile")
      .on(table.profileId)
      .where(sql`kind = 'avatar'`),
  ],
);

// -- Jobs (rebuilt in 0016 with expanded job_type CHECK)
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    jobType: text("job_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status").notNull().default("queued"),
    runAfter: text("run_after").notNull(),
    attempts: integer("attempts").default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_jobs_due").on(table.status, table.runAfter)],
);

// -- Heartbeat Runs (audit log for each heartbeat execution)
export const heartbeatRuns = sqliteTable(
  "heartbeat_runs",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    runType: text("run_type").notNull(),
    ownerDay: text("owner_day").notNull(),
    outcome: text("outcome").notNull().default("ok"),
    proposals: text("proposals", { mode: "json" }).default("{}"),
    estimatedCostUsd: real("estimated_cost_usd").default(0),
    tokensIn: integer("tokens_in").default(0),
    tokensOut: integer("tokens_out").default(0),
    model: text("model"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_heartbeat_runs_owner_day").on(table.ownerKey, table.ownerDay),
  ],
);

// -- Heartbeat Config (per-owner settings)
export const heartbeatConfig = sqliteTable("heartbeat_config", {
  ownerKey: text("owner_key").primaryKey(),
  lightBudgetDailyUsd: real("light_budget_daily_usd").default(0.1),
  deepBudgetDailyUsd: real("deep_budget_daily_usd").default(0.25),
  timezone: text("timezone").default("UTC"),
  lightIntervalHours: integer("light_interval_hours").default(24),
  deepIntervalHours: integer("deep_interval_hours").default(168),
  enabled: integer("enabled").default(1),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Trust Ledger (audit trail for all cognitive actions)
export const trustLedger = sqliteTable(
  "trust_ledger",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    actionType: text("action_type").notNull(),
    summary: text("summary").notNull(),
    entityId: text("entity_id"),
    details: text("details", { mode: "json" }).default("{}"),
    undoPayload: text("undo_payload", { mode: "json" }),
    reversed: integer("reversed").default(0),
    reversedAt: text("reversed_at"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_trust_ledger_owner").on(table.ownerKey, table.createdAt),
  ],
);

// -- Fact Conflicts (dedicated table for conflicting facts)
export const factConflicts = sqliteTable(
  "fact_conflicts",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    factAId: text("fact_a_id").notNull(),
    factBId: text("fact_b_id"),
    category: text("category").notNull(),
    key: text("key").notNull(),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    sourceA: text("source_a"),
    sourceB: text("source_b"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_fact_conflicts_owner_open")
      .on(table.ownerKey, table.status)
      .where(sql`status = 'open'`),
  ],
);

// -- LLM Usage
export const llmUsageDaily = sqliteTable(
  "llm_usage_daily",
  {
    day: text("day").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    estimatedCostUsd: real("estimated_cost_usd").default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.provider, table.model] })],
);

export const llmLimits = sqliteTable("llm_limits", {
  id: text("id").primaryKey().default("main"),
  dailyTokenLimit: integer("daily_token_limit").default(500000),
  monthlyCostLimitUsd: real("monthly_cost_limit_usd").default(25.0), // @deprecated — never enforced
  dailyCostWarningUsd: real("daily_cost_warning_usd").default(1.0),
  dailyCostHardLimitUsd: real("daily_cost_hard_limit_usd").default(2.0),
  warningThresholdsJson: text("warning_thresholds_json").default("[0.5,0.75,0.9,1.0]"), // @deprecated — never read
  heartbeatCallLimit: integer("heartbeat_call_limit").default(3), // @deprecated — never read
  hardStop: integer("hard_stop", { mode: "boolean" }).default(true),
  warningCooldownMinutes: integer("warning_cooldown_minutes").default(60), // @deprecated — never read
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Translation Cache
export const translationCache = sqliteTable("translation_cache", {
  contentHash: text("content_hash").notNull(),
  targetLanguage: text("target_language").notNull(),
  translatedSections: text("translated_sections", { mode: "json" }).notNull(),
  model: text("model"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.contentHash, table.targetLanguage] }),
]);

// -- Component Registry
export const componentRegistry = sqliteTable(
  "component_registry",
  {
    type: text("type").primaryKey(),
    namespace: text("namespace").notNull(),
    owner: text("owner").notNull(),
    status: text("status").notNull(),
    version: text("version").notNull().default("1.0.0"),
    contentSchemaHash: text("content_schema_hash"),
    rendererRef: text("renderer_ref"),
    allowedVariantsJson: text("allowed_variants_json").notNull().default("[]"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_component_registry_status").on(table.status)],
);

// -- Soul Profiles (compiled identity overlay)
export const soulProfiles = sqliteTable(
  "soul_profiles",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    version: integer("version").notNull().default(1),
    overlay: text("overlay", { mode: "json" }).notNull().default("{}"),
    compiled: text("compiled").notNull().default(""),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uniq_soul_active_per_owner")
      .on(table.ownerKey)
      .where(sql`is_active = 1`),
  ],
);

// -- Soul Change Proposals
export const soulChangeProposals = sqliteTable(
  "soul_change_proposals",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    soulProfileId: text("soul_profile_id").references(() => soulProfiles.id),
    proposedOverlay: text("proposed_overlay", { mode: "json" }).notNull().default("{}"),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_soul_proposals_owner_pending")
      .on(table.ownerKey, table.status)
      .where(sql`status = 'pending'`),
  ],
);

// -- Conversation Summaries (Tier 2 memory)
export const conversationSummaries = sqliteTable("conversation_summaries", {
  id: text("id").primaryKey(),
  ownerKey: text("owner_key").notNull().unique(),
  summary: text("summary").notNull(),
  cursorCreatedAt: text("cursor_created_at").notNull(),
  cursorMessageId: text("cursor_message_id").notNull(),
  messageCount: integer("message_count").notNull(),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  model: text("model"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Schema Meta (migration versioning for leader/follower bootstrap)
export const schemaMeta = sqliteTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Profile Message Usage (per-profile atomic quota for authenticated users)
export const profileMessageUsage = sqliteTable("profile_message_usage", {
  profileKey: text("profile_key").primaryKey(),
  count: integer("count").notNull().default(0),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// --- Section Copy (Phase 1c: Personalization) ---

export const sectionCopyCache = sqliteTable("section_copy_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  sectionType: text("section_type").notNull(),
  factsHash: text("facts_hash").notNull(),
  soulHash: text("soul_hash").notNull(),
  language: text("language").notNull(),
  personalizedContent: text("personalized_content").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const sectionCopyState = sqliteTable("section_copy_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  sectionType: text("section_type").notNull(),
  language: text("language").notNull(),
  personalizedContent: text("personalized_content").notNull(),
  factsHash: text("facts_hash").notNull(),
  soulHash: text("soul_hash").notNull(),
  approvedAt: text("approved_at").default(sql`(datetime('now'))`),
  source: text("source").notNull().default("live"),
});

export const sectionCopyProposals = sqliteTable("section_copy_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerKey: text("owner_key").notNull(),
  sectionType: text("section_type").notNull(),
  language: text("language").notNull(),
  currentContent: text("current_content").notNull(),
  proposedContent: text("proposed_content").notNull(),
  issueType: text("issue_type").notNull(),
  reason: text("reason").notNull(),
  severity: text("severity").notNull().default("low"),
  status: text("status").notNull().default("pending"),
  factsHash: text("facts_hash").notNull(),
  soulHash: text("soul_hash").notNull(),
  baselineStateHash: text("baseline_state_hash").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  reviewedAt: text("reviewed_at"),
});

// -- Episodic Events (Tier 4 — Life Logging)
export const episodicEvents = sqliteTable(
  "episodic_events",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    sessionId: text("session_id").notNull(),
    sourceMessageId: text("source_message_id"),
    deviceId: text("device_id"),
    eventAtUnix: integer("event_at_unix").notNull(),
    eventAtHuman: text("event_at_human").notNull(),
    actionType: text("action_type").notNull(),
    narrativeSummary: text("narrative_summary").notNull(),
    rawInput: text("raw_input"),
    entities: text("entities").default("[]"),
    visibility: text("visibility").notNull().default("private"),
    confidence: real("confidence").notNull().default(1.0),
    supersededBy: text("superseded_by"),
    archived: integer("archived").notNull().default(0),
    archivedAt: text("archived_at"),
    source: text("source").notNull().default("chat"),
    externalId: text("external_id"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_episodic_owner_time")
      .on(table.ownerKey, table.eventAtUnix)
      .where(sql`${table.supersededBy} IS NULL AND ${table.archived} = 0`),
    index("idx_episodic_session").on(table.sessionId),
  ],
);

// -- Episodic Pattern Proposals (Dream Cycle output)
export const episodicPatternProposals = sqliteTable(
  "episodic_pattern_proposals",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    actionType: text("action_type").notNull(),
    patternSummary: text("pattern_summary").notNull(),
    eventCount: integer("event_count").notNull().default(0),
    lastEventAtUnix: integer("last_event_at_unix").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    resolvedAt: text("resolved_at"),
    rejectionCooldownUntil: text("rejection_cooldown_until"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_episodic_proposals_owner")
      .on(table.ownerKey, table.status)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("uq_episodic_proposals_active")
      .on(table.ownerKey, table.actionType)
      .where(sql`${table.status} IN ('pending', 'accepted')`),
  ],
);
