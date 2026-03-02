-- Smart Facts v2: parent-child relationships, soft-delete, session metadata
-- sort_order already exists from migration 0021. Only add new columns.
ALTER TABLE facts ADD COLUMN parent_fact_id TEXT;
ALTER TABLE facts ADD COLUMN archived_at TEXT;

ALTER TABLE sessions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';

CREATE INDEX idx_facts_parent ON facts(parent_fact_id) WHERE parent_fact_id IS NOT NULL;
CREATE INDEX idx_facts_active ON facts(archived_at) WHERE archived_at IS NULL;
