-- 002: SRS role model (FR-ROLE-01..06).
--
-- Society-level role tiers (stored on roles.tier):
--   FACULTY_SPONSOR  highest authority; the only tier that approves minutes and
--                    defines Officer permissions
--   ADMIN            full access to every module (President, designated admins)
--   OFFICER          office-bearers whose permissions the Faculty Sponsor sets
--   MEMBER           general member, no management access by default
-- Event Head, Team Lead and Executive are event/team assignments (migration 003),
-- not society roles. Audience members need no role at all.

-- ---------------------------------------------------------------------------
-- 1. Role tiers
-- ---------------------------------------------------------------------------
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS tier        TEXT,
  ADD COLUMN IF NOT EXISTS max_holders INTEGER;

-- Existing roles: President -> Admin tier, Member -> Member, everything else -> Officer.
-- Levels move to a 0-100 scale: FS 100, President 95, Admin 90, Officers 20-80, Member 10.
UPDATE roles SET
  tier = CASE
           WHEN name = 'Faculty Sponsor' THEN 'FACULTY_SPONSOR'
           WHEN name IN ('President', 'Admin') THEN 'ADMIN'
           WHEN name = 'Member' THEN 'MEMBER'
           ELSE 'OFFICER'
         END,
  hierarchy_level = CASE
           WHEN name = 'Faculty Sponsor'  THEN 100
           WHEN name = 'President'        THEN 95
           WHEN name = 'Admin'            THEN 90
           WHEN name = 'Vice President'   THEN 70
           WHEN name = 'Director'         THEN 60
           WHEN name = 'Deputy Director'  THEN 55
           WHEN name = 'Member'           THEN 10
           ELSE GREATEST(20, LEAST(80, hierarchy_level * 8))
         END,
  max_holders = CASE WHEN name IN ('President', 'Faculty Sponsor') THEN 1 ELSE max_holders END
WHERE tier IS NULL;

-- Director / Deputy Director were society-wide roles in the old model. In the SRS
-- they are Team Leads inside an event, so the old roles become ordinary
-- (deletable) officer roles.
UPDATE roles SET is_system_role = FALSE WHERE name IN ('Director', 'Deputy Director');

