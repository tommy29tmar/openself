-- 0006_sessions_and_scoping.sql
-- Adds session isolation: sessions table + session_id on facts/page/agent_config.
-- Backward-compatible: sentinel '__default__' replaces NULL for single-user mode.

-- 1. Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL,
  username TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'registered')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sessions_username
  ON sessions(username) WHERE username IS NOT NULL;

-- Insert sentinel session for single-user / legacy data
INSERT OR IGNORE INTO sessions (id, invite_code, status)
  VALUES ('__default__', '__legacy__', 'active');

-- 2. Recreate facts with session_id + scoped uniqueness
CREATE TABLE facts_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSON NOT NULL,
  source TEXT DEFAULT 'chat',
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'proposed', 'public')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, category, key)
);
INSERT INTO facts_new (id, session_id, category, key, value, source, confidence, visibility, created_at, updated_at)
  SELECT id, '__default__', category, key, value, source, confidence, visibility, created_at, updated_at
  FROM facts;
DROP TABLE facts;
ALTER TABLE facts_new RENAME TO facts;

-- Recreate FTS (references facts)
DROP TABLE IF EXISTS facts_fts;
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
  category, key, value_text,
  content='facts',
  content_rowid='rowid'
);

-- 3. Recreate page with session_id, remove 'draft'-specific CHECK constraints
CREATE TABLE page_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
  username TEXT NOT NULL,
  config JSON NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approval_pending', 'published')),
  generated_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (status != 'published' OR username != 'draft')
);
-- Migrate: existing draft row id='draft' -> id='__default__'
INSERT INTO page_new (id, session_id, username, config, status, generated_at, updated_at)
  SELECT
    CASE WHEN id = 'draft' THEN '__default__' ELSE id END,
    '__default__',
    username, config, status, generated_at, updated_at
  FROM page;
DROP TABLE page;
ALTER TABLE page_new RENAME TO page;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_page_published
  ON page(username) WHERE status = 'published';

-- 4. Recreate agent_config with session_id, remove CHECK(id='main')
CREATE TABLE agent_config_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT '__default__' REFERENCES sessions(id),
  config JSON NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO agent_config_new (id, session_id, config, updated_at)
  SELECT
    '__default__',
    '__default__',
    config, updated_at
  FROM agent_config
  WHERE id = 'main';
DROP TABLE agent_config;
ALTER TABLE agent_config_new RENAME TO agent_config;
