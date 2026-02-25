-- ============================================================================
-- Phase 6: Storage Quota Enforcement Layer — Database Migration
-- ============================================================================
-- Run AFTER 005-phase5-paid-qr.sql
--
-- Changes:
--   1. CHECK constraints on society_settings (storage_used_bytes >= 0)
--   2. New audit_action_enum values: QUOTA_EXCEEDED, STORAGE_DECREMENT, STORAGE_LIMIT_UPDATED
--   3. Trigger: auto-decrement storage on media soft-delete across all 4 tables
--   4. Trigger: auto-increment storage on media restore (is_deleted = FALSE)
--   5. Analytics view: v_society_storage_usage
-- ============================================================================

-- ============================================================================
-- 1. CHECK CONSTRAINTS on society_settings
-- ============================================================================

-- storage_used_bytes must never go negative
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_storage_used_non_negative'
    ) THEN
        ALTER TABLE society_settings
            ADD CONSTRAINT chk_storage_used_non_negative CHECK (storage_used_bytes >= 0);
    END IF;
END $$;

-- storage_quota_bytes must be positive
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_storage_quota_positive'
    ) THEN
        ALTER TABLE society_settings
            ADD CONSTRAINT chk_storage_quota_positive CHECK (storage_quota_bytes > 0);
    END IF;
END $$;

-- ============================================================================
-- 2. NEW AUDIT ACTIONS
-- ============================================================================

-- QUOTA_EXCEEDED — logged when upload is rejected due to quota
DO $$
BEGIN
    ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'QUOTA_EXCEEDED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- STORAGE_DECREMENT — logged when storage is decremented (soft-delete / hard-delete)
DO $$
BEGIN
    ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'STORAGE_DECREMENT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- STORAGE_LIMIT_UPDATED — logged when SuperAdmin changes a society's quota
DO $$
BEGIN
    ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'STORAGE_LIMIT_UPDATED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. TRIGGER: Auto storage adjustment on media soft-delete/restore
-- ============================================================================
-- Covers all 4 media tables:
--   - society_media   (society_id directly)
--   - event_media     (via events.society_id)
--   - post_attachments (via posts.society_id)
--   - event_note_attachments (via event_notes → events.society_id)
--
-- On UPDATE of is_deleted:
--   FALSE → TRUE:  decrement storage_used_bytes
--   TRUE → FALSE:  increment storage_used_bytes (restore)
-- ============================================================================

-- ── society_media trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_society_media_storage_sync()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            -- Soft-delete: decrement
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = OLD.society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            -- Restore: increment
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = NEW.society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        -- Hard-delete of active row: decrement
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = OLD.society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_society_media_storage ON society_media;
CREATE TRIGGER trg_society_media_storage
    AFTER UPDATE OF is_deleted OR DELETE
    ON society_media
    FOR EACH ROW
    EXECUTE FUNCTION fn_society_media_storage_sync();

-- ── event_media trigger ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_event_media_storage_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_society_id UUID;
BEGIN
    SELECT society_id INTO v_society_id FROM events WHERE id = OLD.event_id;

    IF v_society_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = v_society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = v_society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = v_society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_media_storage ON event_media;
CREATE TRIGGER trg_event_media_storage
    AFTER UPDATE OF is_deleted OR DELETE
    ON event_media
    FOR EACH ROW
    EXECUTE FUNCTION fn_event_media_storage_sync();

-- ── post_attachments trigger ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_post_attachment_storage_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_society_id UUID;
BEGIN
    SELECT society_id INTO v_society_id FROM posts WHERE id = OLD.post_id;

    IF v_society_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = v_society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = v_society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = v_society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_attachment_storage ON post_attachments;
CREATE TRIGGER trg_post_attachment_storage
    AFTER UPDATE OF is_deleted OR DELETE
    ON post_attachments
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_attachment_storage_sync();

-- ── event_note_attachments trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_note_attachment_storage_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_society_id UUID;
BEGIN
    SELECT e.society_id INTO v_society_id
    FROM event_notes en
    JOIN events e ON e.id = en.event_id
    WHERE en.id = OLD.note_id;

    IF v_society_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = v_society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = v_society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = v_society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_note_attachment_storage ON event_note_attachments;
CREATE TRIGGER trg_note_attachment_storage
    AFTER UPDATE OF is_deleted OR DELETE
    ON event_note_attachments
    FOR EACH ROW
    EXECUTE FUNCTION fn_note_attachment_storage_sync();

-- ============================================================================
-- 4. ANALYTICS VIEW: v_society_storage_usage
-- ============================================================================

CREATE OR REPLACE VIEW v_society_storage_usage AS
SELECT
    s.id AS society_id,
    s.name AS society_name,
    s.status AS society_status,
    COALESCE(ss.storage_used_bytes, 0) AS storage_used_bytes,
    ROUND(COALESCE(ss.storage_used_bytes, 0)::NUMERIC / (1024 * 1024), 2) AS storage_used_mb,
    COALESCE(ss.storage_quota_bytes, 524288000) AS storage_quota_bytes,
    ROUND(COALESCE(ss.storage_quota_bytes, 524288000)::NUMERIC / (1024 * 1024), 2) AS storage_limit_mb,
    CASE
        WHEN COALESCE(ss.storage_quota_bytes, 524288000) > 0
        THEN ROUND(
            COALESCE(ss.storage_used_bytes, 0)::NUMERIC
            / COALESCE(ss.storage_quota_bytes, 524288000) * 100, 1
        )
        ELSE 0
    END AS percent_used
FROM societies s
LEFT JOIN society_settings ss ON ss.society_id = s.id;

-- ============================================================================
-- Done.
-- ============================================================================
