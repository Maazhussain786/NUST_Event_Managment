const { Pool } = require('pg');
const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  port: 5432,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  // 1. Add status column to events if it doesn't exist
  const colCheck = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name='status'"
  );
  
  if (colCheck.rows.length === 0) {
    console.log('Adding status column to events...');
    await pool.query("ALTER TABLE events ADD COLUMN status VARCHAR(20) DEFAULT 'APPROVED'");
    // Set existing events to APPROVED, cancelled ones to CANCELLED
    await pool.query("UPDATE events SET status = 'CANCELLED' WHERE is_cancelled = TRUE");
    await pool.query("UPDATE events SET status = 'APPROVED' WHERE is_cancelled = FALSE OR is_cancelled IS NULL");
    console.log('Done: events.status column added');
  } else {
    console.log('events.status column already exists');
  }

  // Verify
  const verify = await pool.query("SELECT status, COUNT(*) as cnt FROM events GROUP BY status");
  console.log('Events by status:', verify.rows);

  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
