-- Migration 0033: Backfill connector_items for purge support
--
-- Creates connector_items rows for all connector-created facts and events
-- that aren't yet tracked. Uses facts.profile_id = connectors.owner_key join.

-- Index for event_id lookups (mirrors existing idx_connector_items_fact for fact_id)
CREATE INDEX IF NOT EXISTS idx_connector_items_event ON connector_items(event_id) WHERE event_id IS NOT NULL;

-- Phase 1: Create connector_items for orphan connector facts (all 5 connectors)
INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, fact_id, last_seen_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  c.id,
  'fact:' || f.key,
  f.id,
  datetime('now')
FROM facts f
JOIN connectors c ON c.owner_key = f.profile_id
WHERE f.source = 'connector'
  AND f.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM connector_items ci
    WHERE ci.connector_id = c.id AND ci.fact_id = f.id
  )
  AND (
    (c.connector_type = 'linkedin_zip' AND f.key LIKE 'li-%')
    OR (c.connector_type = 'github' AND (f.key LIKE 'gh-%' OR f.key = 'github-repos'))
    OR (c.connector_type = 'spotify' AND (f.key LIKE 'sp-%' OR f.key = 'spotify-profile'))
    OR (c.connector_type = 'strava' AND f.key LIKE 'strava-%')
    OR (c.connector_type = 'rss' AND f.key LIKE 'rss-%')
  );

-- Phase 2: Backfill episodic event linkage for LinkedIn events
-- LinkedIn writes events with source='linkedin_zip' but never connector_items
INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  c.id,
  'event:' || COALESCE(e.external_id, e.id),
  e.id,
  datetime('now')
FROM episodic_events e
JOIN connectors c ON c.owner_key = e.owner_key AND c.connector_type = 'linkedin_zip'
WHERE e.source = 'linkedin_zip'
  AND NOT EXISTS (
    SELECT 1 FROM connector_items ci
    WHERE ci.connector_id = c.id AND ci.event_id = e.id
  );

-- Phase 3: Backfill GitHub activity events (direct insertEvent, bypass connector_items)
INSERT OR IGNORE INTO connector_items (id, connector_id, external_id, event_id, last_seen_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  c.id,
  'event:' || COALESCE(e.external_id, e.id),
  e.id,
  datetime('now')
FROM episodic_events e
JOIN connectors c ON c.owner_key = e.owner_key AND c.connector_type = 'github'
WHERE e.source = 'github'
  AND NOT EXISTS (
    SELECT 1 FROM connector_items ci
    WHERE ci.connector_id = c.id AND ci.event_id = e.id
  );
