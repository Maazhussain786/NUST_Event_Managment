require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');
const { Pool } = require('pg');

const isAzure = process.env.ACTIVE_DB !== 'local';
const config = isAzure
  ? {
      host: process.env.AZURE_DB_HOST,
      port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
      database: process.env.AZURE_DB_NAME,
      user: process.env.AZURE_DB_USER,
      password: process.env.AZURE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
      database: process.env.LOCAL_DB_NAME || 'event_management',
      user: process.env.LOCAL_DB_USER || 'postgres',
      password: process.env.LOCAL_DB_PASSWORD,
      ssl: false,
    };

const pool = new Pool(config);
const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'test-secret';

function signQr(data) {
  return crypto.createHmac('sha256', QR_SECRET).update(data).digest('hex');
}

function generateQrPayload(type, id, eventId, userId) {
  const data = `${type}:${id}:${eventId}:${userId}`;
  return `${data}:${signQr(data)}`;
}

function verifyQrPayload(payload) {
  const parts = payload.split(':');
  if (parts.length !== 5) return null;

  const [type, id, eventId, userId, signature] = parts;
  if (type !== 'T' && type !== 'R') return null;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id) || !uuidRegex.test(eventId) || !uuidRegex.test(userId)) return null;

  const expected = signQr(`${type}:${id}:${eventId}:${userId}`);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return { type, id, eventId, userId };
}

async function ensurePaidQr(client, ticketId, eventId, userId) {
  const existing = await client.query(
    `SELECT id, qr_data FROM ticket_qr_codes WHERE ticket_id = $1 AND is_active = TRUE LIMIT 1`,
    [ticketId]
  );

  const row = existing.rows[0];
  const parsed = row ? verifyQrPayload(row.qr_data) : null;
  const valid = !!parsed
    && parsed.type === 'T'
    && parsed.id === ticketId
    && parsed.eventId === eventId
    && parsed.userId === userId;

  if (valid) return row.qr_data;

  await client.query(`UPDATE ticket_qr_codes SET is_active = FALSE WHERE ticket_id = $1 AND is_active = TRUE`, [ticketId]);

  const payload = generateQrPayload('T', ticketId, eventId, userId);
  await client.query(
    `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active) VALUES ($1, $2, TRUE)`,
    [ticketId, payload]
  );

  return payload;
}

async function ensureRegistrationQr(client, registrationId, eventId, userId) {
  const existing = await client.query(
    `SELECT id, qr_data FROM ticket_qr_codes WHERE registration_id = $1 AND is_active = TRUE LIMIT 1`,
    [registrationId]
  );

  const row = existing.rows[0];
  const parsed = row ? verifyQrPayload(row.qr_data) : null;
  const valid = !!parsed
    && parsed.type === 'R'
    && parsed.id === registrationId
    && parsed.eventId === eventId
    && parsed.userId === userId;

  if (valid) return row.qr_data;

  await client.query(
    `UPDATE ticket_qr_codes SET is_active = FALSE WHERE registration_id = $1 AND is_active = TRUE`,
    [registrationId]
  );

  const payload = generateQrPayload('R', registrationId, eventId, userId);
  await client.query(
    `INSERT INTO ticket_qr_codes (registration_id, qr_data, is_active) VALUES ($1, $2, TRUE)`,
    [registrationId, payload]
  );

  return payload;
}

