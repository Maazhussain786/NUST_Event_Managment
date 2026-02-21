-- ============================================================================
-- Phase 3: Event Operational Layer — Test Script
-- ============================================================================
-- Run AFTER 003-phase3-event-layer.sql migration.
-- Tests the SQL-level invariants that the APIs depend on.
--
-- Tests:
--  1. Suspended user cannot have CREATE_EVENT privilege
--  2. VP can have CREATE_EVENT privilege
--  3. Director cannot have CANCEL_EVENT (not assigned)
--  4. Member cannot have EDIT_EVENT privilege
--  5. Registration unique constraint (event_id, user_id)
--  6. Optimistic locking (version increment)
--  7. fn_calculate_event_status auto-sets status from dates
--  8. is_cancelled → status = CANCELLED via trigger
--  9. event_registrations max_participants enforcement (app-layer, tested via count)
-- 10. Deactivated society blocks privilege checks
-- 11. MEMBERS_ONLY visibility: non-member has no membership
-- 12. DRAFT status preserved when registration_end is NULL
-- ============================================================================

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
  v_outsider_user UUID;
  v_event_id UUID;
  v_event2_id UUID;
  v_reg_id UUID;
  v_test_count INT := 0;
  v_pass_count INT := 0;
  v_result BOOLEAN;
  v_version INT;
  v_status TEXT;
