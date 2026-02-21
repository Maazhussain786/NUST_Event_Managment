-- ============================================================================
-- PHASE 1: STRUCTURAL SAFETY & DATABASE INTEGRITY
-- Migration: 001-phase1-structural-safety.sql
-- Date: 2026-02-21
-- 
-- This migration enforces hard system invariants:
--   1. One active President per society (trigger constraint)
--   2. Member suspension fields on society_memberships
--   3. Hardened fn_has_privilege() — checks society status + suspension
--   4. Fixed fn_can_manage() — corrected hierarchy inversion bug
--
-- All changes are IDEMPOTENT (safe to run multiple times).
-- Does NOT modify role matrix, event APIs, or feature endpoints.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ONE-PRESIDENT CONSTRAINT (TRIGGER-BASED)
-- ============================================================================
-- 
-- Why a trigger instead of a partial unique index?
-- PostgreSQL partial indexes cannot reference other tables (roles).
-- We need to check: role_id → roles.name = 'President'.
-- A trigger gives us full cross-table validation.
--
-- Race condition safety:
-- Presidency transfers must run in a single transaction:
--   1. Deactivate old President (is_active = FALSE)
--   2. Activate new President (is_active = TRUE)
-- The trigger checks AFTER step 1 completes, so step 2 sees count = 0.
-- For extra safety, transfers should use SERIALIZABLE isolation.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_one_president()
RETURNS TRIGGER AS $$
DECLARE
    v_role_name TEXT;
    v_existing_count INTEGER;
BEGIN
    -- Skip check if membership is being deactivated
    IF NEW.is_active = FALSE THEN
        RETURN NEW;
    END IF;

    -- Look up the role name
    SELECT name INTO v_role_name FROM roles WHERE id = NEW.role_id;

    -- Only enforce for President role
    IF v_role_name IS DISTINCT FROM 'President' THEN
        RETURN NEW;
    END IF;

    -- Count existing active Presidents for this society
    -- Exclude the current row (handles UPDATE case)
    SELECT COUNT(*) INTO v_existing_count
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.society_id = NEW.society_id
      AND sm.is_active = TRUE
      AND r.name = 'President'
      AND r.is_system_role = TRUE
      AND sm.id IS DISTINCT FROM NEW.id;

    IF v_existing_count > 0 THEN
        RAISE EXCEPTION 
            'PRESIDENT_LIMIT_VIOLATED: Society % already has an active President. '
            'Deactivate the current President before assigning a new one.',
            NEW.society_id
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_enforce_one_president ON society_memberships;

CREATE TRIGGER trg_enforce_one_president
    BEFORE INSERT OR UPDATE ON society_memberships
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_one_president();

-- ============================================================================
-- 2. MEMBER SUSPENSION FIELDS
-- ============================================================================
-- 
-- Design:
--   - suspended_at: when the suspension happened (NULL = not suspended)
--   - suspended_by: who performed the suspension (FK → users)
--   - suspension_reason: free-text reason (auditable)
--   - is_active remains authoritative for access control
--   - Suspension sets is_active = FALSE but PRESERVES the membership row
--   - Reactivation sets is_active = TRUE and clears suspension fields
--
-- Invariant: If suspended_at IS NOT NULL, then is_active MUST be FALSE.
-- Enforced via CHECK constraint.
-- ============================================================================

-- Add columns (IF NOT EXISTS via DO block for idempotency)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'society_memberships' AND column_name = 'suspended_at'
    ) THEN
        ALTER TABLE society_memberships ADD COLUMN suspended_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'society_memberships' AND column_name = 'suspended_by'
    ) THEN
        ALTER TABLE society_memberships ADD COLUMN suspended_by UUID REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'society_memberships' AND column_name = 'suspension_reason'
    ) THEN
        ALTER TABLE society_memberships ADD COLUMN suspension_reason TEXT;
    END IF;
END
$$;

-- Enforce invariant: suspended members must be inactive
-- Drop first for idempotency, then re-add
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_suspension_requires_inactive'
    ) THEN
        ALTER TABLE society_memberships
            ADD CONSTRAINT chk_suspension_requires_inactive
            CHECK (
                (suspended_at IS NULL) OR (is_active = FALSE)
            );
    END IF;
