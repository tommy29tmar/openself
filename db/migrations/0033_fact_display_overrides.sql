-- db/migrations/0033_fact_display_overrides.sql
-- Part 1: fact_display_overrides table for content curation layer.
-- Part 2: Add 'curate_page' to jobs.job_type CHECK constraint (table rebuild).

--------------------------------------------------------------------
-- Part 1 — fact_display_overrides
--------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_display_overrides (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  display_fields TEXT NOT NULL,         -- JSON: { "title": "OpenSelf" }
  fact_value_hash TEXT NOT NULL,        -- SHA256 of original fact.value JSON
  source TEXT NOT NULL DEFAULT 'agent', -- agent | worker | live
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fact_display_override
  ON fact_display_overrides(fact_id);

CREATE INDEX IF NOT EXISTS idx_fdo_owner
  ON fact_display_overrides(owner_key);

--------------------------------------------------------------------
-- Part 2 — Rebuild jobs table with curate_page in CHECK
--------------------------------------------------------------------
-- SQLite cannot ALTER CHECK constraints; full table rebuild required.
-- Includes heartbeat_at column added in migration 0031.

CREATE TABLE jobs_v2 (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','consolidate_episodes','curate_page','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  heartbeat_at TEXT
);

INSERT INTO jobs_v2 SELECT * FROM jobs;

DROP TABLE jobs;

ALTER TABLE jobs_v2 RENAME TO jobs;

-- Recreate all indexes from migration 0027
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

CREATE UNIQUE INDEX uniq_jobs_dedup_global
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status IN ('queued','running')
    AND job_type != 'session_compaction'
    AND job_type != 'consolidate_episodes';

CREATE UNIQUE INDEX uniq_jobs_dedup_compaction
  ON jobs(job_type, json_extract(payload, '$.ownerKey'), json_extract(payload, '$.sessionKey'))
  WHERE status = 'queued' AND job_type = 'session_compaction';

CREATE UNIQUE INDEX uniq_jobs_dedup_consolidate
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status = 'queued' AND job_type = 'consolidate_episodes';
