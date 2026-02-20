/**
 * Test Azure PostgreSQL Connection
 * Run: node test-connection.js
 * 
 * This script verifies your database connection configuration.
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

console.log('🔍 Testing Azure PostgreSQL Connection...\n');

console.log('Configuration:');
console.log(`  Host: ${process.env.AZURE_DB_HOST}`);
console.log(`  Port: ${process.env.AZURE_DB_PORT || '5432'}`);
console.log(`  Database: ${process.env.AZURE_DB_NAME}`);
console.log(`  User: ${process.env.AZURE_DB_USER}`);
console.log(`  Password: ${process.env.AZURE_DB_PASSWORD ? '***' + process.env.AZURE_DB_PASSWORD.slice(-4) : 'NOT SET'}`);
console.log(`  SSL: Required (rejectUnauthorized: false)\n`);

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432'),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  try {
    console.log('⏳ Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connection successful!\n');

    console.log('📊 Testing queries...');
    
    // Test 1: Get current timestamp
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log(`  ✅ Current time: ${timeResult.rows[0].current_time}`);

    // Test 2: Check database version
    const versionResult = await client.query('SELECT version()');
    console.log(`  ✅ PostgreSQL version: ${versionResult.rows[0].version.split(',')[0]}`);

    // Test 3: Count tables
    const tablesResult = await client.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
    );
    console.log(`  ✅ Total tables: ${tablesResult.rows[0].count}`);

    // Test 4: Check critical tables exist
    const criticalTables = ['users', 'societies', 'events', 'roles', 'society_memberships'];
    const tableCheckResult = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema='public' AND table_name = ANY($1)`,
      [criticalTables]
    );
    const foundTables = tableCheckResult.rows.map(r => r.table_name);
    console.log(`  ✅ Critical tables found: ${foundTables.join(', ')}`);
    
    if (foundTables.length < criticalTables.length) {
      const missing = criticalTables.filter(t => !foundTables.includes(t));
      console.log(`  ⚠️  Missing tables: ${missing.join(', ')}`);
    }

    // Test 5: Check if there's data
    const userCount = await client.query('SELECT COUNT(*) as count FROM users');
    console.log(`  ✅ Total users: ${userCount.rows[0].count}`);

    const societyCount = await client.query('SELECT COUNT(*) as count FROM societies');
    console.log(`  ✅ Total societies: ${societyCount.rows[0].count}`);

    const eventCount = await client.query('SELECT COUNT(*) as count FROM events');
    console.log(`  ✅ Total events: ${eventCount.rows[0].count}`);

    client.release();
    
    console.log('\n✅ All tests passed! Database is ready to use.\n');
    console.log('Next steps:');
    console.log('  1. Run: npm run dev');
    console.log('  2. Open: http://localhost:3000');
    console.log('  3. Login with admin credentials from DATABASE_SETUP.md\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection failed!\n');
    console.error('Error details:', error.message);
    console.error('\nCommon solutions:');
    console.error('  1. Check .env.local file exists in project root');
    console.error('  2. Verify all AZURE_DB_* variables are set correctly');
    console.error('  3. Make sure password is correct (case-sensitive)');
    console.error('  4. Check if Azure firewall allows your IP address');
    console.error('  5. Verify host is: eventmgmt-pg-server.postgres.database.azure.com');
    console.error('\nIf SSL error persists:');
    console.error('  - SSL is now configured automatically in the code');
    console.error('  - Remove PGSSLMODE from .env.local if present');
    console.error('  - The code uses: ssl: { require: true, rejectUnauthorized: false }\n');
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();
