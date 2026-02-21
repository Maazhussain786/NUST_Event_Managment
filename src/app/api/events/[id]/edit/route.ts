import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * PATCH /api/events/[id]
 *
 * Edit an existing event.
 *
 * Authorization:
 *   - EDIT_EVENT privilege required (via fn_has_privilege)
 *   - Cannot edit if society DEACTIVATED (fn_has_privilege blocks this)
 *   - Core fields => President/VP only (hierarchy_level >= 8)
 *   - Non-core fields => Director+ (hierarchy_level >= 5)
 *
 * Core fields: title, event_start, event_end, is_paid, ticket_price, max_tickets
 * Non-core: description, location, venue_details, banner_url, thumbnail_url,
 *           registration_start, registration_end, max_participants,
 *           category_id, visibility, transfer_deadline, status (DRAFT only)
 *
 * Optimistic locking:
 *   Body must include `version` matching current DB version.
 *   On success, version is incremented.
 */

const CORE_FIELDS = new Set([
  'title', 'event_start', 'event_end', 'is_paid', 'ticket_price', 'max_tickets',
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: eventId } = params;
    const body = await req.json();

    // ── Version required for optimistic locking ───────────────────────
    if (body.version === undefined || body.version === null) {
      return NextResponse.json({ error: 'version is required for optimistic locking' }, { status: 400 });
    }
    const clientVersion = Number(body.version);
    if (!Number.isInteger(clientVersion) || clientVersion < 1) {
      return NextResponse.json({ error: 'version must be a positive integer' }, { status: 400 });
    }

    await client.query('BEGIN');

    // ── Fetch event with FOR UPDATE lock ──────────────────────────────
    const eventResult = await client.query(
      `SELECT e.*, s.status as society_status
       FROM events e
       JOIN societies s ON e.society_id = s.id
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventResult.rows[0];

    // ── Optimistic locking check ──────────────────────────────────────
    if (event.version !== clientVersion) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        {
          error: 'Version mismatch — event was modified by another user',
          currentVersion: event.version,
          yourVersion: clientVersion,
        },
        { status: 409 }
      );
    }

    // ── Cannot edit cancelled or completed events ─────────────────────
    if (event.is_cancelled) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Cannot edit a cancelled event' }, { status: 409 });
    }

    // ── Authorization: fn_has_privilege ────────────────────────────────
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'EDIT_EVENT', $3, $4) AS allowed`,
      [user.userId, event.society_id, event.wing_id, event.portfolio_id]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Forbidden — you do not have EDIT_EVENT privilege' },
        { status: 403 }
      );
    }

    // ── Determine if any core fields are being modified ───────────────
    const submittedFields = Object.keys(body).filter(k => k !== 'version');
    const hasCoreFieldChanges = submittedFields.some(f => CORE_FIELDS.has(f));

    if (hasCoreFieldChanges) {
      // Need hierarchy_level >= 8 (President or VP)
      const roleCheck = await client.query(
        `SELECT MAX(r.hierarchy_level) as max_level
         FROM society_memberships sm
         JOIN roles r ON sm.role_id = r.id
         WHERE sm.user_id = $1 AND sm.society_id = $2
           AND sm.is_active = TRUE AND sm.suspended_at IS NULL`,
        [user.userId, event.society_id]
      );

      const maxLevel = user.userType === 'SUPER_ADMIN'
        ? 999
        : (roleCheck.rows[0]?.max_level ?? 0);

      if (maxLevel < 8) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Core fields (title, dates, pricing) can only be edited by President or VP' },
          { status: 403 }
        );
      }
    }

    // ── Date validations (if dates are being changed) ─────────────────
    const newStart = body.event_start ? new Date(body.event_start) : new Date(event.event_start);
    const newEnd = body.event_end ? new Date(body.event_end) : new Date(event.event_end);

    if (newEnd < newStart) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'event_end must be >= event_start' }, { status: 400 });
    }

    if (body.registration_end) {
      const regEnd = new Date(body.registration_end);
      if (regEnd > newStart) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'registration_end must be <= event_start' }, { status: 400 });
      }
    }

    if (body.max_participants !== undefined && body.max_participants !== null) {
      if (!Number.isInteger(body.max_participants) || body.max_participants < 1) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'max_participants must be an integer >= 1' }, { status: 400 });
      }
    }

    // ── Build dynamic UPDATE ──────────────────────────────────────────
    const ALLOWED_FIELDS: Record<string, string> = {
      title: 'title',
      description: 'description',
      location: 'location',
      venue_details: 'venue_details',
      event_start: 'event_start',
      event_end: 'event_end',
      registration_start: 'registration_start',
      registration_end: 'registration_end',
      transfer_deadline: 'transfer_deadline',
      is_paid: 'is_paid',
      ticket_price: 'ticket_price',
      max_tickets: 'max_tickets',
      max_participants: 'max_participants',
      category_id: 'category_id',
      wing_id: 'wing_id',
      portfolio_id: 'portfolio_id',
      banner_url: 'banner_url',
      thumbnail_url: 'thumbnail_url',
      visibility: 'visibility',
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    let paramIdx = 1;

    for (const [bodyKey, dbCol] of Object.entries(ALLOWED_FIELDS)) {
      if (body[bodyKey] !== undefined) {
        oldValues[dbCol] = event[dbCol];
        newValues[dbCol] = body[bodyKey];
        setClauses.push(`${dbCol} = $${paramIdx}`);
        values.push(body[bodyKey]);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Always increment version and updated_at
    setClauses.push(`version = version + 1`);
    setClauses.push(`updated_at = NOW()`);

    // WHERE with optimistic locking
    values.push(eventId);
    values.push(clientVersion);
    const updateSql = `
      UPDATE events SET ${setClauses.join(', ')}
      WHERE id = $${paramIdx} AND version = $${paramIdx + 1}
      RETURNING id, status, version
    `;

    const updateResult = await client.query(updateSql, values);

    if (updateResult.rows.length === 0) {
      // Race condition — version changed between SELECT and UPDATE
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Version mismatch — event was modified concurrently' },
        { status: 409 }
      );
    }

    const updated = updateResult.rows[0];

    // ── Audit log ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, old_value, new_value, metadata)
       VALUES ('EVENT_UPDATED', $1, $2, 'event', $3, $4, $5, $6)`,
      [
        user.userId,
        event.society_id,
        eventId,
        JSON.stringify(oldValues),
        JSON.stringify(newValues),
        JSON.stringify({
          updatedBy: user.fullName,
          fieldsChanged: Object.keys(newValues),
          hasCoreFieldChanges,
          newVersion: updated.version,
        }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      event: {
        id: updated.id,
        status: updated.status,
        version: updated.version,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Edit event error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  } finally {
    client.release();
  }
}
