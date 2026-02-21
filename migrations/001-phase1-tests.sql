-- ============================================================================
-- PHASE 1: STRUCTURAL SAFETY TEST QUERIES
-- Run AFTER 001-phase1-structural-safety.sql
--
-- These tests verify the 3 hard invariants:
--   TEST 1: Only one active President per society
--   TEST 2: Suspended member loses all privileges
--   TEST 3: Deactivated society blocks all actions
--   TEST 4: fn_can_manage hierarchy is correct
--   TEST 5: Suspension constraint enforcement
-- ============================================================================

-- ============================================================================
-- SETUP: Create test data (all inside a transaction that rolls back)
-- ============================================================================
BEGIN;

-- Create test users
INSERT INTO users (id, email, password_hash, full_name, user_type, status) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'test-pres@test.edu.pk', '$2a$12$test', 'Test President', 'STUDENT', 'ACTIVE'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'test-vp@test.edu.pk', '$2a$12$test', 'Test VP', 'STUDENT', 'ACTIVE'),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'test-member@test.edu.pk', '$2a$12$test', 'Test Member', 'STUDENT', 'ACTIVE'),
    ('aaaaaaaa-0000-0000-0000-000000000004', 'test-admin@test.edu.pk', '$2a$12$test', 'Test SuperAdmin', 'SUPER_ADMIN', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- Create test society
INSERT INTO societies (id, name, description, status, created_by) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST_PHASE1_SOCIETY', 'Test society for Phase 1', 'APPROVED', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Create roles for test society
INSERT INTO roles (id, society_id, name, hierarchy_level, is_system_role) VALUES
    ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'President', 10, TRUE),
    ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Vice President', 8, TRUE),
    ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'Member', 1, TRUE)
ON CONFLICT (society_id, name) DO NOTHING;

-- Assign President
INSERT INTO society_memberships (id, user_id, society_id, role_id, is_active) VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', TRUE)
ON CONFLICT DO NOTHING;

-- Assign VP
INSERT INTO society_memberships (id, user_id, society_id, role_id, is_active) VALUES
    ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', TRUE)
ON CONFLICT DO NOTHING;

-- Assign Member
INSERT INTO society_memberships (id, user_id, society_id, role_id, is_active) VALUES
    ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', TRUE)
ON CONFLICT DO NOTHING;

-- Assign privileges to test roles (use real privilege IDs)
INSERT INTO role_privileges (role_id, privilege_id)
SELECT 'cccccccc-0000-0000-0000-000000000001'::uuid, id FROM privileges WHERE name = 'CREATE_EVENT'
ON CONFLICT DO NOTHING;

INSERT INTO role_privileges (role_id, privilege_id)
SELECT 'cccccccc-0000-0000-0000-000000000002'::uuid, id FROM privileges WHERE name = 'CREATE_EVENT'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- TEST 1: Only one active President per society
-- Expected: INSERT should FAIL with PRESIDENT_LIMIT_VIOLATED
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 1: One-President Constraint ===';
    
    BEGIN
        INSERT INTO society_memberships (user_id, society_id, role_id, is_active)
        VALUES (
            'aaaaaaaa-0000-0000-0000-000000000002',  -- VP user
            'bbbbbbbb-0000-0000-0000-000000000001',  -- test society
            'cccccccc-0000-0000-0000-000000000001',  -- President role
            TRUE
        );
        RAISE NOTICE 'TEST 1 FAILED: Second President was allowed!';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'TEST 1 PASSED: Second President blocked — %', SQLERRM;
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%PRESIDENT_LIMIT_VIOLATED%' THEN
            RAISE NOTICE 'TEST 1 PASSED: Second President blocked — %', SQLERRM;
        ELSE
            RAISE NOTICE 'TEST 1 FAILED: Unexpected error — %', SQLERRM;
        END IF;
    END;
END
$$;

