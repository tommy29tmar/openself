-- Episodic source tracking
ALTER TABLE episodic_events ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS idx_episodic_source
  ON episodic_events(owner_key, source, event_at_unix);

-- Connector event provenance
ALTER TABLE connector_items ADD COLUMN event_id TEXT;

-- Sync observability
ALTER TABLE sync_log ADD COLUMN events_created INTEGER DEFAULT 0;
