import { NextResponse } from 'next/server';
import { query } from './db';
import { ApiErrors, writeAuditLog } from './api-utils';

/** Portfolio functions from the SRS catalog (Appendix 10). Functions carry module powers inside an event. */
export const PORTFOLIO_FUNCTIONS = [
  'TEAM_HR', 'ADMIN_COORDINATION', 'FINANCE', 'LOGISTICS', 'PROTOCOL', 'MOCS', 'SECURITY',
  'EVENT_MANAGEMENT', 'MEDIA', 'OUTREACH', 'INVITES', 'STAGE_MANAGEMENT', 'PERFORMANCES',
  'USHERS', 'CROWD_CONTROL', 'GENERAL',
] as const;

interface PortfolioInput {
  name?: unknown;
  description?: unknown;
  wing_id?: unknown;
  function_key?: unknown;
  is_event_specific?: unknown;
  applies_to?: unknown;
}

/** Validates and inserts a portfolio. Caller has already checked permissions. */
export async function createPortfolio(
  societyId: string,
  actorId: string,
  input: PortfolioInput,
): Promise<{ portfolio: Record<string, unknown> } | { error: NextResponse }> {
  const name = String(input.name || '').trim();
  const functionKey = String(input.function_key || 'GENERAL').toUpperCase();
  const wingId = input.wing_id ? String(input.wing_id) : null;

  if (!name) return { error: ApiErrors.validation('Portfolio name required') };
  if (name.length > 200) return { error: ApiErrors.validation('Portfolio name is too long') };
  if (!(PORTFOLIO_FUNCTIONS as readonly string[]).includes(functionKey)) {
    return { error: ApiErrors.validation('Unknown portfolio function') };
  }
  if (wingId) {
    const wing = await query('SELECT 1 FROM wings WHERE id = $1 AND society_id = $2 AND deleted_at IS NULL', [wingId, societyId]);
    if (wing.rows.length === 0) return { error: ApiErrors.validation('Wing does not belong to this society') };
  }
  const clash = await query(
    `SELECT 1 FROM portfolios WHERE society_id = $1 AND deleted_at IS NULL AND LOWER(name) = LOWER($2)`,
    [societyId, name],
  );
  if (clash.rows.length > 0) return { error: ApiErrors.conflict('A portfolio with this name already exists') };

  const result = await query(
    `INSERT INTO portfolios (society_id, wing_id, name, description, created_by, function_key, is_event_specific, applies_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, wing_id, name, description, function_key, is_event_specific, applies_to, created_at`,
    [
      societyId, wingId, name, String(input.description || ''), actorId, functionKey,
      Boolean(input.is_event_specific), input.applies_to ? String(input.applies_to).slice(0, 200) : null,
    ],
  );
  await writeAuditLog({
    action: 'PORTFOLIO_CREATED',
    performedBy: actorId,
    societyId,
    targetType: 'portfolio',
    targetId: result.rows[0].id,
    newValue: { name, functionKey, wingId },
  });
  return { portfolio: result.rows[0] };
}
