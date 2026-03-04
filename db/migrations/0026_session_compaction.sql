-- 0026_session_compaction.sql — NO BEGIN/COMMIT (migrator wraps in transaction)

-- 1. Rebuild jobs table with session_compaction in CHECK
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO jobs_new (id, job_type, payload, status, run_after, attempts, last_error, created_at, updated_at)
  SELECT id, job_type, payload, status, run_after, attempts, last_error, created_at, updated_at FROM jobs;

DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX idx_jobs_due ON jobs(status, run_after);

-- 2. Per-type dedup indexes
CREATE UNIQUE INDEX uniq_jobs_dedup_global
  ON jobs(job_type, json_extract(payload, '$.ownerKey'))
  WHERE status IN ('queued','running') AND job_type != 'session_compaction';

-- NOTE: session_compaction dedup covers only 'queued' (not 'running') so a running job
-- can enqueue the next continuation without conflicting with itself.
CREATE UNIQUE INDEX uniq_jobs_dedup_compaction
  ON jobs(job_type, json_extract(payload, '$.ownerKey'), json_extract(payload, '$.sessionKey'))
  WHERE status = 'queued' AND job_type = 'session_compaction';

-- 3. Index on messages(session_id) for efficient cursor-based queries
-- NOTE: SQLite rowid is a pseudo-column — cannot be used in CREATE INDEX, but IS usable in WHERE clauses.
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- 4. Session compaction audit log with rowid-based cursor
CREATE TABLE IF NOT EXISTS session_compaction_log (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  session_key TEXT NOT NULL,
  cursor_rowid INTEGER NOT NULL,   -- last rowid of processed message window
  facts_extracted INTEGER NOT NULL DEFAULT 0,
  facts_updated INTEGER NOT NULL DEFAULT 0,
  patterns_detected INTEGER NOT NULL DEFAULT 0,
  structured_summary TEXT,
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','skipped','error')),
  error TEXT,
  error_code TEXT,   -- 'json_parse_failure' | 'schema_validation_failure' | 'transient' | NULL
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compaction_log_session ON session_compaction_log(session_key, cursor_rowid DESC);
