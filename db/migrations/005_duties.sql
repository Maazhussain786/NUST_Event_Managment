-- 005: Duties and tasks (FR-DUTY-01..05).
-- A duty belongs to an event and usually a team. Everyone in the team sees the
-- team's duties; Admins see all; the assignee updates the status.

CREATE TABLE IF NOT EXISTS duties (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id         UUID NOT NULL REFERENCES societies(id),
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id            UUID REFERENCES event_teams(id) ON DELETE CASCADE,
  title              VARCHAR(300) NOT NULL,
  description        TEXT,
  location           VARCHAR(300),
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  assignee_id        UUID NOT NULL REFERENCES users(id),
  assigned_by        UUID NOT NULL REFERENCES users(id),
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  status_updated_at  TIMESTAMPTZ,
  status_updated_by  UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT duties_time_ck CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_duties_event ON duties (event_id, starts_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_duties_team ON duties (team_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_duties_assignee ON duties (assignee_id, status) WHERE deleted_at IS NULL;
