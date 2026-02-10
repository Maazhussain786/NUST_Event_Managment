const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  port: 5432,
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    console.log('Connecting to Azure PostgreSQL...');
    const client = await pool.connect();
    console.log('Connected!\n');

    // Drop all existing objects for a clean slate
    console.log('Dropping existing objects...');
    
    // Drop views
    const views_drop = await client.query(`SELECT table_name FROM information_schema.views WHERE table_schema='public'`);
    for (const v of views_drop.rows) {
      await client.query(`DROP VIEW IF EXISTS "${v.table_name}" CASCADE`);
    }
    
    // Drop tables
    const tables_drop = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
    for (const t of tables_drop.rows) {
      await client.query(`DROP TABLE IF EXISTS "${t.table_name}" CASCADE`);
    }
    
    // Drop all custom types/enums
    const types_drop = await client.query(`SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid WHERE n.nspname='public' AND t.typtype='e'`);
    for (const e of types_drop.rows) {
      await client.query(`DROP TYPE IF EXISTS "${e.typname}" CASCADE`);
    }
    
    // Drop functions
    const funcs_drop = await client.query(`SELECT proname, pg_get_function_identity_arguments(oid) as args FROM pg_proc WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')`);
    for (const f of funcs_drop.rows) {
      await client.query(`DROP FUNCTION IF EXISTS "${f.proname}"(${f.args}) CASCADE`);
    }
    
    console.log('Clean slate ready.\n');

    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Executing schema.sql...');
    await client.query(schemaSQL);
    console.log('\n--- Schema executed successfully! ---\n');

    // List all created tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log(`Created ${tables.rows.length} tables:`);
    tables.rows.forEach(r => console.log(`  - ${r.table_name}`));

    // List views
    const views = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log(`\nCreated ${views.rows.length} views:`);
    views.rows.forEach(r => console.log(`  - ${r.table_name}`));

    client.release();
    await pool.end();
    console.log('\nDone! Refresh the Azure Portal Databases page to see your tables.');
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

run();
