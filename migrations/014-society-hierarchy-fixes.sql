-- ============================================================================
-- PHASE 14: SOCIETY HIERARCHY FIXES
-- Migration: 014-society-hierarchy-fixes.sql
-- Date: 2026-03-22
--
-- This migration fixes hierarchy system issues:
--   1. Adds role_history table for role change auditing
--   2. Adds trigger to handle wing/portfolio deletion impact on memberships
--   3. Adds new audit action types for role changes
--   4. Improves one-president constraint reliability
--
-- All changes are IDEMPOTENT (safe to run multiple times).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ROLE HISTORY TABLE (AUDIT TRAIL FOR ROLE CHANGES)
-- ============================================================================
--
-- Tracks all role changes to preserve membership continuity and provide
-- a complete audit trail of promotions, demotions, and reassignments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_history (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id       UUID NOT NULL REFERENCES society_memberships(id) ON DELETE CASCADE,
    previous_role_id    UUID REFERENCES roles(id),
    new_role_id         UUID NOT NULL REFERENCES roles(id),
    previous_wing_id    UUID REFERENCES wings(id),
    new_wing_id         UUID REFERENCES wings(id),
    previous_portfolio_id UUID REFERENCES portfolios(id),
    new_portfolio_id    UUID REFERENCES portfolios(id),
    changed_by          UUID NOT NULL REFERENCES users(id),
    change_type         VARCHAR(50) NOT NULL DEFAULT 'REASSIGNMENT', -- INITIAL, REASSIGNMENT, PROMOTION, DEMOTION
    reason              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_role_history_membership ON role_history(membership_id);
CREATE INDEX IF NOT EXISTS idx_role_history_changed_by ON role_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_history_created_at ON role_history(created_at);
CREATE INDEX IF NOT EXISTS idx_role_history_society_lookup ON role_history(membership_id, created_at DESC);

-- ============================================================================
-- 2. WING DELETION HANDLER
-- ============================================================================
--
-- When a wing is soft-deleted, memberships referencing it must be handled:
-- - Clear wing_id and portfolio_id from affected memberships
-- - This prevents dangling references to deleted organizational units
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_handle_wing_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- When a wing is soft-deleted (deleted_at changes from NULL to NOT NULL)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Deactivate memberships scoped to this wing or its portfolios
        -- We deactivate rather than delete to preserve audit trail
        UPDATE society_memberships
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE wing_id = OLD.id
          AND is_active = TRUE;

        -- Also soft-delete all portfolios under this wing
        UPDATE portfolios
        SET deleted_at = NEW.deleted_at
        WHERE wing_id = OLD.id
          AND deleted_at IS NULL;

        -- Log this action to audit
        INSERT INTO audit_logs (user_id, society_id, action, target_type, target_id, details)
        SELECT
            COALESCE(
                (SELECT id FROM users WHERE user_type = 'SUPER_ADMIN' LIMIT 1),
                OLD.created_by
            ),
            OLD.society_id,
            'WING_DELETED',
            'wing',
            OLD.id::text,
            jsonb_build_object(
                'wing_name', OLD.name,
                'affected_memberships', (
                    SELECT COUNT(*) FROM society_memberships
                    WHERE wing_id = OLD.id AND is_active = FALSE
                      AND updated_at = NOW()
                )
            )::text;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger for idempotency
DROP TRIGGER IF EXISTS trg_handle_wing_deletion ON wings;
CREATE TRIGGER trg_handle_wing_deletion
    AFTER UPDATE OF deleted_at ON wings
    FOR EACH ROW
    EXECUTE FUNCTION fn_handle_wing_deletion();

-- ============================================================================
-- 3. PORTFOLIO DELETION HANDLER
-- ============================================================================
--
-- When a portfolio is soft-deleted, memberships referencing it must be handled.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_handle_portfolio_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- When a portfolio is soft-deleted
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        -- Deactivate memberships scoped to this portfolio
        UPDATE society_memberships
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE portfolio_id = OLD.id
          AND is_active = TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger for idempotency
DROP TRIGGER IF EXISTS trg_handle_portfolio_deletion ON portfolios;
CREATE TRIGGER trg_handle_portfolio_deletion
    AFTER UPDATE OF deleted_at ON portfolios
    FOR EACH ROW
    EXECUTE FUNCTION fn_handle_portfolio_deletion();

-- ============================================================================
-- 4. ADD NEW AUDIT ACTION TYPES (IF NOT EXISTS)
-- ============================================================================
--
-- Add ROLE_CHANGED action type for tracking role reassignments.
-- We need to add this to the audit_action_enum if it doesn't exist.
-- ============================================================================

-- Check and add enum values if they don't exist
DO $$
BEGIN
    -- Add ROLE_CHANGED if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ROLE_CHANGED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_enum')
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'ROLE_CHANGED';
    END IF;

    -- Add MEMBER_SUSPENDED if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'MEMBER_SUSPENDED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_enum')
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'MEMBER_SUSPENDED';
    END IF;

    -- Add MEMBER_REACTIVATED if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'MEMBER_REACTIVATED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_enum')
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'MEMBER_REACTIVATED';
    END IF;

    -- Add PRIVILEGE_UPDATED if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PRIVILEGE_UPDATED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'audit_action_enum')
    ) THEN
        ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'PRIVILEGE_UPDATED';
    END IF;
