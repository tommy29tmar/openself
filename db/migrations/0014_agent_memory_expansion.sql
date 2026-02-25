-- 0014_agent_memory_expansion.sql
-- Sub-Phase 3: Tier 3 Meta-Memory
-- Expands agent_memory with owner_key, memory_type, category, content_hash,
-- confidence, is_active, user_feedback, deactivated_at.

-- Add new columns to agent_memory
ALTER TABLE agent_memory ADD COLUMN owner_key TEXT NOT NULL DEFAULT '__default__';
ALTER TABLE agent_memory ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'observation'
  CHECK(memory_type IN ('observation','preference','insight','pattern'));
ALTER TABLE agent_memory ADD COLUMN category TEXT DEFAULT NULL;
ALTER TABLE agent_memory ADD COLUMN content_hash TEXT;
ALTER TABLE agent_memory ADD COLUMN confidence REAL DEFAULT 1.0;
ALTER TABLE agent_memory ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_memory ADD COLUMN user_feedback TEXT DEFAULT NULL
  CHECK(user_feedback IS NULL OR user_feedback IN ('helpful','wrong'));
ALTER TABLE agent_memory ADD COLUMN deactivated_at DATETIME DEFAULT NULL;

-- Index for active memories per owner
CREATE INDEX IF NOT EXISTS idx_agent_memory_owner_active
  ON agent_memory(owner_key, is_active) WHERE is_active = 1;

-- Index for content dedup
CREATE INDEX IF NOT EXISTS idx_agent_memory_content_hash
  ON agent_memory(owner_key, content_hash) WHERE content_hash IS NOT NULL;
