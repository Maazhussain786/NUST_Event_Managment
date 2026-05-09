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

(async () => {
  try {
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='society_memberships' ORDER BY ordinal_position"
    );
    console.log('SM COLS:', cols.rows.map(r => r.column_name).join(', '));

    const socs = await pool.query(
      'SELECT id, name, status, created_by, president_name FROM societies ORDER BY created_at DESC LIMIT 15'
    );
    console.log('\nSOCIETIES:');
    socs.rows.forEach(r => console.log(r.status, '-', r.name, '- by:', r.created_by, '- pres:', r.president_name));

    const sc = await pool.query('SELECT COUNT(*) as cnt FROM nust_schools');
    console.log('\nSchools:', sc.rows[0].cnt);
  } catch (e) {
    console.error(e.message);
  }
  pool.end();
})();
