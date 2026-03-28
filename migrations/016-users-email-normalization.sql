-- ============================================================================
-- 016: Users Email Normalization + Case-Insensitive Uniqueness
-- Purpose:
--   1) Normalize all existing users.email values to lowercase/trimmed form
--   2) Safely de-duplicate case-variant collisions by deprovisioning secondary rows
--   3) Enforce normalization on every future write
--   4) Enforce case-insensitive uniqueness at the database layer
-- ============================================================================

BEGIN;

WITH ranked AS (
  SELECT
    id,
    email,
    LOWER(BTRIM(email)) AS normalized_email,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(BTRIM(email))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM users
)
UPDATE users u
SET
  email = CASE
    WHEN r.rn = 1 THEN r.normalized_email
    ELSE 'dedup+' || u.id::text || '@deactivated.local'
  END,
  status = CASE
    WHEN r.rn = 1 THEN u.status
    ELSE 'SUSPENDED'
  END
FROM ranked r
WHERE u.id = r.id
  AND (
    u.email IS DISTINCT FROM CASE
      WHEN r.rn = 1 THEN r.normalized_email
      ELSE 'dedup+' || u.id::text || '@deactivated.local'
    END
    OR (r.rn > 1 AND u.status <> 'SUSPENDED')
  );

CREATE OR REPLACE FUNCTION normalize_users_email_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := LOWER(BTRIM(NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_users_email ON users;
CREATE TRIGGER trg_normalize_users_email
BEFORE INSERT OR UPDATE OF email ON users
FOR EACH ROW
EXECUTE FUNCTION normalize_users_email_fn();

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_lowercase_ck;

ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase_ck
  CHECK (email = LOWER(BTRIM(email)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
  ON users ((LOWER(BTRIM(email))));

COMMIT;
