-- Fix connector fact categories: interest → music/activity
-- Must run BEFORE new mapper code syncs to prevent duplicate rows.
-- Unique constraint: (session_id, category, key)
-- Guards: WHERE NOT EXISTS prevents violation if target row already exists.

-- Spotify artists: interest → music
-- Guard uses profile_id (not session_id) because there are TWO unique constraints:
--   1. (session_id, category, key) — inline from migration 0006
--   2. (profile_id, category, key) — uniq_facts_profile_category_key from migration 0010
-- Using profile_id covers both constraints (same profile = at most one connector session).
UPDATE facts SET category = 'music', updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'sp-artist-%'
  AND archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facts f2
    WHERE f2.profile_id = facts.profile_id
      AND f2.category = 'music'
      AND f2.key = facts.key
  );

-- Spotify tracks: interest → music
UPDATE facts SET category = 'music', updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'sp-track-%'
  AND archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facts f2
    WHERE f2.profile_id = facts.profile_id
      AND f2.category = 'music'
      AND f2.key = facts.key
  );

-- Spotify genres: archive (no longer mapped)
UPDATE facts SET archived_at = datetime('now'), updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'sp-genre-%'
  AND archived_at IS NULL;

-- Strava activities: interest → activity
UPDATE facts SET category = 'activity', updated_at = datetime('now')
WHERE category = 'interest'
  AND key LIKE 'strava-%'
  AND json_extract(value, '$.type') = 'sport'
  AND archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM facts f2
    WHERE f2.profile_id = facts.profile_id
      AND f2.category = 'activity'
      AND f2.key = facts.key
  );

-- Upgrade all connector facts visibility: proposed → public
-- Scope: ALL connector types (GitHub, LinkedIn, RSS, Spotify, Strava)
-- Rationale: user explicitly connected each service = implicit consent for public
UPDATE facts SET visibility = 'public', updated_at = datetime('now')
WHERE source = 'connector'
  AND visibility = 'proposed'
  AND archived_at IS NULL;
