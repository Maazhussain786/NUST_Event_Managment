-- ============================================================================
-- Phase 2: Governance API — Test Script
-- ============================================================================
-- Run against the event_management database AFTER Phase 1 migration.
-- These tests verify the SQL-level invariants that the APIs depend on.
--
-- Phase 2 APIs created:
--   POST /api/societies/[id]/transfer-presidency     (President-initiated)
--   POST /api/admin/societies/[id]/force-transfer    (SuperAdmin forced)
--   POST /api/societies/[id]/members/suspend         (hierarchy-based)
--   POST /api/societies/[id]/members/reactivate      (hierarchy-based)
--   POST /api/admin/societies/[id]/suspend           (SA-only)
--   POST /api/admin/societies/[id]/reactivate        (SA-only)
-- ============================================================================

-- ========== SETUP ==========
DO $$
DECLARE
  v_society_id UUID;
  v_pres_role_id UUID;
  v_vp_role_id UUID;
  v_dir_role_id UUID;
  v_member_role_id UUID;
  v_pres_user UUID;
  v_vp_user UUID;
  v_dir_user UUID;
  v_member_user UUID;
  v_sa_user UUID;
  v_pres_membership UUID;
  v_vp_membership UUID;
  v_dir_membership UUID;
  v_member_membership UUID;
  v_test_count INT := 0;
  v_pass_count INT := 0;
