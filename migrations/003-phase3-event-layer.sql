-- ============================================================================
-- Phase 3: Event Operational Layer — Database Migration
-- ============================================================================
-- Run AFTER 001-phase1-structural-safety.sql
--
-- Changes:
--   1. event_status_enum (draft, upcoming, ongoing, completed, archived, cancelled)
--   2. event_visibility_enum (PUBLIC, MEMBERS_ONLY)
--   3. New columns on events: status, visibility, version, registration_link, thumbnail_url
--   4. event_registrations table with UNIQUE(event_id, user_id)
--   5. fn_calculate_event_status() trigger function
--   6. trg_event_status_auto trigger on events
--   7. EVENT_REGISTERED audit_action_enum value
-- ============================================================================

-- ============================================================================
-- 1. NEW ENUM TYPES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status_enum') THEN
        CREATE TYPE event_status_enum AS ENUM (
            'DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'ARCHIVED', 'CANCELLED'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_visibility_enum') THEN
        CREATE TYPE event_visibility_enum AS ENUM ('PUBLIC', 'MEMBERS_ONLY');
    END IF;
END $$;

-- ============================================================================
-- 2. NEW COLUMNS ON events TABLE
-- ============================================================================

-- status column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'status'
    ) THEN
        ALTER TABLE events ADD COLUMN status event_status_enum NOT NULL DEFAULT 'DRAFT';
    END IF;
END $$;

-- visibility column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'visibility'
    ) THEN
        ALTER TABLE events ADD COLUMN visibility event_visibility_enum NOT NULL DEFAULT 'PUBLIC';
    END IF;
END $$;

-- version column (optimistic locking)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'version'
    ) THEN
        ALTER TABLE events ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

-- registration_link column (auto-generated unique link)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'registration_link'
    ) THEN
        ALTER TABLE events ADD COLUMN registration_link VARCHAR(500);
    END IF;
END $$;

-- thumbnail_url column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'thumbnail_url'
    ) THEN
        ALTER TABLE events ADD COLUMN thumbnail_url TEXT;
    END IF;
END $$;

-- max_participants column (separate from max_tickets for free registration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'max_participants'
    ) THEN
        ALTER TABLE events ADD COLUMN max_participants INTEGER CHECK (max_participants >= 1);
    END IF;
END $$;

-- ============================================================================
-- 3. EVENT REGISTRATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_registrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at    TIMESTAMPTZ,

    CONSTRAINT uq_event_registration UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_user ON event_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_active ON event_registrations (event_id)
    WHERE cancelled_at IS NULL;

-- ============================================================================
-- 4. ADD EVENT_REGISTERED TO audit_action_enum (idempotent)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'EVENT_REGISTERED'
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'EVENT_REGISTERED';
    END IF;
END $$;

-- ============================================================================
-- 5. fn_calculate_event_status() — Trigger function
-- ============================================================================
-- Automatically sets event status based on dates and is_cancelled flag.
-- Runs on INSERT and UPDATE of events.
--
-- Logic:
--   - is_cancelled = TRUE → CANCELLED
--   - event_end < NOW()   → COMPLETED
--   - event_start <= NOW() AND event_end >= NOW() → ONGOING
--   - event_start > NOW()  → UPCOMING
--   - Preserves DRAFT if explicitly set and event_start is in the future
--   - ARCHIVED is set manually (not auto-calculated)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_calculate_event_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Cancelled events always stay cancelled
    IF NEW.is_cancelled = TRUE THEN
        NEW.status := 'CANCELLED';
        RETURN NEW;
    END IF;

    -- Don't auto-calculate if explicitly set to ARCHIVED
    IF NEW.status = 'ARCHIVED' THEN
        RETURN NEW;
    END IF;

    -- Don't override DRAFT unless dates say otherwise
    IF NEW.status = 'DRAFT' AND TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' THEN
        -- Only auto-promote DRAFT to UPCOMING/ONGOING/COMPLETED if registration_end is set
        -- This allows saving partial events as drafts
        IF NEW.registration_end IS NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Auto-calculate based on dates
    IF NEW.event_end < NOW() THEN
        NEW.status := 'COMPLETED';
    ELSIF NEW.event_start <= NOW() AND NEW.event_end >= NOW() THEN
        NEW.status := 'ONGOING';
    ELSIF NEW.event_start > NOW() THEN
        -- Keep DRAFT on INSERT if no registration_end set
        IF TG_OP = 'INSERT' AND NEW.registration_end IS NULL THEN
            NEW.status := 'DRAFT';
        ELSE
            NEW.status := 'UPCOMING';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. TRIGGER on events
-- ============================================================================

DROP TRIGGER IF EXISTS trg_event_status_auto ON events;
CREATE TRIGGER trg_event_status_auto
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION fn_calculate_event_status();

-- ============================================================================
-- 7. BACKFILL existing events with calculated status
-- ============================================================================
-- Touch all existing events so the trigger fires and sets status correctly
DO $$
BEGIN
    UPDATE events SET updated_at = NOW();
END $$;

-- ============================================================================
-- Done. Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'events' ORDER BY ordinal_position;
-- ============================================================================
