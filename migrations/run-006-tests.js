const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  port: 5432,
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  const notices = [];
  client.on('notice', n => {
    notices.push(n.message);
    console.log(n.message);
  });

  try {
    console.log('\n=== Phase 6: Storage Quota Enforcement — SQL Tests ===\n');
    const sql = fs.readFileSync('migrations/006-phase6-tests.sql', 'utf8');
    await client.query(sql);

    // Count pass/fail from notices
    const passed = notices.filter(n => n.includes('PASSED')).length;
    const failed = notices.filter(n => n.includes('FAILED')).length;
    console.log(`\nResult: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('\nTEST ERROR:', e.message);
    // Still show notices collected before error
    const passed = notices.filter(n => n.includes('PASSED')).length;
    const failed = notices.filter(n => n.includes('FAILED')).length;
    console.log(`\nPartial result: ${passed} passed, ${failed} failed`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
