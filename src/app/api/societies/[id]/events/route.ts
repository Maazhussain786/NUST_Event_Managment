export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

/**
 * POST /api/societies/[id]/events
 *
 * Create a new event for a society.
 *
 * Authorization:
 *   - Must have CREATE_EVENT privilege (via fn_has_privilege)
 *   - Society must be APPROVED (checked by fn_has_privilege)
 *
 * Body:
 *   title (required), description, location, venue_details,
 *   event_start (required), event_end (required),
 *   registration_start, registration_end,
 *   is_paid, ticket_price, max_tickets, max_participants,
 *   category_id, wing_id, portfolio_id,
 *   banner_url, thumbnail_url (required),
 *   visibility (PUBLIC|MEMBERS_ONLY), transfer_deadline
 *
 * Auto-behavior:
 *   - registration_link auto-generated
 *   - status auto-calculated by DB trigger (fn_calculate_event_status)
 *   - version = 1
 *   - created_by = current user
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: societyId } = params;
    const body = await req.json();

    // ── Required field validation ─────────────────────────────────────
    const { title, event_start, event_end, thumbnail_url } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!event_start) {
      return NextResponse.json({ error: 'event_start is required' }, { status: 400 });
    }
    if (!event_end) {
      return NextResponse.json({ error: 'event_end is required' }, { status: 400 });
    }
    if (!thumbnail_url || !thumbnail_url.trim()) {
      return NextResponse.json({ error: 'thumbnail_url is required' }, { status: 400 });
    }

    // ── Date validations ──────────────────────────────────────────────
    const startDate = new Date(event_start);
    const endDate = new Date(event_end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format for event_start or event_end' }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'event_end must be >= event_start' }, { status: 400 });
    }

    if (body.registration_end) {
      const regEnd = new Date(body.registration_end);
      if (isNaN(regEnd.getTime())) {
        return NextResponse.json({ error: 'Invalid date format for registration_end' }, { status: 400 });
      }
      if (regEnd > startDate) {
        return NextResponse.json({ error: 'registration_end must be <= event_start' }, { status: 400 });
      }
    }

    // ── max_participants validation ───────────────────────────────────
    if (body.max_participants !== undefined && body.max_participants !== null) {
      if (!Number.isInteger(body.max_participants) || body.max_participants < 1) {
        return NextResponse.json({ error: 'max_participants must be an integer >= 1' }, { status: 400 });
      }
    }

    await client.query('BEGIN');

    // ── Authorization: fn_has_privilege ────────────────────────────────
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'CREATE_EVENT', $3, $4) AS allowed`,
      [user.userId, societyId, body.wing_id || null, body.portfolio_id || null]
    );
    if (!privCheck.rows[0].allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Forbidden — you do not have CREATE_EVENT privilege for this society' },
        { status: 403 }
      );
    }

    // ── Verify society exists & is APPROVED (double-check) ────────────
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1`,
      [societyId]
    );
    if (society.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society not found' }, { status: 404 });
    }
    if (society.rows[0].status !== 'APPROVED' && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Society is not active' }, { status: 409 });
    }

    // ── Auto-generate registration link ───────────────────────────────
    const registrationLink = `evt-${crypto.randomBytes(12).toString('hex')}`;

    // ── Insert event ──────────────────────────────────────────────────
    const insertResult = await client.query(
      `INSERT INTO events (
          society_id, wing_id, portfolio_id, category_id,
          title, description, location, venue_details,
          is_paid, ticket_price, max_tickets, max_participants,
          event_start, event_end, registration_start, registration_end,
          transfer_deadline, banner_url, thumbnail_url,
          visibility, registration_link, version, created_by
       ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19,
          $20, $21, 1, $22
       ) RETURNING id, status, registration_link, version`,
      [
        societyId,
        body.wing_id || null,
        body.portfolio_id || null,
        body.category_id || null,
        title.trim(),
        body.description || null,
        body.location || null,
        body.venue_details || null,
        body.is_paid ?? false,
        body.ticket_price ?? null,
        body.max_tickets ?? null,
        body.max_participants ?? null,
        event_start,
        event_end,
        body.registration_start || null,
        body.registration_end || null,
        body.transfer_deadline || null,
        body.banner_url || null,
        thumbnail_url.trim(),
        body.visibility || 'PUBLIC',
        registrationLink,
        user.userId,
      ]
    );

    const newEvent = insertResult.rows[0];

    // ── Audit log ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
       VALUES ('EVENT_CREATED', $1, $2, 'event', $3, $4, $5)`,
      [
        user.userId,
        societyId,
        newEvent.id,
        JSON.stringify({ title: title.trim(), event_start, event_end, status: newEvent.status }),
        JSON.stringify({ createdBy: user.fullName, registrationLink }),
      ]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      event: {
        id: newEvent.id,
        status: newEvent.status,
        registration_link: newEvent.registration_link,
        version: newEvent.version,
      },
    }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create event error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  } finally {
    client.release();
  }
}
