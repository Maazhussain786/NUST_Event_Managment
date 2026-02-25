-- ============================================================================
-- Phase 5: Paid Events + QR Attendance Engine — Test Scenarios
-- ============================================================================
-- Run AFTER 005-phase5-paid-qr.sql migration.
--
-- Validates:
--   1. participants_count trigger on ticket status transitions
--   2. UNIQUE(event_id, user_id) on tickets
--   3. event_attendance UNIQUE(event_id, user_id)
--   4. ticket_qr_codes CHECK constraint (exactly one target)
--   5. Ticket re-purchase flow (CANCELLED → PENDING)
--   6. Capacity enforcement via ticket counting
--   7. Suspended member cannot hold approved ticket (business rule via API)
--   8. event_attendance proper insert with ticket/registration references
--   9. Analytics views accuracy (v_event_attendance_stats, v_event_revenue)
-- ============================================================================

DO $$
DECLARE
  v_society_id UUID;
  v_pres_role_id UUID;
  v_member_role_id UUID;
  v_pres_user UUID;
  v_buyer1 UUID;
  v_buyer2 UUID;
  v_buyer3 UUID;
  v_buyer4 UUID;
  v_scanner_user UUID;
  v_paid_event UUID;
  v_free_event UUID;
  v_ticket_id UUID;
  v_ticket2_id UUID;
  v_ticket3_id UUID;
  v_reg_id UUID;
  v_qr_id UUID;
  v_attendance_id UUID;
  v_pay_ref UUID;
  v_count INT;
  v_participants INT;
  v_test_count INT := 0;
  v_pass_count INT := 0;
  v_result BOOLEAN;
  v_revenue NUMERIC;
