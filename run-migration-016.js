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
      }
);

async function run() {
  const client = await pool.connect();
  try {
    const migrationPath = path.join(__dirname, 'migrations', '016-users-email-normalization.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration 016-users-email-normalization.sql...');
    await client.query(sql);

    const [triggerCheck, indexCheck] = await Promise.all([
      client.query(
        `SELECT tgname
         FROM pg_trigger
         WHERE tgrelid = 'users'::regclass
           AND tgname = 'trg_normalize_users_email'`
      ),
      client.query(
        `SELECT indexname
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'users'
           AND indexname = 'idx_users_email_lower_unique'`
      ),
    ]);

    console.log('Migration 016 applied successfully.');
    console.log(`- Trigger present: ${triggerCheck.rowCount > 0 ? 'yes' : 'no'}`);
    console.log(`- CI email unique index present: ${indexCheck.rowCount > 0 ? 'yes' : 'no'}`);
  } catch (error) {
    console.error('Migration 016 failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
