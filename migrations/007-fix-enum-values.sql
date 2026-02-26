-- ============================================================================
-- Phase 7: Fix Missing Enum Values
-- ============================================================================
-- Adds 'SUSPENDED' to society_status_enum (used by admin panel)
-- Adds 'PENDING', 'APPROVED', 'REJECTED' to event_status_enum (used by admin panel)
-- ============================================================================

-- 1. Add SUSPENDED to society_status_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'society_status_enum'::regtype
          AND enumlabel = 'SUSPENDED'
    ) THEN
        ALTER TYPE society_status_enum ADD VALUE 'SUSPENDED';
    END IF;
END $$;

-- 2. Add PENDING to event_status_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'event_status_enum'::regtype
          AND enumlabel = 'PENDING'
    ) THEN
        ALTER TYPE event_status_enum ADD VALUE 'PENDING';
    END IF;
END $$;

-- 3. Add APPROVED to event_status_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'event_status_enum'::regtype
          AND enumlabel = 'APPROVED'
    ) THEN
        ALTER TYPE event_status_enum ADD VALUE 'APPROVED';
    END IF;
END $$;

-- 4. Add REJECTED to event_status_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'event_status_enum'::regtype
          AND enumlabel = 'REJECTED'
    ) THEN
        ALTER TYPE event_status_enum ADD VALUE 'REJECTED';
    END IF;
END $$;
