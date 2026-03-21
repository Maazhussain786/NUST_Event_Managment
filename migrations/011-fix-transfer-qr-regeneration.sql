-- ============================================================================
-- Migration 011: Fix ticket transfer QR regeneration
-- ============================================================================
-- Problem:
--   fn_regenerate_qr_on_transfer inserted random hex qr_data which is not
--   compatible with HMAC-signed payload verification.
--
-- Fix:
--   1) Deactivate any active QR codes on transfer.
--   2) Transfer ticket ownership.
--   3) Let application APIs regenerate signed QR payloads via src/lib/qr.ts.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_regenerate_qr_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ticket_qr_codes
    SET is_active = FALSE
    WHERE ticket_id = NEW.ticket_id AND is_active = TRUE;

    UPDATE tickets
    SET user_id = NEW.to_user_id,
        checked_in_at = NULL,
        updated_at = NOW()
    WHERE id = NEW.ticket_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
