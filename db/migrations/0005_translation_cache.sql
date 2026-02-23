-- Translation cache: hash-based, no explicit invalidation needed.
-- When facts change → sections change → hash changes → old entries are never hit again.
CREATE TABLE IF NOT EXISTS translation_cache (
    content_hash TEXT NOT NULL,
    target_language TEXT NOT NULL,
    translated_sections TEXT NOT NULL,  -- JSON array of {sectionId, type, content}
    model TEXT,                         -- model used (e.g. "claude-haiku-4-5-20251001")
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (content_hash, target_language)
);
