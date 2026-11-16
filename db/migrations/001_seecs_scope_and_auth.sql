-- 001: SEECS-only scope, account security, immutable audit log, reference data.
-- Safe to run on the live database (idempotent where data is involved).

-- ---------------------------------------------------------------------------
-- 1. Users: identity details + session revocation
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cms_id            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phone             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS designation       TEXT        NOT NULL DEFAULT 'STUDENT';

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_designation_ck
    CHECK (designation IN ('STUDENT', 'FACULTY', 'STAFF', 'PRINCIPAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing active accounts were created before verification existed.
UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at)
WHERE status = 'ACTIVE' AND email_verified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cms_id ON users (cms_id) WHERE cms_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. One-time codes (email verification OTP, password reset link)
--    Only a SHA-256 hash of the code is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user_purpose ON auth_codes (user_id, purpose, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_codes_reset_hash ON auth_codes (code_hash) WHERE purpose = 'PASSWORD_RESET';

-- ---------------------------------------------------------------------------
-- 3. SEECS-only scope
-- ---------------------------------------------------------------------------
INSERT INTO nust_schools (abbreviation, full_name)
VALUES ('SEECS', 'School of Electrical Engineering & Computer Science')
ON CONFLICT (abbreviation) DO NOTHING;

ALTER TABLE societies ALTER COLUMN is_nust_wide SET DEFAULT FALSE;

UPDATE societies
SET school_id = (SELECT id FROM nust_schools WHERE abbreviation = 'SEECS'),
    is_nust_wide = FALSE
WHERE school_id IS DISTINCT FROM (SELECT id FROM nust_schools WHERE abbreviation = 'SEECS')
   OR is_nust_wide;

-- ---------------------------------------------------------------------------
-- 4. Audit log: free-text actions (new modules add new action names) and
--    append-only (NFR-09: immutable logs).
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ALTER COLUMN action TYPE TEXT USING action::TEXT;

CREATE OR REPLACE FUNCTION fn_block_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();

CREATE INDEX IF NOT EXISTS idx_audit_logs_society_created ON audit_logs (society_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Reference data (the schema-only baseline carries no rows)
-- ---------------------------------------------------------------------------
INSERT INTO event_categories (name, description) VALUES
  ('Gaming',      'Gaming tournaments and competitions'),
  ('Musical',     'Musical performances and concerts'),
  ('Hackathon',   'Coding competitions and hackathons'),
  ('Workshop',    'Educational workshops and training'),
  ('Seminar',     'Seminars and guest lectures'),
  ('Sports',      'Sports events and tournaments'),
  ('Cultural',    'Cultural festivals and celebrations'),
  ('Tech Talk',   'Technology discussions and presentations'),
  ('Networking',  'Professional networking events'),
  ('Exhibition',  'Art, science, and project exhibitions'),
  ('Competition', 'Academic and general competitions'),
  ('Social',      'Social gatherings and meetups'),
  ('Ceremony',    'Convocation, welcome and official ceremonies'),
  ('Conference',  'Conferences such as AICON')
ON CONFLICT (name) DO NOTHING;