END
$$;

-- Index for quick lookup of suspended memberships
CREATE INDEX IF NOT EXISTS idx_memberships_suspended
    ON society_memberships (society_id, suspended_at)
    WHERE suspended_at IS NOT NULL;

-- ============================================================================
-- 3. HARDENED fn_has_privilege()
-- ============================================================================
--
-- Changes from original:
--   a) Checks societies.status = 'APPROVED' (deactivated societies block all)
--   b) Checks suspended_at IS NULL (suspended members lose all privileges)
--   c) SUPER_ADMIN bypass still returns TRUE but only for ACTIVE status
--   d) Added explicit membership existence check
--   e) Preserved scope containment logic (society > wing > portfolio)
--
-- SUPER_ADMIN audit logging is handled at the APPLICATION layer because
-- SQL functions lack HTTP request context (IP, user-agent, etc.).
-- The function returns TRUE for SUPER_ADMIN; the API route logs the action.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_has_privilege(
    p_user_id UUID,
    p_society_id UUID,
    p_privilege_name VARCHAR,
    p_wing_id UUID DEFAULT NULL,
    p_portfolio_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_priv BOOLEAN;
    v_society_status TEXT;
BEGIN
    -- ---------------------------------------------------------------
    -- Step 1: Check society is APPROVED
    -- Even SUPER_ADMIN should not silently operate on deactivated societies
    -- without the application layer being aware. We return TRUE for SA
    -- so the app layer can handle it, but regular users are blocked.
    -- ---------------------------------------------------------------
    SELECT status::TEXT INTO v_society_status
    FROM societies
    WHERE id = p_society_id;

    -- Society doesn't exist
    IF v_society_status IS NULL THEN
        RETURN FALSE;
    END IF;

    -- ---------------------------------------------------------------
    -- Step 2: SUPER_ADMIN bypass
    -- Returns TRUE so application layer can proceed + audit log.
    -- For deactivated societies, SA still gets TRUE — the app layer
    -- must decide whether to allow the action and log it.
    -- ---------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM users 
        WHERE id = p_user_id 
          AND user_type = 'SUPER_ADMIN'
          AND status = 'ACTIVE'
    ) THEN
        RETURN TRUE;
    END IF;

    -- ---------------------------------------------------------------
    -- Step 3: Block if society is not APPROVED (for non-SA users)
    -- ---------------------------------------------------------------
    IF v_society_status <> 'APPROVED' THEN
        RETURN FALSE;
    END IF;

    -- ---------------------------------------------------------------
    -- Step 4: Check privilege via active, non-suspended memberships
    -- with scope containment
    -- ---------------------------------------------------------------
    SELECT EXISTS(
        SELECT 1
        FROM society_memberships sm
        JOIN roles r ON r.id = sm.role_id
        JOIN role_privileges rp ON rp.role_id = r.id
        JOIN privileges p ON p.id = rp.privilege_id
        WHERE sm.user_id = p_user_id
          AND sm.society_id = p_society_id
          AND sm.is_active = TRUE
          AND sm.suspended_at IS NULL          -- not suspended
          AND p.name = p_privilege_name
          -- Scope containment: society > wing > portfolio
          AND (
              -- Society-wide scope: covers everything
              (sm.wing_id IS NULL AND sm.portfolio_id IS NULL)
              OR
              -- Wing scope: matches if target is same wing or any portfolio under it
              (sm.wing_id IS NOT NULL AND sm.portfolio_id IS NULL
               AND (p_wing_id IS NULL OR sm.wing_id = p_wing_id))
              OR
              -- Portfolio scope: matches only exact portfolio
              (sm.portfolio_id IS NOT NULL
               AND sm.wing_id = p_wing_id
               AND sm.portfolio_id = p_portfolio_id)
          )
    ) INTO v_has_priv;

    RETURN v_has_priv;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. FIXED fn_can_manage()
