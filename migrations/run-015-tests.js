require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Pool } = require('pg');

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
      }
);

(async () => {
  const client = await pool.connect();
  const notices = [];
  client.on('notice', (n) => {
    notices.push(n.message);
    console.log(n.message);
  });

  try {
    console.log('\n=== Phase 15: President Role Assignment Workflow Tests ===\n');
    const sql = fs.readFileSync('migrations/015-president-role-assignment-tests.sql', 'utf8');
    await client.query(sql);

    const passed = notices.filter((n) => n.includes('TEST PASSED')).length;
    const failed = notices.filter((n) => n.includes('TEST FAILED')).length;

    console.log(`\nResult: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error('\nTEST ERROR:', error.message);
    const passed = notices.filter((n) => n.includes('TEST PASSED')).length;
    const failed = notices.filter((n) => n.includes('TEST FAILED')).length;
    console.log(`\nPartial result: ${passed} passed, ${failed} failed`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
