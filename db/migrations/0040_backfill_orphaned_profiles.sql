-- Backfill: create profile rows for any profileId in facts/page that
-- doesn't exist in profiles table (fixes phantom profile bug).
INSERT OR IGNORE INTO profiles (id, created_at, updated_at)
SELECT DISTINCT f.profile_id, datetime('now'), datetime('now')
FROM facts f
WHERE f.profile_id IS NOT NULL
  AND f.profile_id NOT IN (SELECT id FROM profiles);

-- Also fix page table orphans
INSERT OR IGNORE INTO profiles (id, created_at, updated_at)
SELECT DISTINCT p.profile_id, datetime('now'), datetime('now')
FROM page p
WHERE p.profile_id IS NOT NULL
  AND p.profile_id NOT IN (SELECT id FROM profiles);
