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
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='societies' ORDER BY ordinal_position"
  );
  console.log('SOCIETIES columns:', cols.rows.map(x => x.column_name).join(', '));

  const creator = await pool.query(
    "SELECT s.id, s.name, s.status, s.created_by, u.full_name FROM societies s LEFT JOIN users u ON s.created_by = u.id WHERE s.status = 'PENDING'"
  );
  console.log('\nPENDING societies with creator:');
  creator.rows.forEach(r => console.log(`  ${r.name} | status=${r.status} | created_by=${r.created_by} (${r.full_name})`));

  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
