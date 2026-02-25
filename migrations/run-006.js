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
    const sql = fs.readFileSync('migrations/006-phase6-storage-quota.sql', 'utf8');
    client.on('notice', n => console.log('NOTICE:', n.message));
    await client.query(sql);
    console.log('Migration 006 applied successfully.');

    // Verify CHECK constraints
    const r1 = await client.query(
      "SELECT conname FROM pg_constraint WHERE conname IN ('chk_storage_used_non_negative', 'chk_storage_quota_positive') ORDER BY conname"
    );
    console.log('CHECK constraints:', r1.rows.map(r => r.conname));

    // Verify triggers
    const r2 = await client.query(
      "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%_storage' ORDER BY tgname"
    );
    console.log('Storage triggers:', r2.rows.map(r => r.tgname));

    // Verify audit actions
    const r3 = await client.query(
      "SELECT unnest(enum_range(NULL::audit_action_enum))::text AS val"
    );
    const storageActions = r3.rows
      .map(r => r.val)
      .filter(v => ['QUOTA_EXCEEDED', 'STORAGE_DECREMENT', 'STORAGE_LIMIT_UPDATED'].includes(v));
    console.log('Storage audit actions:', storageActions);

    // Verify view
    const r4 = await client.query(
      "SELECT table_name FROM information_schema.views WHERE table_name = 'v_society_storage_usage'"
    );
    console.log('v_society_storage_usage view exists:', r4.rows.length > 0);

    // Quick test of the view
    const r5 = await client.query('SELECT * FROM v_society_storage_usage LIMIT 3');
    console.log('View sample:', r5.rows);

  } catch (e) {
    console.error('MIGRATION ERROR:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
