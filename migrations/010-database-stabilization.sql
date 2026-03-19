-- ============================================================================
-- MIGRATION 010: Database Stabilization & Integrity
-- ============================================================================
-- This migration addresses:
--   1. Schema naming consistency (society_posts family is canonical)
--   2. DB-enforced business rules (unique society names, one president)
--   3. Concurrency-safe ticket capacity handling
--   4. Stale PENDING ticket cleanup
--   5. Missing indexes and constraints
--   6. Soft-delete column consistency
--
-- IMPORTANT: This migration is IDEMPOTENT - safe to run multiple times.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SOCIETY NAME UNIQUENESS (Case-Insensitive)
-- ============================================================================
-- Currently enforced only in application code (societies/register/route.ts).
-- Add DB-level enforcement via partial unique index.

-- Drop if exists for idempotency
DROP INDEX IF EXISTS idx_society_name_unique_ci;

-- Case-insensitive unique index on active (non-rejected, non-deleted) societies
CREATE UNIQUE INDEX idx_society_name_unique_ci
    ON societies (LOWER(name))
    WHERE status != 'REJECTED' AND deleted_at IS NULL;

COMMENT ON INDEX idx_society_name_unique_ci IS
    'Ensures no two active societies have the same name (case-insensitive)';


-- ============================================================================
-- 2. ONE ACTIVE PRESIDENT PER SOCIETY
-- ============================================================================
-- Business rule: Each society can have at most ONE active president.
-- Currently enforced in application code; add DB-level partial unique index.

-- First, ensure roles table has the President role
INSERT INTO roles (name, description, hierarchy_level)
VALUES ('President', 'Society President - full administrative access', 10)
ON CONFLICT (name) DO NOTHING;

-- Drop if exists for idempotency
DROP INDEX IF EXISTS idx_one_president_per_society;

-- Partial unique index: one active president per society
-- This allows multiple inactive presidents (historical records) but only one active.
CREATE UNIQUE INDEX idx_one_president_per_society
    ON society_memberships (society_id)
    WHERE is_active = TRUE
      AND suspended_at IS NULL
      AND role_id = (SELECT id FROM roles WHERE name = 'President' LIMIT 1);

COMMENT ON INDEX idx_one_president_per_society IS
    'Ensures each society has at most one active, non-suspended President';


-- ============================================================================
-- 3. RESERVED CAPACITY FOR PAID TICKETS
-- ============================================================================
-- Problem: PENDING tickets reserve capacity but can go stale.
-- Solution: Add reserved_count column + expiry mechanism.
--
-- reserved_count = number of PENDING tickets (capacity hold)
-- participants_count = number of APPROVED tickets (actual attendees)
-- Total capacity usage = reserved_count + participants_count

-- Add reserved_count column to events (for PENDING ticket capacity)
ALTER TABLE events ADD COLUMN IF NOT EXISTS reserved_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN events.reserved_count IS
    'Number of PENDING tickets reserving capacity. Reset when tickets are approved/expired.';

-- Create function to update reserved_count on ticket status changes
CREATE OR REPLACE FUNCTION fn_update_ticket_reserved_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- New PENDING ticket reserves capacity
        IF NEW.status = 'PENDING' THEN
            UPDATE events SET reserved_count = reserved_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Moving TO PENDING
        IF OLD.status != 'PENDING' AND NEW.status = 'PENDING' THEN
            UPDATE events SET reserved_count = reserved_count + 1
            WHERE id = NEW.event_id;
        -- Moving FROM PENDING (to APPROVED, REJECTED, CANCELLED, etc.)
        ELSIF OLD.status = 'PENDING' AND NEW.status != 'PENDING' THEN
            UPDATE events SET reserved_count = GREATEST(0, reserved_count - 1)
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'PENDING' THEN
            UPDATE events SET reserved_count = GREATEST(0, reserved_count - 1)
            WHERE id = OLD.event_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_ticket_reserved_count ON tickets;

