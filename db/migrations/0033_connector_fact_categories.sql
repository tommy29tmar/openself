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

-- Spotify artists: fix value shape (name → title)
-- Old mapper stored {name, genres, url}; new mapper stores {title, note?, url}
UPDATE facts SET
  value = json_set(json_remove(value, '$.name'), '$.title', json_extract(value, '$.name')),
  updated_at = datetime('now')
WHERE key LIKE 'sp-artist-%'
  AND category = 'music'
  AND json_extract(value, '$.name') IS NOT NULL
  AND json_extract(value, '$.title') IS NULL
  AND archived_at IS NULL;

-- Spotify tracks: fix value shape (name → title)
-- Old mapper stored {name, artists[], url}; new mapper stores {title, artist(string), url}
UPDATE facts SET
  value = json_set(json_remove(value, '$.name'), '$.title', json_extract(value, '$.name')),
  updated_at = datetime('now')
WHERE key LIKE 'sp-track-%'
  AND category = 'music'
  AND json_extract(value, '$.name') IS NOT NULL
  AND json_extract(value, '$.title') IS NULL
  AND archived_at IS NULL;

-- Strava activities: add structured fields for L10N
-- Old mapper stored {name, type, description:"2 activities · 15 km · 2 hrs"}
-- New mapper stores {name, type, activityCount, distanceKm?, timeHrs?}
-- We can't reliably parse the description string back into numbers,
-- so old facts keep their description field and page-composer falls back to it.

-- Upgrade all connector facts visibility: proposed → public
-- Scope: ALL connector types (GitHub, LinkedIn, RSS, Spotify, Strava)
-- Rationale: user explicitly connected each service = implicit consent for public
UPDATE facts SET visibility = 'public', updated_at = datetime('now')
WHERE source = 'connector'
  AND visibility = 'proposed'
  AND archived_at IS NULL;
