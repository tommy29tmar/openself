-- db/migrations/0031_job_heartbeat.sql
-- Adds heartbeat_at column to jobs table for stale job detection.
-- connector_sync jobs update this every 30s; jobs with no heartbeat
-- for 10+ minutes are considered stale and recovered automatically.
ALTER TABLE jobs ADD COLUMN heartbeat_at TEXT;
