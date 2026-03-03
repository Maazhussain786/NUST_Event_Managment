-- ============================================================================
-- 008 — Core Workflow Enhancements
-- ============================================================================
-- 1. tickets.ticket_number  (auto-generated sequential)
-- 2. society_memberships.suspended_at
-- 3. societies: category, mission_statement, banner_url
-- 4. audit_action_enum: PRESIDENCY_TRANSFERRED
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ticket_number on tickets table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'ticket_number'
    ) THEN
        ALTER TABLE tickets ADD COLUMN ticket_number VARCHAR(20);
    END IF;
END $$;

-- Unique constraint on ticket_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number
    ON tickets (ticket_number) WHERE ticket_number IS NOT NULL;

-- Auto-generate ticket_number on insert (NUST-XXXXXX format)
CREATE OR REPLACE FUNCTION fn_generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_num BIGINT;
BEGIN
    -- Use a sequence for thread-safe numbering
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ticket_number_seq') THEN
        CREATE SEQUENCE ticket_number_seq START WITH 100001;
    END IF;
    
    seq_num := nextval('ticket_number_seq');
    NEW.ticket_number := 'NUST-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_ticket_number ON tickets;
CREATE TRIGGER trg_generate_ticket_number
    BEFORE INSERT ON tickets
    FOR EACH ROW
    WHEN (NEW.ticket_number IS NULL)
    EXECUTE FUNCTION fn_generate_ticket_number();

-- Create the sequence if it doesn't exist yet (outside function for idempotency)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ticket_number_seq') THEN
        CREATE SEQUENCE ticket_number_seq START WITH 100001;
    END IF;
END $$;

-- Backfill existing tickets that have no ticket_number
DO $$
DECLARE
    r RECORD;
    seq_num BIGINT;
BEGIN
    FOR r IN SELECT id FROM tickets WHERE ticket_number IS NULL ORDER BY created_at LOOP
        seq_num := nextval('ticket_number_seq');
        UPDATE tickets SET ticket_number = 'NUST-' || LPAD(seq_num::TEXT, 6, '0') WHERE id = r.id;
    END LOOP;
END $$;

-- ============================================================================
-- 2. suspended_at on society_memberships
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'society_memberships' AND column_name = 'suspended_at'
    ) THEN
        ALTER TABLE society_memberships ADD COLUMN suspended_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- 3. societies: category, mission_statement, banner_url
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'category'
    ) THEN
        ALTER TABLE societies ADD COLUMN category VARCHAR(100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'mission_statement'
    ) THEN
        ALTER TABLE societies ADD COLUMN mission_statement TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'banner_url'
    ) THEN
        ALTER TABLE societies ADD COLUMN banner_url TEXT;
    END IF;
END $$;

-- ============================================================================
-- 4. PRESIDENCY_TRANSFERRED in audit_action_enum
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PRESIDENCY_TRANSFERRED'
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'PRESIDENCY_TRANSFERRED';
    END IF;
END $$;

COMMIT;
