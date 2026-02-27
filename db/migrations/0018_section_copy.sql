-- Section copy cache (pure LLM output cache, content-addressed)
CREATE TABLE section_copy_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_key, section_type, facts_hash, soul_hash, language)
);

CREATE INDEX idx_section_cache_lookup
  ON section_copy_cache(owner_key, section_type, facts_hash, soul_hash, language);

-- Section copy state (active approved personalized copy, read by projection)
CREATE TABLE section_copy_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  personalized_content TEXT NOT NULL,
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'live',
  UNIQUE(owner_key, section_type, language)
);

CREATE INDEX idx_section_state_lookup
  ON section_copy_state(owner_key, section_type, language);

-- Section copy proposals (conformity check proposals for user review)
CREATE TABLE section_copy_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL,
  section_type TEXT NOT NULL,
  language TEXT NOT NULL,
  current_content TEXT NOT NULL,
  proposed_content TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'pending',
  facts_hash TEXT NOT NULL,
  soul_hash TEXT NOT NULL,
  baseline_state_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE INDEX idx_proposals_pending
  ON section_copy_proposals(owner_key, status);