async function performCheckIn(client, { eventId, scannerUserId, qrPayload }) {
  const parsed = verifyQrPayload(qrPayload);
  if (!parsed) {
    throw new Error('INVALID_QR');
  }
  if (parsed.eventId !== eventId) {
    throw new Error('EVENT_MISMATCH');
  }

  const eventRes = await client.query(
    `SELECT e.id, e.society_id, e.is_paid, e.is_cancelled, e.status, e.event_end, s.status AS society_status
     FROM events e
     JOIN societies s ON s.id = e.society_id
     WHERE e.id = $1`,
    [eventId]
  );
  if (eventRes.rows.length === 0) throw new Error('EVENT_NOT_FOUND');

  const event = eventRes.rows[0];
  if (event.society_status !== 'APPROVED' || event.is_cancelled || event.status === 'CANCELLED') {
    throw new Error('EVENT_INVALID');
  }

  const priv = await client.query(
    `SELECT fn_has_privilege($1, $2, 'SCAN_QR') AS allowed`,
    [scannerUserId, event.society_id]
  );
  if (!priv.rows[0].allowed) throw new Error('NO_SCAN_PRIVILEGE');

  const existingAttendance = await client.query(
    `SELECT id FROM event_attendance WHERE event_id = $1 AND user_id = $2`,
    [eventId, parsed.userId]
  );
  if (existingAttendance.rows.length > 0) throw new Error('DUPLICATE_CHECKIN');

  if (parsed.type === 'T') {
    const ticketRes = await client.query(
      `SELECT id, status, checked_in_at
       FROM tickets
       WHERE id = $1 AND event_id = $2 AND user_id = $3`,
      [parsed.id, eventId, parsed.userId]
    );
    if (ticketRes.rows.length === 0) throw new Error('TICKET_NOT_FOUND');
    if (ticketRes.rows[0].status !== 'APPROVED') throw new Error('TICKET_NOT_APPROVED');
    if (ticketRes.rows[0].checked_in_at) throw new Error('DUPLICATE_CHECKIN');

    await client.query(
      `UPDATE tickets SET checked_in_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [parsed.id]
    );

    const qrUpdated = await client.query(
      `UPDATE ticket_qr_codes
       SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1
       WHERE ticket_id = $2 AND is_active = TRUE AND is_scanned = FALSE
       RETURNING id`,
      [scannerUserId, parsed.id]
    );

    await client.query(
      `INSERT INTO event_attendance (event_id, user_id, ticket_id, qr_code_id, checked_in_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, parsed.userId, parsed.id, qrUpdated.rows[0]?.id || null, scannerUserId]
    );
    return;
  }

  const regRes = await client.query(
    `SELECT id, cancelled_at
     FROM event_registrations
     WHERE id = $1 AND event_id = $2 AND user_id = $3`,
    [parsed.id, eventId, parsed.userId]
  );
  if (regRes.rows.length === 0) throw new Error('REG_NOT_FOUND');
  if (regRes.rows[0].cancelled_at) throw new Error('REG_CANCELLED');

  const qrUpdated = await client.query(
    `UPDATE ticket_qr_codes
     SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1
     WHERE registration_id = $2 AND is_active = TRUE AND is_scanned = FALSE
     RETURNING id`,
    [scannerUserId, parsed.id]
  );

  await client.query(
    `INSERT INTO event_attendance (event_id, user_id, registration_id, qr_code_id, checked_in_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventId, parsed.userId, parsed.id, qrUpdated.rows[0]?.id || null, scannerUserId]
  );
}

(async () => {
  const client = await pool.connect();
  const prefix = `QRFLOW-${Date.now()}`;
  const tests = [];

  function record(name, pass, detail = '') {
    tests.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`);
  }

  try {
    await client.query('BEGIN');

    const ids = {
      societyId: crypto.randomUUID(),
      roleScannerId: crypto.randomUUID(),
      roleMemberId: crypto.randomUUID(),
      scannerUserId: crypto.randomUUID(),
      paidUserId: crypto.randomUUID(),
      freeUserId: crypto.randomUUID(),
      transferredToUserId: crypto.randomUUID(),
      paidEventId: crypto.randomUUID(),
      freeEventId: crypto.randomUUID(),
      paidTicketId: crypto.randomUUID(),
      freeRegistrationId: crypto.randomUUID(),
    };

    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, user_type, status)
       VALUES
       ($1, $2, 'x', 'QR Scanner', 'STUDENT', 'ACTIVE'),
       ($3, $4, 'x', 'Paid User', 'STUDENT', 'ACTIVE'),
       ($5, $6, 'x', 'Free User', 'STUDENT', 'ACTIVE'),
       ($7, $8, 'x', 'Transfer Receiver', 'STUDENT', 'ACTIVE')`,
      [
        ids.scannerUserId, `${prefix}-scanner@test.edu.pk`,
        ids.paidUserId, `${prefix}-paid@test.edu.pk`,
        ids.freeUserId, `${prefix}-free@test.edu.pk`,
        ids.transferredToUserId, `${prefix}-to@test.edu.pk`,
      ]
    );

    await client.query(
      `INSERT INTO societies (id, name, description, status, created_by)
       VALUES ($1, $2, 'QR workflow test', 'APPROVED', $3)`,
      [ids.societyId, `${prefix}-Society`, ids.scannerUserId]
    );

    await client.query(
      `INSERT INTO roles (id, society_id, name, hierarchy_level)
       VALUES
       ($1, $3, 'Scanner', 5),
       ($2, $3, 'Member', 1)`,
      [ids.roleScannerId, ids.roleMemberId, ids.societyId]
    );

    await client.query(
      `INSERT INTO role_privileges (role_id, privilege_id)
       SELECT $1, id FROM privileges WHERE name = 'SCAN_QR'`,
      [ids.roleScannerId]
    );

    await client.query(
      `INSERT INTO society_memberships (society_id, user_id, role_id, is_active)
       VALUES
       ($1, $2, $3, TRUE),
       ($1, $4, $5, TRUE),
       ($1, $6, $5, TRUE),
       ($1, $7, $5, TRUE)`,
      [
        ids.societyId,
        ids.scannerUserId, ids.roleScannerId,
        ids.paidUserId, ids.roleMemberId,
        ids.freeUserId,
        ids.transferredToUserId,
      ]
    );

    await client.query(
      `INSERT INTO events
       (id, title, society_id, is_paid, ticket_price, event_start, event_end, registration_end, status, visibility, created_by)
       VALUES
       ($1, $3, $6, TRUE, 500, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', NOW() + INTERVAL '12 hour', 'UPCOMING', 'PUBLIC', $2),
       ($4, $5, $6, FALSE, 0, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 day', NOW() + INTERVAL '12 hour', 'UPCOMING', 'PUBLIC', $2)`,
      [
        ids.paidEventId, ids.scannerUserId, `${prefix}-Paid Event`,
        ids.freeEventId, `${prefix}-Free Event`,
        ids.societyId,
      ]
    );

    await client.query(
      `INSERT INTO tickets (id, event_id, user_id, status, payment_reference, approved_at, approved_by)
       VALUES ($1, $2, $3, 'APPROVED', uuid_generate_v4(), NOW(), $4)`,
      [ids.paidTicketId, ids.paidEventId, ids.paidUserId, ids.scannerUserId]
    );

    await client.query(
      `INSERT INTO event_registrations (id, event_id, user_id)
       VALUES ($1, $2, $3)`,
      [ids.freeRegistrationId, ids.freeEventId, ids.freeUserId]
    );

    // 1) paid approved -> QR exists/retrieves
    const paidQr = await ensurePaidQr(client, ids.paidTicketId, ids.paidEventId, ids.paidUserId);
    record(
      'paid approved ticket returns valid QR',
      !!verifyQrPayload(paidQr)
    );

    // 2) free registration -> QR generation/retrieval
    const freeQr = await ensureRegistrationQr(client, ids.freeRegistrationId, ids.freeEventId, ids.freeUserId);
    record(
      'free registration QR generated/retrieved',
      !!verifyQrPayload(freeQr)
    );

    // 3) free registration QR scans successfully
    try {
      await performCheckIn(client, {
        eventId: ids.freeEventId,
        scannerUserId: ids.scannerUserId,
        qrPayload: freeQr,
      });
      record('free registration QR check-in succeeds', true);
    } catch (e) {
      record('free registration QR check-in succeeds', false, e.message);
    }

    // 4) tampered QR rejected
    const tampered = `${freeQr.slice(0, -1)}${freeQr.slice(-1) === 'a' ? 'b' : 'a'}`;
    try {
      await performCheckIn(client, {
        eventId: ids.freeEventId,
        scannerUserId: ids.scannerUserId,
        qrPayload: tampered,
      });
      record('tampered QR rejected', false, 'unexpected success');
    } catch (e) {
      record('tampered QR rejected', e.message === 'INVALID_QR', e.message);
    }

    // 5) transferred ticket invalid QR healed to valid signed QR and scans
    await client.query(
      `UPDATE tickets SET user_id = $1, checked_in_at = NULL, updated_at = NOW() WHERE id = $2`,
      [ids.transferredToUserId, ids.paidTicketId]
    );
    await client.query(`UPDATE ticket_qr_codes SET is_active = FALSE WHERE ticket_id = $1`, [ids.paidTicketId]);
    await client.query(
      `INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
       VALUES ($1, encode(gen_random_bytes(32), 'hex'), TRUE)`,
      [ids.paidTicketId]
    );

    const transferredQr = await ensurePaidQr(
      client,
      ids.paidTicketId,
      ids.paidEventId,
      ids.transferredToUserId
    );

    const parsedTransferred = verifyQrPayload(transferredQr);
    let transferScanOk = false;
    try {
      await performCheckIn(client, {
        eventId: ids.paidEventId,
        scannerUserId: ids.scannerUserId,
        qrPayload: transferredQr,
      });
      transferScanOk = true;
    } catch (e) {
      transferScanOk = false;
    }

    record(
      'transferred ticket gets valid signed QR and scans',
      !!parsedTransferred
        && parsedTransferred.userId === ids.transferredToUserId
        && transferScanOk
    );

    // 6) duplicate scan rejected
    try {
      await performCheckIn(client, {
        eventId: ids.paidEventId,
        scannerUserId: ids.scannerUserId,
        qrPayload: transferredQr,
      });
      record('duplicate scan rejected', false, 'unexpected success');
    } catch (e) {
      record('duplicate scan rejected', e.message === 'DUPLICATE_CHECKIN', e.message);
    }

    const passed = tests.filter((t) => t.pass).length;
    const total = tests.length;
    console.log(`\nQR workflow tests: ${passed}/${total} passed`);

    if (passed !== total) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('QR workflow test runner failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    client.release();
    await pool.end();
  }
})();
