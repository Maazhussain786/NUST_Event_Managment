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
  const client = await pool.connect();
  try {
    console.log('Connected to Azure PostgreSQL.\n');

    // Step 1: Drop custom functions only (skip extension functions)
    console.log('Cleaning up custom functions...');
    const funcs = await client.query(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
      WHERE n.nspname = 'public' AND d.objid IS NULL
    `);
    for (const f of funcs.rows) {
      await client.query(`DROP FUNCTION IF EXISTS "${f.proname}"(${f.args}) CASCADE`);
    }
    console.log(`Dropped ${funcs.rows.length} custom functions.\n`);

    // Step 2: Execute schema.sql
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Executing schema.sql...');
    await client.query(schemaSQL);
    console.log('Schema executed successfully!\n');

    // Step 3: Verify
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    );
    console.log(`Created ${tables.rows.length} tables:`);
    tables.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.table_name}`));

    const views = await client.query(
      "SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY table_name"
    );
    console.log(`\nCreated ${views.rows.length} views:`);
    views.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.table_name}`));

    console.log('\nDone! Your database is ready.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
