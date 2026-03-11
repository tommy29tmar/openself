-- Add source provenance to agent_memory and episodic_events

ALTER TABLE agent_memory ADD COLUMN source TEXT NOT NULL DEFAULT 'agent';
-- Values: 'agent' (tool call), 'worker' (session compaction)

ALTER TABLE episodic_events ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
-- Values: 'chat' (user-reported), 'github', 'linkedin', etc.

-- Add external_id column for connector dedup (stable per-event discriminator)
ALTER TABLE episodic_events ADD COLUMN external_id TEXT;
-- e.g., GitHub event ID "12345678", LinkedIn post URL hash

CREATE INDEX idx_episodic_source ON episodic_events(owner_key, source, event_at_unix);
CREATE INDEX idx_agent_memory_source ON agent_memory(owner_key, source);

-- Connector dedup: unique per source + external_id (only for non-chat events with an external ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_episodic_connector_dedup
  ON episodic_events(owner_key, source, external_id)
  WHERE source != 'chat' AND external_id IS NOT NULL;
