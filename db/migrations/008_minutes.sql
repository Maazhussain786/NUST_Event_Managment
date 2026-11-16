-- 008: Minutes sheets with approval chain (FR-MIN-01..06).
--
--   DRAFT --submit--> SUBMITTED --(Faculty Sponsor)--> APPROVED | REJECTED | CHANGES_REQUESTED
--   CHANGES_REQUESTED --resubmit--> SUBMITTED
--   APPROVED (visible to Admin) --(Admin, optional)--> FORWARDED --(Principal)--> PRINCIPAL_APPROVED | PRINCIPAL_REJECTED
-- Approved minutes are locked (FR-MIN-06). Every step is recorded in minutes_approval_steps.

CREATE TABLE IF NOT EXISTS minutes_sheets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id     UUID NOT NULL REFERENCES societies(id),
  event_id       UUID REFERENCES events(id),
  team_id        UUID REFERENCES event_teams(id),
  title          VARCHAR(300) NOT NULL,
  meeting_date   DATE NOT NULL,
  venue          VARCHAR(300),
  attendees      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ["Name", ...]
  agenda         TEXT NOT NULL DEFAULT '',
  decisions      TEXT NOT NULL DEFAULT '',
  action_items   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{"task","owner","due"}]
  status         TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                   'DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED',
                   'FORWARDED', 'PRINCIPAL_APPROVED', 'PRINCIPAL_REJECTED')),
  created_by     UUID NOT NULL REFERENCES users(id),
  submitted_at   TIMESTAMPTZ,
  locked_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT minutes_attendees_ck CHECK (jsonb_typeof(attendees) = 'array'),
  CONSTRAINT minutes_action_items_ck CHECK (jsonb_typeof(action_items) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_minutes_society_status ON minutes_sheets (society_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_minutes_event ON minutes_sheets (event_id) WHERE deleted_at IS NULL;

-- Once locked, only the forwarding/principal status changes are allowed.
CREATE OR REPLACE FUNCTION fn_guard_locked_minutes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'minutes sheets cannot be deleted; use deleted_at on drafts';
  END IF;
  IF OLD.locked_at IS NOT NULL AND (
       NEW.title IS DISTINCT FROM OLD.title OR NEW.meeting_date IS DISTINCT FROM OLD.meeting_date
       OR NEW.venue IS DISTINCT FROM OLD.venue OR NEW.attendees IS DISTINCT FROM OLD.attendees
       OR NEW.agenda IS DISTINCT FROM OLD.agenda OR NEW.decisions IS DISTINCT FROM OLD.decisions
       OR NEW.action_items IS DISTINCT FROM OLD.action_items OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'approved minutes are locked and cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_locked_minutes ON minutes_sheets;
CREATE TRIGGER trg_guard_locked_minutes
  BEFORE UPDATE OR DELETE ON minutes_sheets
  FOR EACH ROW EXECUTE FUNCTION fn_guard_locked_minutes();

CREATE TABLE IF NOT EXISTS minutes_approval_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id  UUID NOT NULL REFERENCES minutes_sheets(id),
  stage       TEXT NOT NULL CHECK (stage IN ('AUTHOR', 'FACULTY_SPONSOR', 'ADMIN', 'PRINCIPAL')),
  action      TEXT NOT NULL CHECK (action IN (
                'SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'FORWARDED')),
  actor_id    UUID NOT NULL REFERENCES users(id),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_minutes_steps_minutes ON minutes_approval_steps (minutes_id, created_at);

DROP TRIGGER IF EXISTS trg_minutes_steps_immutable ON minutes_approval_steps;
CREATE TRIGGER trg_minutes_steps_immutable
  BEFORE UPDATE OR DELETE ON minutes_approval_steps
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();
