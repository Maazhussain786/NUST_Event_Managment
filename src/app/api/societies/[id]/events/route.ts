export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  checkApiRateLimit,
  checkSocietyOperational,
  checkBlackoutPeriod,
} from '@/lib/api-utils';

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
    if (!user) return ApiErrors.unauthorized();

    const { id: societyId } = params;
    const ip = extractIpAddress(req);

    // Rate limit: max 5 event creations per minute per user
    const rateLimited = checkApiRateLimit(user.userId, 'create-event', 5);
    if (rateLimited) return rateLimited;

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

    // ── Society operational check ─────────────────────────────────────
    const societyCheck = await checkSocietyOperational(societyId, client);
    if (societyCheck) { await client.query('ROLLBACK'); return societyCheck; }

    // ── Authorization: fn_has_privilege ────────────────────────────────
    const privCheck = await client.query(
      `SELECT fn_has_privilege($1, $2, 'CREATE_EVENT', $3, $4) AS allowed`,
      [user.userId, societyId, body.wing_id || null, body.portfolio_id || null]
    );
    if (!privCheck.rows[0].allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have CREATE_EVENT privilege for this society');
    }

    // ── Blackout period check ─────────────────────────────────────────
    const blackoutError = await checkBlackoutPeriod(startDate, endDate, client);
    if (blackoutError) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict(blackoutError);
    }

    // ── Verify society exists & is APPROVED (double-check) ────────────
    const society = await client.query(
      `SELECT id, name, status FROM societies WHERE id = $1`,
      [societyId]
    );
    if (society.rows.length === 0) {
      await client.query('ROLLBACK');
      return ApiErrors.notFound('Society');
    }
    if (society.rows[0].status !== 'APPROVED' && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('Society is not active');
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

    // ── Audit log with IP ─────────────────────────────────────────────
    await writeAuditLog(
      {
        action: 'EVENT_CREATED',
        performedBy: user.userId,
        societyId,
        targetType: 'event',
        targetId: newEvent.id,
        newValue: { title: title.trim(), event_start, event_end, status: newEvent.status },
        metadata: { createdBy: user.fullName, registrationLink },
        ipAddress: ip,
      },
      client
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
    return ApiErrors.serverError('Create event error:', error);
  } finally {
    client.release();
  }
}
