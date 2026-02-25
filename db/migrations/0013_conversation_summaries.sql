-- 0013_conversation_summaries.sql
-- Sub-Phase 2: Tier 2 Conversation Summaries
-- One active summary per owner (UNIQUE on owner_key).
-- Compound cursor (created_at + message_id) for CAS-safe updates.

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  cursor_created_at TEXT NOT NULL,
  cursor_message_id TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  model TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
