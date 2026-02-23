-- Restructure page table: remove CHECK(id='main'), add status column, support draft + published rows
CREATE TABLE page_new (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    config JSON NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approval_pending', 'published')),
    generated_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Invariant 1: draft row (id='draft') cannot be published
    CHECK (id != 'draft' OR status != 'published'),
    -- Invariant 2: non-draft rows can only be published
    CHECK (id = 'draft' OR status = 'published'),
    -- Invariant 3: username "draft" is reserved — nobody can publish with this username
    CHECK (status != 'published' OR username != 'draft')
);

-- Retrocompatibility: existing rows become published (they were already live)
INSERT INTO page_new (id, username, config, status, generated_at, updated_at)
    SELECT username, username, config, 'published', generated_at, updated_at
    FROM page;

-- Also create a draft copy from existing rows
INSERT OR IGNORE INTO page_new (id, username, config, status, generated_at, updated_at)
    SELECT 'draft', username, config, 'draft', generated_at, updated_at
    FROM page;

DROP TABLE page;
ALTER TABLE page_new RENAME TO page;

-- Partial unique index: only one published row per username
CREATE UNIQUE INDEX IF NOT EXISTS uniq_page_published
    ON page(username) WHERE status = 'published';
