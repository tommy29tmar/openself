-- Presence System: schema registration only.
-- PageConfig is stored as JSON in the `config` column so no DDL changes needed
-- for surface/voice/light fields — they live inside the JSON blob.
-- Data cleanup is handled by scripts/cleanup-presence-reset.ts (run separately).

-- This migration intentionally contains no DDL changes.
-- It is a version marker for the migration system.
SELECT 1; -- no-op to satisfy migration runner
