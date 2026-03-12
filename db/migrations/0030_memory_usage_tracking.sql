-- db/migrations/0030_memory_usage_tracking.sql
-- Adds usage tracking column for T3 meta-memory scoring enhancement.
-- last_referenced_at: updated async post-turn when memory appears in agent context.
ALTER TABLE agent_memory ADD COLUMN last_referenced_at TEXT;
