-- ============================================================================
-- Migration 013: Backfill events.is_paid from ticket_price
-- ============================================================================
-- Fixes historical rows where paid events were stored as free (or vice versa)
-- due to inconsistent create/edit payload handling.
--
-- Rule:
--   ticket_price > 0  => is_paid = TRUE
--   ticket_price <= 0 or NULL => is_paid = FALSE
-- ============================================================================

BEGIN;

UPDATE events
SET is_paid = CASE
  WHEN COALESCE(ticket_price, 0) > 0 THEN TRUE
  ELSE FALSE
END,
updated_at = NOW()
WHERE is_paid IS DISTINCT FROM CASE
  WHEN COALESCE(ticket_price, 0) > 0 THEN TRUE
  ELSE FALSE
END;

COMMIT;
