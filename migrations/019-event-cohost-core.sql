-- ==========================================================================
-- Migration 019: Event co-host core workflow
-- Adds first-class co-host rows + request metadata extensions.
-- ============================================================================

-- 1) Materialized co-host relationships per event
CREATE TABLE IF NOT EXISTS event_cohosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  cohost_type TEXT NOT NULL CHECK (cohost_type IN ('SOCIETY', 'NUST_ADMIN')),
  society_id UUID REFERENCES societies(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  source_request_id UUID REFERENCES platform_cohost_requests(id) ON DELETE SET NULL,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_event_cohosts_society_required
    CHECK (
      (cohost_type = 'SOCIETY' AND society_id IS NOT NULL)
      OR
      (cohost_type = 'NUST_ADMIN' AND society_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_event_cohosts_event_id
  ON event_cohosts(event_id);

CREATE INDEX IF NOT EXISTS idx_event_cohosts_society_id
  ON event_cohosts(society_id, cohost_type, status);

DO $$
BEGIN
  EXECUTE '
    CREATE UNIQUE INDEX IF NOT EXISTS ux_event_cohost_society_active
      ON event_cohosts(event_id, society_id)
      WHERE cohost_type = ''SOCIETY'' AND status = ''ACTIVE''
  ';
END $$;

DO $$
BEGIN
  EXECUTE '
    CREATE UNIQUE INDEX IF NOT EXISTS ux_event_cohost_nust_admin_active
      ON event_cohosts(event_id)
      WHERE cohost_type = ''NUST_ADMIN'' AND status = ''ACTIVE''
  ';
END $$;

-- 2) Extend request table semantics without breaking existing rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_cohost_requests'
      AND column_name = 'request_type'
  ) THEN
    EXECUTE 'ALTER TABLE platform_cohost_requests ADD COLUMN request_type TEXT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_cohost_requests'
      AND column_name = 'cohost_society_id'
  ) THEN
    EXECUTE 'ALTER TABLE platform_cohost_requests ADD COLUMN cohost_society_id UUID REFERENCES societies(id)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_cohost_requests'
      AND column_name = 'decided_at'
  ) THEN
    EXECUTE 'ALTER TABLE platform_cohost_requests ADD COLUMN decided_at TIMESTAMPTZ';
  END IF;
END $$;

UPDATE platform_cohost_requests
SET request_type = COALESCE(request_type, 'SOCIETY')
WHERE request_type IS NULL;

ALTER TABLE platform_cohost_requests
  ALTER COLUMN request_type SET DEFAULT 'SOCIETY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_platform_cohost_requests_request_type'
  ) THEN
    ALTER TABLE platform_cohost_requests
      ADD CONSTRAINT chk_platform_cohost_requests_request_type
      CHECK (request_type IN ('SOCIETY', 'NUST_ADMIN'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_cohost_requests_event_status
  ON platform_cohost_requests(event_id, status);

CREATE INDEX IF NOT EXISTS idx_platform_cohost_requests_request_type
  ON platform_cohost_requests(request_type);

DO $$
BEGIN
  EXECUTE '
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_society_cohost_request
      ON platform_cohost_requests(event_id, requesting_society_id, cohost_society_id)
      WHERE status = ''PENDING'' AND request_type = ''SOCIETY''
  ';
END $$;

DO $$
BEGIN
  EXECUTE '
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_nust_admin_request
      ON platform_cohost_requests(event_id, requesting_society_id)
      WHERE status = ''PENDING'' AND request_type = ''NUST_ADMIN''
  ';
END $$;
