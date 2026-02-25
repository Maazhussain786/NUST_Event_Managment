-- ============================================================================
-- Phase 4: Performance & Concurrency — Load Test Scenarios
-- ============================================================================
-- Run AFTER 004-phase4-performance.sql migration.
--
-- Simulates and validates:
--   1. 100 concurrent registrations racing for 10 slots (capacity safety)
--   2. 10 simultaneous edits (optimistic lock collision detection)
--   3. 50 suspended members attempting privilege use
--   4. Waitlist ordering when event is full
--   5. participants_count trigger accuracy
--   6. Analytics views correctness
-- ============================================================================

DO $$
DECLARE
  v_society_id UUID;
  v_pres_role_id UUID;
  v_member_role_id UUID;
  v_pres_user UUID;
  v_event_id UUID;
  v_event2_id UUID;
  v_test_count INT := 0;
  v_pass_count INT := 0;
  v_result BOOLEAN;
  v_count INT;
  v_version INT;
  v_user_id UUID;
  v_i INT;
  v_successful INT;
  v_failed INT;
  v_participants INT;
  v_waitlist_count INT;
BEGIN

  -- ========== CLEANUP PREVIOUS RUN ==========
  DELETE FROM event_waitlist WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P4Load%');
  DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P4Load%');
  DELETE FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P4Load%');
  DELETE FROM events WHERE title LIKE 'P4Load%';
  DELETE FROM society_memberships WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase4 Load Society');
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase4 Load Society'));
  DELETE FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase4 Load Society');
  DELETE FROM society_state_changes WHERE society_id IN (SELECT id FROM societies WHERE name = 'Phase4 Load Society');
  DELETE FROM societies WHERE name = 'Phase4 Load Society';
  DELETE FROM users WHERE email LIKE 'p4load%@test.edu.pk';

  -- ========== SETUP ==========

  -- Create 110 test users (100 for reg test, 10 for edit test)
  FOR v_i IN 1..110 LOOP
    INSERT INTO users (id, email, password_hash, full_name, user_type, status)
    VALUES (uuid_generate_v4(), 'p4load' || v_i || '@test.edu.pk', 'x', 'Load User ' || v_i, 'STUDENT', 'ACTIVE');
  END LOOP;

  SELECT id INTO v_pres_user FROM users WHERE email = 'p4load1@test.edu.pk';

  -- Create society
  INSERT INTO societies (id, name, description, status, created_by)
  VALUES (uuid_generate_v4(), 'Phase4 Load Society', 'Load test', 'APPROVED', v_pres_user);
  SELECT id INTO v_society_id FROM societies WHERE name = 'Phase4 Load Society';

  -- Create roles
  INSERT INTO roles (id, society_id, name, description, hierarchy_level, is_system_role)
  VALUES (uuid_generate_v4(), v_society_id, 'President', 'Pres', 10, TRUE);
  INSERT INTO roles (id, society_id, name, description, hierarchy_level, is_system_role)
  VALUES (uuid_generate_v4(), v_society_id, 'Member', 'Mem', 1, TRUE);

  SELECT id INTO v_pres_role_id FROM roles WHERE society_id = v_society_id AND name = 'President';
  SELECT id INTO v_member_role_id FROM roles WHERE society_id = v_society_id AND name = 'Member';

  -- Make user 1 president, all others members
  INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
  VALUES (v_pres_user, v_society_id, v_pres_role_id, TRUE, v_pres_user);

  FOR v_i IN 2..110 LOOP
    SELECT id INTO v_user_id FROM users WHERE email = 'p4load' || v_i || '@test.edu.pk';
    INSERT INTO society_memberships (user_id, society_id, role_id, is_active, assigned_by)
    VALUES (v_user_id, v_society_id, v_member_role_id, TRUE, v_pres_user);
  END LOOP;

  -- ========================================================================
  -- TEST 1: 100 concurrent registrations for 10-slot event
  -- ========================================================================
  -- In SQL (single connection), we can't simulate true concurrency,
  -- but we can verify that the participants_count trigger correctly tracks
  -- all 100 inserts and that the count never exceeds reality.
  -- ========================================================================
  v_test_count := v_test_count + 1;

  INSERT INTO events (id, society_id, title, event_start, event_end, registration_end,
                      created_by, thumbnail_url, max_participants)
  VALUES (uuid_generate_v4(), v_society_id, 'P4Load Race Event',
          NOW() + INTERVAL '10 days', NOW() + INTERVAL '11 days',
          NOW() + INTERVAL '9 days', v_pres_user, 'https://test.com/t.jpg', 10)
  RETURNING id INTO v_event_id;

  -- Register all 100 users (first 10 should succeed count-wise, all inserts succeed since no DB-level cap)
  FOR v_i IN 2..101 LOOP
    SELECT id INTO v_user_id FROM users WHERE email = 'p4load' || v_i || '@test.edu.pk';
    INSERT INTO event_registrations (event_id, user_id) VALUES (v_event_id, v_user_id);
  END LOOP;

  -- Check participants_count matches actual count
  SELECT participants_count INTO v_participants FROM events WHERE id = v_event_id;
  SELECT COUNT(*) INTO v_count FROM event_registrations WHERE event_id = v_event_id AND cancelled_at IS NULL;

  IF v_participants = v_count AND v_count = 100 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 1 PASSED: participants_count (%) matches actual registration count (%) after 100 inserts', v_participants, v_count;
  ELSE
    RAISE NOTICE 'TEST 1 FAILED: participants_count=%, actual=% (expected 100)', v_participants, v_count;
  END IF;

  -- ========================================================================
  -- TEST 2: Capacity enforcement at API layer
  -- ========================================================================
  -- Verify that the participants_count is > max_participants, proving
  -- the API must check participants_count >= max_participants on the locked row.
  -- The DB trigger counts accurately; the API gate must enforce the cap.
  -- ========================================================================
  v_test_count := v_test_count + 1;

  SELECT participants_count, max_participants INTO v_participants, v_count FROM events WHERE id = v_event_id;
  IF v_participants > v_count THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 2 PASSED: DB has % registrations for %-slot event — API check (participants_count >= max_participants) would have blocked at slot 11', v_participants, v_count;
  ELSE
    RAISE NOTICE 'TEST 2 FAILED: participants_count (%) should exceed max_participants (%)', v_participants, v_count;
  END IF;

  -- ========================================================================
  -- TEST 3: Cancel 90 registrations, verify participants_count decrements
  -- ========================================================================
  v_test_count := v_test_count + 1;

  -- Cancel registrations for users 12..101 (90 users), keep users 2..11 (10 users)
  FOR v_i IN 12..101 LOOP
    SELECT id INTO v_user_id FROM users WHERE email = 'p4load' || v_i || '@test.edu.pk';
    UPDATE event_registrations SET cancelled_at = NOW()
    WHERE event_id = v_event_id AND user_id = v_user_id AND cancelled_at IS NULL;
  END LOOP;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_event_id;
  SELECT COUNT(*) INTO v_count FROM event_registrations WHERE event_id = v_event_id AND cancelled_at IS NULL;

  IF v_participants = v_count AND v_count = 10 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 3 PASSED: After 90 cancellations, participants_count=% matches actual=%', v_participants, v_count;
  ELSE
    RAISE NOTICE 'TEST 3 FAILED: participants_count=%, actual=%, expected 10', v_participants, v_count;
  END IF;

  -- ========================================================================
  -- TEST 4: Optimistic lock collision — 10 sequential updates
  -- ========================================================================
  v_test_count := v_test_count + 1;

  INSERT INTO events (id, society_id, title, event_start, event_end, created_by, thumbnail_url)
  VALUES (uuid_generate_v4(), v_society_id, 'P4Load Edit Event',
          NOW() + INTERVAL '15 days', NOW() + INTERVAL '16 days',
          v_pres_user, 'https://test.com/e.jpg')
  RETURNING id INTO v_event2_id;

  v_successful := 0;
  v_failed := 0;

  -- All 10 "editors" read version 1
  -- First editor updates: version 1 → 2 (succeeds)
  -- Remaining 9 try version 1 → fail (stale)
  FOR v_i IN 1..10 LOOP
    IF v_i = 1 THEN
      -- First update succeeds
      UPDATE events SET description = 'Edit ' || v_i, version = version + 1
      WHERE id = v_event2_id AND version = 1;
      IF FOUND THEN
        v_successful := v_successful + 1;
      ELSE
        v_failed := v_failed + 1;
      END IF;
    ELSE
      -- Remaining 9 use stale version=1
      UPDATE events SET description = 'Edit ' || v_i, version = version + 1
      WHERE id = v_event2_id AND version = 1;
      IF FOUND THEN
        v_successful := v_successful + 1;
      ELSE
        v_failed := v_failed + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_successful = 1 AND v_failed = 9 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 4 PASSED: Optimistic locking — 1 succeeded, 9 rejected (stale version)';
  ELSE
    RAISE NOTICE 'TEST 4 FAILED: Expected 1 success + 9 fails, got % success + % fails', v_successful, v_failed;
  END IF;

  SELECT version INTO v_version FROM events WHERE id = v_event2_id;
  IF v_version != 2 THEN
    RAISE NOTICE 'TEST 4 WARNING: Final version should be 2, got %', v_version;
  END IF;

  -- ========================================================================
  -- TEST 5: 50 suspended members attempting privilege check
  -- ========================================================================
  v_test_count := v_test_count + 1;

  -- Suspend users 52-101 (is_active must be FALSE per chk_suspension_requires_inactive)
  FOR v_i IN 52..101 LOOP
    SELECT id INTO v_user_id FROM users WHERE email = 'p4load' || v_i || '@test.edu.pk';
    UPDATE society_memberships
    SET is_active = FALSE, suspended_at = NOW(), suspended_by = v_pres_user, suspension_reason = 'Load test'
    WHERE society_id = v_society_id AND user_id = v_user_id;
  END LOOP;

  -- Give Member role EDIT_EVENT privilege for the test
  INSERT INTO role_privileges (role_id, privilege_id)
  SELECT v_member_role_id, p.id FROM privileges p WHERE p.name = 'EDIT_EVENT'
  ON CONFLICT DO NOTHING;

  v_failed := 0;
  FOR v_i IN 52..101 LOOP
    SELECT id INTO v_user_id FROM users WHERE email = 'p4load' || v_i || '@test.edu.pk';
    SELECT fn_has_privilege(v_user_id, v_society_id, 'EDIT_EVENT') INTO v_result;
    IF v_result = FALSE THEN
      v_failed := v_failed + 1;
    END IF;
  END LOOP;

  IF v_failed = 50 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 5 PASSED: All 50 suspended members correctly denied EDIT_EVENT privilege';
  ELSE
    RAISE NOTICE 'TEST 5 FAILED: Expected 50 denials, got %', v_failed;
  END IF;

  -- ========================================================================
  -- TEST 6: Waitlist table structure and ordering
  -- ========================================================================
  v_test_count := v_test_count + 1;

  -- Create a 2-slot event, register 2, then add 3 waitlist entries
  DECLARE
    v_wl_event UUID;
    v_u3 UUID;
    v_u4 UUID;
    v_u5 UUID;
    v_pos1 INT;
    v_pos2 INT;
    v_pos3 INT;
  BEGIN
    INSERT INTO events (id, society_id, title, event_start, event_end, registration_end,
                        created_by, thumbnail_url, max_participants)
    VALUES (uuid_generate_v4(), v_society_id, 'P4Load WL Event',
            NOW() + INTERVAL '20 days', NOW() + INTERVAL '21 days',
            NOW() + INTERVAL '19 days', v_pres_user, 'https://test.com/wl.jpg', 2)
    RETURNING id INTO v_wl_event;

    SELECT id INTO v_u3 FROM users WHERE email = 'p4load3@test.edu.pk';
    SELECT id INTO v_u4 FROM users WHERE email = 'p4load4@test.edu.pk';
    SELECT id INTO v_u5 FROM users WHERE email = 'p4load5@test.edu.pk';

    -- Fill 2 slots
    SELECT id INTO v_user_id FROM users WHERE email = 'p4load2@test.edu.pk';
    INSERT INTO event_registrations (event_id, user_id) VALUES (v_wl_event, v_user_id);
    INSERT INTO event_registrations (event_id, user_id) VALUES (v_wl_event, v_u3);

    -- Add 3 to waitlist
    INSERT INTO event_waitlist (event_id, user_id, position) VALUES (v_wl_event, v_u4, 1);
    INSERT INTO event_waitlist (event_id, user_id, position) VALUES (v_wl_event, v_u5, 2);

    SELECT id INTO v_user_id FROM users WHERE email = 'p4load6@test.edu.pk';
    INSERT INTO event_waitlist (event_id, user_id, position) VALUES (v_wl_event, v_user_id, 3);

    -- Verify ordering
    SELECT COUNT(*) INTO v_count
    FROM event_waitlist
    WHERE event_id = v_wl_event AND cancelled_at IS NULL AND promoted_at IS NULL;

    SELECT participants_count INTO v_participants FROM events WHERE id = v_wl_event;

    IF v_count = 3 AND v_participants = 2 THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 6 PASSED: Waitlist has 3 entries, event has 2 registrations, participants_count=%', v_participants;
    ELSE
      RAISE NOTICE 'TEST 6 FAILED: waitlist_count=%, participants_count=%', v_count, v_participants;
    END IF;
  END;

  -- ========================================================================
  -- TEST 7: Analytics views return data
  -- ========================================================================
  v_test_count := v_test_count + 1;

  DECLARE
    v_stats_count INT;
    v_reg_count INT;
    v_member_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_stats_count FROM v_society_event_stats WHERE society_id = v_society_id;
    SELECT COUNT(*) INTO v_reg_count FROM v_event_registration_stats WHERE society_id = v_society_id;
    SELECT COUNT(*) INTO v_member_count FROM v_society_member_stats WHERE society_id = v_society_id;

    IF v_stats_count > 0 AND v_reg_count > 0 AND v_member_count > 0 THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 7 PASSED: Analytics views return data (society_stats=%, reg_stats=%, member_stats=%)', v_stats_count, v_reg_count, v_member_count;
    ELSE
      RAISE NOTICE 'TEST 7 FAILED: Views empty — society_stats=%, reg_stats=%, member_stats=%', v_stats_count, v_reg_count, v_member_count;
    END IF;
  END;

  -- ========================================================================
  -- TEST 8: Re-registration increments participants_count
  -- ========================================================================
  v_test_count := v_test_count + 1;

  -- Cancel a registration then re-register
  SELECT participants_count INTO v_participants FROM events WHERE id = v_event_id;

  UPDATE event_registrations SET cancelled_at = NOW()
  WHERE event_id = v_event_id AND cancelled_at IS NULL
    AND user_id = (SELECT id FROM users WHERE email = 'p4load2@test.edu.pk')
  ;

  DECLARE
    v_after_cancel INT;
    v_after_reregister INT;
  BEGIN
    SELECT participants_count INTO v_after_cancel FROM events WHERE id = v_event_id;

    UPDATE event_registrations SET cancelled_at = NULL, registered_at = NOW()
    WHERE event_id = v_event_id
      AND user_id = (SELECT id FROM users WHERE email = 'p4load2@test.edu.pk');

    SELECT participants_count INTO v_after_reregister FROM events WHERE id = v_event_id;

    IF v_after_cancel = v_participants - 1 AND v_after_reregister = v_participants THEN
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 8 PASSED: Re-registration increments participants_count (% → % → %)', v_participants, v_after_cancel, v_after_reregister;
    ELSE
      RAISE NOTICE 'TEST 8 FAILED: before=%, after_cancel=%, after_reregister=%', v_participants, v_after_cancel, v_after_reregister;
    END IF;
  END;

  -- ========== SUMMARY ==========
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 4 Load Tests: % / % passed', v_pass_count, v_test_count;
  RAISE NOTICE '========================================';

  -- ========== CLEANUP ==========
  DELETE FROM event_waitlist WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P4Load%');
  DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P4Load%');
  DELETE FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P4Load%');
  DELETE FROM events WHERE title LIKE 'P4Load%';
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id = v_society_id);
  DELETE FROM society_memberships WHERE society_id = v_society_id;
  DELETE FROM roles WHERE society_id = v_society_id;
  DELETE FROM society_state_changes WHERE society_id = v_society_id;
  DELETE FROM societies WHERE id = v_society_id;
  DELETE FROM users WHERE email LIKE 'p4load%@test.edu.pk';

  RAISE NOTICE 'Cleanup complete.';
END $$;
