-- ============================================================================
-- Migration 018: Society multi-wallet payment support
-- ============================================================================
-- Adds:
--   1) society_payment_wallets table for multiple wallet methods per society
--   2) tickets.selected_wallet_id for selected payment method tracking
--   3) migration of legacy single-wallet settings into wallet rows
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS society_payment_wallets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  society_id    UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  wallet_type   VARCHAR(20) NOT NULL
                CHECK (wallet_type IN ('EASYPAISA', 'JAZZCASH', 'BANK')),
  account_title VARCHAR(200) NOT NULL,
  account_number VARCHAR(100),
  iban          VARCHAR(50),
  bank_name     VARCHAR(150),
  branch_name   VARCHAR(150),
  instructions  TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wallet_fields_by_type CHECK (
    (
      wallet_type IN ('EASYPAISA', 'JAZZCASH')
      AND account_number IS NOT NULL
      AND LENGTH(BTRIM(account_number)) > 0
    )
    OR
    (
      wallet_type = 'BANK'
      AND iban IS NOT NULL
      AND LENGTH(BTRIM(iban)) > 0
      AND bank_name IS NOT NULL
      AND LENGTH(BTRIM(bank_name)) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_society_payment_wallets_society
  ON society_payment_wallets (society_id);

CREATE INDEX IF NOT EXISTS idx_society_payment_wallets_enabled
  ON society_payment_wallets (society_id, is_enabled);

CREATE UNIQUE INDEX IF NOT EXISTS uq_society_wallet_default_active
  ON society_payment_wallets (society_id)
  WHERE is_default = TRUE AND is_enabled = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_society_payment_wallets_updated_at'
  ) THEN
    CREATE TRIGGER trg_society_payment_wallets_updated_at
      BEFORE UPDATE ON society_payment_wallets
      FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
  END IF;
END $$;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS selected_wallet_id UUID REFERENCES society_payment_wallets(id);

CREATE INDEX IF NOT EXISTS idx_tickets_selected_wallet
  ON tickets (selected_wallet_id);

WITH legacy AS (
  SELECT
    ss.society_id,
    ss.payment_provider,
    ss.payment_recipient_name,
    ss.payment_account_number,
    ss.payment_iban,
    ss.payment_instructions,
    CASE
      WHEN ss.payment_provider ILIKE '%easy%'
        AND NULLIF(BTRIM(ss.payment_account_number), '') IS NOT NULL
      THEN 'EASYPAISA'
      WHEN ss.payment_provider ILIKE '%jazz%'
        AND NULLIF(BTRIM(ss.payment_account_number), '') IS NOT NULL
      THEN 'JAZZCASH'
      ELSE 'BANK'
    END AS resolved_wallet_type
  FROM society_settings ss
  WHERE
    NULLIF(BTRIM(ss.payment_provider), '') IS NOT NULL
    AND NULLIF(BTRIM(ss.payment_recipient_name), '') IS NOT NULL
)
INSERT INTO society_payment_wallets (
  id,
  society_id,
  wallet_type,
  account_title,
  account_number,
  iban,
  bank_name,
  branch_name,
  instructions,
  is_enabled,
  is_default,
  display_order
)
SELECT
  uuid_generate_v4(),
  l.society_id,
  l.resolved_wallet_type,
  NULLIF(BTRIM(l.payment_recipient_name), ''),
  NULLIF(BTRIM(l.payment_account_number), ''),
  NULLIF(UPPER(REPLACE(BTRIM(l.payment_iban), ' ', '')), ''),
  CASE
    WHEN l.resolved_wallet_type = 'BANK'
      THEN COALESCE(NULLIF(BTRIM(l.payment_provider), ''), 'Bank Transfer')
    ELSE NULL
  END,
  NULL,
  NULLIF(BTRIM(l.payment_instructions), ''),
  TRUE,
  TRUE,
  0
FROM legacy l
WHERE NOT EXISTS (
  SELECT 1
  FROM society_payment_wallets spw
  WHERE spw.society_id = l.society_id
)
AND (
  (
    l.resolved_wallet_type IN ('EASYPAISA', 'JAZZCASH')
    AND NULLIF(BTRIM(l.payment_account_number), '') IS NOT NULL
  )
  OR
  (
    l.resolved_wallet_type = 'BANK'
    AND NULLIF(UPPER(REPLACE(BTRIM(l.payment_iban), ' ', '')), '') IS NOT NULL
  )
);

COMMIT;
