-- 007: Logistics and inventory (FR-LOG-01..05).
-- Items are shared across the society's events. Every quantity change goes
-- through inventory_transactions, which is append-only (FR-LOG-05).

CREATE TABLE IF NOT EXISTS inventory_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id           UUID NOT NULL REFERENCES societies(id),
  name                 VARCHAR(200) NOT NULL,
  category             VARCHAR(100),
  unit                 VARCHAR(30) NOT NULL DEFAULT 'pcs',
  quantity_total       INTEGER NOT NULL DEFAULT 0 CHECK (quantity_total >= 0),
  quantity_available   INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  condition            TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('GOOD', 'NEEDS_REPAIR', 'DAMAGED')),
  location             VARCHAR(200),
  ownership            TEXT NOT NULL DEFAULT 'OWNED' CHECK (ownership IN ('OWNED', 'BORROWED', 'RENTED')),
  owner_name           VARCHAR(200),            -- lender / rental vendor
  return_due           DATE,                    -- for borrowed / rented items
  low_stock_threshold  INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  notes                TEXT,
  created_by           UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ,
  CONSTRAINT inventory_items_available_ck CHECK (quantity_available <= quantity_total)
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_society ON inventory_items (society_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id         UUID NOT NULL REFERENCES societies(id),
  event_id           UUID NOT NULL REFERENCES events(id),
  team_id            UUID NOT NULL REFERENCES event_teams(id),
  item_id            UUID NOT NULL REFERENCES inventory_items(id),
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  needed_from        TIMESTAMPTZ,
  needed_until       TIMESTAMPTZ,
  purpose            TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                       'PENDING', 'APPROVED', 'REJECTED', 'ISSUED', 'RETURNED', 'CANCELLED')),
  quantity_issued    INTEGER NOT NULL DEFAULT 0 CHECK (quantity_issued >= 0),
  quantity_returned  INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  requested_by       UUID NOT NULL REFERENCES users(id),
  reviewed_by        UUID REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  review_note        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_event ON inventory_requests (event_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_item ON inventory_requests (item_id, status);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    UUID NOT NULL REFERENCES societies(id),
  item_id       UUID NOT NULL REFERENCES inventory_items(id),
  request_id    UUID REFERENCES inventory_requests(id),
  event_id      UUID REFERENCES events(id),
  txn_type      TEXT NOT NULL CHECK (txn_type IN ('ADD', 'REMOVE', 'ISSUE', 'RETURN', 'DAMAGE', 'LOSS', 'REPAIR', 'ADJUST')),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  note          TEXT,
  performed_by  UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions (item_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_inventory_transactions_immutable ON inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_immutable
  BEFORE UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_block_log_mutation();
