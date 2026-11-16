-- 010: Columns the society registration form has always sent but the live table
--      never had. Without them POST /api/societies/register fails with
--      "column category of relation societies does not exist" (no society could
--      be registered since early April 2026).

ALTER TABLE societies
  ADD COLUMN IF NOT EXISTS category          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mission_statement TEXT,
  ADD COLUMN IF NOT EXISTS banner_url        TEXT;
