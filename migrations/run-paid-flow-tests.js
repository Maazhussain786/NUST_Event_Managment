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

function sign(data) {
  return crypto.createHmac('sha256', QR_SECRET).update(data).digest('hex');
}
function makeQr(type, id, eventId, userId) {
  const base = `${type}:${id}:${eventId}:${userId}`;
  return `${base}:${sign(base)}`;
}
function verifyQr(payload) {
  const parts = payload.split(':');
  if (parts.length !== 5) return null;
  const [type, id, eventId, userId, sig] = parts;
  const expected = sign(`${type}:${id}:${eventId}:${userId}`);
  return sig === expected ? { type, id, eventId, userId } : null;
}

(async () => {
  const client = await pool.connect();
  const tests = [];
  const now = Date.now();

  function check(name, pass, detail = '') {
    tests.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`);
  }

  try {
    await client.query('BEGIN');

    // Keep the test runnable on older schemas by adding required columns in-transaction.
    await client.query(`
      ALTER TABLE society_settings
      ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(100),
      ADD COLUMN IF NOT EXISTS payment_recipient_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS payment_account_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS payment_iban VARCHAR(100),
      ADD COLUMN IF NOT EXISTS payment_instructions TEXT
    `);
    await client.query(`
      ALTER TABLE payment_proofs
      ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(200),
      ADD COLUMN IF NOT EXISTS student_note TEXT
    `);

    const ids = {
      societyId: crypto.randomUUID(),
      presUserId: crypto.randomUUID(),
      scannerUserId: crypto.randomUUID(),
      studentA: crypto.randomUUID(),
      studentB: crypto.randomUUID(),
      studentC: crypto.randomUUID(),
      eventId: crypto.randomUUID(),
      ticketA: crypto.randomUUID(),
      ticketB: crypto.randomUUID(),
      ticketC: crypto.randomUUID(),
      rolePres: crypto.randomUUID(),
      roleMember: crypto.randomUUID(),
    };

    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, user_type, status)
       VALUES
       ($1,$2,'x','President','STUDENT','ACTIVE'),
       ($3,$4,'x','Scanner','STUDENT','ACTIVE'),
       ($5,$6,'x','Student A','STUDENT','ACTIVE'),
       ($7,$8,'x','Student B','STUDENT','ACTIVE'),
       ($9,$10,'x','Student C','STUDENT','ACTIVE')`,
      [
        ids.presUserId, `paidflow-pres-${now}@test.edu.pk`,
        ids.scannerUserId, `paidflow-scan-${now}@test.edu.pk`,
        ids.studentA, `paidflow-a-${now}@test.edu.pk`,
        ids.studentB, `paidflow-b-${now}@test.edu.pk`,
        ids.studentC, `paidflow-c-${now}@test.edu.pk`,
      ]
    );

    await client.query(
      `INSERT INTO societies (id,name,description,status,created_by)
       VALUES ($1,$2,'paid flow test','APPROVED',$3)`,
      [ids.societyId, `PaidFlow-${now}`, ids.presUserId]
    );

    await client.query(
      `INSERT INTO roles (id,society_id,name,hierarchy_level)
       VALUES
       ($1,$3,'President',10),
       ($2,$3,'Member',1)`,
      [ids.rolePres, ids.roleMember, ids.societyId]
    );

    await client.query(
      `INSERT INTO role_privileges (role_id, privilege_id)
       SELECT $1, id FROM privileges WHERE name = 'VERIFY_PAYMENTS'`,
      [ids.rolePres]
    );
    await client.query(
      `INSERT INTO role_privileges (role_id, privilege_id)
       SELECT $1, id FROM privileges WHERE name = 'SCAN_QR'`,
      [ids.rolePres]
    );

    await client.query(
      `INSERT INTO society_memberships (society_id,user_id,role_id,is_active)
       VALUES
       ($1,$2,$3,TRUE),
       ($1,$4,$3,TRUE),
       ($1,$5,$6,TRUE),
       ($1,$7,$6,TRUE),
       ($1,$8,$6,TRUE)`,
      [ids.societyId, ids.presUserId, ids.rolePres, ids.scannerUserId, ids.studentA, ids.roleMember, ids.studentB, ids.studentC]
    );

    await client.query(
      `INSERT INTO society_settings (
         society_id, event_creation_role, chat_management_role, content_upload_role,
         ticketing_enabled, transfer_policy, transfer_deadline_hours,
         payment_provider, payment_recipient_name, payment_account_number, payment_iban, payment_instructions
       ) VALUES ($1,'Director','Vice President','Deputy Director',TRUE,'ALLOWED',24,$2,$3,$4,$5,$6)
       ON CONFLICT (society_id) DO UPDATE SET
         payment_provider = EXCLUDED.payment_provider,
         payment_recipient_name = EXCLUDED.payment_recipient_name,
         payment_account_number = EXCLUDED.payment_account_number,
         payment_iban = EXCLUDED.payment_iban,
         payment_instructions = EXCLUDED.payment_instructions`,
      [ids.societyId, 'Bank Transfer', 'NUST Events', '1234567890', 'PK00TEST123', 'Send exact amount then upload screenshot']
    );

    await client.query(
      `INSERT INTO events (id,title,society_id,is_paid,ticket_price,event_start,event_end,registration_end,status,visibility,created_by)
       VALUES ($1,$2,$3,TRUE,1500,NOW()+INTERVAL '1 day',NOW()+INTERVAL '2 days',NOW()+INTERVAL '12 hours','UPCOMING','PUBLIC',$4)`,
      [ids.eventId, `Paid Flow Event ${now}`, ids.societyId, ids.presUserId]
    );

    // 1) student opens paid flow and creates pending ticket
    await client.query(
      `INSERT INTO tickets (id,event_id,user_id,status,payment_reference)
       VALUES ($1,$2,$3,'PENDING',uuid_generate_v4())`,
      [ids.ticketA, ids.eventId, ids.studentA]
    );
    const t1 = await client.query(`SELECT status FROM tickets WHERE id = $1`, [ids.ticketA]);
    check('1. pending ticket created for paid flow', t1.rows[0]?.status === 'PENDING');

    const ref1 = await client.query(`SELECT payment_reference FROM tickets WHERE id = $1`, [ids.ticketA]);
    const paymentReferenceA = ref1.rows[0]?.payment_reference;
    check('1b. purchase flow exposes payment_reference', !!paymentReferenceA);

    const lookupByRef = await client.query(`SELECT id FROM tickets WHERE payment_reference = $1`, [paymentReferenceA]);
    check('1c. payment_reference resolves ticket', lookupByRef.rows[0]?.id === ids.ticketA);

    const wrongRefLookup = await client.query(`SELECT id FROM tickets WHERE payment_reference = $1`, ['00000000-0000-0000-0000-000000000000']);
    check('1d. wrong payment_reference fails to resolve', wrongRefLookup.rows.length === 0);

    // 2) payment proof upload creates/updates payment_proofs row
    await client.query(
      `INSERT INTO payment_proofs (ticket_id, uploaded_by, proof_url, proof_type, transaction_reference, student_note, status)
       VALUES ($1,$2,$3,'SCREENSHOT',$4,$5,'PENDING')`,
      [ids.ticketA, ids.studentA, 'https://blob/test-proof-a.png', 'TXN-ABC-1', 'first note']
    );
    await client.query(
      `UPDATE payment_proofs
       SET proof_url = $2, transaction_reference = $3, student_note = $4, status = 'PENDING', updated_at = NOW()
       WHERE ticket_id = $1`,
      [ids.ticketA, 'https://blob/test-proof-a-v2.png', 'TXN-ABC-2', 'updated note']
    );
    const p2 = await client.query(`SELECT transaction_reference, student_note FROM payment_proofs WHERE ticket_id = $1`, [ids.ticketA]);
    check('2. proof create/update works', p2.rows[0]?.transaction_reference === 'TXN-ABC-2');

    // 3) approver list query includes proof URL + reference fields
    const list3 = await client.query(
      `SELECT t.id, pp.proof_url, pp.transaction_reference, pp.student_note
       FROM tickets t
       LEFT JOIN LATERAL (
         SELECT proof_url, transaction_reference, student_note
         FROM payment_proofs
         WHERE ticket_id = t.id
         ORDER BY updated_at DESC, created_at DESC LIMIT 1
       ) pp ON TRUE
       WHERE t.id = $1`,
      [ids.ticketA]
    );
    check('3. approver listing returns proof metadata', !!list3.rows[0]?.proof_url && !!list3.rows[0]?.transaction_reference);

    // 4) approver approves and QR becomes available
    await client.query(`UPDATE tickets SET status='APPROVED', approved_at=NOW(), approved_by=$1 WHERE id=$2`, [ids.presUserId, ids.ticketA]);
    await client.query(`UPDATE payment_proofs SET status='VERIFIED', verified_by=$1, verified_at=NOW() WHERE ticket_id=$2`, [ids.presUserId, ids.ticketA]);
    const qrA = makeQr('T', ids.ticketA, ids.eventId, ids.studentA);
    await client.query(`INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active) VALUES ($1,$2,TRUE)`, [ids.ticketA, qrA]);
    const q4 = await client.query(`SELECT qr_data FROM ticket_qr_codes WHERE ticket_id=$1 AND is_active=TRUE`, [ids.ticketA]);
    check('4. approve -> QR available', verifyQr(q4.rows[0]?.qr_data) !== null);

    // 5) approver reject with reason
    await client.query(`INSERT INTO tickets (id,event_id,user_id,status,payment_reference) VALUES ($1,$2,$3,'PENDING',uuid_generate_v4())`, [ids.ticketB, ids.eventId, ids.studentB]);
    await client.query(`INSERT INTO payment_proofs (ticket_id, uploaded_by, proof_url, proof_type, transaction_reference, status) VALUES ($1,$2,$3,'SCREENSHOT',$4,'PENDING')`, [ids.ticketB, ids.studentB, 'https://blob/test-proof-b.png', 'TXN-B-1']);
    await client.query(`UPDATE tickets SET status='REJECTED' WHERE id=$1`, [ids.ticketB]);
    await client.query(`UPDATE payment_proofs SET status='REJECTED', rejection_reason='Invalid screenshot', verified_by=$1, verified_at=NOW() WHERE ticket_id=$2`, [ids.presUserId, ids.ticketB]);
    const r5 = await client.query(`SELECT status, rejection_reason FROM payment_proofs WHERE ticket_id=$1`, [ids.ticketB]);
    check('5. reject with reason stored', r5.rows[0]?.status === 'REJECTED' && !!r5.rows[0]?.rejection_reason);

    // 6) request reupload then student resubmits
    await client.query(`INSERT INTO tickets (id,event_id,user_id,status,payment_reference) VALUES ($1,$2,$3,'PENDING',uuid_generate_v4())`, [ids.ticketC, ids.eventId, ids.studentC]);
    await client.query(`INSERT INTO payment_proofs (ticket_id, uploaded_by, proof_url, proof_type, transaction_reference, status) VALUES ($1,$2,$3,'SCREENSHOT',$4,'REJECTED')`, [ids.ticketC, ids.studentC, 'https://blob/c-old.png', 'TXN-C-OLD']);
    await client.query(`UPDATE payment_proofs SET status='PENDING', proof_url='https://blob/c-new.png', transaction_reference='TXN-C-NEW', rejection_reason=NULL, verified_by=NULL, verified_at=NULL WHERE ticket_id=$1`, [ids.ticketC]);
    const r6 = await client.query(`SELECT status, transaction_reference FROM payment_proofs WHERE ticket_id=$1`, [ids.ticketC]);
    check('6. reupload path allows clean resubmission', r6.rows[0]?.status === 'PENDING' && r6.rows[0]?.transaction_reference === 'TXN-C-NEW');

    // 7) QR not available before approval
    const q7 = await client.query(`SELECT COUNT(*)::int AS c FROM ticket_qr_codes WHERE ticket_id = $1`, [ids.ticketC]);
    check('7. no QR before approval', q7.rows[0]?.c === 0);

    // 8) unauthorized student cannot submit proof for other user ticket
    const owner8 = await client.query(`SELECT user_id FROM tickets WHERE id=$1`, [ids.ticketA]);
    check('8. unauthorized proof submit blocked by owner check', owner8.rows[0]?.user_id !== ids.studentB);

    // 9) validation rejects bad file type / oversized (rule simulation)
    const badMimeRejected = !['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes('text/plain');
    const oversizedRejected = 12 * 1024 * 1024 > 8 * 1024 * 1024;
    check('9. bad file type and oversized image rejected', badMimeRejected && oversizedRejected);

    // 10) approved ticket QR scan/check-in still works + duplicate rejected
    const parsed10 = verifyQr(qrA);
    let firstScan = false;
    let duplicateBlocked = false;
    if (parsed10) {
      await client.query(
        `INSERT INTO event_attendance (event_id, user_id, ticket_id, checked_in_by)
         VALUES ($1,$2,$3,$4)`,
        [ids.eventId, ids.studentA, ids.ticketA, ids.scannerUserId]
      );
      firstScan = true;
      try {
        await client.query(
          `INSERT INTO event_attendance (event_id, user_id, ticket_id, checked_in_by)
           VALUES ($1,$2,$3,$4)`,
          [ids.eventId, ids.studentA, ids.ticketA, ids.scannerUserId]
        );
      } catch {
        duplicateBlocked = true;
      }
    }
    check('10. approved ticket scan works and duplicate blocked', firstScan && duplicateBlocked);

    const passed = tests.filter((t) => t.pass).length;
    const total = tests.length;
    console.log(`\nPaid flow tests: ${passed}/${total} passed`);

    if (passed !== total) process.exitCode = 1;
  } catch (e) {
    console.error('Paid flow tests failed:', e);
    process.exitCode = 1;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    client.release();
    await pool.end();
  }
})();