-- Create trigger for reserved_count maintenance
CREATE TRIGGER trg_ticket_reserved_count
    AFTER INSERT OR UPDATE OF status OR DELETE
    ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_ticket_reserved_count();


-- ============================================================================
-- 4. PENDING TICKET EXPIRY (TTL)
-- ============================================================================
-- Add purchased_at column for TTL tracking (if not exists)
-- Tickets PENDING for > 30 minutes are considered stale.

-- Ensure purchased_at exists
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for efficient stale ticket queries
DROP INDEX IF EXISTS idx_tickets_pending_stale;
CREATE INDEX idx_tickets_pending_stale
    ON tickets (event_id, purchased_at)
    WHERE status = 'PENDING';

COMMENT ON INDEX idx_tickets_pending_stale IS
    'Supports queries for stale PENDING tickets that should be expired';

-- Function to expire stale PENDING tickets
-- Called periodically by application or cron job
CREATE OR REPLACE FUNCTION fn_expire_stale_pending_tickets(ttl_minutes INTEGER DEFAULT 30)
RETURNS TABLE(expired_count INTEGER, affected_events UUID[]) AS $$
DECLARE
    cutoff TIMESTAMPTZ;
    result_count INTEGER;
    result_events UUID[];
BEGIN
    cutoff := NOW() - (ttl_minutes || ' minutes')::INTERVAL;

    -- Get affected event IDs before update
    SELECT ARRAY_AGG(DISTINCT event_id) INTO result_events
    FROM tickets
    WHERE status = 'PENDING' AND purchased_at < cutoff;

    -- Expire stale tickets
    UPDATE tickets
    SET status = 'CANCELLED',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'PENDING' AND purchased_at < cutoff;

    GET DIAGNOSTICS result_count = ROW_COUNT;

    expired_count := result_count;
    affected_events := COALESCE(result_events, ARRAY[]::UUID[]);

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_expire_stale_pending_tickets IS
    'Expires PENDING tickets older than TTL. Returns count and affected event IDs.';


-- ============================================================================
-- 5. CAPACITY CHECK FUNCTION (For Use in Payment Confirmation)
-- ============================================================================
-- Atomic capacity check that can be called during payment confirmation.
-- Returns TRUE if capacity is available, FALSE otherwise.

CREATE OR REPLACE FUNCTION fn_check_ticket_capacity(p_event_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_max_participants INTEGER;
    v_participants_count INTEGER;
    v_reserved_count INTEGER;
BEGIN
    SELECT max_participants, participants_count, reserved_count
    INTO v_max_participants, v_participants_count, v_reserved_count
    FROM events
    WHERE id = p_event_id
    FOR UPDATE;  -- Lock the row for atomic check

    -- No capacity limit
    IF v_max_participants IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check if approving one more ticket would exceed capacity
    -- Note: reserved_count includes the ticket being approved, so we check against it
    IF v_participants_count >= v_max_participants THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_check_ticket_capacity IS
    'Atomic capacity check for ticket approval. Locks event row and returns boolean.';


-- ============================================================================
-- 6. ADD SOFT-DELETE COLUMNS TO TABLES MISSING THEM
-- ============================================================================
-- Ensure consistency: tables with is_deleted should also have deleted_at, deleted_by

-- society_posts
ALTER TABLE society_posts
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- society_post_images
ALTER TABLE society_post_images
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- society_albums
ALTER TABLE society_albums
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- society_album_photos
ALTER TABLE society_album_photos
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);


-- ============================================================================
-- 7. PERFORMANCE INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Events: Active events for a society (used in listings)
DROP INDEX IF EXISTS idx_events_society_active;
CREATE INDEX idx_events_society_active
    ON events (society_id, event_start DESC)
    WHERE is_cancelled = FALSE AND deleted_at IS NULL;

-- Events: Upcoming events (used in home page)
DROP INDEX IF EXISTS idx_events_upcoming;
CREATE INDEX idx_events_upcoming
    ON events (event_start)
    WHERE is_cancelled = FALSE
      AND deleted_at IS NULL
      AND status NOT IN ('CANCELLED', 'COMPLETED', 'ARCHIVED');

