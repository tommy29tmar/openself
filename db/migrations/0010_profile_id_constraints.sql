-- Deduplicate: keep only the most recent record per (profile_id, category, key)
-- Required before creating the unique index
DELETE FROM facts WHERE rowid NOT IN (
  SELECT rowid FROM (
    SELECT rowid, ROW_NUMBER() OVER (
      PARTITION BY profile_id, category, key
      ORDER BY updated_at DESC
    ) AS rn
    FROM facts
    WHERE profile_id IS NOT NULL
  ) WHERE rn = 1
);

-- Unique constraint on profile_id for facts
CREATE UNIQUE INDEX IF NOT EXISTS uniq_facts_profile_category_key ON facts(profile_id, category, key);
