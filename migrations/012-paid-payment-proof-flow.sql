-- ============================================================================
-- Migration 012: Paid manual payment proof workflow
-- ============================================================================
-- Adds:
--   1) payment destination fields in society_settings
--   2) payment proof metadata fields in payment_proofs
-- ============================================================================

BEGIN;

ALTER TABLE society_settings
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_recipient_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS payment_account_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_iban VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

ALTER TABLE payment_proofs
  ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(200),
  ADD COLUMN IF NOT EXISTS student_note TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_proofs_ticket_updated
  ON payment_proofs (ticket_id, updated_at DESC);

COMMIT;
