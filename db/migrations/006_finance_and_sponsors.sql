-- 006: Finance (FR-FIN-01..07) and Sponsors (FR-SPN-01..03).
--
-- Money records are tamper-evident (NFR-09):
--   fund_allocations       append-only; corrections are new negative entries
--   expenses               only SUBMITTED -> VERIFIED/REJECTED is allowed, amounts never change
--   sponsor_interactions   append-only
--   sponsorships           amount/sponsor/event fixed once RECEIVED and verified

-- ---------------------------------------------------------------------------
-- Fund allocations (Admin/Finance allocate to events and teams)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fund_allocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    UUID NOT NULL REFERENCES societies(id),
  event_id      UUID NOT NULL REFERENCES events(id),
  team_id       UUID REFERENCES event_teams(id),          -- NULL = event-level pool
  amount        NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  note          TEXT,
  allocated_by  UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fund_allocations_event ON fund_allocations (event_id, team_id);

DROP TRIGGER IF EXISTS trg_fund_allocations_immutable ON fund_allocations;
CREATE TRIGGER trg_fund_allocations_immutable
  BEFORE UPDATE OR DELETE ON fund_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();

-- ---------------------------------------------------------------------------
-- Expenses (Team Leads log; Finance verifies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    UUID NOT NULL REFERENCES societies(id),
  event_id      UUID NOT NULL REFERENCES events(id),
  team_id       UUID NOT NULL REFERENCES event_teams(id),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL CHECK (category IN (
                  'VENUE', 'FOOD', 'PRINTING', 'TRANSPORT', 'DECOR', 'EQUIPMENT',
                  'MARKETING', 'HONORARIUM', 'PRIZES', 'MERCHANDISE', 'MISC')),
  spent_on      DATE NOT NULL,
  description   TEXT NOT NULL,
  receipt_url   TEXT,
  submitted_by  UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'VERIFIED', 'REJECTED')),
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_event_team ON expenses (event_id, team_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by ON expenses (submitted_by);

CREATE OR REPLACE FUNCTION fn_guard_expense_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expenses cannot be deleted; reject them instead';
  END IF;
  IF OLD.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'expense % is already % and is locked', OLD.id, OLD.status;
  END IF;
  IF NEW.amount <> OLD.amount OR NEW.team_id <> OLD.team_id OR NEW.event_id <> OLD.event_id
     OR NEW.submitted_by <> OLD.submitted_by OR NEW.society_id <> OLD.society_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'expense amount, team, event and submitter cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_expense_update ON expenses;
CREATE TRIGGER trg_guard_expense_update
  BEFORE UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION fn_guard_expense_update();

-- ---------------------------------------------------------------------------
-- Sponsors directory, interactions and deals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id     UUID NOT NULL REFERENCES societies(id),
  name           VARCHAR(200) NOT NULL,
  industry       VARCHAR(120),
  contact_name   VARCHAR(200),
  contact_email  VARCHAR(255),
  contact_phone  VARCHAR(40),
  website        TEXT,
  notes          TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsors_unique_name
  ON sponsors (society_id, LOWER(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sponsor_interactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id        UUID NOT NULL REFERENCES societies(id),
  sponsor_id        UUID NOT NULL REFERENCES sponsors(id),
  event_id          UUID REFERENCES events(id),
  interaction_type  TEXT NOT NULL CHECK (interaction_type IN (
                      'CALL', 'EMAIL', 'MEETING', 'PROPOSAL', 'OFFER', 'FOLLOW_UP', 'OTHER')),
  summary           TEXT NOT NULL,
  occurred_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_by         UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sponsor_interactions_sponsor ON sponsor_interactions (sponsor_id, occurred_on DESC);

DROP TRIGGER IF EXISTS trg_sponsor_interactions_immutable ON sponsor_interactions;
CREATE TRIGGER trg_sponsor_interactions_immutable
  BEFORE UPDATE OR DELETE ON sponsor_interactions
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();

CREATE TABLE IF NOT EXISTS sponsorships (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id           UUID NOT NULL REFERENCES societies(id),
  sponsor_id           UUID NOT NULL REFERENCES sponsors(id),
  event_id             UUID NOT NULL REFERENCES events(id),
  amount               NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status               TEXT NOT NULL DEFAULT 'PROPOSED'
                       CHECK (status IN ('PROPOSED', 'CONFIRMED', 'RECEIVED', 'DECLINED')),
  deliverables         TEXT,
  deliverables_status  TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (deliverables_status IN ('PENDING', 'IN_PROGRESS', 'DELIVERED')),
  received_on          DATE,
  payment_reference    VARCHAR(200),
  verified_by          UUID REFERENCES users(id),
  verified_at          TIMESTAMPTZ,
  logged_by            UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sponsorships_received_ck CHECK (status <> 'RECEIVED' OR received_on IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sponsorships_event ON sponsorships (event_id, status);
CREATE INDEX IF NOT EXISTS idx_sponsorships_sponsor ON sponsorships (sponsor_id);

CREATE OR REPLACE FUNCTION fn_guard_sponsorship_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sponsorships cannot be deleted; mark them DECLINED instead';
  END IF;
  IF OLD.verified_at IS NOT NULL AND (
       NEW.amount <> OLD.amount OR NEW.sponsor_id <> OLD.sponsor_id OR NEW.event_id <> OLD.event_id
       OR NEW.status <> OLD.status OR NEW.received_on IS DISTINCT FROM OLD.received_on) THEN
    RAISE EXCEPTION 'verified sponsorship money cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sponsorship_update ON sponsorships;
CREATE TRIGGER trg_guard_sponsorship_update
  BEFORE UPDATE OR DELETE ON sponsorships
  FOR EACH ROW EXECUTE FUNCTION fn_guard_sponsorship_update();
