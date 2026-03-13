-- 0035_fact_clusters.sql
-- Fact clustering: groups related facts from different sources

---------------------------------------------------------------------
-- Part 1 — fact_clusters table
---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_clusters (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  category TEXT NOT NULL,
  canonical_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fact_clusters_owner
  ON fact_clusters(owner_key);

CREATE INDEX IF NOT EXISTS idx_fact_clusters_owner_category
  ON fact_clusters(owner_key, category);

-- Add cluster_id column to facts table (ON DELETE SET NULL for self-healing FK)
ALTER TABLE facts ADD COLUMN cluster_id TEXT REFERENCES fact_clusters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facts_cluster_id
  ON facts(cluster_id) WHERE cluster_id IS NOT NULL;

---------------------------------------------------------------------
-- Part 2 — Rebuild jobs table with consolidate_facts in CHECK
---------------------------------------------------------------------
-- SQLite cannot ALTER CHECK constraints; full table rebuild required.
-- Same pattern as migration 0033.

CREATE TABLE jobs_v2 (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','consolidate_episodes','curate_page','consolidate_facts','legacy_unknown')),
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

-- Recreate ALL indexes from migration 0033 (critical for job dedup)
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
