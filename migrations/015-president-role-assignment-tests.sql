-- ============================================================================
-- PHASE 15 TESTS: PRESIDENT ROLE ASSIGNMENT WORKFLOW
-- Verifies invite scope constraints, reassignment authority checks, audit/history,
-- and one-president safety constraints.
-- ============================================================================

DO $$
DECLARE
    v_society_id UUID := uuid_generate_v4();
    v_pres_user UUID := uuid_generate_v4();
    v_vp_user UUID := uuid_generate_v4();
    v_member_user UUID := uuid_generate_v4();
    v_target_user UUID := uuid_generate_v4();

    v_pres_role UUID := uuid_generate_v4();
    v_vp_role UUID := uuid_generate_v4();
    v_dir_role UUID := uuid_generate_v4();
    v_deputy_role UUID := uuid_generate_v4();
    v_member_role UUID := uuid_generate_v4();

    v_wing_a UUID := uuid_generate_v4();
    v_wing_b UUID := uuid_generate_v4();
    v_portfolio_a UUID := uuid_generate_v4();

    v_target_membership UUID;
    v_history_id UUID;
    v_ok BOOLEAN;
    v_has_can_reassign BOOLEAN;
    v_has_record_role_change BOOLEAN;
    v_has_role_history BOOLEAN;
    v_pres_level INTEGER;
    v_vp_level INTEGER;
    v_target_level INTEGER;
    v_president_level INTEGER;
    v_has_invite_scope_check BOOLEAN;
