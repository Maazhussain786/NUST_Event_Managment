const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const isAzure = process.env.ACTIVE_DB !== 'local';
const pool = new Pool(
  isAzure
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
      },
);

async function run() {
  const client = await pool.connect();
  try {
    const migrationPath = path.join(__dirname, 'migrations', '017-event-broadcasts.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration 017-event-broadcasts.sql...');
    await client.query(sql);

    const [tables, enumValues] = await Promise.all([
      client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('event_update_broadcasts', 'event_update_broadcast_recipients')
         ORDER BY table_name`,
      ),
      client.query(
        `SELECT e.enumlabel
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'audit_action_enum'
           AND e.enumlabel IN ('EVENT_BROADCAST_CREATED', 'EVENT_BROADCAST_SENT', 'EVENT_BROADCAST_CANCELLED')
         ORDER BY e.enumlabel`,
      ),
    ]);

    console.log('Migration 017 applied successfully.');
    console.log(`- Broadcast tables found: ${tables.rowCount}/2`);
    console.log(`- Broadcast audit enums found: ${enumValues.rowCount}/3`);
  } catch (error) {
    console.error('Migration 017 failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
