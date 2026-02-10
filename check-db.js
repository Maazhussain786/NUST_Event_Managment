const { Pool } = require('pg');
const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  port: 5432,
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
  );
  console.log(`\n=== ${tables.rows.length} Tables in event_management ===`);
  tables.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.table_name}`));

  const views = await pool.query(
    "SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY table_name"
  );
  console.log(`\n=== ${views.rows.length} Views ===`);
  views.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.table_name}`));

  const enums = await pool.query(
    "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid WHERE n.nspname='public' AND t.typtype='e' ORDER BY t.typname"
  );
  console.log(`\n=== ${enums.rows.length} Enums ===`);
  enums.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.typname}`));

  const funcs = await pool.query(
    "SELECT proname FROM pg_proc WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public') ORDER BY proname"
  );
  console.log(`\n=== ${funcs.rows.length} Functions ===`);
  funcs.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.proname}`));

  await pool.end();
}

check().catch(e => { console.error(e.message); pool.end(); });