BEGIN

  -- Clean up any prior test data
  DELETE FROM audit_logs WHERE metadata->>'test_phase' = 'phase2_test';
  DELETE FROM notifications WHERE title LIKE '%Phase2Test%';
  DELETE FROM society_state_changes WHERE reason LIKE 'Phase2Test%';
  DELETE FROM society_memberships WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase2 Test Society');
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase2 Test Society'));
  DELETE FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase2 Test Society');
  DELETE FROM societies WHERE name = 'Phase2 Test Society';
  DELETE FROM users WHERE email LIKE 'p2test%@test.edu.pk';

  -- Create test users
  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES
    (uuid_generate_v4(), 'p2test_sa@test.edu.pk', 'x', 'SA User P2', 'SUPER_ADMIN', 'ACTIVE'),
    (uuid_generate_v4(), 'p2test_pres@test.edu.pk', 'x', 'President P2', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p2test_vp@test.edu.pk', 'x', 'VP P2', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p2test_dir@test.edu.pk', 'x', 'Director P2', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p2test_mem@test.edu.pk', 'x', 'Member P2', 'STUDENT', 'ACTIVE');

  SELECT id INTO v_sa_user   FROM users WHERE email = 'p2test_sa@test.edu.pk';
  SELECT id INTO v_pres_user FROM users WHERE email = 'p2test_pres@test.edu.pk';
  SELECT id INTO v_vp_user   FROM users WHERE email = 'p2test_vp@test.edu.pk';
  SELECT id INTO v_dir_user  FROM users WHERE email = 'p2test_dir@test.edu.pk';
  SELECT id INTO v_member_user FROM users WHERE email = 'p2test_mem@test.edu.pk';

  -- Create test society
  INSERT INTO societies (id, name, description, status, created_by)
  VALUES (uuid_generate_v4(), 'Phase2 Test Society', 'Test', 'APPROVED', v_pres_user);
  SELECT id INTO v_society_id FROM societies WHERE name = 'Phase2 Test Society';

  -- Create roles
  INSERT INTO roles (id, society_id, name, description, hierarchy_level, is_system_role) VALUES
    (uuid_generate_v4(), v_society_id, 'President', 'Pres', 10, TRUE),
    (uuid_generate_v4(), v_society_id, 'Vice President', 'VP', 8, TRUE),
    (uuid_generate_v4(), v_society_id, 'Director', 'Dir', 5, TRUE),
    (uuid_generate_v4(), v_society_id, 'Member', 'Mem', 1, TRUE);

  SELECT id INTO v_pres_role_id   FROM roles WHERE society_id = v_society_id AND name = 'President';
  SELECT id INTO v_vp_role_id     FROM roles WHERE society_id = v_society_id AND name = 'Vice President';
  SELECT id INTO v_dir_role_id    FROM roles WHERE society_id = v_society_id AND name = 'Director';
  SELECT id INTO v_member_role_id FROM roles WHERE society_id = v_society_id AND name = 'Member';

  -- Create memberships
  INSERT INTO society_memberships (id, user_id, society_id, role_id, is_active, assigned_by) VALUES
    (uuid_generate_v4(), v_pres_user, v_society_id, v_pres_role_id, TRUE, v_sa_user),
    (uuid_generate_v4(), v_vp_user, v_society_id, v_vp_role_id, TRUE, v_pres_user),
    (uuid_generate_v4(), v_dir_user, v_society_id, v_dir_role_id, TRUE, v_pres_user),
    (uuid_generate_v4(), v_member_user, v_society_id, v_member_role_id, TRUE, v_pres_user);

  SELECT id INTO v_pres_membership   FROM society_memberships WHERE user_id = v_pres_user AND society_id = v_society_id AND is_active = TRUE;
  SELECT id INTO v_vp_membership     FROM society_memberships WHERE user_id = v_vp_user AND society_id = v_society_id AND is_active = TRUE;
  SELECT id INTO v_dir_membership    FROM society_memberships WHERE user_id = v_dir_user AND society_id = v_society_id AND is_active = TRUE;
  SELECT id INTO v_member_membership FROM society_memberships WHERE user_id = v_member_user AND society_id = v_society_id AND is_active = TRUE;

  -- ========== TEST 1: fn_can_manage hierarchy — President > VP > Director > Member ==========
  v_test_count := v_test_count + 1;
  IF (SELECT fn_can_manage(v_pres_user, v_vp_user, v_society_id) = TRUE
      AND fn_can_manage(v_vp_user, v_dir_user, v_society_id) = TRUE
      AND fn_can_manage(v_dir_user, v_member_user, v_society_id) = TRUE
      AND fn_can_manage(v_vp_user, v_pres_user, v_society_id) = FALSE
      AND fn_can_manage(v_member_user, v_dir_user, v_society_id) = FALSE
      AND fn_can_manage(v_dir_user, v_dir_user, v_society_id) = FALSE)
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 1 PASSED: fn_can_manage hierarchy works correctly';
  ELSE
    RAISE NOTICE 'TEST 1 FAILED: fn_can_manage hierarchy incorrect';
  END IF;

  -- ========== TEST 2: Member suspension sets correct fields ==========
  v_test_count := v_test_count + 1;
  -- Simulate a suspension (like the API would do)
  UPDATE society_memberships
  SET is_active = FALSE, suspended_at = NOW(), suspended_by = v_pres_user, suspension_reason = 'Phase2Test'
  WHERE id = v_member_membership;

  IF (SELECT suspended_at IS NOT NULL AND is_active = FALSE AND suspension_reason = 'Phase2Test'
      FROM society_memberships WHERE id = v_member_membership)
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 2 PASSED: Member suspension fields set correctly';
  ELSE
    RAISE NOTICE 'TEST 2 FAILED: Member suspension fields incorrect';
  END IF;

  -- ========== TEST 3: Suspended member loses privileges ==========
  v_test_count := v_test_count + 1;
  -- fn_has_privilege should return FALSE for suspended member
  -- (We need a privilege query — use fn_can_manage as proxy: suspended member should lose authority)
  IF (SELECT NOT EXISTS (
    SELECT 1 FROM society_memberships sm
    JOIN roles r ON sm.role_id = r.id
    WHERE sm.user_id = v_member_user AND sm.society_id = v_society_id
      AND sm.is_active = TRUE AND sm.suspended_at IS NULL
  ))
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 3 PASSED: Suspended member has no active memberships';
  ELSE
    RAISE NOTICE 'TEST 3 FAILED: Suspended member still has active memberships';
  END IF;

  -- ========== TEST 4: Member reactivation clears suspension fields ==========
  v_test_count := v_test_count + 1;
  -- Simulate reactivation (like the API would do)
  UPDATE society_memberships
  SET is_active = TRUE, suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
  WHERE id = v_member_membership;

  IF (SELECT suspended_at IS NULL AND is_active = TRUE AND suspension_reason IS NULL
      FROM society_memberships WHERE id = v_member_membership)
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 4 PASSED: Member reactivation clears suspension fields';
  ELSE
    RAISE NOTICE 'TEST 4 FAILED: Member reactivation did not clear fields';
  END IF;

  -- ========== TEST 5: Presidency transfer — deactivate old, create new ==========
  v_test_count := v_test_count + 1;
  -- Simulate the transfer flow: deactivate old president, then assign VP as new president
  UPDATE society_memberships SET is_active = FALSE WHERE id = v_pres_membership;
  UPDATE society_memberships SET is_active = FALSE WHERE id = v_vp_membership;

  -- Now create a new President membership for VP user (should succeed — trigger allows it)
  INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
  VALUES (v_vp_user, v_society_id, v_pres_role_id, TRUE, v_pres_user);

  -- Demote old president to member
  INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
  VALUES (v_pres_user, v_society_id, v_member_role_id, TRUE, v_pres_user);

  IF (SELECT COUNT(*) = 1 FROM society_memberships sm
      JOIN roles r ON sm.role_id = r.id
      WHERE sm.society_id = v_society_id AND r.name = 'President' AND sm.is_active = TRUE
        AND sm.user_id = v_vp_user)
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 5 PASSED: Presidency transfer works (VP is now President)';
  ELSE
    RAISE NOTICE 'TEST 5 FAILED: Presidency transfer did not work';
  END IF;

  -- ========== TEST 6: One-President trigger blocks dual presidents ==========
  v_test_count := v_test_count + 1;
  BEGIN
    -- Try inserting a second President (should fail due to trigger)
    INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
    VALUES (v_dir_user, v_society_id, v_pres_role_id, TRUE, v_sa_user);

    RAISE NOTICE 'TEST 6 FAILED: Second President INSERT was allowed';
  EXCEPTION WHEN OTHERS THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 6 PASSED: Second President INSERT blocked by trigger';
  END;

  -- ========== TEST 7: Society suspension (DEACTIVATED status) ==========
  v_test_count := v_test_count + 1;
  UPDATE societies SET status = 'DEACTIVATED' WHERE id = v_society_id;

  INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by, reason)
  VALUES (v_society_id, 'APPROVED', 'DEACTIVATED', v_sa_user, 'Phase2Test society suspension');

  IF (SELECT status = 'DEACTIVATED' FROM societies WHERE id = v_society_id)
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 7 PASSED: Society successfully set to DEACTIVATED';
  ELSE
    RAISE NOTICE 'TEST 7 FAILED: Society status not DEACTIVATED';
  END IF;

  -- ========== TEST 8: Society reactivation (back to APPROVED) ==========
  v_test_count := v_test_count + 1;
  UPDATE societies SET status = 'APPROVED' WHERE id = v_society_id;

  INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by, reason)
  VALUES (v_society_id, 'DEACTIVATED', 'APPROVED', v_sa_user, 'Phase2Test society reactivation');

  IF (SELECT status = 'APPROVED' FROM societies WHERE id = v_society_id)
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 8 PASSED: Society successfully reactivated to APPROVED';
  ELSE
    RAISE NOTICE 'TEST 8 FAILED: Society status not APPROVED';
  END IF;

  -- ========== TEST 9: Audit log insertion ==========
  v_test_count := v_test_count + 1;
  INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
  VALUES ('PRESIDENCY_TRANSFERRED', v_sa_user, v_society_id, 'society_membership', v_pres_membership,
          '{"test_phase": "phase2_test"}'::jsonb);

  INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
  VALUES ('MEMBER_SUSPENDED', v_sa_user, v_society_id, 'society_membership', v_member_membership,
          '{"test_phase": "phase2_test"}'::jsonb);

  INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
  VALUES ('MEMBER_REACTIVATED', v_sa_user, v_society_id, 'society_membership', v_member_membership,
          '{"test_phase": "phase2_test"}'::jsonb);

  INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
  VALUES ('SOCIETY_SUSPENDED', v_sa_user, v_society_id, 'society', v_society_id,
          '{"test_phase": "phase2_test"}'::jsonb);

  INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
  VALUES ('SOCIETY_REACTIVATED', v_sa_user, v_society_id, 'society', v_society_id,
          '{"test_phase": "phase2_test"}'::jsonb);

  INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, metadata)
  VALUES ('SUPERADMIN_OVERRIDE', v_sa_user, v_society_id, 'society_membership', v_pres_membership,
          '{"test_phase": "phase2_test", "subAction": "FORCED_PRESIDENCY_TRANSFER"}'::jsonb);

  IF (SELECT COUNT(*) = 6 FROM audit_logs WHERE metadata->>'test_phase' = 'phase2_test')
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 9 PASSED: All 6 audit_action_enum values accepted';
  ELSE
    RAISE NOTICE 'TEST 9 FAILED: Not all audit log insertions succeeded';
  END IF;

  -- ========== TEST 10: CHECK constraint — suspended_at + is_active=TRUE blocked ==========
  v_test_count := v_test_count + 1;
  BEGIN
    UPDATE society_memberships
    SET is_active = TRUE, suspended_at = NOW()
    WHERE id = v_member_membership;

    RAISE NOTICE 'TEST 10 FAILED: CHECK constraint did not block suspended_at + is_active=TRUE';
  EXCEPTION WHEN OTHERS THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 10 PASSED: CHECK constraint blocks suspended_at + is_active=TRUE';
  END;

  -- ========== SUMMARY ==========
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 2 Tests: % / % passed', v_pass_count, v_test_count;
  RAISE NOTICE '========================================';

  -- ========== CLEANUP ==========
  DELETE FROM audit_logs WHERE metadata->>'test_phase' = 'phase2_test';
  DELETE FROM notifications WHERE title LIKE '%Phase2Test%';
  DELETE FROM society_state_changes WHERE society_id = v_society_id;
  DELETE FROM society_memberships WHERE society_id = v_society_id;
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id = v_society_id);
  DELETE FROM roles WHERE society_id = v_society_id;
  DELETE FROM societies WHERE id = v_society_id;
  DELETE FROM users WHERE email LIKE 'p2test%@test.edu.pk';

  RAISE NOTICE 'Cleanup complete.';
END $$;
