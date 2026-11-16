-- 004: Recruitment (FR-REC-01..07): Forms -> Applications -> Shortlist -> Interviews -> Team.
--
-- A form recruits either Executives for one team (Team Lead runs it) or Team Leads
-- for an event (Admin runs it, FR-REC-07). For Team Lead forms without a fixed team,
-- applicants pick their preferred portfolio.

CREATE TABLE IF NOT EXISTS recruitment_forms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    UUID NOT NULL REFERENCES societies(id),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES event_teams(id) ON DELETE CASCADE,
  target_role   TEXT NOT NULL CHECK (target_role IN ('EXECUTIVE', 'TEAM_LEAD')),
  title         VARCHAR(300) NOT NULL,
  description   TEXT,
  -- [{ "id": "q1", "label": "...", "type": "short_text|long_text|single_choice|multi_choice|number|url",
  --    "required": true, "options": ["..."] }]
  questions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'FINALIZED')),
  closes_at     TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES users(id),
  finalized_by  UUID REFERENCES users(id),
  finalized_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recruitment_forms_team_ck CHECK (target_role = 'TEAM_LEAD' OR team_id IS NOT NULL),
  CONSTRAINT recruitment_forms_questions_ck CHECK (jsonb_typeof(questions) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_recruitment_forms_event ON recruitment_forms (event_id, status);
CREATE INDEX IF NOT EXISTS idx_recruitment_forms_team ON recruitment_forms (team_id);

CREATE TABLE IF NOT EXISTS recruitment_applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id            UUID NOT NULL REFERENCES recruitment_forms(id) ON DELETE CASCADE,
  society_id         UUID NOT NULL REFERENCES societies(id),
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  applicant_id       UUID NOT NULL REFERENCES users(id),
  preferred_team_id  UUID REFERENCES event_teams(id) ON DELETE SET NULL,
  answers            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
                       'SUBMITTED', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEWED',
                       'SELECTED', 'REJECTED', 'WITHDRAWN')),
  reviewer_notes     TEXT,
  placed_team_id     UUID REFERENCES event_teams(id),
  decided_by         UUID REFERENCES users(id),
  decided_at         TIMESTAMPTZ,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, applicant_id)
);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_form ON recruitment_applications (form_id, status);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_applicant ON recruitment_applications (applicant_id);

CREATE TABLE IF NOT EXISTS recruitment_interviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'IN_PERSON' CHECK (mode IN ('IN_PERSON', 'ONLINE')),
  location        TEXT,
  meeting_link    TEXT,
  interviewer_id  UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED')),
  score           NUMERIC(4,1) CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_application ON recruitment_interviews (application_id);