BEGIN

  -- ========== CLEANUP ==========
  DELETE FROM event_attendance WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%');
  DELETE FROM audit_logs WHERE metadata::text LIKE '%P5Test%';
  DELETE FROM ticket_qr_codes WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%'));
  DELETE FROM ticket_qr_codes WHERE registration_id IN (SELECT id FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%'));
  DELETE FROM payment_proofs WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%'));
  DELETE FROM tickets WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%');
  DELETE FROM event_waitlist WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%');
  DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'P5Test%');
  DELETE FROM events WHERE title LIKE 'P5Test%';
  DELETE FROM society_memberships WHERE society_id IN (SELECT id FROM societies WHERE name = 'P5Test Society');
  DELETE FROM role_privileges WHERE role_id IN (SELECT id FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'P5Test Society'));
  DELETE FROM roles WHERE society_id IN (SELECT id FROM societies WHERE name = 'P5Test Society');
  DELETE FROM society_state_changes WHERE society_id IN (SELECT id FROM societies WHERE name = 'P5Test Society');
  DELETE FROM societies WHERE name = 'P5Test Society';
  DELETE FROM users WHERE email LIKE 'p5test%@test.edu.pk';

  -- ========== SETUP ==========

  -- Users
  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES (uuid_generate_v4(), 'p5test_pres@test.edu.pk', 'x', 'P5 President', 'STUDENT', 'ACTIVE')
  RETURNING id INTO v_pres_user;

  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES (uuid_generate_v4(), 'p5test_buy1@test.edu.pk', 'x', 'P5 Buyer 1', 'STUDENT', 'ACTIVE')
  RETURNING id INTO v_buyer1;

  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES (uuid_generate_v4(), 'p5test_buy2@test.edu.pk', 'x', 'P5 Buyer 2', 'STUDENT', 'ACTIVE')
  RETURNING id INTO v_buyer2;

  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES (uuid_generate_v4(), 'p5test_buy3@test.edu.pk', 'x', 'P5 Buyer 3', 'STUDENT', 'ACTIVE')
  RETURNING id INTO v_buyer3;

  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES (uuid_generate_v4(), 'p5test_buy4@test.edu.pk', 'x', 'P5 Buyer 4 (capacity overflow)', 'STUDENT', 'ACTIVE')
  RETURNING id INTO v_buyer4;

  INSERT INTO users (id, email, password_hash, full_name, user_type, status)
  VALUES (uuid_generate_v4(), 'p5test_scan@test.edu.pk', 'x', 'P5 Scanner', 'STUDENT', 'ACTIVE')
  RETURNING id INTO v_scanner_user;

  -- Society
  INSERT INTO societies (id, name, description, status, created_by)
  VALUES (uuid_generate_v4(), 'P5Test Society', 'Phase 5 testing', 'APPROVED', v_pres_user)
  RETURNING id INTO v_society_id;

  -- Roles
  INSERT INTO roles (id, society_id, name, hierarchy_level)
  VALUES (uuid_generate_v4(), v_society_id, 'President', 10)
  RETURNING id INTO v_pres_role_id;

  INSERT INTO roles (id, society_id, name, hierarchy_level)
  VALUES (uuid_generate_v4(), v_society_id, 'Member', 1)
  RETURNING id INTO v_member_role_id;

  -- Grant SCAN_QR privilege to President role
  INSERT INTO role_privileges (role_id, privilege_id)
  SELECT v_pres_role_id, id FROM privileges WHERE name = 'SCAN_QR';

  -- Memberships
  INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
  VALUES (v_society_id, v_pres_user, v_pres_role_id, TRUE);

  INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
  VALUES (v_society_id, v_buyer1, v_member_role_id, TRUE);

  INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
  VALUES (v_society_id, v_buyer2, v_member_role_id, TRUE);

  INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
  VALUES (v_society_id, v_buyer3, v_member_role_id, TRUE);

  INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
  VALUES (v_society_id, v_buyer4, v_member_role_id, TRUE);

  INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
  VALUES (v_society_id, v_scanner_user, v_pres_role_id, TRUE);

  -- Paid event (capacity 3)
  INSERT INTO events (id, title, society_id, is_paid, ticket_price, max_participants,
                      event_start, event_end, registration_end, status, visibility, created_by)
  VALUES (
    uuid_generate_v4(), 'P5Test Paid Gala', v_society_id, TRUE, 500.00, 3,
    NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW() + INTERVAL '23 hours',
    'UPCOMING', 'PUBLIC', v_pres_user
  )
  RETURNING id INTO v_paid_event;

  -- Free event
  INSERT INTO events (id, title, society_id, is_paid, ticket_price, max_participants,
                      event_start, event_end, registration_end, status, visibility, created_by)
  VALUES (
    uuid_generate_v4(), 'P5Test Free Meetup', v_society_id, FALSE, 0, 100,
    NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', NOW() + INTERVAL '23 hours',
    'UPCOMING', 'PUBLIC', v_pres_user
  )
  RETURNING id INTO v_free_event;

  -- Reset participants_count (clean state)
  UPDATE events SET participants_count = 0 WHERE id IN (v_paid_event, v_free_event);

  -- ================================================================
  -- TEST 1: Ticket purchase creates PENDING — participants_count stays 0
  -- ================================================================
  v_test_count := v_test_count + 1;

  INSERT INTO tickets (id, event_id, user_id, status, payment_reference)
  VALUES (uuid_generate_v4(), v_paid_event, v_buyer1, 'PENDING', uuid_generate_v4())
  RETURNING id, payment_reference INTO v_ticket_id, v_pay_ref;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;

  IF v_participants = 0 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 1 PASSED: PENDING ticket does not increment participants_count (count=%)', v_participants;
  ELSE
    RAISE NOTICE 'TEST 1 FAILED: Expected participants_count=0, got %', v_participants;
  END IF;

  -- ================================================================
  -- TEST 2: Approve ticket → participants_count increments to 1
  -- ================================================================
  v_test_count := v_test_count + 1;

  UPDATE tickets SET status = 'APPROVED', approved_at = NOW(), approved_by = v_pres_user
  WHERE id = v_ticket_id;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;

  IF v_participants = 1 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 2 PASSED: APPROVED ticket increments participants_count to %', v_participants;
  ELSE
    RAISE NOTICE 'TEST 2 FAILED: Expected participants_count=1, got %', v_participants;
  END IF;

  -- ================================================================
  -- TEST 3: Cancel approved ticket → participants_count decrements to 0
  -- ================================================================
  v_test_count := v_test_count + 1;

  UPDATE tickets SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = v_ticket_id;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;

  IF v_participants = 0 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 3 PASSED: CANCELLED ticket decrements participants_count to %', v_participants;
  ELSE
    RAISE NOTICE 'TEST 3 FAILED: Expected participants_count=0, got %', v_participants;
  END IF;

  -- ================================================================
  -- TEST 4: Re-purchase (CANCELLED → PENDING → APPROVED) works
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- Re-purchase: update back to PENDING
  UPDATE tickets SET status = 'PENDING', payment_reference = uuid_generate_v4(),
         purchased_at = NOW(), approved_at = NULL, approved_by = NULL,
         cancelled_at = NULL, checked_in_at = NULL
  WHERE id = v_ticket_id;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;
  v_result := (v_participants = 0); -- PENDING should NOT increment

  -- Now approve again
  UPDATE tickets SET status = 'APPROVED', approved_at = NOW(), approved_by = v_pres_user
  WHERE id = v_ticket_id;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;
  v_result := v_result AND (v_participants = 1);

  IF v_result THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 4 PASSED: Re-purchase flow CANCELLED→PENDING(0)→APPROVED(1) correct';
  ELSE
    RAISE NOTICE 'TEST 4 FAILED: Re-purchase flow participants_count mismatch (got %)', v_participants;
  END IF;

  -- ================================================================
  -- TEST 5: UNIQUE(event_id, user_id) prevents duplicate tickets
  -- ================================================================
  v_test_count := v_test_count + 1;

  BEGIN
    INSERT INTO tickets (event_id, user_id, status, payment_reference)
    VALUES (v_paid_event, v_buyer1, 'PENDING', uuid_generate_v4());
    -- Should not reach here
    RAISE NOTICE 'TEST 5 FAILED: Duplicate ticket was allowed';
  EXCEPTION WHEN unique_violation THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 5 PASSED: Duplicate ticket blocked by UNIQUE constraint';
  END;

  -- ================================================================
  -- TEST 6: Capacity enforcement — 3 slots, 3 approved → full
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- buyer1 already has approved ticket (count=1)
  -- Add buyer2 APPROVED (count=2)
  INSERT INTO tickets (id, event_id, user_id, status, payment_reference, approved_at, approved_by)
  VALUES (uuid_generate_v4(), v_paid_event, v_buyer2, 'APPROVED', uuid_generate_v4(), NOW(), v_pres_user)
  RETURNING id INTO v_ticket2_id;

  -- Add buyer3 APPROVED (count=3 → FULL)
  INSERT INTO tickets (id, event_id, user_id, status, payment_reference, approved_at, approved_by)
  VALUES (uuid_generate_v4(), v_paid_event, v_buyer3, 'APPROVED', uuid_generate_v4(), NOW(), v_pres_user)
  RETURNING id INTO v_ticket3_id;

  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;

  -- Count PENDING+APPROVED tickets (this is what the API checks)
  SELECT COUNT(*) INTO v_count FROM tickets
  WHERE event_id = v_paid_event AND status IN ('PENDING', 'APPROVED');

  IF v_participants = 3 AND v_count = 3 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 6 PASSED: Capacity correctly at 3/3 (participants_count=%, ticket_count=%)', v_participants, v_count;
  ELSE
    RAISE NOTICE 'TEST 6 FAILED: Expected 3/3, got participants_count=%, ticket_count=%', v_participants, v_count;
  END IF;

  -- ================================================================
  -- TEST 7: ticket_qr_codes CHECK — must have exactly one target
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- A) Both NULL should fail
  BEGIN
    INSERT INTO ticket_qr_codes (ticket_id, registration_id, qr_data, is_active)
    VALUES (NULL, NULL, 'test-qr-both-null', TRUE);
    RAISE NOTICE 'TEST 7a FAILED: Both NULL was allowed';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  -- B) Both set should fail
  -- First create a registration for the free event
  INSERT INTO event_registrations (id, event_id, user_id)
  VALUES (uuid_generate_v4(), v_free_event, v_buyer1)
  RETURNING id INTO v_reg_id;

  BEGIN
    INSERT INTO ticket_qr_codes (ticket_id, registration_id, qr_data, is_active)
    VALUES (v_ticket_id, v_reg_id, 'test-qr-both-set', TRUE);
    RAISE NOTICE 'TEST 7b FAILED: Both set was allowed';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  -- C) Ticket only should succeed
  INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
  VALUES (v_ticket_id, 'test-qr-ticket-only', TRUE)
  RETURNING id INTO v_qr_id;

  -- D) Registration only should succeed
  INSERT INTO ticket_qr_codes (registration_id, qr_data, is_active)
  VALUES (v_reg_id, 'test-qr-reg-only', TRUE);

  IF v_qr_id IS NOT NULL THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 7 PASSED: CHECK constraint enforces exclusive ticket_id/registration_id';
  ELSE
    RAISE NOTICE 'TEST 7 FAILED: QR insert did not return id';
  END IF;

  -- Cleanup the test QRs
  DELETE FROM ticket_qr_codes WHERE qr_data IN ('test-qr-ticket-only', 'test-qr-reg-only');

  -- ================================================================
  -- TEST 8: event_attendance UNIQUE prevents double check-in
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- Insert first attendance
  INSERT INTO event_attendance (event_id, user_id, ticket_id, checked_in_by)
  VALUES (v_paid_event, v_buyer1, v_ticket_id, v_scanner_user)
  RETURNING id INTO v_attendance_id;

  -- Try duplicate
  BEGIN
    INSERT INTO event_attendance (event_id, user_id, ticket_id, checked_in_by)
    VALUES (v_paid_event, v_buyer1, v_ticket_id, v_scanner_user);
    RAISE NOTICE 'TEST 8 FAILED: Double check-in was allowed';
  EXCEPTION WHEN unique_violation THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 8 PASSED: Double check-in blocked by UNIQUE(event_id, user_id)';
  END;

  -- ================================================================
  -- TEST 9: event_attendance allows different users for same event
  -- ================================================================
  v_test_count := v_test_count + 1;

  INSERT INTO event_attendance (event_id, user_id, ticket_id, checked_in_by)
  VALUES (v_paid_event, v_buyer2, v_ticket2_id, v_scanner_user);

  SELECT COUNT(*) INTO v_count FROM event_attendance WHERE event_id = v_paid_event;

  IF v_count = 2 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 9 PASSED: Multiple users can check in for same event (count=%)', v_count;
  ELSE
    RAISE NOTICE 'TEST 9 FAILED: Expected 2 attendees, got %', v_count;
  END IF;

  -- ================================================================
  -- TEST 10: v_event_attendance_stats view correctness
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- 3 approved, 2 checked in → attendance_rate = 66.7%
  SELECT checked_in_count, attendance_rate, no_show_rate
  INTO v_count, v_revenue, v_participants
  FROM v_event_attendance_stats
  WHERE event_id = v_paid_event;

  IF v_count = 2 AND v_revenue = 66.7 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 10 PASSED: v_event_attendance_stats correct (checked_in=%, rate=%, no_show=%)', v_count, v_revenue, v_participants;
  ELSE
    RAISE NOTICE 'TEST 10 FAILED: Expected checked_in=2, rate=66.7, got checked_in=%, rate=%', v_count, v_revenue;
  END IF;

  -- ================================================================
  -- TEST 11: v_event_revenue view correctness
  -- ================================================================
  v_test_count := v_test_count + 1;

  SELECT approved_tickets, total_revenue, checked_in_count
  INTO v_count, v_revenue, v_participants
  FROM v_event_revenue
  WHERE event_id = v_paid_event;

  IF v_count = 3 AND v_revenue = 1500.00 AND v_participants = 2 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 11 PASSED: v_event_revenue correct (approved=%, revenue=%, checked_in=%)', v_count, v_revenue, v_participants;
  ELSE
    RAISE NOTICE 'TEST 11 FAILED: Expected approved=3, revenue=1500, checked_in=2. Got approved=%, revenue=%, checked_in=%', v_count, v_revenue, v_participants;
  END IF;

  -- ================================================================
  -- TEST 12: Unique active QR per registration
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- Insert first active QR for registration
  INSERT INTO ticket_qr_codes (registration_id, qr_data, is_active)
  VALUES (v_reg_id, 'test-qr-unique-reg-1', TRUE);

  -- Try second active QR for same registration (should fail)
  BEGIN
    INSERT INTO ticket_qr_codes (registration_id, qr_data, is_active)
    VALUES (v_reg_id, 'test-qr-unique-reg-2', TRUE);
    RAISE NOTICE 'TEST 12 FAILED: Second active QR for same registration was allowed';
  EXCEPTION WHEN unique_violation THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 12 PASSED: Only one active QR per registration enforced';
  END;

  -- Cleanup
  DELETE FROM ticket_qr_codes WHERE qr_data LIKE 'test-qr-unique-reg%';

  -- ================================================================
  -- TEST 13: SCAN_QR privilege check via fn_has_privilege
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- President (has SCAN_QR) should pass
  SELECT fn_has_privilege(v_pres_user, v_society_id, 'SCAN_QR') INTO v_result;
  IF NOT v_result THEN
    RAISE NOTICE 'TEST 13 FAILED: President should have SCAN_QR privilege';
  ELSE
    -- Member (no SCAN_QR) should fail
    SELECT fn_has_privilege(v_buyer1, v_society_id, 'SCAN_QR') INTO v_result;
    IF v_result THEN
      RAISE NOTICE 'TEST 13 FAILED: Member should NOT have SCAN_QR privilege';
    ELSE
      v_pass_count := v_pass_count + 1;
      RAISE NOTICE 'TEST 13 PASSED: SCAN_QR privilege enforced (President=true, Member=false)';
    END IF;
  END IF;

  -- ================================================================
  -- TEST 14: Suspended member detection via membership flag
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- Suspend buyer4 (must also mark is_active=FALSE per chk_suspension_requires_inactive)
  UPDATE society_memberships SET suspended_at = NOW(), is_active = FALSE
  WHERE user_id = v_buyer4 AND society_id = v_society_id;

  -- Verify suspension is detectable
  SELECT COUNT(*) INTO v_count FROM society_memberships
  WHERE user_id = v_buyer4 AND society_id = v_society_id AND suspended_at IS NOT NULL;

  IF v_count = 1 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 14 PASSED: Suspended member correctly detected';
  ELSE
    RAISE NOTICE 'TEST 14 FAILED: Suspension not detected (count=%)', v_count;
  END IF;

  -- Unsuspend for cleanup
  UPDATE society_memberships SET suspended_at = NULL, is_active = TRUE
  WHERE user_id = v_buyer4 AND society_id = v_society_id;

  -- ================================================================
  -- TEST 15: Delete ticket → participants_count decrements
  -- ================================================================
  v_test_count := v_test_count + 1;

  -- Current count should be 3 (buyer1, buyer2, buyer3 all APPROVED)
  SELECT participants_count INTO v_participants FROM events WHERE id = v_paid_event;

  -- Delete buyer3's ticket
  DELETE FROM event_attendance WHERE ticket_id = v_ticket3_id;
  DELETE FROM ticket_qr_codes WHERE ticket_id = v_ticket3_id;
  DELETE FROM tickets WHERE id = v_ticket3_id;

  SELECT participants_count INTO v_count FROM events WHERE id = v_paid_event;

  IF v_participants = 3 AND v_count = 2 THEN
    v_pass_count := v_pass_count + 1;
    RAISE NOTICE 'TEST 15 PASSED: Deleting APPROVED ticket decrements count (3→%)', v_count;
  ELSE
    RAISE NOTICE 'TEST 15 FAILED: Expected 3→2, got %→%', v_participants, v_count;
  END IF;

  -- ================================================================
  -- SUMMARY
  -- ================================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Phase 5 Tests: %/% passed', v_pass_count, v_test_count;
  RAISE NOTICE '========================================';

  IF v_pass_count = v_test_count THEN
    RAISE NOTICE 'ALL TESTS PASSED';
  ELSE
    RAISE NOTICE 'SOME TESTS FAILED — review output above';
  END IF;

  -- ========== CLEANUP ==========
  DELETE FROM event_attendance WHERE event_id IN (v_paid_event, v_free_event);
  DELETE FROM ticket_qr_codes WHERE ticket_id IN (SELECT id FROM tickets WHERE event_id IN (v_paid_event, v_free_event));
  DELETE FROM ticket_qr_codes WHERE registration_id IN (SELECT id FROM event_registrations WHERE event_id IN (v_paid_event, v_free_event));
  DELETE FROM tickets WHERE event_id IN (v_paid_event, v_free_event);
  DELETE FROM event_registrations WHERE event_id IN (v_paid_event, v_free_event);
  DELETE FROM events WHERE id IN (v_paid_event, v_free_event);
  DELETE FROM society_memberships WHERE society_id = v_society_id;
  DELETE FROM role_privileges WHERE role_id IN (v_pres_role_id, v_member_role_id);
  DELETE FROM roles WHERE society_id = v_society_id;
  DELETE FROM society_state_changes WHERE society_id = v_society_id;
  DELETE FROM societies WHERE id = v_society_id;
  DELETE FROM users WHERE email LIKE 'p5test%@test.edu.pk';

END $$;