END
$$;

-- ============================================================================
-- 5. FUNCTION TO RECORD ROLE CHANGE HISTORY
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_record_role_change(
    p_membership_id UUID,
    p_previous_role_id UUID,
    p_new_role_id UUID,
    p_previous_wing_id UUID,
    p_new_wing_id UUID,
    p_previous_portfolio_id UUID,
    p_new_portfolio_id UUID,
    p_changed_by UUID,
    p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_history_id UUID;
    v_prev_level INTEGER;
    v_new_level INTEGER;
    v_change_type VARCHAR(50);
BEGIN
    -- Determine change type (PROMOTION, DEMOTION, or REASSIGNMENT)
    SELECT hierarchy_level INTO v_prev_level FROM roles WHERE id = p_previous_role_id;
    SELECT hierarchy_level INTO v_new_level FROM roles WHERE id = p_new_role_id;

    IF v_prev_level IS NULL THEN
        v_change_type := 'INITIAL';
    ELSIF v_new_level > v_prev_level THEN
        v_change_type := 'PROMOTION';
    ELSIF v_new_level < v_prev_level THEN
        v_change_type := 'DEMOTION';
    ELSE
        v_change_type := 'REASSIGNMENT';
    END IF;

    INSERT INTO role_history (
        membership_id,
        previous_role_id,
        new_role_id,
        previous_wing_id,
        new_wing_id,
        previous_portfolio_id,
        new_portfolio_id,
        changed_by,
        change_type,
        reason
    ) VALUES (
        p_membership_id,
        p_previous_role_id,
        p_new_role_id,
        p_previous_wing_id,
        p_new_wing_id,
        p_previous_portfolio_id,
        p_new_portfolio_id,
        p_changed_by,
        v_change_type,
        p_reason
    ) RETURNING id INTO v_history_id;

    RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. IMPROVED AUTHORITY CHECK FOR ROLE REASSIGNMENT
-- ============================================================================
--
-- This function validates if user_a can reassign user_b to a new role.
-- Returns TRUE if the reassignment is allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_can_reassign_role(
    p_user_a UUID,           -- The user performing the reassignment
    p_user_b UUID,           -- The user being reassigned
    p_society_id UUID,       -- The society context
    p_new_role_level INTEGER -- The hierarchy level of the new role
) RETURNS BOOLEAN AS $$
DECLARE
    v_a_level INTEGER;
    v_b_level INTEGER;
BEGIN
    -- Get user A's highest authority level (highest hierarchy_level number)
    SELECT MAX(r.hierarchy_level) INTO v_a_level
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_a
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
      AND sm.suspended_at IS NULL;

    -- Get user B's current highest authority level
    SELECT MAX(r.hierarchy_level) INTO v_b_level
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_b
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
      AND sm.suspended_at IS NULL;

    -- Validation rules:
    -- 1. User A must have a role in this society
    IF v_a_level IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. User A must outrank user B (higher hierarchy_level = more authority)
    IF v_b_level IS NOT NULL AND v_a_level <= v_b_level THEN
        RETURN FALSE;
    END IF;

    -- 3. Cannot promote someone above your own level
    IF p_new_role_level >= v_a_level THEN
        RETURN FALSE;
    END IF;

    -- 4. Special protection: only SUPER_ADMIN can affect Presidents
    IF v_b_level = 10 THEN  -- President level
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. VIEW FOR ROLE CHANGE HISTORY
-- ============================================================================

CREATE OR REPLACE VIEW v_role_history AS
SELECT
    rh.id,
    rh.membership_id,
    rh.change_type,
    rh.reason,
    rh.created_at,
    sm.society_id,
    sm.user_id,
    u.full_name AS member_name,
    u.email AS member_email,
    pr.name AS previous_role_name,
    pr.hierarchy_level AS previous_level,
    nr.name AS new_role_name,
    nr.hierarchy_level AS new_level,
    pw.name AS previous_wing_name,
    nw.name AS new_wing_name,
    pp.name AS previous_portfolio_name,
    np.name AS new_portfolio_name,
    cb.full_name AS changed_by_name
FROM role_history rh
JOIN society_memberships sm ON sm.id = rh.membership_id
JOIN users u ON u.id = sm.user_id
LEFT JOIN roles pr ON pr.id = rh.previous_role_id
JOIN roles nr ON nr.id = rh.new_role_id
LEFT JOIN wings pw ON pw.id = rh.previous_wing_id
LEFT JOIN wings nw ON nw.id = rh.new_wing_id
LEFT JOIN portfolios pp ON pp.id = rh.previous_portfolio_id
LEFT JOIN portfolios np ON np.id = rh.new_portfolio_id
JOIN users cb ON cb.id = rh.changed_by
ORDER BY rh.created_at DESC;

COMMIT;
