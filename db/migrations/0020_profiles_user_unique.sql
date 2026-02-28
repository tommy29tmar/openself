-- Migration 0020: Add UNIQUE INDEX on profiles.user_id
-- Ensures one profile per user, preventing zombie state from concurrent registration retries.
-- Safely deduplicates any existing duplicate profiles before adding the constraint.

-- 1. Temp table: map duplicate profiles → canonical per user_id
CREATE TEMP TABLE _profile_remap AS
SELECT p.id AS old_id, canonical.id AS new_id
FROM profiles p
JOIN (
  SELECT user_id, MIN(rowid) AS min_rowid
  FROM profiles WHERE user_id IS NOT NULL
  GROUP BY user_id HAVING COUNT(*) > 1
) dupes ON p.user_id = dupes.user_id
JOIN profiles canonical ON canonical.rowid = dupes.min_rowid
WHERE p.rowid != dupes.min_rowid;

-- 2. Merge username: copy to canonical if canonical has NULL
UPDATE profiles SET username = (
  SELECT p2.username FROM profiles p2
  WHERE p2.id IN (SELECT old_id FROM _profile_remap WHERE new_id = profiles.id)
  AND p2.username IS NOT NULL
  ORDER BY p2.updated_at DESC
  LIMIT 1
) WHERE id IN (SELECT DISTINCT new_id FROM _profile_remap)
  AND username IS NULL;

-- 3. Dedup facts before remap.
--    Among all facts that will end up with the same (target_profile_id, category, key),
--    keep only the newest (by rowid).
DELETE FROM facts WHERE rowid NOT IN (
  SELECT MAX(f.rowid) FROM facts f
  LEFT JOIN _profile_remap r ON f.profile_id = r.old_id
  WHERE COALESCE(r.new_id, f.profile_id) IN (
    SELECT DISTINCT new_id FROM _profile_remap
  )
  GROUP BY COALESCE(r.new_id, f.profile_id), f.category, f.key
)
AND profile_id IN (
  SELECT old_id FROM _profile_remap
  UNION
  SELECT new_id FROM _profile_remap
);

-- 4. Dedup media_assets avatars before remap.
DELETE FROM media_assets WHERE rowid NOT IN (
  SELECT MAX(m.rowid) FROM media_assets m
  LEFT JOIN _profile_remap r ON m.profile_id = r.old_id
  WHERE m.kind = 'avatar'
  AND COALESCE(r.new_id, m.profile_id) IN (
    SELECT DISTINCT new_id FROM _profile_remap
  )
  GROUP BY COALESCE(r.new_id, m.profile_id)
)
AND kind = 'avatar'
AND profile_id IN (
  SELECT old_id FROM _profile_remap
  UNION
  SELECT new_id FROM _profile_remap
);

-- 5. Remap FK: sessions.profile_id
UPDATE sessions SET profile_id = (
  SELECT new_id FROM _profile_remap WHERE old_id = sessions.profile_id
) WHERE profile_id IN (SELECT old_id FROM _profile_remap);

-- 6. Remap logical references (no FK, conflict-free after dedup)
UPDATE facts SET profile_id = (
  SELECT new_id FROM _profile_remap WHERE old_id = facts.profile_id
) WHERE profile_id IN (SELECT old_id FROM _profile_remap);

UPDATE page SET profile_id = (
  SELECT new_id FROM _profile_remap WHERE old_id = page.profile_id
) WHERE profile_id IN (SELECT old_id FROM _profile_remap);

UPDATE messages SET profile_id = (
  SELECT new_id FROM _profile_remap WHERE old_id = messages.profile_id
) WHERE profile_id IN (SELECT old_id FROM _profile_remap);

UPDATE agent_config SET profile_id = (
  SELECT new_id FROM _profile_remap WHERE old_id = agent_config.profile_id
) WHERE profile_id IN (SELECT old_id FROM _profile_remap);

UPDATE media_assets SET profile_id = (
  SELECT new_id FROM _profile_remap WHERE old_id = media_assets.profile_id
) WHERE profile_id IN (SELECT old_id FROM _profile_remap);

-- 7. Delete duplicate profiles (all references merged + remapped)
DELETE FROM profiles WHERE id IN (SELECT old_id FROM _profile_remap);

-- 8. Cleanup
DROP TABLE _profile_remap;

-- 9. Partial unique index (NULL user_id allowed for anonymous profiles)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique ON profiles(user_id)
  WHERE user_id IS NOT NULL;
