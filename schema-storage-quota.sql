-- LEGACY: superseded by db/migrations (000_baseline.sql is the real schema).
-- Kept for reference only; do not run on a database set up with scripts/migrate.js.

-- ============================================================================
-- STORAGE QUOTA TRACKING
-- Run AFTER schema-fixes.sql (which creates society_settings)
-- ============================================================================
-- Adds storage tracking columns to society_settings.
-- These columns track how much blob storage each society is using.
-- ============================================================================

BEGIN;

-- Add storage quota columns to society_settings
ALTER TABLE society_settings
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NOT NULL DEFAULT 524288000,  -- 500 MB
  ADD COLUMN IF NOT EXISTS storage_used_bytes  BIGINT NOT NULL DEFAULT 0;

-- Ensure storage_used_bytes never goes negative
ALTER TABLE society_settings
  ADD CONSTRAINT chk_storage_used_non_negative
  CHECK (storage_used_bytes >= 0);

-- Ensure quota is at least 100MB
ALTER TABLE society_settings
  ADD CONSTRAINT chk_storage_quota_minimum
  CHECK (storage_quota_bytes >= 104857600);  -- 100 MB minimum

-- Index for fast quota lookups
CREATE INDEX IF NOT EXISTS idx_society_settings_quota
  ON society_settings (society_id, storage_used_bytes);

-- ============================================================================
-- Upload tracking table (for rate limiting and analytics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS upload_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    society_id      UUID REFERENCES societies(id),
    file_url        TEXT NOT NULL,
    file_name       VARCHAR(500),
    file_size_bytes BIGINT NOT NULL,
    mime_type       VARCHAR(100),
    container_name  VARCHAR(100) NOT NULL,
    blob_name       VARCHAR(1000) NOT NULL,
    entity_type     VARCHAR(50),          -- 'profile', 'event_media', 'society_media', 'post', 'note'
    entity_id       UUID,                 -- ID of the related entity
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_upload_logs_user_time
  ON upload_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_logs_society_time
  ON upload_logs (society_id, created_at DESC);

-- For cleanup of old logs (keep 90 days)
CREATE INDEX IF NOT EXISTS idx_upload_logs_created
  ON upload_logs (created_at);

-- ============================================================================
-- Function: Recalculate society storage from actual media tables
-- Run periodically to fix any drift between tracked and actual usage.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_recalculate_society_storage(p_society_id UUID)
RETURNS BIGINT AS $$
DECLARE
    total_bytes BIGINT := 0;
    calculated BIGINT;
BEGIN
    -- Society media
    SELECT COALESCE(SUM(file_size_bytes), 0) INTO calculated
    FROM society_media WHERE society_id = p_society_id AND is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Event media (through events)
    SELECT COALESCE(SUM(em.file_size_bytes), 0) INTO calculated
    FROM event_media em
    JOIN events e ON e.id = em.event_id
    WHERE e.society_id = p_society_id AND em.is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Post attachments (through posts)
    SELECT COALESCE(SUM(pa.file_size_bytes), 0) INTO calculated
    FROM post_attachments pa
    JOIN posts p ON p.id = pa.post_id
    WHERE p.society_id = p_society_id AND pa.is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Note attachments (through event_notes -> events)
    SELECT COALESCE(SUM(ena.file_size_bytes), 0) INTO calculated
    FROM event_note_attachments ena
    JOIN event_notes en ON en.id = ena.note_id
    JOIN events e ON e.id = en.event_id
    WHERE e.society_id = p_society_id AND ena.is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Update the tracked value
    UPDATE society_settings
    SET storage_used_bytes = total_bytes
    WHERE society_id = p_society_id;

    RETURN total_bytes;
END;
$$ LANGUAGE plpgsql;

COMMIT;