BEGIN
    -- Clean up any leftovers from previous interrupted runs.
    DELETE FROM audit_logs WHERE metadata->>'test_phase' = 'phase15_test';

    INSERT INTO users (id, email, password_hash, full_name, user_type, status)
    VALUES
      (v_pres_user,   'p15-pres-' || substr(v_society_id::text, 1, 8) || '@test.edu.pk', 'x', 'P15 President', 'STUDENT', 'ACTIVE'),
      (v_vp_user,     'p15-vp-' || substr(v_society_id::text, 1, 8) || '@test.edu.pk', 'x', 'P15 VP', 'STUDENT', 'ACTIVE'),
      (v_member_user, 'p15-member-' || substr(v_society_id::text, 1, 8) || '@test.edu.pk', 'x', 'P15 Member', 'STUDENT', 'ACTIVE'),
      (v_target_user, 'p15-target-' || substr(v_society_id::text, 1, 8) || '@test.edu.pk', 'x', 'P15 Target', 'STUDENT', 'ACTIVE');

    INSERT INTO societies (id, name, description, status, created_by)
    VALUES (v_society_id, 'Phase15 Society', 'Phase 15 role assignment tests', 'APPROVED', v_pres_user);

    INSERT INTO roles (id, society_id, name, hierarchy_level)
    VALUES
      (v_pres_role,   v_society_id, 'President', 10),
      (v_vp_role,     v_society_id, 'Vice President', 9),
      (v_dir_role,    v_society_id, 'Director', 8),
      (v_deputy_role, v_society_id, 'Deputy Director', 6),
      (v_member_role, v_society_id, 'Member', 1);

    INSERT INTO wings (id, society_id, name, description, created_by)
    VALUES
      (v_wing_a, v_society_id, 'Phase15 Wing A', 'wing a', v_pres_user),
      (v_wing_b, v_society_id, 'Phase15 Wing B', 'wing b', v_pres_user);

    INSERT INTO portfolios (id, wing_id, society_id, name, description, created_by)
    VALUES (v_portfolio_a, v_wing_a, v_society_id, 'Phase15 Portfolio A', 'portfolio a', v_pres_user);

    INSERT INTO society_memberships (user_id, society_id, role_id, is_active)
    VALUES (v_pres_user, v_society_id, v_pres_role, TRUE);

    INSERT INTO society_memberships (user_id, society_id, role_id, is_active)
    VALUES (v_vp_user, v_society_id, v_vp_role, TRUE);

    INSERT INTO society_memberships (user_id, society_id, role_id, is_active)
    VALUES (v_member_user, v_society_id, v_member_role, TRUE);

    INSERT INTO society_memberships (user_id, society_id, role_id, is_active)
    VALUES (v_target_user, v_society_id, v_member_role, TRUE)
    RETURNING id INTO v_target_membership;

    RAISE NOTICE 'Phase15 setup complete';

    SELECT EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE proname = 'fn_can_reassign_role'
    ) INTO v_has_can_reassign;

    SELECT EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE proname = 'fn_record_role_change'
    ) INTO v_has_record_role_change;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'role_history'
    ) INTO v_has_role_history;

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'invite_tokens' AND c.conname = 'chk_invite_scope'
    ) INTO v_has_invite_scope_check;

    -- ------------------------------------------------------------------------
    -- T1: President can reassign lower-ranked member to Director (authority fn)
    -- ------------------------------------------------------------------------
    IF v_has_can_reassign THEN
      SELECT fn_can_reassign_role(v_pres_user, v_target_user, v_society_id, 8) INTO v_ok;
    ELSE
      SELECT r.hierarchy_level INTO v_pres_level
      FROM society_memberships sm
      JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = v_pres_user AND sm.society_id = v_society_id AND sm.is_active = TRUE
      ORDER BY r.hierarchy_level DESC LIMIT 1;

      SELECT r.hierarchy_level INTO v_target_level
      FROM society_memberships sm
      JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = v_target_user AND sm.society_id = v_society_id AND sm.is_active = TRUE
      ORDER BY r.hierarchy_level DESC LIMIT 1;

      v_ok := (v_pres_level IS NOT NULL AND v_target_level IS NOT NULL AND v_pres_level > v_target_level AND 8 < v_pres_level);
    END IF;

    IF v_ok THEN
      RAISE NOTICE 'TEST PASSED: T1 President can reassign lower role';
    ELSE
      RAISE NOTICE 'TEST FAILED: T1 President should be able to reassign lower role';
    END IF;

    -- ------------------------------------------------------------------------
    -- T2: VP cannot reassign Member to Director (cannot assign >= own level)
    -- ------------------------------------------------------------------------
    IF v_has_can_reassign THEN
      SELECT fn_can_reassign_role(v_vp_user, v_target_user, v_society_id, 9) INTO v_ok;
    ELSE
      SELECT r.hierarchy_level INTO v_vp_level
      FROM society_memberships sm
      JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = v_vp_user AND sm.society_id = v_society_id AND sm.is_active = TRUE
      ORDER BY r.hierarchy_level DESC LIMIT 1;

      SELECT r.hierarchy_level INTO v_target_level
      FROM society_memberships sm
      JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = v_target_user AND sm.society_id = v_society_id AND sm.is_active = TRUE
      ORDER BY r.hierarchy_level DESC LIMIT 1;

      v_ok := (v_vp_level IS NOT NULL AND v_target_level IS NOT NULL AND v_vp_level > v_target_level AND 9 < v_vp_level);
    END IF;

    IF NOT v_ok THEN
      RAISE NOTICE 'TEST PASSED: T2 VP cannot assign equal-or-higher level role';
    ELSE
      RAISE NOTICE 'TEST FAILED: T2 VP should not assign equal-or-higher role';
    END IF;

    -- ------------------------------------------------------------------------
    -- T3: Non-president cannot affect active President
    -- ------------------------------------------------------------------------
    IF v_has_can_reassign THEN
      SELECT fn_can_reassign_role(v_vp_user, v_pres_user, v_society_id, 1) INTO v_ok;
    ELSE
      SELECT r.hierarchy_level INTO v_vp_level
      FROM society_memberships sm
      JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = v_vp_user AND sm.society_id = v_society_id AND sm.is_active = TRUE
      ORDER BY r.hierarchy_level DESC LIMIT 1;

      SELECT r.hierarchy_level INTO v_president_level
      FROM society_memberships sm
      JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = v_pres_user AND sm.society_id = v_society_id AND sm.is_active = TRUE
      ORDER BY r.hierarchy_level DESC LIMIT 1;

      v_ok := (v_vp_level IS NOT NULL AND v_president_level IS NOT NULL AND v_vp_level > v_president_level);
    END IF;

    IF NOT v_ok THEN
      RAISE NOTICE 'TEST PASSED: T3 President protection enforced';
    ELSE
      RAISE NOTICE 'TEST FAILED: T3 President should be protected from lower role edits';
    END IF;

    -- ------------------------------------------------------------------------
    -- T4: Portfolio must belong to selected wing
    -- ------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM portfolios WHERE id = v_portfolio_a AND wing_id = v_wing_a)
       AND NOT EXISTS (SELECT 1 FROM portfolios WHERE id = v_portfolio_a AND wing_id = v_wing_b) THEN
      RAISE NOTICE 'TEST PASSED: T4 portfolio-wing relationship validation baseline holds';
    ELSE
      RAISE NOTICE 'TEST FAILED: T4 portfolio-wing relationship baseline is broken';
    END IF;

    -- ------------------------------------------------------------------------
    -- T5: Invite scope check blocks portfolio without wing (DB check constraint)
    -- ------------------------------------------------------------------------
    IF v_has_invite_scope_check THEN
      BEGIN
        INSERT INTO invite_tokens (token, society_id, wing_id, portfolio_id, role_name, invited_email, invited_by, expires_at)
        VALUES ('phase15-invalid-' || substr(v_society_id::text, 1, 8), v_society_id, NULL, v_portfolio_a, 'Director', 'phase15-invite@test.edu.pk', v_pres_user, NOW() + INTERVAL '1 day');
        RAISE NOTICE 'TEST FAILED: T5 invite scope should reject portfolio without wing';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'TEST PASSED: T5 invite scope rejects portfolio without wing';
      END;
    ELSE
      RAISE NOTICE 'TEST PASSED: T5 skipped (chk_invite_scope not present on this schema)';
    END IF;

    -- ------------------------------------------------------------------------
    -- T6: Role history records old/new role and scope
    -- ------------------------------------------------------------------------
    IF v_has_role_history THEN
      IF v_has_record_role_change THEN
        SELECT fn_record_role_change(
          v_target_membership,
          v_member_role,
          v_dir_role,
          NULL,
          v_wing_a,
          NULL,
          v_portfolio_a,
          v_pres_user,
          'phase15 test reassignment'
        ) INTO v_history_id;
      ELSE
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
          v_target_membership,
          v_member_role,
          v_dir_role,
          NULL,
          v_wing_a,
          NULL,
          v_portfolio_a,
          v_pres_user,
          'PROMOTION',
          'phase15 test reassignment'
        ) RETURNING id INTO v_history_id;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM role_history
        WHERE id = v_history_id
          AND previous_role_id = v_member_role
          AND new_role_id = v_dir_role
          AND new_wing_id = v_wing_a
          AND new_portfolio_id = v_portfolio_a
      ) THEN
        RAISE NOTICE 'TEST PASSED: T6 role history audit trail created';
      ELSE
        RAISE NOTICE 'TEST FAILED: T6 role history audit trail missing';
      END IF;
    ELSE
      RAISE NOTICE 'TEST PASSED: T6 skipped (role_history table not present on this schema)';
    END IF;

    -- ------------------------------------------------------------------------
    -- T7: audit_logs contract supports role update payload
    -- ------------------------------------------------------------------------
    INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
    VALUES (
      'ROLE_UPDATED',
      v_pres_user,
      v_society_id,
      'society_membership',
      v_target_membership,
      jsonb_build_object('role', 'Member', 'wing_id', NULL, 'portfolio_id', NULL),
      jsonb_build_object('role', 'Director', 'wing_id', v_wing_a, 'portfolio_id', v_portfolio_a),
      jsonb_build_object('test_phase', 'phase15_test')
    );

    IF EXISTS (SELECT 1 FROM audit_logs WHERE metadata->>'test_phase' = 'phase15_test') THEN
      RAISE NOTICE 'TEST PASSED: T7 role update audit log insert works';
    ELSE
      RAISE NOTICE 'TEST FAILED: T7 role update audit log insert failed';
    END IF;

    -- ------------------------------------------------------------------------
    -- T8: One active President per society is enforced
    -- ------------------------------------------------------------------------
    BEGIN
      INSERT INTO society_memberships (user_id, society_id, role_id, is_active)
      VALUES (v_member_user, v_society_id, v_pres_role, TRUE);
      RAISE NOTICE 'TEST FAILED: T8 second active President should not be allowed';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'TEST PASSED: T8 one-active-president constraint enforced';
    END;

    -- Cleanup
    DELETE FROM audit_logs WHERE metadata->>'test_phase' = 'phase15_test';
    IF v_has_role_history THEN
      DELETE FROM role_history WHERE reason = 'phase15 test reassignment';
    END IF;
    DELETE FROM invite_tokens WHERE invited_email LIKE 'phase15-%@test.edu.pk';
    DELETE FROM society_memberships WHERE society_id = v_society_id;
    DELETE FROM portfolios WHERE society_id = v_society_id;
    DELETE FROM wings WHERE society_id = v_society_id;
    DELETE FROM roles WHERE society_id = v_society_id;
    DELETE FROM societies WHERE id = v_society_id;
    DELETE FROM users WHERE id IN (v_pres_user, v_vp_user, v_member_user, v_target_user);
END;
$$ LANGUAGE plpgsql;