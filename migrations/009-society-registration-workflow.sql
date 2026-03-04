-- Migration 009: Society registration workflow completion
-- Adds INFO_REQUESTED status, faculty advisor, justification, admin message, banner for registration

-- 1. Add INFO_REQUESTED to society_status_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'society_status_enum'::regtype
          AND enumlabel = 'INFO_REQUESTED'
    ) THEN
        ALTER TYPE society_status_enum ADD VALUE 'INFO_REQUESTED';
    END IF;
END$$;

-- 2. Add new columns to societies for registration workflow
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'faculty_advisor_name') THEN
        ALTER TABLE societies ADD COLUMN faculty_advisor_name VARCHAR(200);
    END IF;
END$$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'justification') THEN
        ALTER TABLE societies ADD COLUMN justification TEXT;
    END IF;
END$$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'admin_message') THEN
        ALTER TABLE societies ADD COLUMN admin_message TEXT;
    END IF;
END$$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'contact_email') THEN
        ALTER TABLE societies ADD COLUMN contact_email VARCHAR(200);
    END IF;
END$$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'societies' AND column_name = 'rejection_reason') THEN
        ALTER TABLE societies ADD COLUMN rejection_reason TEXT;
    END IF;
END$$;

-- 3. Add INFO_REQUESTED to audit_action_enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'audit_action_enum'::regtype
          AND enumlabel = 'SOCIETY_INFO_REQUESTED'
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'SOCIETY_INFO_REQUESTED';
    END IF;
END$$;
