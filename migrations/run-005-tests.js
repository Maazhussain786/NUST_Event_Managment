const { Pool } = require('pg');
const fs = require('fs');
const crypto = require('crypto');

const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  port: 5432,
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  ssl: { rejectUnauthorized: false }
});

// ── QR HMAC utility (mirrors src/lib/qr.ts) ──────────────────────────
const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'test-secret-for-phase5';

function generateQrPayload(type, id, eventId, userId) {
  const data = `${type}:${id}:${eventId}:${userId}`;
  const sig = crypto.createHmac('sha256', QR_SECRET).update(data).digest('hex');
  return `${data}:${sig}`;
}

function verifyQrPayload(payload) {
  const parts = payload.split(':');
  if (parts.length !== 5) return null;
  const [type, id, eventId, userId, signature] = parts;
  if (type !== 'T' && type !== 'R') return null;
  const data = `${type}:${id}:${eventId}:${userId}`;
  const expected = crypto.createHmac('sha256', QR_SECRET).update(data).digest('hex');
  if (expected.length !== signature.length) return null;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (!crypto.timingSafeEqual(a, b)) return null;
  return { type, id, eventId, userId };
}

(async () => {
  const client = await pool.connect();
  const notices = [];
  client.on('notice', n => {
    notices.push(n.message);
    console.log(n.message);
  });

  try {
    // ── Part A: Run SQL tests ─────────────────────────────────────
    console.log('\n=== PART A: SQL Database Tests ===\n');
    const sql = fs.readFileSync('migrations/005-phase5-tests.sql', 'utf8');
    await client.query(sql);

    // ── Part B: QR HMAC tests ─────────────────────────────────────
    console.log('\n=== PART B: QR HMAC Verification Tests ===\n');

    let qrPass = 0;
    let qrTotal = 0;

    // Test B1: Valid QR generation and verification
    qrTotal++;
    const eventId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const ticketId = '11111111-2222-3333-4444-555555555555';
    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const payload = generateQrPayload('T', ticketId, eventId, userId);
    const verified = verifyQrPayload(payload);
    if (verified && verified.type === 'T' && verified.id === ticketId && verified.eventId === eventId && verified.userId === userId) {
      qrPass++;
      console.log('TEST B1 PASSED: Valid QR payload generates and verifies correctly');
    } else {
      console.log('TEST B1 FAILED: QR verification returned', verified);
    }

    // Test B2: Tampered payload — change userId
    qrTotal++;
    const tampered = payload.replace(userId, 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee');
    const tamperedResult = verifyQrPayload(tampered);
    if (tamperedResult === null) {
      qrPass++;
      console.log('TEST B2 PASSED: Tampered QR payload rejected');
    } else {
      console.log('TEST B2 FAILED: Tampered QR was accepted');
    }

    // Test B3: Tampered payload — change type
    qrTotal++;
    const typeSwap = 'R' + payload.substring(1);
    const typeResult = verifyQrPayload(typeSwap);
    if (typeResult === null) {
      qrPass++;
      console.log('TEST B3 PASSED: Type-swapped QR payload rejected');
    } else {
      console.log('TEST B3 FAILED: Type-swapped QR was accepted');
    }

    // Test B4: Malformed payload — missing parts
    qrTotal++;
    const malformed = 'T:some-id:missing';
    const malformedResult = verifyQrPayload(malformed);
    if (malformedResult === null) {
      qrPass++;
      console.log('TEST B4 PASSED: Malformed QR payload rejected');
    } else {
      console.log('TEST B4 FAILED: Malformed QR was accepted');
    }

    // Test B5: Invalid type
    qrTotal++;
    const invalidType = generateQrPayload('X', ticketId, eventId, userId);
    // Manually construct with invalid type
    const badPayload = invalidType.replace(/^T/, 'X');
    const badResult = verifyQrPayload('X:' + ticketId + ':' + eventId + ':' + userId + ':abc123');
    if (badResult === null) {
      qrPass++;
      console.log('TEST B5 PASSED: Invalid QR type rejected');
    } else {
      console.log('TEST B5 FAILED: Invalid type was accepted');
    }

    // Test B6: Registration type QR works
    qrTotal++;
    const regPayload = generateQrPayload('R', ticketId, eventId, userId);
    const regVerified = verifyQrPayload(regPayload);
    if (regVerified && regVerified.type === 'R') {
      qrPass++;
      console.log('TEST B6 PASSED: Registration-type QR generates and verifies');
    } else {
      console.log('TEST B6 FAILED: Registration QR verification failed');
    }

    console.log(`\n========================================`);
    console.log(`QR HMAC Tests: ${qrPass}/${qrTotal} passed`);
    console.log(`========================================`);

    // ── Summary ───────────────────────────────────────────────────
    const sqlSummary = notices.find(n => n.includes('Phase 5 Tests:'));
    const sqlMatch = sqlSummary ? sqlSummary.match(/(\d+)\/(\d+)/) : null;
    const sqlPassed = sqlMatch ? parseInt(sqlMatch[1]) : 0;
    const sqlTotal = sqlMatch ? parseInt(sqlMatch[2]) : 0;

    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`║  PHASE 5 OVERALL: ${sqlPassed + qrPass}/${sqlTotal + qrTotal} tests passed  ║`);
    console.log(`╚══════════════════════════════════════╝`);

    if (sqlPassed + qrPass === sqlTotal + qrTotal) {
      console.log('ALL TESTS PASSED');
      process.exit(0);
    } else {
      console.log('SOME TESTS FAILED');
      process.exit(1);
    }

  } catch (e) {
    console.error('TEST ERROR:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
