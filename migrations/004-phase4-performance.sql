-- ============================================================================
-- Phase 4: Performance & Concurrency Hardening — Database Migration
-- ============================================================================
-- Run AFTER 003-phase3-event-layer.sql
--
-- Changes:
--   1. participants_count column + trigger (eliminates COUNT on registration)
--   2. event_waitlist table
--   3. Critical missing indexes
--   4. Analytics composite indexes
--   5. EVENT_WAITLISTED audit_action_enum value
-- ============================================================================

-- ============================================================================
-- 1. PARTICIPANTS_COUNT — Denormalized counter on events
-- ============================================================================
-- Maintained by trigger on event_registrations.
-- Enables race-safe capacity check via the FOR UPDATE row lock on events,
-- eliminating the separate COUNT(*) query entirely.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'participants_count'
    ) THEN
        ALTER TABLE events ADD COLUMN participants_count INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Backfill existing counts
UPDATE events e
SET participants_count = (
    SELECT COUNT(*)
    FROM event_registrations er
    WHERE er.event_id = e.id AND er.cancelled_at IS NULL
);

-- Trigger function: keep events.participants_count in sync
CREATE OR REPLACE FUNCTION fn_update_participants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.cancelled_at IS NULL THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- cancelled_at changed from NULL → non-NULL (cancellation)
        IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = NEW.event_id;
        -- cancelled_at changed from non-NULL → NULL (re-registration)
        ELSIF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.cancelled_at IS NULL THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = OLD.event_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_participants_count ON event_registrations;
CREATE TRIGGER trg_participants_count
    AFTER INSERT OR UPDATE OF cancelled_at OR DELETE
    ON event_registrations
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_participants_count();

-- ============================================================================
-- 2. EVENT WAITLIST TABLE
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'EVENT_WAITLISTED'
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'EVENT_WAITLISTED';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS event_waitlist (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position        INTEGER NOT NULL,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_at     TIMESTAMPTZ,   -- set when promoted to registration
    cancelled_at    TIMESTAMPTZ,

    CONSTRAINT uq_waitlist_entry UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_event ON event_waitlist (event_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_user ON event_waitlist (user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_active ON event_waitlist (event_id, position)
    WHERE cancelled_at IS NULL AND promoted_at IS NULL;

-- ============================================================================
-- 3. CRITICAL MISSING INDEXES
-- ============================================================================

-- events(status) — filter by status in list queries
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);

-- events(registration_end) — deadline filter / notification queries
CREATE INDEX IF NOT EXISTS idx_events_registration_end ON events (registration_end);

-- events(is_cancelled, status) — common combined filter
CREATE INDEX IF NOT EXISTS idx_events_active_status ON events (status)
    WHERE is_cancelled = FALSE;

-- society_memberships active check (used by MEMBERS_ONLY, fn_has_privilege)
CREATE INDEX IF NOT EXISTS idx_memberships_active ON society_memberships (society_id, user_id)
    WHERE is_active = TRUE AND suspended_at IS NULL;

-- audit_logs(created_at DESC) — analytics dashboard descending sort
CREATE INDEX IF NOT EXISTS idx_audit_created_desc ON audit_logs (created_at DESC);

-- ============================================================================
-- 4. ANALYTICS COMPOSITE INDEXES
-- ============================================================================

-- Events per society filtered by status
CREATE INDEX IF NOT EXISTS idx_events_society_status ON events (society_id, status);

-- Events per society by start date (upcoming events list)
CREATE INDEX IF NOT EXISTS idx_events_society_start ON events (society_id, event_start);

-- Registrations per event (active only) — for capacity / analytics
-- Already exists: idx_event_registrations_active (from Phase 3)

-- Revenue per event — tickets with payment status
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets (event_id, status);

-- Active memberships per society — membership counts
CREATE INDEX IF NOT EXISTS idx_memberships_society_active ON society_memberships (society_id)
    WHERE is_active = TRUE;

-- Audit logs per society descending (recent activity feed)
CREATE INDEX IF NOT EXISTS idx_audit_society_created ON audit_logs (society_id, created_at DESC);

-- ============================================================================
-- 5. ANALYTICS VIEWS (non-materialized for real-time accuracy)
-- ============================================================================

-- Events per society with registration and ticket counts
CREATE OR REPLACE VIEW v_society_event_stats AS
SELECT
    e.society_id,
    s.name AS society_name,
    COUNT(DISTINCT e.id) AS total_events,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'UPCOMING') AS upcoming_events,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'ONGOING')  AS ongoing_events,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'COMPLETED') AS completed_events,
    COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'CANCELLED') AS cancelled_events,
    SUM(e.participants_count) AS total_registrations
FROM events e
JOIN societies s ON s.id = e.society_id
GROUP BY e.society_id, s.name;

-- Registrations per event with capacity info
CREATE OR REPLACE VIEW v_event_registration_stats AS
SELECT
    e.id AS event_id,
    e.title,
    e.society_id,
    e.status,
    e.max_participants,
    e.participants_count,
    CASE
        WHEN e.max_participants IS NOT NULL
        THEN ROUND((e.participants_count::NUMERIC / e.max_participants) * 100, 1)
        ELSE NULL
    END AS fill_percentage,
    (SELECT COUNT(*) FROM event_waitlist w
     WHERE w.event_id = e.id AND w.cancelled_at IS NULL AND w.promoted_at IS NULL
    ) AS waitlist_count
FROM events e;

-- Revenue per event (paid events)
CREATE OR REPLACE VIEW v_event_revenue AS
SELECT
    e.id AS event_id,
    e.title,
    e.society_id,
    e.ticket_price,
    COUNT(t.id) FILTER (WHERE t.status = 'APPROVED')  AS approved_tickets,
    COUNT(t.id) FILTER (WHERE t.status = 'PENDING')   AS pending_tickets,
    COUNT(t.id) FILTER (WHERE t.status = 'CANCELLED') AS cancelled_tickets,
    COUNT(t.id) FILTER (WHERE t.status = 'REJECTED')  AS rejected_tickets,
    COALESCE(SUM(e.ticket_price) FILTER (WHERE t.status = 'APPROVED'), 0) AS total_revenue
FROM events e
LEFT JOIN tickets t ON t.event_id = e.id
WHERE e.is_paid = TRUE
GROUP BY e.id, e.title, e.society_id, e.ticket_price;

-- Active members per society
CREATE OR REPLACE VIEW v_society_member_stats AS
SELECT
    sm.society_id,
    s.name AS society_name,
    COUNT(*) FILTER (WHERE sm.is_active = TRUE AND sm.suspended_at IS NULL) AS active_members,
    COUNT(*) FILTER (WHERE sm.is_active = TRUE AND sm.suspended_at IS NOT NULL) AS suspended_members,
    COUNT(*) FILTER (WHERE sm.is_active = FALSE) AS inactive_members,
    COUNT(*) AS total_members
FROM society_memberships sm
JOIN societies s ON s.id = sm.society_id
GROUP BY sm.society_id, s.name;

-- ============================================================================
-- Done.
-- ============================================================================
