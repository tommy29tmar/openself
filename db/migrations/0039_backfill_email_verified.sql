-- Backfill: set email_verified=1 for existing users who have already published.
UPDATE users SET email_verified = 1
WHERE email_verified = 0
  AND id IN (
    SELECT DISTINCT p.user_id FROM profiles p
    WHERE p.username IS NOT NULL AND p.user_id IS NOT NULL
  );

-- Fallback: also check page table for users who published
UPDATE users SET email_verified = 1
WHERE email_verified = 0
  AND id IN (
    SELECT DISTINCT pr.user_id FROM profiles pr
    JOIN page pg ON pg.profile_id = pr.id
    WHERE pg.status = 'published' AND pr.user_id IS NOT NULL
  );