-- ============================================================================
--
-- BUG FIX: Original function treated LOWER hierarchy_level as HIGHER authority.
-- But the schema uses: President=10, VP=8, Director=5, DD=3, Member=1.
-- So HIGHER number = HIGHER authority.
--
-- The fix:
--   - Get HIGHEST hierarchy_level (DESC) for each user
--   - a_level > b_level means A outranks B
--   - Also checks suspension and society status
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_can_manage(
    p_user_a UUID,
    p_user_b UUID,
    p_society_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_a_level INTEGER;
    v_b_level INTEGER;
    v_a_assigned TIMESTAMPTZ;
    v_b_assigned TIMESTAMPTZ;
    v_society_status TEXT;
BEGIN
    -- Check society exists and is approved
    SELECT status::TEXT INTO v_society_status FROM societies WHERE id = p_society_id;
    IF v_society_status IS NULL OR v_society_status <> 'APPROVED' THEN
        RETURN FALSE;
    END IF;

    -- Get the HIGHEST authority role for user A in this society
    -- Higher hierarchy_level = higher authority (President=10 > Member=1)
    SELECT r.hierarchy_level, sm.assigned_at
    INTO v_a_level, v_a_assigned
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_a
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
      AND sm.suspended_at IS NULL
    ORDER BY r.hierarchy_level DESC, sm.assigned_at ASC
    LIMIT 1;

    -- Get the highest authority role for user B
    SELECT r.hierarchy_level, sm.assigned_at
    INTO v_b_level, v_b_assigned
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_b
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
      AND sm.suspended_at IS NULL
    ORDER BY r.hierarchy_level DESC, sm.assigned_at ASC
    LIMIT 1;

    -- If either user has no active, non-suspended membership, return FALSE
    IF v_a_level IS NULL OR v_b_level IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Higher number = higher authority
    IF v_a_level > v_b_level THEN
        RETURN TRUE;
    ELSIF v_a_level = v_b_level THEN
        -- Same level: earlier assignment wins (seniority)
        RETURN v_a_assigned < v_b_assigned;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 5. AUDIT LOG ENUMS — ADD SUSPENSION ACTIONS
-- ============================================================================
-- Add new audit actions for suspension/reactivation if not already present.
-- PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a transaction in older
-- versions, so we use a safe DO block.
-- ============================================================================

DO $$
BEGIN
    -- Add MEMBER_SUSPENDED if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'MEMBER_SUSPENDED' 
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'MEMBER_SUSPENDED';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'MEMBER_REACTIVATED' 
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'MEMBER_REACTIVATED';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'SOCIETY_SUSPENDED' 
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'SOCIETY_SUSPENDED';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'SOCIETY_REACTIVATED' 
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'SOCIETY_REACTIVATED';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'PRESIDENCY_TRANSFERRED' 
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'PRESIDENCY_TRANSFERRED';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'SUPERADMIN_OVERRIDE' 
          AND enumtypid = 'audit_action_enum'::regtype
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE 'SUPERADMIN_OVERRIDE';
    END IF;
END
$$;

-- ============================================================================
-- 6. UPDATE v_active_memberships VIEW
-- ============================================================================
-- Include suspension info in the view for downstream queries.
-- ============================================================================

CREATE OR REPLACE VIEW v_active_memberships AS
SELECT
    sm.id AS membership_id,
    sm.user_id,
    u.full_name,
    u.email,
    sm.society_id,
    s.name AS society_name,
    sm.role_id,
    r.name AS role_name,
    r.hierarchy_level,
    sm.wing_id,
    w.name AS wing_name,
    sm.portfolio_id,
    p.name AS portfolio_name,
    sm.assigned_at,
    sm.is_active,
    sm.suspended_at,
    sm.suspended_by,
    sm.suspension_reason
FROM society_memberships sm
JOIN users u ON u.id = sm.user_id
JOIN societies s ON s.id = sm.society_id
JOIN roles r ON r.id = sm.role_id
LEFT JOIN wings w ON w.id = sm.wing_id
LEFT JOIN portfolios p ON p.id = sm.portfolio_id
WHERE sm.is_active = TRUE;

-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;
