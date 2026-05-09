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

async function main() {
  // Check nust_schools columns
  const ns = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='nust_schools' ORDER BY ordinal_position"
  );
  console.log('nust_schools columns:', ns.rows.map(x => x.column_name).join(', '));

  // Check events columns
  const ev = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='events' ORDER BY ordinal_position"
  );
  console.log('events columns:', ev.rows.map(x => x.column_name).join(', '));

  // Sample nust_schools data
  const sample = await pool.query('SELECT * FROM nust_schools LIMIT 2');
  console.log('\nnust_schools sample:', JSON.stringify(sample.rows, null, 2));

  // Check what tables exist
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  console.log('\nAll tables:', tables.rows.map(x => x.table_name).join(', '));

  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
