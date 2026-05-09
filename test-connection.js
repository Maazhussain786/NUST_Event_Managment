/*
 * Quick database connection check for local or Azure Postgres.
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const requiredTables = [
  'users',
  'societies',
  'events',
  'roles',
  'society_memberships',
  'tickets',
  'audit_logs',
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Testing PostgreSQL connection...');
    await client.query('SELECT 1');
    console.log('✅ Connected');

    const tableResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name`,
      [requiredTables],
    );

    const existing = new Set(tableResult.rows.map((r) => r.table_name));
    const missing = requiredTables.filter((t) => !existing.has(t));

    if (missing.length > 0) {
      console.log('❌ Missing tables:', missing.join(', '));
    } else {
      console.log('✅ All critical tables exist');
    }

    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM societies) AS societies,
         (SELECT COUNT(*) FROM events) AS events`,
    );

    console.log('Sample counts:', counts.rows[0]);

    if (missing.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
