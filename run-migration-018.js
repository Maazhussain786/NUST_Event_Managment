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
    const migrationPath = path.join(__dirname, 'migrations', '018-society-multi-wallets.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration 018-society-multi-wallets.sql...');
    await client.query(sql);

    const [walletTable, ticketColumn] = await Promise.all([
      client.query(
        `SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'society_payment_wallets'`,
      ),
      client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'tickets'
           AND column_name = 'selected_wallet_id'`,
      ),
    ]);

    console.log('Migration 018 applied successfully.');
    console.log(`- Wallet table ready: ${walletTable.rowCount > 0 ? 'yes' : 'no'}`);
    console.log(`- tickets.selected_wallet_id ready: ${ticketColumn.rowCount > 0 ? 'yes' : 'no'}`);
  } catch (error) {
    console.error('Migration 018 failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
