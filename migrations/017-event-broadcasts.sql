-- ============================================================================
-- 017: Event Update Broadcasts (Society -> Event Participants)
-- Purpose:
--   1) Add robust event update broadcast pipeline tables
--   2) Track per-recipient delivery outcomes
--   3) Extend audit action enum for event broadcast lifecycle
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS event_update_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  update_type TEXT NOT NULL DEFAULT 'GENERAL',
  severity TEXT NOT NULL DEFAULT 'INFO',
  title VARCHAR(300) NOT NULL,
  message TEXT NOT NULL,
  include_push BOOLEAN NOT NULL DEFAULT TRUE,
  include_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  target_scope TEXT NOT NULL DEFAULT 'ALL_PARTICIPANTS',
  status TEXT NOT NULL DEFAULT 'PENDING',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES users(id),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  in_app_delivered_count INTEGER NOT NULL DEFAULT 0,
  push_token_count INTEGER NOT NULL DEFAULT 0,
  push_sent_count INTEGER NOT NULL DEFAULT 0,
  push_failed_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  is_automated BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_event_update_broadcast_channel
    CHECK (include_push = TRUE OR include_in_app = TRUE)
);

CREATE TABLE IF NOT EXISTS event_update_broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES event_update_broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  push_message_key TEXT,
  push_status TEXT NOT NULL DEFAULT 'QUEUED',
  delivery_status TEXT NOT NULL DEFAULT 'QUEUED',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_update_broadcasts_society
  ON event_update_broadcasts (society_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_update_broadcasts_event
  ON event_update_broadcasts (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_update_broadcasts_status
  ON event_update_broadcasts (status, scheduled_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_update_broadcast_recipients_broadcast
  ON event_update_broadcast_recipients (broadcast_id);

CREATE INDEX IF NOT EXISTS idx_event_update_broadcast_recipients_user
  ON event_update_broadcast_recipients (user_id, created_at DESC);

COMMIT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action_enum') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action_enum'
        AND e.enumlabel = 'EVENT_BROADCAST_CREATED'
    ) THEN
      ALTER TYPE audit_action_enum ADD VALUE 'EVENT_BROADCAST_CREATED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action_enum'
        AND e.enumlabel = 'EVENT_BROADCAST_SENT'
    ) THEN
      ALTER TYPE audit_action_enum ADD VALUE 'EVENT_BROADCAST_SENT';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'audit_action_enum'
        AND e.enumlabel = 'EVENT_BROADCAST_CANCELLED'
    ) THEN
      ALTER TYPE audit_action_enum ADD VALUE 'EVENT_BROADCAST_CANCELLED';
    END IF;
  END IF;
END $$;