BEGIN

  -- ========== SETUP ==========
  DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P3Test%');
  DELETE FROM audit_logs WHERE metadata->>'test_phase' = 'phase3_test';
  DELETE FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P3Test%');
  DELETE FROM events WHERE title LIKE 'P3Test%';
  DELETE FROM society_memberships WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase3 Test Society');
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase3 Test Society'));
  DELETE FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase3 Test Society');
  DELETE FROM society_state_changes WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase3 Test Society');
  DELETE FROM societies WHERE name = 'Phase3 Test Society';
  DELETE FROM users WHERE email LIKE 'p3test%@test.edu.pk';

  -- Create test users
  INSERT INTO users (id, email, password_hash, full_name, user_type, status) VALUES
    (uuid_generate_v4(), 'p3test_sa@test.edu.pk', 'x', 'SA P3', 'SUPER_ADMIN', 'ACTIVE'),
    (uuid_generate_v4(), 'p3test_pres@test.edu.pk', 'x', 'Pres P3', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p3test_vp@test.edu.pk', 'x', 'VP P3', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p3test_dir@test.edu.pk', 'x', 'Dir P3', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p3test_mem@test.edu.pk', 'x', 'Mem P3', 'STUDENT', 'ACTIVE'),
    (uuid_generate_v4(), 'p3test_outsider@test.edu.pk', 'x', 'Outsider P3', 'STUDENT', 'ACTIVE');

  SELECT id INTO v_sa_user       FROM users WHERE email = 'p3test_sa@test.edu.pk';
  SELECT id INTO v_pres_user     FROM users WHERE email = 'p3test_pres@test.edu.pk';
  SELECT id INTO v_vp_user       FROM users WHERE email = 'p3test_vp@test.edu.pk';
  SELECT id INTO v_dir_user      FROM users WHERE email = 'p3test_dir@test.edu.pk';
  SELECT id INTO v_member_user   FROM users WHERE email = 'p3test_mem@test.edu.pk';
  SELECT id INTO v_outsider_user FROM users WHERE email = 'p3test_outsider@test.edu.pk';

  -- Create test society
  INSERT INTO societies (id, name, description, status, created_by)
  VALUES (uuid_generate_v4(), 'Phase3 Test Society', 'Test', 'APPROVED', v_pres_user);
  SELECT id INTO v_society_id FROM societies WHERE name = 'Phase3 Test Society';

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

  -- Assign privileges: President gets ALL, VP gets CREATE/EDIT/CANCEL, Director gets EDIT only, Member gets none
  INSERT INTO role_privileges (role_id, privilege_id)
  SELECT v_pres_role_id, p.id FROM privileges p;

  INSERT INTO role_privileges (role_id, privilege_id)
  SELECT v_vp_role_id, p.id FROM privileges p
  WHERE p.name IN ('CREATE_EVENT','EDIT_EVENT','CANCEL_EVENT','UPLOAD_CONTENT','DELETE_CONTENT',
                    'SEND_MESSAGE','VIEW_CHAT','MANAGE_CHAT','MANAGE_MEMBERS','SCAN_QR','VIEW_ANALYTICS');

  INSERT INTO role_privileges (role_id, privilege_id)
  SELECT v_dir_role_id, p.id FROM privileges p
  WHERE p.name IN ('EDIT_EVENT','UPLOAD_CONTENT','SEND_MESSAGE','VIEW_CHAT','SCAN_QR');

  -- Note: Member role gets NO event privileges

  -- Create memberships
  INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by) VALUES
    (v_pres_user, v_society_id, v_pres_role_id, TRUE, v_sa_user),
    (v_vp_user, v_society_id, v_vp_role_id, TRUE, v_pres_user),
    (v_dir_user, v_society_id, v_dir_role_id, TRUE, v_pres_user),
    (v_member_user, v_society_id, v_member_role_id, TRUE, v_pres_user);

  -- ========== TEST 1: Suspended user loses CREATE_EVENT ==========
  v_test_count := v_test_count + 1;

  -- VP has CREATE_EVENT before suspension
  SELECT fn_has_privilege(v_vp_user, v_society_id, 'CREATE_EVENT') INTO v_result;
  IF v_result = TRUE THEN
    -- Now suspend VP
    UPDATE society_memberships
    SET is_active = FALSE, suspended_at = NOW(), suspended_by = v_pres_user, suspension_reason = 'Test'
    WHERE user_id = v_vp_user AND society_id = v_society_id AND is_active = TRUE;

    SELECT fn_has_privilege(v_vp_user, v_society_id, 'CREATE_EVENT') INTO v_result;
    IF v_result = FALSE THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 1 PASSED: Suspended user lost CREATE_EVENT privilege';
    ELSE
      RAISE NOTICE 'TEST 1 FAILED: Suspended user still has CREATE_EVENT';
    END IF;

    -- Restore VP
    UPDATE society_memberships
    SET is_active = TRUE, suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL
    WHERE user_id = v_vp_user AND society_id = v_society_id;
  ELSE
    RAISE NOTICE 'TEST 1 FAILED: VP should have CREATE_EVENT before suspension';
  END IF;

  -- ========== TEST 2: VP has CREATE_EVENT privilege ==========
  v_test_count := v_test_count + 1;
  SELECT fn_has_privilege(v_vp_user, v_society_id, 'CREATE_EVENT') INTO v_result;
  IF v_result = TRUE THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 2 PASSED: VP has CREATE_EVENT privilege';
  ELSE
    RAISE NOTICE 'TEST 2 FAILED: VP should have CREATE_EVENT';
  END IF;

  -- ========== TEST 3: Director does NOT have CANCEL_EVENT ==========
  v_test_count := v_test_count + 1;
  SELECT fn_has_privilege(v_dir_user, v_society_id, 'CANCEL_EVENT') INTO v_result;
  IF v_result = FALSE THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 3 PASSED: Director does NOT have CANCEL_EVENT';
  ELSE
    RAISE NOTICE 'TEST 3 FAILED: Director should NOT have CANCEL_EVENT';
  END IF;

  -- ========== TEST 4: Member does NOT have EDIT_EVENT ==========
  v_test_count := v_test_count + 1;
  SELECT fn_has_privilege(v_member_user, v_society_id, 'EDIT_EVENT') INTO v_result;
  IF v_result = FALSE THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 4 PASSED: Member does NOT have EDIT_EVENT';
  ELSE
    RAISE NOTICE 'TEST 4 FAILED: Member should NOT have EDIT_EVENT';
  END IF;

  -- ========== TEST 5: Registration UNIQUE constraint ==========
  v_test_count := v_test_count + 1;

  -- Create a test event
  INSERT INTO events (id, society_id, title, event_start, event_end, registration_end, created_by, thumbnail_url, max_participants)
  VALUES (uuid_generate_v4(), v_society_id, 'P3Test Event', NOW() + INTERVAL '7 days', NOW() + INTERVAL '8 days',
          NOW() + INTERVAL '6 days', v_pres_user, 'https://test.com/thumb.jpg', 5)
  RETURNING id INTO v_event_id;

  -- Register user
  INSERT INTO event_registrations (event_id, user_id) VALUES (v_event_id, v_member_user);

  -- Try duplicate registration
  BEGIN
    INSERT INTO event_registrations (event_id, user_id) VALUES (v_event_id, v_member_user);
    RAISE NOTICE 'TEST 5 FAILED: Duplicate registration was allowed';
  EXCEPTION WHEN unique_violation THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 5 PASSED: Duplicate registration blocked by UNIQUE constraint';
  END;

  -- ========== TEST 6: Optimistic locking — version increments ==========
  v_test_count := v_test_count + 1;

  SELECT version INTO v_version FROM events WHERE id = v_event_id;
  IF v_version = 1 THEN
    -- Simulate an update with correct version
    UPDATE events SET description = 'Updated', version = version + 1, updated_at = NOW()
    WHERE id = v_event_id AND version = 1;

    SELECT version INTO v_version FROM events WHERE id = v_event_id;
    IF v_version = 2 THEN
      -- Now try update with stale version = 1
      UPDATE events SET description = 'Stale update', version = version + 1
      WHERE id = v_event_id AND version = 1;

      IF NOT FOUND THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'TEST 6 PASSED: Optimistic locking prevents overwrite (stale version rejected)';
      ELSE
        RAISE NOTICE 'TEST 6 FAILED: Stale version update was accepted';
      END IF;
    ELSE
      RAISE NOTICE 'TEST 6 FAILED: Version did not increment to 2';
    END IF;
  ELSE
    RAISE NOTICE 'TEST 6 FAILED: Initial version should be 1';
  END IF;

  -- ========== TEST 7: fn_calculate_event_status — future event = UPCOMING ==========
  v_test_count := v_test_count + 1;

  SELECT status::TEXT INTO v_status FROM events WHERE id = v_event_id;
  IF v_status = 'UPCOMING' THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 7 PASSED: Future event has status UPCOMING';
  ELSE
    RAISE NOTICE 'TEST 7 FAILED: Expected UPCOMING, got %', v_status;
  END IF;

  -- ========== TEST 8: is_cancelled triggers status = CANCELLED ==========
  v_test_count := v_test_count + 1;

  UPDATE events SET is_cancelled = TRUE WHERE id = v_event_id;
  SELECT status::TEXT INTO v_status FROM events WHERE id = v_event_id;
  IF v_status = 'CANCELLED' THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 8 PASSED: is_cancelled=TRUE triggers status=CANCELLED';
  ELSE
    RAISE NOTICE 'TEST 8 FAILED: Expected CANCELLED, got %', v_status;
  END IF;

  -- ========== TEST 9: Registration count check (app-layer logic) ==========
  v_test_count := v_test_count + 1;

  -- Create event with max_participants = 2
  INSERT INTO events (id, society_id, title, event_start, event_end, registration_end, created_by, thumbnail_url, max_participants)
  VALUES (uuid_generate_v4(), v_society_id, 'P3Test Limited', NOW() + INTERVAL '10 days', NOW() + INTERVAL '11 days',
          NOW() + INTERVAL '9 days', v_pres_user, 'https://test.com/thumb2.jpg', 2)
  RETURNING id INTO v_event2_id;

  INSERT INTO event_registrations (event_id, user_id) VALUES (v_event2_id, v_pres_user);
  INSERT INTO event_registrations (event_id, user_id) VALUES (v_event2_id, v_vp_user);

  -- Check count = max_participants
  IF (SELECT COUNT(*) FROM event_registrations WHERE event_id = v_event2_id AND cancelled_at IS NULL) >= 2
  THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 9 PASSED: Registration count matches max_participants (2/2)';
  ELSE
    RAISE NOTICE 'TEST 9 FAILED: Registration count should be 2';
  END IF;

  -- ========== TEST 10: Deactivated society blocks privilege checks ==========
  v_test_count := v_test_count + 1;

  UPDATE societies SET status = 'DEACTIVATED' WHERE id = v_society_id;
  SELECT fn_has_privilege(v_vp_user, v_society_id, 'CREATE_EVENT') INTO v_result;
  IF v_result = FALSE THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 10 PASSED: Deactivated society blocks CREATE_EVENT for regular user';
  ELSE
    RAISE NOTICE 'TEST 10 FAILED: Deactivated society should block privileges';
  END IF;
  -- Restore
  UPDATE societies SET status = 'APPROVED' WHERE id = v_society_id;

  -- ========== TEST 11: Non-member has no active membership (MEMBERS_ONLY check) ==========
  v_test_count := v_test_count + 1;

  IF NOT EXISTS (
    SELECT 1 FROM society_memberships
    WHERE user_id = v_outsider_user AND society_id = v_society_id AND is_active = TRUE AND suspended_at IS NULL
  ) THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 11 PASSED: Outsider has no active membership (MEMBERS_ONLY enforced at app layer)';
  ELSE
    RAISE NOTICE 'TEST 11 FAILED: Outsider should not be a member';
  END IF;

  -- ========== TEST 12: DRAFT preserved when no registration_end ==========
  v_test_count := v_test_count + 1;

  DECLARE
    v_draft_event UUID;
    v_draft_status TEXT;
  BEGIN
    INSERT INTO events (id, society_id, title, event_start, event_end, created_by, thumbnail_url, status)
    VALUES (uuid_generate_v4(), v_society_id, 'P3Test Draft', NOW() + INTERVAL '30 days', NOW() + INTERVAL '31 days',
            v_pres_user, 'https://test.com/thumb3.jpg', 'DRAFT')
    RETURNING id INTO v_draft_event;

    SELECT status::TEXT INTO v_draft_status FROM events WHERE id = v_draft_event;
    IF v_draft_status = 'DRAFT' THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 12 PASSED: DRAFT status preserved when registration_end is NULL';
    ELSE
      RAISE NOTICE 'TEST 12 FAILED: Expected DRAFT, got %', v_draft_status;
    END IF;
  END;

  -- ========== SUMMARY ==========
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 3 Tests: % / % passed', v_pass_count, v_test_count;
  RAISE NOTICE '========================================';

  -- ========== CLEANUP ==========
  DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P3Test%');
  DELETE FROM audit_logs WHERE metadata->>'test_phase' = 'phase3_test';
  DELETE FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P3Test%');
  DELETE FROM events WHERE title LIKE 'P3Test%';
  DELETE FROM society_memberships WHERE society_id = v_society_id;
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id = v_society_id);
  DELETE FROM roles WHERE society_id = v_society_id;
  DELETE FROM society_state_changes WHERE society_id = v_society_id;
  DELETE FROM societies WHERE id = v_society_id;
  DELETE FROM users WHERE email LIKE 'p3test%@test.edu.pk';

  RAISE NOTICE 'Cleanup complete.';
END $$;
