/**
 * Audit current database state before Phase 1 migration
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: 5432,
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function audit() {
  const client = await pool.connect();

  // 1. society_memberships columns
  let r = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name='society_memberships' 
    ORDER BY ordinal_position
  `);
  console.log('=== society_memberships columns ===');
  r.rows.forEach(x => console.log(`  ${x.column_name} (${x.data_type}) nullable=${x.is_nullable}`));

  // 2. Indexes on society_memberships
  r = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='society_memberships'`);
  console.log('\n=== society_memberships indexes ===');
  r.rows.forEach(x => console.log(`  ${x.indexname}\n    ${x.indexdef}`));

  // 3. Constraints
  r = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as def 
    FROM pg_constraint 
    WHERE conrelid='society_memberships'::regclass
  `);
  console.log('\n=== society_memberships constraints ===');
  r.rows.forEach(x => console.log(`  ${x.conname} [${x.contype}]: ${x.def}`));

  // 4. fn_has_privilege definition
  r = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='fn_has_privilege'`);
  console.log('\n=== fn_has_privilege ===');
  if (r.rows[0]) console.log(r.rows[0].pg_get_functiondef);
  else console.log('  NOT FOUND');

  // 5. fn_can_manage definition
  r = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='fn_can_manage'`);
  console.log('\n=== fn_can_manage ===');
  if (r.rows[0]) console.log(r.rows[0].pg_get_functiondef);
  else console.log('  NOT FOUND');

  // 6. Distinct roles
  r = await client.query(`SELECT DISTINCT name, hierarchy_level, is_system_role FROM roles ORDER BY hierarchy_level DESC`);
  console.log('\n=== distinct roles ===');
  r.rows.forEach(x => console.log(`  ${x.name} level=${x.hierarchy_level} system=${x.is_system_role}`));

  // 7. Active Presidents per society
  r = await client.query(`
    SELECT sm.society_id, s.name as soc_name, COUNT(*) as cnt 
    FROM society_memberships sm 
    JOIN roles r ON r.id=sm.role_id 
    JOIN societies s ON s.id=sm.society_id
    WHERE r.name='President' AND sm.is_active=TRUE 
    GROUP BY sm.society_id, s.name
  `);
  console.log('\n=== active Presidents per society ===');
  r.rows.forEach(x => console.log(`  ${x.soc_name}: ${x.cnt} president(s)`));

  // 8. Societies by status
  r = await client.query(`SELECT status, COUNT(*) FROM societies GROUP BY status`);
  console.log('\n=== societies by status ===');
  r.rows.forEach(x => console.log(`  ${x.status}: ${x.count}`));

  // 9. Check if suspended columns already exist
  r = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='society_memberships' AND column_name IN ('suspended_at','suspended_by','suspension_reason')
  `);
  console.log('\n=== suspension columns exist? ===');
  if (r.rows.length === 0) console.log('  NONE (need to add)');
  else r.rows.forEach(x => console.log(`  ${x.column_name} exists`));

  // 10. Check for one-president index
  r = await client.query(`
    SELECT indexname FROM pg_indexes 
    WHERE tablename='society_memberships' AND indexname LIKE '%president%'
  `);
  console.log('\n=== president constraint index? ===');
  if (r.rows.length === 0) console.log('  NONE (need to add)');
  else r.rows.forEach(x => console.log(`  ${x.indexname} exists`));

  client.release();
  await pool.end();
  console.log('\n✅ Audit complete');
}

audit().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
