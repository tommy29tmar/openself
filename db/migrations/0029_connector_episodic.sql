-- Episodic source tracking
ALTER TABLE episodic_events ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS idx_episodic_source
  ON episodic_events(owner_key, source, event_at_unix);

-- Connector event provenance
ALTER TABLE connector_items ADD COLUMN event_id TEXT;

-- Sync observability
ALTER TABLE sync_log ADD COLUMN events_created INTEGER DEFAULT 0;

-- Agent memory source provenance (worker vs agent)
ALTER TABLE agent_memory ADD COLUMN source TEXT NOT NULL DEFAULT 'agent';

-- Episodic external_id for connector dedup
ALTER TABLE episodic_events ADD COLUMN external_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_memory_source ON agent_memory(owner_key, source);

-- Connector dedup: unique per source + external_id (only for non-chat events with an external ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_episodic_connector_dedup
  ON episodic_events(owner_key, source, external_id)
  WHERE source != 'chat' AND external_id IS NOT NULL;
