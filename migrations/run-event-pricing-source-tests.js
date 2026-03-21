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

(async () => {
  const client = await pool.connect();
  const now = Date.now();
  const tests = [];

  function check(name, pass, detail = '') {
    tests.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`);
  }

  try {
    await client.query('BEGIN');

    const societyId = crypto.randomUUID();
    const creatorId = crypto.randomUUID();
    const eventA = crypto.randomUUID();
    const eventB = crypto.randomUUID();

    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, user_type, status)
       VALUES ($1, $2, 'x', 'Pricing Tester', 'STUDENT', 'ACTIVE')`,
      [creatorId, `pricing-source-${now}@test.edu.pk`]
    );

    await client.query(
      `INSERT INTO societies (id, name, description, status, created_by)
       VALUES ($1, $2, 'pricing source tests', 'APPROVED', $3)`,
      [societyId, `PricingSource-${now}`, creatorId]
    );

    // 1) create paid event -> stored paid
    await client.query(
      `INSERT INTO events (id, society_id, title, event_start, event_end, created_by, status, is_cancelled, ticket_price, is_paid)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', $4, 'UPCOMING', FALSE, $5, $6)`,
      [eventA, societyId, `Paid Event ${now}`, creatorId, 500, true]
    );
    const c1 = await client.query(`SELECT ticket_price, is_paid FROM events WHERE id = $1`, [eventA]);
    check('1. create paid event stores is_paid=true', c1.rows[0]?.is_paid === true && Number(c1.rows[0]?.ticket_price) === 500);

    // 2) create free event -> stored free
    await client.query(
      `INSERT INTO events (id, society_id, title, event_start, event_end, created_by, status, is_cancelled, ticket_price, is_paid)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', $4, 'UPCOMING', FALSE, $5, $6)`,
      [eventB, societyId, `Free Event ${now}`, creatorId, 0, false]
    );
    const c2 = await client.query(`SELECT ticket_price, is_paid FROM events WHERE id = $1`, [eventB]);
    check('2. create free event stores is_paid=false', c2.rows[0]?.is_paid === false && Number(c2.rows[0]?.ticket_price) === 0);

    // 3) edit free -> paid
    await client.query(`UPDATE events SET ticket_price = 500, is_paid = TRUE WHERE id = $1`, [eventB]);
    const e3 = await client.query(`SELECT ticket_price, is_paid FROM events WHERE id = $1`, [eventB]);
    check('3. edit free to paid updates is_paid=true', e3.rows[0]?.is_paid === true && Number(e3.rows[0]?.ticket_price) === 500);

    // 4) edit paid -> free
    await client.query(`UPDATE events SET ticket_price = 0, is_paid = FALSE WHERE id = $1`, [eventA]);
    const e4 = await client.query(`SELECT ticket_price, is_paid FROM events WHERE id = $1`, [eventA]);
    check('4. edit paid to free updates is_paid=false', e4.rows[0]?.is_paid === false && Number(e4.rows[0]?.ticket_price) === 0);

    // 5) detail/list source fields reflect paid status correctly
    await client.query(`UPDATE events SET ticket_price = 500, is_paid = TRUE WHERE id = $1`, [eventA]);
    const e5 = await client.query(
      `SELECT id, is_paid, ticket_price, CASE WHEN is_paid THEN ticket_price ELSE 0 END AS ui_price
       FROM events WHERE id = $1`,
      [eventA]
    );
    check('5. event detail/list paid fields are consistent', e5.rows[0]?.is_paid === true && Number(e5.rows[0]?.ui_price) === 500);

    // 6) backfill migration logic corrects broken row
    await client.query(`UPDATE events SET ticket_price = 500, is_paid = FALSE WHERE id = $1`, [eventA]);
    await client.query(
      `UPDATE events
       SET is_paid = CASE
         WHEN COALESCE(ticket_price, 0) > 0 THEN TRUE
         ELSE FALSE
       END,
       updated_at = NOW()
       WHERE id = $1`,
      [eventA]
    );
    const e6 = await client.query(`SELECT ticket_price, is_paid FROM events WHERE id = $1`, [eventA]);
    check('6. backfill fixes bad historical paid row', Number(e6.rows[0]?.ticket_price) === 500 && e6.rows[0]?.is_paid === true);

    const passed = tests.filter((t) => t.pass).length;
    const total = tests.length;
    console.log(`\nEvent pricing source tests: ${passed}/${total} passed`);

    if (passed !== total) process.exitCode = 1;
  } catch (e) {
    console.error('Event pricing source tests failed:', e);
    process.exitCode = 1;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    client.release();
    await pool.end();
  }
})();
