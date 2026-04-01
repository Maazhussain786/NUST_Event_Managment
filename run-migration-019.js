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
    const migrationPath = path.join(__dirname, 'migrations', '019-event-cohost-core.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration 019-event-cohost-core.sql...');
    await client.query(sql);

    const [cohostsTable, requestTypeCol] = await Promise.all([
      client.query(
        `SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'event_cohosts'`,
      ),
      client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'platform_cohost_requests'
           AND column_name = 'request_type'`,
      ),
    ]);

    console.log('Migration 019 applied successfully.');
    console.log(`- event_cohosts ready: ${cohostsTable.rowCount > 0 ? 'yes' : 'no'}`);
    console.log(`- request_type column ready: ${requestTypeCol.rowCount > 0 ? 'yes' : 'no'}`);
  } catch (error) {
    console.error('Migration 019 failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
