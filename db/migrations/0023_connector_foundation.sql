-- Connector foundation: ownership, status, idempotency
-- Extends existing connectors table, adds connector_items for provenance tracking.
-- SAFETY: connectors feature not yet live; no production sync_log data exists.

ALTER TABLE connectors ADD COLUMN owner_key TEXT;
ALTER TABLE connectors ADD COLUMN status TEXT NOT NULL DEFAULT 'connected'
  CHECK(status IN ('connected', 'paused', 'error', 'disconnected'));
ALTER TABLE connectors ADD COLUMN sync_cursor TEXT;
ALTER TABLE connectors ADD COLUMN last_error TEXT;
ALTER TABLE connectors ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

CREATE INDEX idx_connectors_owner ON connectors(owner_key) WHERE owner_key IS NOT NULL;
CREATE INDEX idx_connectors_status ON connectors(status);

CREATE TABLE connector_items (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id),
  external_id TEXT NOT NULL,
  external_hash TEXT,
  fact_id TEXT,
  last_seen_at TEXT DEFAULT (datetime('now')),
  UNIQUE(connector_id, external_id)
);

CREATE INDEX idx_connector_items_fact ON connector_items(fact_id) WHERE fact_id IS NOT NULL;

-- Safety dedup: clean FK references before removing any duplicate connector rows.
-- (Connectors feature not yet live — this is purely defensive for dev/test DBs.)
-- Step 1: delete sync_log entries pointing to duplicate (non-canonical) connector rows
DELETE FROM sync_log WHERE connector_id IN (
  SELECT id FROM connectors WHERE owner_key IS NOT NULL AND rowid NOT IN (
    SELECT MAX(rowid) FROM connectors WHERE owner_key IS NOT NULL GROUP BY owner_key, connector_type
  )
);
-- Step 2: delete duplicate connector rows (keep newest per owner+type)
DELETE FROM connectors WHERE owner_key IS NOT NULL AND rowid NOT IN (
  SELECT MAX(rowid) FROM connectors WHERE owner_key IS NOT NULL GROUP BY owner_key, connector_type
);

-- One connector per type per owner (prevents double-connect)
CREATE UNIQUE INDEX idx_connectors_owner_type ON connectors(owner_key, connector_type)
  WHERE owner_key IS NOT NULL;
