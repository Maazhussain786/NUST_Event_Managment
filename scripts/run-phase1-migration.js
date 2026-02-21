/**
 * Phase 1: Run structural safety migration + tests
 * 
 * Usage: node scripts/run-phase1-migration.js
 * 
 * Runs:
 *   1. migrations/001-phase1-structural-safety.sql (the migration)
 *   2. migrations/001-phase1-tests.sql (verification tests)
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: 5432,
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function runSQL(client, filePath, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Running: ${label}`);
  console.log(`${'='.repeat(60)}\n`);

  const sql = fs.readFileSync(filePath, 'utf8');
  
  try {
    const result = await client.query(sql);
    console.log(`✅ ${label} — executed successfully`);
    
    // Print any NOTICE messages (test results)
    if (client._lastNotices && client._lastNotices.length > 0) {
      client._lastNotices.forEach(n => console.log(n));
      client._lastNotices = [];
    }
    
    return true;
  } catch (error) {
    console.error(`❌ ${label} — FAILED`);
    console.error(`   Error: ${error.message}`);
    if (error.detail) console.error(`   Detail: ${error.detail}`);
    if (error.where) console.error(`   Where: ${error.where}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Phase 1: Structural Safety & Database Integrity\n');

  const client = await pool.connect();
  
  // Capture NOTICE messages (test output)
  const notices = [];
  client.on('notice', (msg) => {
    notices.push(msg.message);
    // Print immediately
    if (msg.message) console.log(`  📋 ${msg.message}`);
  });

  const migrationPath = path.join(__dirname, '..', 'migrations', '001-phase1-structural-safety.sql');
  const testPath = path.join(__dirname, '..', 'migrations', '001-phase1-tests.sql');

  // Step 1: Run migration
  const migrationOk = await runSQL(client, migrationPath, 'Phase 1 Migration');
  
  if (!migrationOk) {
    console.error('\n❌ Migration failed. Aborting tests.');
    client.release();
    await pool.end();
    process.exit(1);
  }

  // Step 2: Verify migration results
  console.log('\n--- Verifying migration results ---\n');

  // Check trigger exists
  const triggerCheck = await client.query(`
    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_one_president'
  `);
  console.log(`  Trigger trg_enforce_one_president: ${triggerCheck.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);

  // Check suspension columns
  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'society_memberships' 
      AND column_name IN ('suspended_at', 'suspended_by', 'suspension_reason')
    ORDER BY column_name
  `);
  const cols = colCheck.rows.map(r => r.column_name);
  console.log(`  Suspension columns: ${cols.length === 3 ? '✅' : '❌'} [${cols.join(', ')}]`);

  // Check constraint
  const constraintCheck = await client.query(`
    SELECT conname FROM pg_constraint 
    WHERE conname = 'chk_suspension_requires_inactive'
  `);
  console.log(`  Suspension CHECK constraint: ${constraintCheck.rows.length > 0 ? '✅ EXISTS' : '❌ MISSING'}`);

  // Check fn_has_privilege has society status check
  const fnCheck = await client.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'fn_has_privilege'
  `);
  const fnDef = fnCheck.rows[0]?.def || '';
  const hasStatusCheck = fnDef.includes('society_status') || fnDef.includes('v_society_status');
  const hasSuspendCheck = fnDef.includes('suspended_at');
  console.log(`  fn_has_privilege society status check: ${hasStatusCheck ? '✅' : '❌'}`);
  console.log(`  fn_has_privilege suspension check: ${hasSuspendCheck ? '✅' : '❌'}`);

  // Check fn_can_manage uses DESC (fixed hierarchy)
  const fnManageCheck = await client.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'fn_can_manage'
  `);
  const fnManageDef = fnManageCheck.rows[0]?.def || '';
  const hasDescOrder = fnManageDef.includes('hierarchy_level DESC');
  console.log(`  fn_can_manage hierarchy fix (DESC): ${hasDescOrder ? '✅' : '❌'}`);

  // Step 3: Run tests
  console.log('\n');
  const testOk = await runSQL(client, testPath, 'Phase 1 Tests');

  client.release();
  await pool.end();

  console.log('\n' + '='.repeat(60));
  if (migrationOk && testOk) {
    console.log('  ✅ PHASE 1 COMPLETE — All invariants enforced');
  } else {
    console.log('  ⚠️  PHASE 1 PARTIAL — Check errors above');
  }
  console.log('='.repeat(60));
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
