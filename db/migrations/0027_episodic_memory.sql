-- db/migrations/0027_episodic_memory.sql
-- Fully transactional — no CREATE VIRTUAL TABLE.

-- 1. Rebuild jobs table with consolidate_episodes in CHECK
CREATE TABLE jobs_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_type TEXT NOT NULL CHECK(job_type IN (
    'heartbeat_light','heartbeat_deep','connector_sync','page_regen','taxonomy_review',
    'page_synthesis','memory_summary','soul_proposal','expire_proposals',
    'session_compaction','consolidate_episodes','legacy_unknown')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
  run_after TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO jobs_new SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
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

-- 2. Episodic events
CREATE TABLE episodic_events (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  source_message_id TEXT,
  device_id TEXT,
  event_at_unix INTEGER NOT NULL,
  event_at_human TEXT NOT NULL,
  action_type TEXT NOT NULL,
  narrative_summary TEXT NOT NULL,
  raw_input TEXT,
  entities TEXT DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private',
  confidence REAL NOT NULL DEFAULT 1.0,
  superseded_by TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_episodic_owner_time ON episodic_events(owner_key, event_at_unix)
  WHERE superseded_by IS NULL AND archived = 0;
CREATE INDEX idx_episodic_session ON episodic_events(session_id);

-- 3. Episodic pattern proposals
CREATE TABLE episodic_pattern_proposals (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  pattern_summary TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  last_event_at_unix INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','expired')),
  expires_at TEXT NOT NULL,
  resolved_at TEXT,
  rejection_cooldown_until TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_episodic_proposals_owner
  ON episodic_pattern_proposals(owner_key, status)
  WHERE status = 'pending';
CREATE UNIQUE INDEX uq_episodic_proposals_active
  ON episodic_pattern_proposals (owner_key, action_type)
  WHERE status IN ('pending', 'accepted');
