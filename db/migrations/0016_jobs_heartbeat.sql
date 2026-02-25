-- 0016_jobs_heartbeat.sql
-- Sub-Phase 5: Worker Process + Heartbeat Engine
-- Rebuilds jobs table with new CHECK constraints (CREATE→INSERT→RENAME pattern).
-- Adds heartbeat_runs, heartbeat_config, trust_ledger, fact_conflicts tables.

-- 1. Create new jobs table with expanded job_type CHECK
CREATE TABLE IF NOT EXISTS jobs_new (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep',
    'connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate data with CASE mapping
INSERT INTO jobs_new(id, job_type, payload, status, run_after, attempts, last_error, created_at, updated_at)
SELECT id,
  CASE
    WHEN job_type = 'heartbeat' THEN 'heartbeat_light'
    WHEN job_type IN ('connector_sync','page_regen','taxonomy_review',
                       'page_synthesis','memory_summary','soul_proposal','expire_proposals')
         THEN job_type
    ELSE 'legacy_unknown' END,
  payload,
  CASE status
    WHEN 'done' THEN 'completed'
    WHEN 'error' THEN 'failed'
    WHEN 'queued' THEN 'queued'
    WHEN 'running' THEN 'failed'
    ELSE 'failed' END,
  run_after, attempts, last_error, created_at, updated_at
FROM jobs;

-- 3. Drop old, rename new
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

-- Dedup index: one queued/running job per (job_type, ownerKey) pair
CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_dedup
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status IN ('queued', 'running');

-- Heartbeat runs: audit log for each heartbeat execution
CREATE TABLE IF NOT EXISTS heartbeat_runs (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK(run_type IN ('light','deep')),
  owner_day TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'ok' CHECK(outcome IN ('ok','action_taken','error','budget_exceeded')),
  proposals TEXT DEFAULT '{}',
  estimated_cost_usd REAL DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  model TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_owner_day
  ON heartbeat_runs(owner_key, owner_day);

-- Heartbeat config: per-owner settings
CREATE TABLE IF NOT EXISTS heartbeat_config (
  owner_key TEXT PRIMARY KEY,
  light_budget_daily_usd REAL DEFAULT 0.10,
  deep_budget_daily_usd REAL DEFAULT 0.25,
  timezone TEXT DEFAULT 'UTC',
  light_interval_hours INTEGER DEFAULT 24,
  deep_interval_hours INTEGER DEFAULT 168,
  enabled INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trust ledger: audit trail for all cognitive actions
CREATE TABLE IF NOT EXISTS trust_ledger (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_id TEXT,
  details TEXT DEFAULT '{}',
  undo_payload TEXT,
  reversed INTEGER DEFAULT 0,
  reversed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_owner
  ON trust_ledger(owner_key, created_at);

-- Fact conflicts: dedicated table for conflicting facts
CREATE TABLE IF NOT EXISTS fact_conflicts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  fact_a_id TEXT NOT NULL,
  fact_b_id TEXT,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  resolution TEXT,
  source_a TEXT,
  source_b TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_fact_conflicts_owner_open
  ON fact_conflicts(owner_key, status) WHERE status = 'open';
