-- Fix v1-format Strava facts: totalDistance → distanceKm, totalTime → timeHrs
-- Double guard: only touch facts that have old field AND lack new field
-- Same json_set(json_remove(...)) pattern proven in migration 0033
UPDATE facts
SET value = json_set(
  json_remove(json_remove(value, '$.totalDistance'), '$.totalTime'),
  '$.distanceKm', json_extract(value, '$.totalDistance'),
  '$.timeHrs', json_extract(value, '$.totalTime')
)
WHERE category = 'activity'
  AND key LIKE 'strava-%'
  AND json_extract(value, '$.totalDistance') IS NOT NULL
  AND json_extract(value, '$.distanceKm') IS NULL;
