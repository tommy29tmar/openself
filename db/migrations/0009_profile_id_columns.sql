-- Add profile_id to all data tables
ALTER TABLE facts ADD COLUMN profile_id TEXT;
ALTER TABLE page ADD COLUMN profile_id TEXT;
ALTER TABLE messages ADD COLUMN profile_id TEXT;
ALTER TABLE agent_config ADD COLUMN profile_id TEXT;

-- Bootstrap: create a profile for every existing session (id = session.id)
INSERT OR IGNORE INTO profiles (id, username, created_at)
  SELECT id, username, created_at FROM sessions;
UPDATE sessions SET profile_id = id WHERE profile_id IS NULL;

-- Backfill profile_id from session_id
UPDATE facts SET profile_id = session_id WHERE profile_id IS NULL;
UPDATE page SET profile_id = session_id WHERE profile_id IS NULL;
UPDATE messages SET profile_id = session_id WHERE profile_id IS NULL;
UPDATE agent_config SET profile_id = session_id WHERE profile_id IS NULL;

-- Indexes on profile_id (needed immediately for performance)
CREATE INDEX IF NOT EXISTS idx_facts_profile ON facts(profile_id);
CREATE INDEX IF NOT EXISTS idx_page_profile ON page(profile_id);
CREATE INDEX IF NOT EXISTS idx_messages_profile ON messages(profile_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_profile ON agent_config(profile_id);