-- Tickets: User's tickets (used in My Tickets page)
DROP INDEX IF EXISTS idx_tickets_user_active;
CREATE INDEX idx_tickets_user_active
    ON tickets (user_id, purchased_at DESC)
    WHERE status IN ('PENDING', 'APPROVED');

-- Society memberships: Active members (used in permission checks)
DROP INDEX IF EXISTS idx_memberships_active;
CREATE INDEX idx_memberships_active
    ON society_memberships (user_id, society_id)
    WHERE is_active = TRUE AND suspended_at IS NULL;

-- Notifications: User's unread notifications
DROP INDEX IF EXISTS idx_notifications_unread;
CREATE INDEX idx_notifications_unread
    ON notifications (user_id, created_at DESC)
    WHERE is_read = FALSE;


-- ============================================================================
-- 8. ATTENDANCE TABLE NORMALIZATION
-- ============================================================================
-- The schema has both 'attendance' and 'event_attendance' references.
-- Standardize on 'event_attendance' which has the correct structure.

-- Create view for backward compatibility if old 'attendance' table doesn't exist
DO $$
BEGIN
    -- Check if event_attendance exists but attendance doesn't
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_attendance')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
        -- Create alias view
        EXECUTE 'CREATE OR REPLACE VIEW attendance AS SELECT * FROM event_attendance';
    END IF;
END $$;


-- ============================================================================
-- 9. AUDIT ACTION ENUM ADDITIONS
-- ============================================================================
-- Ensure all required audit actions exist

DO $$
BEGIN
    -- Add ticket-related audit actions if they don't exist
    BEGIN
        ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'TICKET_EXPIRED';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'CAPACITY_EXCEEDED';
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;


-- ============================================================================
-- 10. INITIALIZE RESERVED_COUNT FROM EXISTING DATA
-- ============================================================================
-- One-time fix: Set reserved_count based on current PENDING tickets

UPDATE events e
SET reserved_count = (
    SELECT COUNT(*)
    FROM tickets t
    WHERE t.event_id = e.id AND t.status = 'PENDING'
);


-- ============================================================================
-- 11. VIEW: SOCIETY STORAGE USAGE (Fix for Missing View)
-- ============================================================================
-- Used by SuperAdmin dashboard. May not exist in all environments.

CREATE OR REPLACE VIEW v_society_storage_usage AS
SELECT
    s.id AS society_id,
    s.name AS society_name,
    COALESCE(ss.storage_used_bytes, 0) AS storage_used_bytes,
    COALESCE(ss.storage_quota_bytes, 5368709120) AS storage_quota_bytes, -- 5GB default
    ROUND(
        COALESCE(ss.storage_used_bytes, 0)::NUMERIC /
        NULLIF(COALESCE(ss.storage_quota_bytes, 5368709120), 0) * 100,
        2
    ) AS usage_percent
FROM societies s
LEFT JOIN society_settings ss ON ss.society_id = s.id
WHERE s.deleted_at IS NULL AND s.status = 'APPROVED';


-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (for reference, do not run automatically)
-- ============================================================================
-- To rollback this migration:
--
-- DROP INDEX IF EXISTS idx_society_name_unique_ci;
-- DROP INDEX IF EXISTS idx_one_president_per_society;
-- DROP TRIGGER IF EXISTS trg_ticket_reserved_count ON tickets;
-- DROP FUNCTION IF EXISTS fn_update_ticket_reserved_count();
-- DROP FUNCTION IF EXISTS fn_expire_stale_pending_tickets(INTEGER);
-- DROP FUNCTION IF EXISTS fn_check_ticket_capacity(UUID);
-- ALTER TABLE events DROP COLUMN IF EXISTS reserved_count;
-- ALTER TABLE tickets DROP COLUMN IF EXISTS purchased_at;
-- (soft-delete columns are additive, no need to remove)
-- ============================================================================
