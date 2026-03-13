-- Add last_message_at to sessions for TTL-based session activity detection.
-- Backfill from most recent message per session.

ALTER TABLE sessions ADD COLUMN last_message_at TEXT;

UPDATE sessions SET last_message_at = (
  SELECT MAX(created_at) FROM messages WHERE messages.session_id = sessions.id
);
