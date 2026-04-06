import { query } from '@/lib/db';

const EVENT_COHOSTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS event_cohosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    cohost_type TEXT NOT NULL CHECK (cohost_type IN ('SOCIETY', 'NUST_ADMIN')),
    society_id UUID REFERENCES societies(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
    source_request_id UUID REFERENCES platform_cohost_requests(id) ON DELETE SET NULL,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_event_cohosts_society_required
      CHECK (
        (cohost_type = 'SOCIETY' AND society_id IS NOT NULL)
        OR
        (cohost_type = 'NUST_ADMIN' AND society_id IS NULL)
      )
  )
`;

let ensured = false;
let inFlight: Promise<void> | null = null;

// Avoid running DDL on every request in hot APIs.
export async function ensureEventCohostsTable(): Promise<void> {
  if (ensured) return;

  if (!inFlight) {
    inFlight = query(EVENT_COHOSTS_TABLE_SQL)
      .then(() => {
        ensured = true;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  await inFlight;
}
