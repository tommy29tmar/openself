-- 0012_owner_scoping.sql
-- Sub-Phase 0: Owner Identity & Scoping Safety
-- Adds schema_meta (migration versioning for leader/follower bootstrap)
-- and profile_message_usage (per-profile atomic quota for authenticated users).

-- schema_meta: key-value store for schema metadata (version, etc.)
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- profile_message_usage: per-profile message quota for authenticated users
-- profile_key = cognitiveOwnerKey (profileId for auth, sessionId for anon)
CREATE TABLE IF NOT EXISTS profile_message_usage (
  profile_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
