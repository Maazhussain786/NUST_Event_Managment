-- 009: Seed Officer role templates only once per society, and let chats target
--      portfolios that have no wing (wings are optional since 003).

ALTER TABLE societies ADD COLUMN IF NOT EXISTS roles_seeded_at TIMESTAMPTZ;

-- Societies seeded by 002 count as seeded.
UPDATE societies s SET roles_seeded_at = NOW()
WHERE roles_seeded_at IS NULL
  AND EXISTS (SELECT 1 FROM roles r WHERE r.society_id = s.id AND r.tier = 'FACULTY_SPONSOR');

-- Essential roles (Faculty Sponsor, Admin tier, Member) are always ensured; their
-- names cannot be edited, so matching by name is safe. Officer templates are
-- added only the first time, so renamed or deleted Officer roles stay that way.
CREATE OR REPLACE FUNCTION fn_seed_society_roles(p_society_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  t RECORD;
  v_role_id UUID;
  v_first_time BOOLEAN;
BEGIN
  SELECT roles_seeded_at IS NULL INTO v_first_time FROM societies WHERE id = p_society_id FOR UPDATE;
  IF v_first_time IS NULL THEN
    RETURN; -- society does not exist
  END IF;

  FOR t IN SELECT * FROM role_templates ORDER BY sort_order LOOP
    CONTINUE WHEN t.tier = 'OFFICER' AND NOT v_first_time;
    SELECT id INTO v_role_id FROM roles WHERE society_id = p_society_id AND name = t.name;
    IF v_role_id IS NULL THEN
      INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role, tier, max_holders)
      VALUES (p_society_id, t.name, t.description, t.hierarchy_level, t.is_system_role, t.tier, t.max_holders)
      RETURNING id INTO v_role_id;

      INSERT INTO role_privileges (role_id, privilege_id)
      SELECT v_role_id, p.id FROM privileges p WHERE p.name = ANY (t.privileges)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  IF v_first_time THEN
    UPDATE societies SET roles_seeded_at = NOW() WHERE id = p_society_id;
  END IF;
END;
$$;

ALTER TABLE chats DROP CONSTRAINT IF EXISTS chk_chat_scope;
