-- ============================================================================
-- Phase 5: Paid Events + QR Attendance Engine — Database Migration
-- ============================================================================
-- Run AFTER 004-phase4-performance.sql
--
-- Changes:
--   1. tickets: payment_reference, checked_in_at, UNIQUE(event_id, user_id)
--   2. ticket_qr_codes: make ticket_id nullable, add registration_id FK
--   3. event_attendance table (new — spec requirement)
--   4. Trigger: tickets status → participants_count
--   5. Updated analytics views with attendance data
-- ============================================================================

-- ============================================================================
-- 1. ALTER tickets TABLE
-- ============================================================================

-- payment_reference — simulated payment gateway reference
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'payment_reference'
    ) THEN
        ALTER TABLE tickets ADD COLUMN payment_reference UUID UNIQUE DEFAULT uuid_generate_v4();
    END IF;
END $$;

-- checked_in_at — set when QR scanned
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'checked_in_at'
    ) THEN
        ALTER TABLE tickets ADD COLUMN checked_in_at TIMESTAMPTZ;
    END IF;
END $$;

-- UNIQUE(event_id, user_id) — one ticket per user per event
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_ticket_event_user'
    ) THEN
        ALTER TABLE tickets ADD CONSTRAINT uq_ticket_event_user UNIQUE (event_id, user_id);
    END IF;
END $$;

-- Index for payment_reference lookups (payment confirmation)
CREATE INDEX IF NOT EXISTS idx_tickets_payment_ref ON tickets (payment_reference);

-- ============================================================================
-- 2. ALTER ticket_qr_codes TABLE
-- ============================================================================

-- Make ticket_id nullable (was NOT NULL)
DO $$
BEGIN
    -- Only alter if currently NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_qr_codes'
          AND column_name = 'ticket_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE ticket_qr_codes ALTER COLUMN ticket_id DROP NOT NULL;
    END IF;
END $$;

-- Add registration_id FK for free-event QR codes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_qr_codes' AND column_name = 'registration_id'
    ) THEN
        ALTER TABLE ticket_qr_codes ADD COLUMN registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- CHECK: exactly one of ticket_id or registration_id must be set
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_qr_target_exclusive'
    ) THEN
        ALTER TABLE ticket_qr_codes ADD CONSTRAINT chk_qr_target_exclusive
        CHECK (
            (ticket_id IS NOT NULL AND registration_id IS NULL) OR
            (ticket_id IS NULL AND registration_id IS NOT NULL)
        );
    END IF;
END $$;

-- Index for registration_id lookups
CREATE INDEX IF NOT EXISTS idx_qr_registration ON ticket_qr_codes (registration_id) WHERE registration_id IS NOT NULL;

-- Unique active QR per registration
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_qr_per_registration
    ON ticket_qr_codes (registration_id)
    WHERE is_active = TRUE AND registration_id IS NOT NULL;

-- ============================================================================
-- 3. EVENT ATTENDANCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_attendance (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id       UUID REFERENCES tickets(id),           -- NULL for free events
    registration_id UUID REFERENCES event_registrations(id), -- NULL for paid events
    qr_code_id      UUID REFERENCES ticket_qr_codes(id),
    checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_in_by   UUID NOT NULL REFERENCES users(id),    -- who scanned the QR

    CONSTRAINT uq_attendance_event_user UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_event ON event_attendance (event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_user ON event_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_checkin_by ON event_attendance (checked_in_by);

-- ============================================================================
-- 4. TRIGGER: tickets status → participants_count
-- ============================================================================
-- When a ticket transitions to APPROVED → increment participants_count
-- When a ticket transitions FROM APPROVED → decrement participants_count
-- This mirrors the event_registrations trigger for paid events.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_ticket_participants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Transitioning TO APPROVED
        IF OLD.status != 'APPROVED' AND NEW.status = 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        -- Transitioning FROM APPROVED
        ELSIF OLD.status = 'APPROVED' AND NEW.status != 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = OLD.event_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_participants_count ON tickets;
CREATE TRIGGER trg_ticket_participants_count
    AFTER INSERT OR UPDATE OF status OR DELETE
    ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_ticket_participants_count();

-- ============================================================================
-- 5. UPDATED ANALYTICS VIEWS
-- ============================================================================

-- Attendance rate per event
CREATE OR REPLACE VIEW v_event_attendance_stats AS
SELECT
    e.id AS event_id,
    e.title,
    e.society_id,
    e.status,
    e.participants_count,
    (SELECT COUNT(*) FROM event_attendance ea WHERE ea.event_id = e.id) AS checked_in_count,
    CASE
        WHEN e.participants_count > 0
        THEN ROUND(
            (SELECT COUNT(*) FROM event_attendance ea WHERE ea.event_id = e.id)::NUMERIC
            / e.participants_count * 100, 1
        )
        ELSE 0
    END AS attendance_rate,
    CASE
        WHEN e.participants_count > 0
        THEN ROUND(
            (e.participants_count - (SELECT COUNT(*) FROM event_attendance ea WHERE ea.event_id = e.id))::NUMERIC
            / e.participants_count * 100, 1
        )
        ELSE 0
    END AS no_show_rate
FROM events e;

-- Updated revenue view with ticket counts
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
    COALESCE(SUM(e.ticket_price) FILTER (WHERE t.status = 'APPROVED'), 0) AS total_revenue,
    (SELECT COUNT(*) FROM event_attendance ea WHERE ea.event_id = e.id) AS checked_in_count
FROM events e
LEFT JOIN tickets t ON t.event_id = e.id
WHERE e.is_paid = TRUE
GROUP BY e.id, e.title, e.society_id, e.ticket_price;

-- ============================================================================
-- Done.
-- ============================================================================
