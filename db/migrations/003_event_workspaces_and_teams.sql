-- 003: Event workspaces, portfolios and teams (FR-EVT-02..05, FR-TEAM-01..05, FR-ROLE-05).
--
-- portfolios      = the society's catalog of functional departments (Finance, Logistics, ...).
--                   Wings are optional (FR-TEAM-02), so a portfolio no longer needs one.
-- event_teams     = a portfolio activated for one event (FR-TEAM-04).
-- event_team_members = Team Leads and Executives of that team.

-- ---------------------------------------------------------------------------
-- 1. Portfolios: optional wing, function tag, event-specific flag
-- ---------------------------------------------------------------------------
ALTER TABLE portfolios ALTER COLUMN wing_id DROP NOT NULL;
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS function_key      TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS is_event_specific BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS applies_to        TEXT,
  ADD COLUMN IF NOT EXISTS sort_order        INTEGER NOT NULL DEFAULT 100;

DO $$ BEGIN
  ALTER TABLE portfolios ADD CONSTRAINT portfolios_function_key_ck CHECK (function_key IN (
    'TEAM_HR', 'ADMIN_COORDINATION', 'FINANCE', 'LOGISTICS', 'PROTOCOL', 'MOCS', 'SECURITY',
    'EVENT_MANAGEMENT', 'MEDIA', 'OUTREACH', 'INVITES', 'STAGE_MANAGEMENT', 'PERFORMANCES',
    'USHERS', 'CROWD_CONTROL', 'GENERAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_unique_name_no_wing
  ON portfolios (society_id, LOWER(name)) WHERE deleted_at IS NULL AND wing_id IS NULL;

-- Portfolios and memberships no longer need a wing.
ALTER TABLE society_memberships DROP CONSTRAINT IF EXISTS chk_scope_hierarchy;
ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_event_attribution;

-- The SRS portfolio catalog (Appendix 10).
CREATE TABLE IF NOT EXISTS portfolio_templates (
  name              VARCHAR(200) PRIMARY KEY,
  function_key      TEXT NOT NULL,
  description       TEXT NOT NULL,
  is_event_specific BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to        TEXT NOT NULL DEFAULT 'All events',
  sort_order        INTEGER NOT NULL
);

INSERT INTO portfolio_templates (name, function_key, description, is_event_specific, applies_to, sort_order) VALUES
  ('Team HR',            'TEAM_HR',            'Recruitment, member welfare, attendance',          FALSE, 'All events', 1),
  ('Admin Coordination', 'ADMIN_COORDINATION', 'Cross-team coordination and logs',                 FALSE, 'All events', 2),
  ('Finance',            'FINANCE',            'Allocated funds, sponsorship, expense tracking',  FALSE, 'All events', 3),
  ('Logistics',          'LOGISTICS',          'Inventory tracking and issuance',                  FALSE, 'All events', 4),
  ('Protocol',           'PROTOCOL',           'Guest handling and protocol',                      FALSE, 'All events', 5),
  ('MoCs',               'MOCS',               'Hosting and anchoring',                            FALSE, 'All events', 6),
  ('Security',           'SECURITY',           'Safety and entry control',                         FALSE, 'All events', 7),
  ('Event Management',   'EVENT_MANAGEMENT',   'Event planning and execution',                     FALSE, 'All events', 8),
  ('Media',              'MEDIA',              'Photography, video, publicity',                    FALSE, 'All events', 9),
  ('Outreach/Sponsors',  'OUTREACH',           'Sponsor acquisition and management',               FALSE, 'All events', 10),
  ('Invites',            'INVITES',            'Invitations to guests and dignitaries',            TRUE,  'DFTW, AICON', 11),
  ('Stage Management',   'STAGE_MANAGEMENT',   'Stage setup and flow',                             TRUE,  'Convocation, Welcome', 12),
  ('Performances',       'PERFORMANCES',       'Performance scheduling',                           TRUE,  'Welcome', 13),
  ('Ushers',             'USHERS',             'Seating and guest guidance',                       TRUE,  'Convocation', 14),
  ('Crowd Control',      'CROWD_CONTROL',      'Crowd flow and safety',                            TRUE,  'Convocation', 15)
ON CONFLICT (name) DO NOTHING;

-- Adds any missing catalog portfolios to a society (idempotent).
CREATE OR REPLACE FUNCTION fn_seed_society_portfolios(p_society_id UUID, p_actor UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO portfolios (society_id, wing_id, name, description, created_by,
                          function_key, is_event_specific, applies_to, sort_order)
  SELECT p_society_id, NULL, t.name, t.description, p_actor,
         t.function_key, t.is_event_specific, t.applies_to, t.sort_order
  FROM portfolio_templates t
  WHERE NOT EXISTS (
    SELECT 1 FROM portfolios p
    WHERE p.society_id = p_society_id AND p.deleted_at IS NULL AND LOWER(p.name) = LOWER(t.name)
  );
END;
$$;

SELECT fn_seed_society_portfolios(id, created_by)
FROM societies WHERE status = 'APPROVED' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Events: Event Head, budget, archive
-- ---------------------------------------------------------------------------
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_head_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS budget_total  NUMERIC(12,2) CHECK (budget_total IS NULL OR budget_total >= 0),
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by   UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_events_event_head ON events (event_head_id) WHERE event_head_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Event teams and their members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    UUID NOT NULL REFERENCES societies(id),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  portfolio_id  UUID NOT NULL REFERENCES portfolios(id),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, portfolio_id)
);
CREATE INDEX IF NOT EXISTS idx_event_teams_event ON event_teams (event_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS event_team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  society_id      UUID NOT NULL REFERENCES societies(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  team_role       TEXT NOT NULL CHECK (team_role IN ('TEAM_LEAD', 'EXECUTIVE')),
  source          TEXT NOT NULL DEFAULT 'DIRECT'
                  CHECK (source IN ('DIRECT', 'APPLICATION', 'RECRUITMENT', 'TRANSFER', 'SYSTEM')),
  assigned_by     UUID REFERENCES users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at      TIMESTAMPTZ,
  removed_by      UUID REFERENCES users(id),
  removal_reason  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_active
  ON event_team_members (team_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_team_members_user
  ON event_team_members (user_id, event_id) WHERE removed_at IS NULL;

-- Team role changes -> role_change_log (scope TEAM)
CREATE OR REPLACE FUNCTION fn_log_team_member_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
  v_from TEXT;
  v_to   TEXT := NEW.team_role;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.removed_at IS NOT NULL THEN RETURN NEW; END IF;
    v_type := 'ASSIGNED';
  ELSIF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN
    v_type := 'REVOKED'; v_from := OLD.team_role; v_to := NULL;
  ELSIF OLD.team_role IS DISTINCT FROM NEW.team_role THEN
    v_type := 'CHANGED'; v_from := OLD.team_role;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO role_change_log (society_id, user_id, changed_by, scope_type, scope_id,
                               change_type, from_role, to_role, source, reason)
  VALUES (NEW.society_id, NEW.user_id,
          fn_change_actor(COALESCE(NEW.removed_by, NEW.assigned_by)),
          'TEAM', NEW.team_id, v_type, v_from, v_to,
          COALESCE(NULLIF(current_setting('app.change_source', TRUE), ''), NEW.source),
          COALESCE(NULLIF(current_setting('app.change_reason', TRUE), ''), NEW.removal_reason));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_team_member_change ON event_team_members;
CREATE TRIGGER trg_log_team_member_change
  AFTER INSERT OR UPDATE ON event_team_members
  FOR EACH ROW EXECUTE FUNCTION fn_log_team_member_change();

-- Event Head changes -> role_change_log (scope EVENT)
CREATE OR REPLACE FUNCTION fn_log_event_head_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor  UUID := fn_change_actor(NULL);
  v_reason TEXT := NULLIF(current_setting('app.change_reason', TRUE), '');
BEGIN
  IF OLD.event_head_id IS NOT DISTINCT FROM NEW.event_head_id THEN
    RETURN NEW;
  END IF;
  IF OLD.event_head_id IS NOT NULL THEN
    INSERT INTO role_change_log (society_id, user_id, changed_by, scope_type, scope_id,
                                 change_type, from_role, to_role, reason)
    VALUES (NEW.society_id, OLD.event_head_id, v_actor, 'EVENT', NEW.id, 'REVOKED', 'EVENT_HEAD', NULL, v_reason);
  END IF;
  IF NEW.event_head_id IS NOT NULL THEN
    INSERT INTO role_change_log (society_id, user_id, changed_by, scope_type, scope_id,
                                 change_type, from_role, to_role, reason)
    VALUES (NEW.society_id, NEW.event_head_id, v_actor, 'EVENT', NEW.id, 'ASSIGNED', NULL, 'EVENT_HEAD', v_reason);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_event_head_change ON events;
CREATE TRIGGER trg_log_event_head_change
  AFTER UPDATE OF event_head_id ON events
  FOR EACH ROW EXECUTE FUNCTION fn_log_event_head_change();

-- ---------------------------------------------------------------------------
-- 4. Event plan: days, venues, time slots (FR-EVT-04) + change history (FR-EVT-05)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_plan_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  society_id   UUID NOT NULL REFERENCES societies(id),
  day_date     DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  title        VARCHAR(300) NOT NULL,
  venue        VARCHAR(300),
  description  TEXT,
  team_id      UUID REFERENCES event_teams(id) ON DELETE SET NULL,
  created_by   UUID NOT NULL REFERENCES users(id),
  updated_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT event_plan_items_time_ck CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_event_plan_items_event
  ON event_plan_items (event_id, day_date, start_time) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS event_plan_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  plan_item_id  UUID NOT NULL REFERENCES event_plan_items(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('CREATED', 'UPDATED', 'DELETED')),
  changed_by    UUID REFERENCES users(id),
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_plan_changes_event ON event_plan_changes (event_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_event_plan_changes_immutable ON event_plan_changes;
CREATE TRIGGER trg_event_plan_changes_immutable
  BEFORE UPDATE ON event_plan_changes
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();

CREATE OR REPLACE FUNCTION fn_log_event_plan_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_action TEXT;
  v_old JSONB;
  v_new JSONB := jsonb_build_object('day_date', NEW.day_date, 'start_time', NEW.start_time,
                   'end_time', NEW.end_time, 'title', NEW.title, 'venue', NEW.venue,
                   'description', NEW.description, 'team_id', NEW.team_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATED';
  ELSE
    v_old := jsonb_build_object('day_date', OLD.day_date, 'start_time', OLD.start_time,
               'end_time', OLD.end_time, 'title', OLD.title, 'venue', OLD.venue,
               'description', OLD.description, 'team_id', OLD.team_id);
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'DELETED'; v_new := NULL;
    ELSIF v_old IS DISTINCT FROM v_new THEN
      v_action := 'UPDATED';
    ELSE
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO event_plan_changes (event_id, plan_item_id, action, changed_by, old_value, new_value)
  VALUES (NEW.event_id, NEW.id, v_action, fn_change_actor(COALESCE(NEW.updated_by, NEW.created_by)), v_old, v_new);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_event_plan_change ON event_plan_items;
CREATE TRIGGER trg_log_event_plan_change
  AFTER INSERT OR UPDATE ON event_plan_items
  FOR EACH ROW EXECUTE FUNCTION fn_log_event_plan_change();