ALTER TABLE roles ALTER COLUMN tier SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE roles ADD CONSTRAINT roles_tier_ck
    CHECK (tier IN ('FACULTY_SPONSOR', 'ADMIN', 'OFFICER', 'MEMBER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE roles ADD CONSTRAINT roles_level_range_ck CHECK (hierarchy_level BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Privilege catalog
-- ---------------------------------------------------------------------------
ALTER TABLE privileges
  ADD COLUMN IF NOT EXISTS module     TEXT,
  ADD COLUMN IF NOT EXISTS label      TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

INSERT INTO privileges (name, module, label, description, sort_order) VALUES
  -- Accounts and roles
  ('APPROVE_ACCOUNTS',   'Accounts & roles', 'Approve account requests',     'Approve, reject or ask for more information on account/access requests', 10),
  ('MANAGE_MEMBERS',     'Accounts & roles', 'Manage members',               'Add, suspend, reactivate or remove members', 11),
  ('MANAGE_ROLES',       'Accounts & roles', 'Assign roles',                 'Assign and change member roles', 12),
  -- Events
  ('CREATE_EVENT',       'Events', 'Create events',                          'Create new events', 20),
  ('EDIT_EVENT',         'Events', 'Edit events',                            'Edit event details', 21),
  ('CANCEL_EVENT',       'Events', 'Cancel / archive / delete events',       'Cancel, archive, delete or restore events', 22),
  ('MANAGE_EVENT_PLAN',  'Events', 'Edit event plans',                       'Edit event days, venues and time slots', 23),
  -- Teams
  ('MANAGE_TEAMS',       'Teams', 'Manage event teams',                      'Activate portfolios for an event and assign Team Leads and Event Heads', 30),
  ('MANAGE_WINGS',       'Teams', 'Manage wings',                            'Create, edit and remove wings', 31),
  ('MANAGE_PORTFOLIOS',  'Teams', 'Manage portfolios',                       'Create, edit and remove portfolios', 32),
  -- Recruitment
  ('MANAGE_RECRUITMENT', 'Recruitment', 'Run recruitment for any team',      'Create forms, shortlist, interview and select for any team', 40),
  ('VIEW_RECRUITMENT',   'Recruitment', 'View all recruitment',              'View every recruitment form, application and interview', 41),
  -- Duties
  ('MANAGE_DUTIES',      'Duties', 'Assign duties to any team',              'Create and edit duties for any team', 50),
  ('VIEW_ALL_DUTIES',    'Duties', 'View all duties',                        'View duties across all teams', 51),
  -- Inventory
  ('MANAGE_INVENTORY',   'Inventory', 'Manage inventory',                    'Maintain items and approve, issue and receive item requests', 60),
  ('VIEW_INVENTORY',     'Inventory', 'View inventory',                      'View items, requests and movements', 61),
  -- Finance
  ('MANAGE_FINANCE',     'Finance', 'Allocate funds',                        'Allocate funds to events and teams', 70),
  ('VERIFY_EXPENSES',    'Finance', 'Verify expenses and sponsorships',      'Verify or reject logged expenses and received sponsorship money', 71),
  ('VIEW_FINANCE',       'Finance', 'View finance',                          'View all allocations, expenses, sponsorships and reports', 72),
  ('VERIFY_PAYMENTS',    'Finance', 'Verify ticket payments',                'Approve or reject ticket payment proofs', 73),
  -- Sponsors
  ('MANAGE_SPONSORS',    'Sponsors', 'Manage sponsors',                      'Maintain the sponsor directory, interactions and deals', 80),
  ('VIEW_SPONSORS',      'Sponsors', 'View sponsors',                        'View sponsors and their history', 81),
  -- Minutes
  ('CREATE_MINUTES',     'Minutes', 'Create minutes for any team',           'Create and submit minutes sheets', 90),
  ('REVIEW_MINUTES',     'Minutes', 'Review / forward minutes',              'Review approved minutes and forward them to the Principal', 91),
  ('APPROVE_MINUTES',    'Minutes', 'Approve minutes',                       'Approve, reject or request changes to minutes (Faculty Sponsor only)', 92),
  -- Registration and ticketing
  ('VIEW_REGISTRATIONS', 'Ticketing', 'View registrations',                  'View registrations, tickets and attendance', 100),
  ('SCAN_QR',            'Ticketing', 'Validate tickets at entry',           'Scan QR codes or check tickets manually at entry', 101),
  ('TRANSFER_TICKET',    'Ticketing', 'Transfer tickets',                    'Transfer own tickets to another user', 102),
  -- Oversight
  ('VIEW_ANALYTICS',     'Oversight', 'View dashboards and analytics',       'View society dashboards and analytics', 110),
  ('VIEW_AUDIT_LOGS',    'Oversight', 'View activity logs',                  'View and filter the activity log', 111),
  -- Content and communication
  ('CREATE_POST',        'Content', 'Create posts',                          'Create society posts', 120),
  ('EDIT_POST',          'Content', 'Edit posts',                            'Edit society posts', 121),
  ('DELETE_POST',        'Content', 'Delete posts',                          'Delete society posts', 122),
  ('UPLOAD_MEDIA',       'Content', 'Upload media',                          'Upload photos and media', 123),
  ('DELETE_MEDIA',       'Content', 'Delete media',                          'Delete photos and media', 124),
  ('UPLOAD_CONTENT',     'Content', 'Upload files',                          'Upload files, images and videos', 125),
  ('DELETE_CONTENT',     'Content', 'Delete files',                          'Delete uploaded files', 126),
  ('CREATE_EVENT_NOTE',  'Content', 'Create event notes',                    'Create internal event notes', 127),
  ('EDIT_EVENT_NOTE',    'Content', 'Edit event notes',                      'Edit internal event notes', 128),
  ('DELETE_EVENT_NOTE',  'Content', 'Delete event notes',                    'Delete internal event notes', 129),
  ('VIEW_EVENT_NOTES',   'Content', 'View event notes',                      'View internal event notes', 130),
  ('VIEW_CHAT',          'Communication', 'View chats',                      'Read chat channels', 140),
  ('SEND_MESSAGE',       'Communication', 'Send messages',                   'Send messages in open chat channels', 141),
  ('MANAGE_CHAT',        'Communication', 'Manage chats',                    'Create channels and change channel modes', 142)
ON CONFLICT (name) DO UPDATE
  SET module = EXCLUDED.module, label = EXCLUDED.label,
      description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- Privileges no non-Faculty-Sponsor can ever hold (not even via override).
CREATE OR REPLACE FUNCTION fn_faculty_sponsor_only_privileges() RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['APPROVE_MINUTES']::TEXT[] $$;

-- ---------------------------------------------------------------------------
-- 3. Role templates: the single place that defines the default roles every
--    society starts with. Faculty Sponsor and Admin tiers need no privilege
--    list because the tier grants full access.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_templates (
  name            VARCHAR(100) PRIMARY KEY,
  tier            TEXT NOT NULL CHECK (tier IN ('FACULTY_SPONSOR', 'ADMIN', 'OFFICER', 'MEMBER')),
  hierarchy_level INTEGER NOT NULL CHECK (hierarchy_level BETWEEN 0 AND 100),
  max_holders     INTEGER,
  description     TEXT NOT NULL,
  privileges      TEXT[] NOT NULL DEFAULT '{}',
  is_system_role  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

INSERT INTO role_templates (name, tier, hierarchy_level, max_holders, description, privileges, is_system_role, sort_order) VALUES
  ('Faculty Sponsor', 'FACULTY_SPONSOR', 100, 1,
   'Faculty member overseeing the society. Full authority, approves minutes and defines Officer permissions.',
   '{}', TRUE, 1),
  ('President', 'ADMIN', 95, 1,
   'Head of the society. Full access to every module.', '{}', TRUE, 2),
  ('Admin', 'ADMIN', 90, NULL,
   'Designated administrator. Full access to every module.', '{}', TRUE, 3),
  ('Vice President', 'OFFICER', 70, NULL,
   'Officer overseeing events and wings. Permissions set by the Faculty Sponsor.',
   ARRAY['VIEW_ANALYTICS','VIEW_RECRUITMENT','VIEW_ALL_DUTIES','VIEW_INVENTORY','VIEW_FINANCE','VIEW_SPONSORS',
         'VIEW_REGISTRATIONS','VIEW_EVENT_NOTES','CREATE_MINUTES','SCAN_QR','VIEW_CHAT','SEND_MESSAGE','MANAGE_CHAT',
         'CREATE_POST','UPLOAD_MEDIA'], FALSE, 4),
  ('General Secretary', 'OFFICER', 68, NULL,
   'Officer handling membership, records and minutes. Permissions set by the Faculty Sponsor.',
   ARRAY['APPROVE_ACCOUNTS','MANAGE_MEMBERS','VIEW_ANALYTICS','VIEW_RECRUITMENT','VIEW_ALL_DUTIES',
         'CREATE_MINUTES','VIEW_REGISTRATIONS','VIEW_AUDIT_LOGS','VIEW_EVENT_NOTES','VIEW_CHAT','SEND_MESSAGE',
         'MANAGE_CHAT','CREATE_POST'], FALSE, 5),
  ('Finance Secretary', 'OFFICER', 66, NULL,
   'Officer overseeing society finances. Permissions set by the Faculty Sponsor.',
   ARRAY['VIEW_FINANCE','VERIFY_EXPENSES','VERIFY_PAYMENTS','VIEW_SPONSORS','VIEW_ANALYTICS',
         'VIEW_REGISTRATIONS','VIEW_CHAT','SEND_MESSAGE'], FALSE, 6),
  ('Member', 'MEMBER', 10, NULL,
   'General society member. Team Lead / Executive duties come from event teams.',
   ARRAY['VIEW_CHAT','SEND_MESSAGE','TRANSFER_TICKET'], TRUE, 7)
ON CONFLICT (name) DO NOTHING;

-- Creates any missing default roles (and their default privileges) for a society.
-- Idempotent: existing roles and their privileges are left untouched.
CREATE OR REPLACE FUNCTION fn_seed_society_roles(p_society_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  t RECORD;
  v_role_id UUID;
BEGIN
  FOR t IN SELECT * FROM role_templates ORDER BY sort_order LOOP
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
END;
$$;

-- Existing Vice President roles had the old (wide) privilege set, including
-- creating events, which the SRS reserves for Admins. Reset them to the template.
DELETE FROM role_privileges rp USING roles r
WHERE rp.role_id = r.id AND r.name = 'Vice President';
INSERT INTO role_privileges (role_id, privilege_id)
SELECT r.id, p.id FROM roles r
JOIN role_templates t ON t.name = r.name
JOIN privileges p ON p.name = ANY (t.privileges)
WHERE r.name IN ('Vice President', 'Member')
ON CONFLICT DO NOTHING;

-- Give every approved society the full default role set.
SELECT fn_seed_society_roles(id) FROM societies WHERE status = 'APPROVED' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Privilege check (used by SQL and by src/lib/rbac.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_has_privilege(
  p_user_id UUID,
  p_society_id UUID,
  p_privilege_name VARCHAR,
  p_wing_id UUID DEFAULT NULL,
  p_portfolio_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_status   TEXT;
  v_override BOOLEAN;
BEGIN
  SELECT status::TEXT INTO v_status FROM societies WHERE id = p_society_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND user_type = 'SUPER_ADMIN' AND status = 'ACTIVE') THEN
    RETURN TRUE;
  END IF;

  IF v_status <> 'APPROVED' THEN
    RETURN FALSE;
  END IF;

  -- Faculty-Sponsor-only privileges cannot be granted to anyone else.
  IF p_privilege_name = ANY (fn_faculty_sponsor_only_privileges()) THEN
    RETURN EXISTS (
      SELECT 1 FROM society_memberships sm JOIN roles r ON r.id = sm.role_id
      WHERE sm.user_id = p_user_id AND sm.society_id = p_society_id
        AND sm.is_active AND sm.suspended_at IS NULL AND r.tier = 'FACULTY_SPONSOR');
  END IF;

  -- Faculty Sponsor and Admin tiers have full access (FR-ROLE-02).
  IF EXISTS (
    SELECT 1 FROM society_memberships sm JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_id AND sm.society_id = p_society_id
      AND sm.is_active AND sm.suspended_at IS NULL
      AND r.tier IN ('FACULTY_SPONSOR', 'ADMIN')
  ) THEN
    RETURN TRUE;
  END IF;

  -- A per-member override wins over the role's privileges.
  SELECT mpo.is_granted INTO v_override
  FROM society_member_privilege_overrides mpo
  JOIN privileges p ON p.id = mpo.privilege_id
  JOIN society_memberships sm ON sm.id = mpo.membership_id
  WHERE sm.user_id = p_user_id AND sm.society_id = p_society_id
    AND sm.is_active AND sm.suspended_at IS NULL
    AND p.name = p_privilege_name
  ORDER BY mpo.updated_at DESC
  LIMIT 1;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM society_memberships sm
    JOIN role_privileges rp ON rp.role_id = sm.role_id
    JOIN privileges p ON p.id = rp.privilege_id
    WHERE sm.user_id = p_user_id
      AND sm.society_id = p_society_id
      AND sm.is_active AND sm.suspended_at IS NULL
      AND p.name = p_privilege_name
      AND (
        -- society-wide assignment covers everything
        (sm.wing_id IS NULL AND sm.portfolio_id IS NULL)
        -- wing assignment covers only its own wing (and portfolios inside it);
        -- it no longer grants society-wide actions
        OR (sm.wing_id IS NOT NULL AND sm.portfolio_id IS NULL AND sm.wing_id = p_wing_id)
        -- portfolio assignment covers only that portfolio
        OR (sm.portfolio_id IS NOT NULL AND sm.portfolio_id = p_portfolio_id)
      )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Role change history (FR-ROLE-06): who, when, why. Append-only.
--    Filled automatically by triggers; routes add the reason/source through
--    transaction-local settings app.actor_id / app.change_reason / app.change_source.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  UUID NOT NULL REFERENCES societies(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  changed_by  UUID REFERENCES users(id),
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('SOCIETY', 'EVENT', 'TEAM')),
  scope_id    UUID,
  change_type TEXT NOT NULL CHECK (change_type IN ('ASSIGNED', 'CHANGED', 'REVOKED', 'SUSPENDED', 'REACTIVATED')),
  from_role   TEXT,
  to_role     TEXT,
  source      TEXT NOT NULL DEFAULT 'DIRECT'
              CHECK (source IN ('DIRECT', 'APPLICATION', 'RECRUITMENT', 'TRANSFER', 'SYSTEM')),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_role_change_log_society ON role_change_log (society_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_change_log_user ON role_change_log (user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_role_change_log_immutable ON role_change_log;
CREATE TRIGGER trg_role_change_log_immutable
  BEFORE UPDATE OR DELETE ON role_change_log
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();

CREATE OR REPLACE FUNCTION fn_change_actor(p_fallback UUID) RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE v TEXT := NULLIF(current_setting('app.actor_id', TRUE), '');
BEGIN
  RETURN COALESCE(v::UUID, p_fallback);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN p_fallback;
END;
$$;

CREATE OR REPLACE FUNCTION fn_log_membership_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_type   TEXT;
  v_from   TEXT;
  v_to     TEXT;
  v_source TEXT := COALESCE(NULLIF(current_setting('app.change_source', TRUE), ''), 'DIRECT');
  v_reason TEXT := NULLIF(current_setting('app.change_reason', TRUE), '');
BEGIN
  SELECT name INTO v_to FROM roles WHERE id = NEW.role_id;

  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_active THEN RETURN NEW; END IF;
    v_type := 'ASSIGNED';
  ELSE
    SELECT name INTO v_from FROM roles WHERE id = OLD.role_id;
    IF OLD.is_active AND NOT NEW.is_active THEN
      v_type := CASE WHEN NEW.suspended_at IS NOT NULL THEN 'SUSPENDED' ELSE 'REVOKED' END;
    ELSIF NOT OLD.is_active AND NEW.is_active THEN
      v_type := 'REACTIVATED';
    ELSIF OLD.role_id IS DISTINCT FROM NEW.role_id
       OR OLD.wing_id IS DISTINCT FROM NEW.wing_id
       OR OLD.portfolio_id IS DISTINCT FROM NEW.portfolio_id THEN
      v_type := 'CHANGED';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO role_change_log (society_id, user_id, changed_by, scope_type, scope_id,
                               change_type, from_role, to_role, source, reason)
  VALUES (NEW.society_id, NEW.user_id,
          fn_change_actor(COALESCE(NEW.suspended_by, NEW.assigned_by)),
          'SOCIETY', NEW.society_id, v_type, v_from, v_to, v_source,
          COALESCE(v_reason, NEW.suspension_reason));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_membership_change ON society_memberships;
CREATE TRIGGER trg_log_membership_change
  AFTER INSERT OR UPDATE ON society_memberships
  FOR EACH ROW EXECUTE FUNCTION fn_log_membership_change();

-- ---------------------------------------------------------------------------
-- 6. Account / access requests (FR-AUTH-01/02): the existing join-request
--    table gains the requested role, portfolio and an "info requested" state.
-- ---------------------------------------------------------------------------
ALTER TABLE society_join_requests
  ADD COLUMN IF NOT EXISTS requested_role          TEXT NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN IF NOT EXISTS requested_portfolio_id  UUID REFERENCES portfolios(id),
  ADD COLUMN IF NOT EXISTS requested_event_id      UUID REFERENCES events(id),
  ADD COLUMN IF NOT EXISTS info_request_message    TEXT;

ALTER TABLE society_join_requests DROP CONSTRAINT IF EXISTS society_join_requests_status_check;
ALTER TABLE society_join_requests ADD CONSTRAINT society_join_requests_status_check
  CHECK (status IN ('PENDING', 'INFO_REQUESTED', 'INTERVIEW_SCHEDULED', 'APPROVED', 'REJECTED', 'WITHDRAWN'));
DO $$ BEGIN
  ALTER TABLE society_join_requests ADD CONSTRAINT society_join_requests_role_ck
    CHECK (requested_role IN ('MEMBER', 'EXECUTIVE', 'TEAM_LEAD', 'OFFICER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 7. Faculty Sponsor nomination captured at society registration
-- ---------------------------------------------------------------------------
ALTER TABLE societies ADD COLUMN IF NOT EXISTS faculty_sponsor_email VARCHAR(255);
