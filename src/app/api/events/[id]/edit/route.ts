export const dynamic = 'force-dynamic';

const CORE_FIELDS = new Set([
  'title',
  'event_start',
  'event_end',
  'is_paid',
  'ticket_price',
  'max_tickets',
]);

import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  ApiErrors,
  extractIpAddress,
  writeAuditLog,
  checkSocietyOperational,
  checkBlackoutPeriod,
  validateCapacityReduction,
  validatePriceChange,
  validateTimeChangeAfterCheckIn,
  resolveEffectiveSocietyPrivilege,
} from '@/lib/api-utils';
import { createAutomaticEventUpdateBroadcast } from "@/lib/event-broadcasts";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return ApiErrors.unauthorized();

    const { id: eventId } = await params;
    const body = await req.json();
    const ip = extractIpAddress(req);
    const hasTicketPriceInBody = Object.prototype.hasOwnProperty.call(body, 'ticket_price');

    if (hasTicketPriceInBody) {
      const rawTicketPrice = body.ticket_price;
      const normalizedTicketPrice =
        rawTicketPrice === undefined || rawTicketPrice === null || rawTicketPrice === ''
          ? null
          : Number(rawTicketPrice);

      if (normalizedTicketPrice !== null && (Number.isNaN(normalizedTicketPrice) || normalizedTicketPrice < 0)) {
        return ApiErrors.validation('ticket_price must be a non-negative number');
      }

      body.ticket_price = normalizedTicketPrice;
      body.is_paid = normalizedTicketPrice !== null && normalizedTicketPrice > 0;
    }

    // ── Version required for optimistic locking ───────────────────────
    if (body.version === undefined || body.version === null) {
      return ApiErrors.validation('version is required for optimistic locking');
    }
    const clientVersion = Number(body.version);
    if (!Number.isInteger(clientVersion) || clientVersion < 1) {
      return ApiErrors.validation('version must be a positive integer');
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
      return ApiErrors.notFound('Event');
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

    // ── Cannot edit deleted events ────────────────────────────────────
    if (event.deleted_at) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('Cannot edit a deleted event');
    }

    // ── Cannot edit cancelled events ──────────────────────────────────
    if (event.is_cancelled) {
      await client.query('ROLLBACK');
      return ApiErrors.conflict('Cannot edit a cancelled event');
    }

    // ── Cannot edit completed/archived events ─────────────────────────
    if (event.status === 'COMPLETED' || event.status === 'ARCHIVED') {
      await client.query('ROLLBACK');
      return ApiErrors.conflict(`Cannot edit a ${event.status.toLowerCase()} event`);
    }

    // ── Check society operational state ────────────────────────────────
    const societyCheck = await checkSocietyOperational(event.society_id, client);
    if (societyCheck) {
      await client.query('ROLLBACK');
      return societyCheck;
    }

    // ── Authorization: effective privilege (role grant or member override) ─
    const effectiveEditPrivilege = await resolveEffectiveSocietyPrivilege(
      {
        userId: user.userId,
        societyId: event.society_id,
        privilegeName: 'EDIT_EVENT',
        wingId: event.wing_id,
        portfolioId: event.portfolio_id,
      },
      client,
    );
    if (!effectiveEditPrivilege.allowed && user.userType !== 'SUPER_ADMIN') {
      await client.query('ROLLBACK');
      return ApiErrors.forbidden('You do not have EDIT_EVENT privilege');
    }

    // ── Date validations (if dates are being changed) ─────────────────
    const newStart = body.event_start ? new Date(body.event_start) : new Date(event.event_start);
    const newEnd = body.event_end ? new Date(body.event_end) : new Date(event.event_end);

    if (newEnd < newStart) {
      await client.query('ROLLBACK');
      return ApiErrors.validation('event_end must be >= event_start');
    }

    if (body.registration_end) {
      const regEnd = new Date(body.registration_end);
      if (regEnd > newStart) {
        await client.query('ROLLBACK');
        return ApiErrors.validation('registration_end must be <= event_start');
      }
    }

    if (body.max_participants !== undefined && body.max_participants !== null) {
      if (!Number.isInteger(body.max_participants) || body.max_participants < 1) {
        await client.query('ROLLBACK');
        return ApiErrors.validation('max_participants must be an integer >= 1');
      }
    }

    // ── Capacity reduction guard ──────────────────────────────────────
    if (body.max_participants !== undefined && body.max_participants < event.max_participants) {
      const capError = await validateCapacityReduction(eventId, body.max_participants, client);
      if (capError) {
        await client.query('ROLLBACK');
        return ApiErrors.conflict(capError);
      }
    }

    // ── Price change guard (cannot change if approved payments exist) ─
    if (body.ticket_price !== undefined && Number(body.ticket_price) !== Number(event.ticket_price)) {
      const priceError = await validatePriceChange(eventId, client);
      if (priceError) {
        await client.query('ROLLBACK');
        return ApiErrors.conflict(priceError);
      }
    }

    // ── Time change guard (cannot change if check-ins exist) ──────────
    if (body.event_start !== undefined || body.event_end !== undefined) {
      const timeError = await validateTimeChangeAfterCheckIn(eventId, client);
      if (timeError) {
        await client.query('ROLLBACK');
        return ApiErrors.conflict(timeError);
      }

      // Blackout period check
      const blackoutError = await checkBlackoutPeriod(newStart, newEnd, client);
      if (blackoutError) {
        await client.query('ROLLBACK');
        return ApiErrors.conflict(blackoutError);
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
      return ApiErrors.validation('No valid fields to update');
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
      return ApiErrors.conflict('Version mismatch — event was modified concurrently');
    }

    const updated = updateResult.rows[0];
    const hasCoreFieldChanges = Object.keys(newValues).some((field) =>
      CORE_FIELDS.has(field),
    );

    // ── Audit log with IP ──────────────────────────────────────────────
    await writeAuditLog(
      {
        action: 'EVENT_UPDATED',
        performedBy: user.userId,
        societyId: event.society_id,
        targetType: 'event',
        targetId: eventId,
        oldValue: oldValues,
        newValue: newValues,
        metadata: {
          updatedBy: user.fullName,
          fieldsChanged: Object.keys(newValues),
          hasCoreFieldChanges,
          newVersion: updated.version,
        },
        ipAddress: ip,
      },
      client
    );

    await client.query('COMMIT');

    const scheduleChanged =
      Object.prototype.hasOwnProperty.call(newValues, "event_start") ||
      Object.prototype.hasOwnProperty.call(newValues, "event_end");
    const venueChanged =
      Object.prototype.hasOwnProperty.call(newValues, "location") ||
      Object.prototype.hasOwnProperty.call(newValues, "venue_details");

    if (scheduleChanged || venueChanged) {
      try {
        await createAutomaticEventUpdateBroadcast({
          societyId: event.society_id,
          eventId,
          actorUserId: user.userId,
          eventTitle: String(newValues.title || event.title || "Event"),
          oldStart: event.event_start ? new Date(event.event_start).toISOString() : null,
          newStart: Object.prototype.hasOwnProperty.call(newValues, "event_start")
            ? String(newValues.event_start || "")
            : event.event_start
              ? new Date(event.event_start).toISOString()
              : null,
          oldEnd: event.event_end ? new Date(event.event_end).toISOString() : null,
          newEnd: Object.prototype.hasOwnProperty.call(newValues, "event_end")
            ? String(newValues.event_end || "")
            : event.event_end
              ? new Date(event.event_end).toISOString()
              : null,
          oldVenue: String(event.location || ""),
          newVenue: String(newValues.location ?? event.location ?? ""),
        });
      } catch (broadcastError) {
        console.error("Automatic event update broadcast failed:", broadcastError);
      }
    }

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
    return ApiErrors.serverError('Edit event error:', error);
  } finally {
    client.release();
  }
}