-- ============================================================================
-- TEST 1b: Deactivated President should allow new President
-- Expected: After deactivating old, new insert should SUCCEED
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 1b: President Transfer (deactivate then assign) ===';
    
    -- Deactivate current President
    UPDATE society_memberships 
    SET is_active = FALSE 
    WHERE id = 'dddddddd-0000-0000-0000-000000000001';
    
    -- Also deactivate VP's existing membership (unique constraint on user+society+scope)
    UPDATE society_memberships 
    SET is_active = FALSE 
    WHERE id = 'dddddddd-0000-0000-0000-000000000002';
    
    BEGIN
        -- Now assign VP user as new President (society-wide scope, no conflict)
        INSERT INTO society_memberships (id, user_id, society_id, role_id, is_active)
        VALUES (
            'dddddddd-0000-0000-0000-000000000099',
            'aaaaaaaa-0000-0000-0000-000000000002',
            'bbbbbbbb-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000001',
            TRUE
        );
        RAISE NOTICE 'TEST 1b PASSED: New President assigned after deactivating old one';
        
        -- Clean up: remove the new president row
        DELETE FROM society_memberships WHERE id = 'dddddddd-0000-0000-0000-000000000099';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'TEST 1b FAILED: %', SQLERRM;
    END;
    
    -- Reactivate original President and VP
    UPDATE society_memberships 
    SET is_active = TRUE 
    WHERE id = 'dddddddd-0000-0000-0000-000000000001';
    
    UPDATE society_memberships 
    SET is_active = TRUE 
    WHERE id = 'dddddddd-0000-0000-0000-000000000002';
END
$$;

-- ============================================================================
-- TEST 2: Suspended member loses all privileges
-- Expected: fn_has_privilege returns TRUE before, FALSE after suspension
-- ============================================================================

DO $$
DECLARE
    v_before BOOLEAN;
    v_after BOOLEAN;
    v_reactivated BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 2: Suspended Member Loses Privileges ===';
    
    -- Check privilege BEFORE suspension
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000002',  -- VP user
        'bbbbbbbb-0000-0000-0000-000000000001',  -- test society
        'CREATE_EVENT'
    ) INTO v_before;
    RAISE NOTICE 'VP CREATE_EVENT before suspension: %', v_before;
    
    -- Suspend the VP
    UPDATE society_memberships 
    SET is_active = FALSE, 
        suspended_at = NOW(), 
        suspended_by = 'aaaaaaaa-0000-0000-0000-000000000001',
        suspension_reason = 'Test suspension'
    WHERE id = 'dddddddd-0000-0000-0000-000000000002';
    
    -- Check privilege AFTER suspension
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'CREATE_EVENT'
    ) INTO v_after;
    RAISE NOTICE 'VP CREATE_EVENT after suspension: %', v_after;
    
    -- Reactivate
    UPDATE society_memberships 
    SET is_active = TRUE, 
        suspended_at = NULL, 
        suspended_by = NULL,
        suspension_reason = NULL
    WHERE id = 'dddddddd-0000-0000-0000-000000000002';
    
    -- Check privilege AFTER reactivation
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'CREATE_EVENT'
    ) INTO v_reactivated;
    RAISE NOTICE 'VP CREATE_EVENT after reactivation: %', v_reactivated;
    
    IF v_before = TRUE AND v_after = FALSE AND v_reactivated = TRUE THEN
        RAISE NOTICE 'TEST 2 PASSED: Suspension correctly blocks/restores privileges';
    ELSE
        RAISE NOTICE 'TEST 2 FAILED: before=%, after=%, reactivated=%', v_before, v_after, v_reactivated;
    END IF;
END
$$;

-- ============================================================================
-- TEST 3: Deactivated society blocks all actions
-- Expected: fn_has_privilege returns FALSE when society is DEACTIVATED
-- ============================================================================

DO $$
DECLARE
    v_before BOOLEAN;
    v_during BOOLEAN;
    v_after BOOLEAN;
    v_sa_during BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 3: Society Deactivation Blocks Actions ===';
    
    -- Check before deactivation
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'CREATE_EVENT'
    ) INTO v_before;
    RAISE NOTICE 'President CREATE_EVENT (society APPROVED): %', v_before;
    
    -- Deactivate society
    UPDATE societies SET status = 'DEACTIVATED' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
    
    -- Check during deactivation (regular user)
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'CREATE_EVENT'
    ) INTO v_during;
    RAISE NOTICE 'President CREATE_EVENT (society DEACTIVATED): %', v_during;
    
    -- Check during deactivation (SuperAdmin — should still return TRUE for override)
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000004',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'CREATE_EVENT'
    ) INTO v_sa_during;
    RAISE NOTICE 'SuperAdmin CREATE_EVENT (society DEACTIVATED): %', v_sa_during;
    
    -- Reactivate
    UPDATE societies SET status = 'APPROVED' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
    
    -- Check after reactivation
    SELECT fn_has_privilege(
        'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'CREATE_EVENT'
    ) INTO v_after;
    RAISE NOTICE 'President CREATE_EVENT (society re-APPROVED): %', v_after;
    
    IF v_before = TRUE AND v_during = FALSE AND v_after = TRUE AND v_sa_during = TRUE THEN
        RAISE NOTICE 'TEST 3 PASSED: Deactivation blocks regular users, SA override works';
    ELSE
        RAISE NOTICE 'TEST 3 FAILED: before=%, during=%, after=%, sa_during=%', v_before, v_during, v_after, v_sa_during;
    END IF;
