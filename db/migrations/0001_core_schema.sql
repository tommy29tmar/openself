PRAGMA foreign_keys = ON;

-- Facts
CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSON NOT NULL,
    source TEXT DEFAULT 'chat',
    confidence REAL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- Taxonomy
CREATE TABLE IF NOT EXISTS category_registry (
    category TEXT PRIMARY KEY,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'deprecated')),
    created_by TEXT DEFAULT 'system' CHECK (created_by IN ('system', 'agent', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category_aliases (
    alias TEXT PRIMARY KEY,
    category TEXT NOT NULL REFERENCES category_registry(category),
    source TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversation
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Canonical operational audit stream
CREATE TABLE IF NOT EXISTS agent_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL CHECK (actor IN ('user', 'assistant', 'worker', 'connector', 'system')),
    source TEXT,
    entity_type TEXT,
    entity_id TEXT,
    payload JSON NOT NULL,
    correlation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_events_type_created
    ON agent_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_events_corr
    ON agent_events(correlation_id);

-- Page + Agent
CREATE TABLE IF NOT EXISTS page (
    id TEXT PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
    username TEXT UNIQUE NOT NULL,
    config JSON NOT NULL,
    generated_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_config (
    id TEXT PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
    config JSON NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_memory (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Connectors
CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY,
    connector_type TEXT NOT NULL,
    credentials JSON,
    config JSON,
    last_sync DATETIME,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_log (
    id TEXT PRIMARY KEY,
    connector_id TEXT NOT NULL REFERENCES connectors(id),
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
    facts_created INTEGER DEFAULT 0,
    facts_updated INTEGER DEFAULT 0,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Media
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL DEFAULT 'main',
    kind TEXT NOT NULL CHECK (kind IN ('avatar', 'gallery', 'cover')),
    storage_backend TEXT NOT NULL DEFAULT 'sqlite' CHECK (storage_backend IN ('sqlite', 'fs', 's3')),
    storage_key TEXT,
    blob_data BLOB,
    mime_type TEXT NOT NULL,
    bytes INTEGER NOT NULL CHECK (bytes >= 0),
    width INTEGER,
    height INTEGER,
    sha256 TEXT NOT NULL,
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(storage_backend, storage_key),
    CHECK (
        (storage_backend = 'sqlite' AND blob_data IS NOT NULL)
        OR (storage_backend <> 'sqlite' AND storage_key IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_avatar_per_profile
    ON media_assets(profile_id)
    WHERE kind = 'avatar';

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('heartbeat', 'connector_sync', 'page_regen', 'taxonomy_review')),
    payload JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
    run_after DATETIME NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, run_after);

-- LLM usage and limits
CREATE TABLE IF NOT EXISTS llm_usage_daily (
    day TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    PRIMARY KEY(day, provider, model)
);

CREATE TABLE IF NOT EXISTS llm_limits (
    id TEXT PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
    daily_token_limit INTEGER DEFAULT 150000,
    monthly_cost_limit_usd REAL DEFAULT 25.0,
    daily_cost_warning_usd REAL DEFAULT 1.0,
    daily_cost_hard_limit_usd REAL DEFAULT 2.0,
    warning_thresholds_json TEXT DEFAULT '[0.5,0.75,0.9,1.0]',
    heartbeat_call_limit INTEGER DEFAULT 3,
    hard_stop BOOLEAN DEFAULT TRUE,
    warning_cooldown_minutes INTEGER DEFAULT 60,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO llm_limits (id) VALUES ('main');

-- FTS index (semantic vec index can be added later in Phase 1 when sqlite-vec is enabled)
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
    category, key, value_text,
    content='facts',
    content_rowid='rowid'
);
