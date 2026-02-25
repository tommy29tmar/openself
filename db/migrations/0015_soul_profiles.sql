-- 0015_soul_profiles.sql
-- Sub-Phase 4: Soul Profiles
-- Soul = compiled identity overlay (voice, tone, values, self-description).
-- One active soul per owner (unique index). Change proposals with approval flow.

CREATE TABLE IF NOT EXISTS soul_profiles (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  overlay TEXT NOT NULL DEFAULT '{}',
  compiled TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Guarantee one active soul per owner
CREATE UNIQUE INDEX IF NOT EXISTS uniq_soul_active_per_owner
  ON soul_profiles(owner_key) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS soul_change_proposals (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  soul_profile_id TEXT REFERENCES soul_profiles(id),
  proposed_overlay TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','expired')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_soul_proposals_owner_pending
  ON soul_change_proposals(owner_key, status) WHERE status = 'pending';