END
$$;

-- ============================================================================
-- TEST 4: fn_can_manage hierarchy correctness
-- Expected: President can manage Member, NOT vice versa
-- ============================================================================

DO $$
DECLARE
    v_pres_manages_member BOOLEAN;
    v_member_manages_pres BOOLEAN;
    v_pres_manages_vp BOOLEAN;
    v_vp_manages_pres BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 4: fn_can_manage Hierarchy Correctness ===';
    
    -- President (level 10) manages Member (level 1)?
    SELECT fn_can_manage(
        'aaaaaaaa-0000-0000-0000-000000000001',  -- President
        'aaaaaaaa-0000-0000-0000-000000000003',  -- Member
        'bbbbbbbb-0000-0000-0000-000000000001'
    ) INTO v_pres_manages_member;
    RAISE NOTICE 'President manages Member: % (expect TRUE)', v_pres_manages_member;
    
    -- Member manages President?
    SELECT fn_can_manage(
        'aaaaaaaa-0000-0000-0000-000000000003',  -- Member
        'aaaaaaaa-0000-0000-0000-000000000001',  -- President
        'bbbbbbbb-0000-0000-0000-000000000001'
    ) INTO v_member_manages_pres;
    RAISE NOTICE 'Member manages President: % (expect FALSE)', v_member_manages_pres;
    
    -- President manages VP?
    SELECT fn_can_manage(
        'aaaaaaaa-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000001'
    ) INTO v_pres_manages_vp;
    RAISE NOTICE 'President manages VP: % (expect TRUE)', v_pres_manages_vp;
    
    -- VP manages President?
    SELECT fn_can_manage(
        'aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001'
    ) INTO v_vp_manages_pres;
    RAISE NOTICE 'VP manages President: % (expect FALSE)', v_vp_manages_pres;
    
    IF v_pres_manages_member = TRUE 
       AND v_member_manages_pres = FALSE 
       AND v_pres_manages_vp = TRUE 
       AND v_vp_manages_pres = FALSE THEN
        RAISE NOTICE 'TEST 4 PASSED: Hierarchy correctly enforced (higher level = more authority)';
    ELSE
        RAISE NOTICE 'TEST 4 FAILED: Hierarchy inversion still present!';
    END IF;
END
$$;

-- ============================================================================
-- TEST 5: Suspension constraint enforcement
-- Expected: Cannot have suspended_at set while is_active = TRUE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 5: Suspension Constraint Enforcement ===';
    
    BEGIN
        -- Try to set suspended_at while keeping is_active = TRUE
        UPDATE society_memberships 
        SET suspended_at = NOW()
        WHERE id = 'dddddddd-0000-0000-0000-000000000002'
          AND is_active = TRUE;
        
        RAISE NOTICE 'TEST 5 FAILED: Allowed suspended_at with is_active=TRUE!';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'TEST 5 PASSED: CHECK constraint blocked suspended_at + is_active=TRUE';
    WHEN OTHERS THEN
        IF SQLERRM LIKE '%chk_suspension_requires_inactive%' THEN
            RAISE NOTICE 'TEST 5 PASSED: CHECK constraint blocked suspended_at + is_active=TRUE';
        ELSE
            RAISE NOTICE 'TEST 5 FAILED: Unexpected error — %', SQLERRM;
        END IF;
    END;
END
$$;

-- ============================================================================
-- CLEANUP: Remove all test data
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CLEANING UP TEST DATA ===';

    -- Delete test memberships
    DELETE FROM society_memberships WHERE society_id = 'bbbbbbbb-0000-0000-0000-000000000001';
    -- Delete test role privileges  
    DELETE FROM role_privileges WHERE role_id IN ('cccccccc-0000-0000-0000-000000000001'::uuid, 'cccccccc-0000-0000-0000-000000000002'::uuid, 'cccccccc-0000-0000-0000-000000000003'::uuid);
    -- Delete test roles
    DELETE FROM roles WHERE society_id = 'bbbbbbbb-0000-0000-0000-000000000001';
    -- Delete society_state_changes (FK dependency from TEST 3 status changes)
    DELETE FROM society_state_changes WHERE society_id = 'bbbbbbbb-0000-0000-0000-000000000001';
    -- Delete test society
    DELETE FROM societies WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
    -- Delete test users
    DELETE FROM users WHERE email LIKE 'test-%@test.edu.pk';

    RAISE NOTICE '=== ALL TESTS COMPLETE ===';
END
$$;

COMMIT;
