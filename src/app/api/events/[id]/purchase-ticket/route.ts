export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocietyPaymentDetails } from "@/lib/payment-wallets";

/**
 * POST /api/events/[id]/purchase-ticket
 *
 * Purchase a ticket for a paid event.
 *
 * Rules:
 * - Event must be paid
 * - User must be active and not suspended
 * - Society must be approved
 * - Capacity cannot be exceeded
 * - Duplicate purchases are blocked
 * - Registration must still be open
 * - Event must not be cancelled/completed
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getClient();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: eventId } = await params;

    let requestedWalletId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.wallet_id === "string" && body.wallet_id.trim()) {
        requestedWalletId = body.wallet_id.trim();
      }
    } catch {
      requestedWalletId = null;
    }

    await client.query("BEGIN");

    const userCheck = await client.query(
      `SELECT id, status
       FROM users
       WHERE id = $1`,
      [user.userId],
    );
    if (userCheck.rows.length === 0 || userCheck.rows[0].status !== "ACTIVE") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Your account is not active" }, { status: 403 });
    }

    const eventResult = await client.query(
      `SELECT
         e.id,
         e.title,
         e.society_id,
         e.is_cancelled,
         e.status,
         e.is_paid,
         e.ticket_price,
         e.max_participants,
         e.participants_count,
         e.event_start,
         e.event_end,
         e.registration_end,
         e.visibility,
         e.created_by,
         s.status AS society_status,
         s.name AS society_name
       FROM events e
       JOIN societies s ON e.society_id = s.id
       WHERE e.id = $1
       FOR UPDATE OF e`,
      [eventId],
    );
    if (eventResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventResult.rows[0];

    if (!event.is_paid) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "This is a free event. Use /register instead." },
        { status: 400 },
      );
    }

    if (event.society_status !== "APPROVED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Society is not active" }, { status: 409 });
    }

    if (event.is_cancelled || event.status === "CANCELLED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Event is cancelled" }, { status: 409 });
    }

    if (event.status === "COMPLETED" || event.status === "ARCHIVED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Event has already ended" }, { status: 409 });
    }

    if (event.registration_end && new Date(event.registration_end) < new Date()) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Registration deadline has passed" }, { status: 409 });
    }

    if (event.visibility === "MEMBERS_ONLY") {
      const memberCheck = await client.query(
        `SELECT 1
         FROM society_memberships
         WHERE user_id = $1
           AND society_id = $2
           AND is_active = TRUE
           AND suspended_at IS NULL`,
        [user.userId, event.society_id],
      );
      if (memberCheck.rows.length === 0 && user.userType !== "SUPER_ADMIN") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This event is for society members only" },
          { status: 403 },
        );
      }
    }

    const suspendedCheck = await client.query(
      `SELECT 1
       FROM society_memberships
       WHERE user_id = $1
         AND society_id = $2
         AND suspended_at IS NOT NULL`,
      [user.userId, event.society_id],
    );
    if (suspendedCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "You are suspended from this society" }, { status: 403 });
    }

    if (event.created_by === user.userId) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Event organizers cannot purchase tickets for their own events" },
        { status: 403 },
      );
    }

    if (user.userType !== "SUPER_ADMIN") {
      const orgCheck = await client.query(
        `SELECT r.hierarchy_level
         FROM society_memberships sm
         JOIN roles r ON sm.role_id = r.id
         WHERE sm.user_id = $1
           AND sm.society_id = $2
           AND sm.is_active = TRUE
           AND r.hierarchy_level >= 8`,
        [user.userId, event.society_id],
      );
      if (orgCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Society leadership cannot purchase tickets for their own society events" },
          { status: 403 },
        );
      }
    }

    const paymentDetails = await getSocietyPaymentDetails(
      (text, values) => client.query(text, values),
      event.society_id,
    );

    if (!paymentDetails.configured || paymentDetails.wallets.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error:
            "Payment details are not configured for this society. Please ask society leadership to update payment settings first.",
          code: "PAYMENT_DETAILS_MISSING",
        },
        { status: 409 },
      );
    }

    const selectedWallet =
      (requestedWalletId
        ? paymentDetails.wallets.find((wallet) => wallet.id === requestedWalletId)
        : null) ||
      paymentDetails.wallets.find((wallet) => wallet.id === paymentDetails.active_wallet_id) ||
      paymentDetails.wallets[0];
    const selectedWalletIdForTicket =
      selectedWallet && /^[0-9a-fA-F-]{36}$/.test(selectedWallet.id)
        ? selectedWallet.id
        : null;

    if (requestedWalletId && !selectedWallet) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Selected wallet is invalid or unavailable", code: "INVALID_WALLET" },
        { status: 400 },
      );
    }

    const selectedWalletColumn = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'tickets'
         AND column_name = 'selected_wallet_id'
       LIMIT 1`,
    );
    const hasSelectedWalletColumn = selectedWalletColumn.rows.length > 0;

    if (event.max_participants) {
      const ticketCount = await client.query(
        `SELECT COUNT(*) AS cnt
         FROM tickets
         WHERE event_id = $1
           AND status IN ('PENDING', 'APPROVED')`,
        [eventId],
      );
      const currentCount = parseInt(ticketCount.rows[0].cnt, 10);
      if (currentCount >= event.max_participants) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Event has reached maximum capacity" }, { status: 409 });
      }
    }

    const existingTicket = await client.query(
      `SELECT id, status, payment_reference
       FROM tickets
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, user.userId],
    );

    if (existingTicket.rows.length > 0) {
      const ticket = existingTicket.rows[0];

      if (ticket.status === "PENDING") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: "You already have a pending ticket for this event",
            ticketId: ticket.id,
            paymentReference: ticket.payment_reference,
            ticket: {
              id: ticket.id,
              status: "PENDING",
              paymentReference: ticket.payment_reference,
            },
          },
          { status: 409 },
        );
      }

      if (ticket.status === "APPROVED") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "You already have an approved ticket" }, { status: 409 });
      }

      if (ticket.status === "REJECTED" || ticket.status === "CANCELLED") {
        const updateSql = hasSelectedWalletColumn
          ? `UPDATE tickets
             SET status = 'PENDING',
                 payment_reference = uuid_generate_v4(),
                 selected_wallet_id = $2,
                 purchased_at = NOW(),
                 approved_at = NULL,
                 approved_by = NULL,
                 cancelled_at = NULL,
                 checked_in_at = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, payment_reference`
          : `UPDATE tickets
             SET status = 'PENDING',
                 payment_reference = uuid_generate_v4(),
                 purchased_at = NOW(),
                 approved_at = NULL,
                 approved_by = NULL,
                 cancelled_at = NULL,
                 checked_in_at = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, payment_reference`;
        const updateValues = hasSelectedWalletColumn
          ? [ticket.id, selectedWalletIdForTicket]
          : [ticket.id];
        const updated = await client.query(updateSql, updateValues);

        try {
          await client.query(
            `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
             VALUES ('TICKET_PURCHASED', $1, $2, 'ticket', $3, $4, $5)`,
            [
              user.userId,
              event.society_id,
              updated.rows[0].id,
              JSON.stringify({
                status: "PENDING",
                payment_reference: updated.rows[0].payment_reference,
              }),
              JSON.stringify({
                eventTitle: event.title,
                action: "ticket_re_purchased",
              }),
            ],
          );
        } catch (auditErr) {
          console.warn("Audit log skipped for ticket re-purchase:", auditErr);
        }

        await client.query("COMMIT");
        return NextResponse.json(
          {
            success: true,
            ticket: {
              id: updated.rows[0].id,
              status: "PENDING",
              paymentReference: updated.rows[0].payment_reference,
              selectedWalletId: selectedWallet?.id || null,
            },
            paymentDetails,
            message: "Ticket request re-submitted. Pending approval by society.",
          },
          { status: 200 },
        );
      }
    }

    const insertSql = hasSelectedWalletColumn
      ? `INSERT INTO tickets (event_id, user_id, status, payment_reference, selected_wallet_id)
         VALUES ($1, $2, 'PENDING', uuid_generate_v4(), $3)
         RETURNING id, payment_reference`
      : `INSERT INTO tickets (event_id, user_id, status, payment_reference)
         VALUES ($1, $2, 'PENDING', uuid_generate_v4())
         RETURNING id, payment_reference`;
    const insertValues = hasSelectedWalletColumn
      ? [eventId, user.userId, selectedWalletIdForTicket]
      : [eventId, user.userId];
    const ticketResult = await client.query(insertSql, insertValues);
    const createdTicket = ticketResult.rows[0];

    try {
      await client.query(
        `INSERT INTO audit_logs (action, performed_by, society_id, target_type, target_id, new_value, metadata)
         VALUES ('TICKET_PURCHASED', $1, $2, 'ticket', $3, $4, $5)`,
        [
          user.userId,
          event.society_id,
          createdTicket.id,
          JSON.stringify({
            status: "PENDING",
            payment_reference: createdTicket.payment_reference,
          }),
          JSON.stringify({
            eventTitle: event.title,
            societyName: event.society_name,
            ticketPrice: event.ticket_price,
            action: "ticket_purchased",
          }),
        ],
      );
    } catch (auditErr) {
      console.warn("Audit log skipped for ticket purchase:", auditErr);
    }

    try {
      const approvers = await client.query(
        `SELECT DISTINCT sm.user_id
         FROM society_memberships sm
         JOIN roles r ON sm.role_id = r.id
         JOIN role_privileges rp ON r.id = rp.role_id
         JOIN privileges p ON rp.privilege_id = p.id
         WHERE sm.society_id = $1
           AND sm.is_active = TRUE
           AND p.name = 'VERIFY_PAYMENTS'
           AND sm.user_id != $2`,
        [event.society_id, user.userId],
      );
      for (const approver of approvers.rows) {
        await client.query(
          `INSERT INTO notifications (user_id, title, body, link)
           VALUES ($1, $2, $3, $4)`,
          [
            approver.user_id,
            "New Ticket Request",
            `${user.fullName || "A student"} requested a ticket for "${event.title}" (Rs. ${event.ticket_price})`,
            `/society/${event.society_id}/approvals`,
          ],
        );
      }
    } catch (notifErr) {
      console.error("Failed to notify approvers:", notifErr);
    }

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        ticket: {
          id: createdTicket.id,
          status: "PENDING",
          paymentReference: createdTicket.payment_reference,
          selectedWalletId: selectedWallet?.id || null,
        },
        paymentDetails,
        message: "Ticket request submitted. Pending approval by society.",
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK");

    if (error instanceof Error && error.message.includes("uq_ticket_event_user")) {
      return NextResponse.json(
        { error: "You already have a ticket for this event" },
        { status: 409 },
      );
    }

    console.error("Ticket purchase error:", error);
    return NextResponse.json({ error: "Failed to purchase ticket" }, { status: 500 });
  } finally {
    client.release();
  }
}
