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

// -- Sessions
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  inviteCode: text("invite_code").notNull(),
  username: text("username"),
  messageCount: integer("message_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Facts
export const facts = sqliteTable(
  "facts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().default("__default__"),
    category: text("category").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    source: text("source").default("chat"),
    confidence: real("confidence").default(1.0),
    visibility: text("visibility").default("private"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
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
  username: text("username").notNull(),
  config: text("config", { mode: "json" }).notNull(),
  status: text("status").notNull().default("draft"),   // draft | approval_pending | published
  generatedAt: text("generated_at"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Agent Config
// Row id = session_id (e.g. '__default__' or a UUID).
export const agentConfig = sqliteTable("agent_config", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().default("__default__"),
  config: text("config", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Agent Memory
export const agentMemory = sqliteTable("agent_memory", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// -- Connectors
export const connectors = sqliteTable("connectors", {
  id: text("id").primaryKey(),
  connectorType: text("connector_type").notNull(),
  credentials: text("credentials", { mode: "json" }),
  config: text("config", { mode: "json" }),
  lastSync: text("last_sync"),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const syncLog = sqliteTable("sync_log", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id")
    .notNull()
    .references(() => connectors.id),
  status: text("status").notNull(),
  factsCreated: integer("facts_created").default(0),
  factsUpdated: integer("facts_updated").default(0),
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

// -- Jobs
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
  dailyTokenLimit: integer("daily_token_limit").default(150000),
  monthlyCostLimitUsd: real("monthly_cost_limit_usd").default(25.0),
  dailyCostWarningUsd: real("daily_cost_warning_usd").default(1.0),
  dailyCostHardLimitUsd: real("daily_cost_hard_limit_usd").default(2.0),
  warningThresholdsJson: text("warning_thresholds_json").default("[0.5,0.75,0.9,1.0]"),
  heartbeatCallLimit: integer("heartbeat_call_limit").default(3),
  hardStop: integer("hard_stop", { mode: "boolean" }).default(true),
  warningCooldownMinutes: integer("warning_cooldown_minutes").default(60),
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
