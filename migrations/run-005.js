const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  port: 5432,
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync('migrations/005-phase5-paid-qr.sql', 'utf8');
    client.on('notice', n => console.log('NOTICE:', n.message));
    await client.query(sql);
    console.log('Migration 005 applied successfully.');

    // Verify
    const r1 = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='tickets' AND column_name IN ('payment_reference','checked_in_at') ORDER BY column_name"
    );
    console.log('tickets new cols:', r1.rows.map(r => r.column_name));

    const r2 = await client.query(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='ticket_qr_codes' AND column_name IN ('ticket_id','registration_id') ORDER BY column_name"
    );
    console.log('ticket_qr_codes:', r2.rows);

    const r3 = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name='event_attendance'"
    );
    console.log('event_attendance exists:', r3.rows.length > 0);

    const r4 = await client.query(
      "SELECT tgname FROM pg_trigger WHERE tgname='trg_ticket_participants_count'"
    );
    console.log('trigger exists:', r4.rows.length > 0);
  } catch (e) {
    console.error('MIGRATION ERROR:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
