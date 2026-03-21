require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const isAzure = process.env.ACTIVE_DB !== 'local';
const config = isAzure ? {
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432'),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
} : {
  host: process.env.LOCAL_DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT || '5432'),
  database: process.env.LOCAL_DB_NAME || 'event_management',
  user: process.env.LOCAL_DB_USER || 'postgres',
  password: process.env.LOCAL_DB_PASSWORD,
};

const pool = new Pool(config);

(async () => {
  try {
    console.log('=== TICKET SYSTEM DIAGNOSTIC ===\n');

    // 1. Check recent tickets with full details
    const tickets = await pool.query(`
      SELECT t.id, t.status, t.user_id, e.title AS event_title, e.society_id,
             u.full_name AS buyer_name, u.email AS buyer_email,
             e.ticket_price,
             pp.proof_url, pp.status AS proof_status
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      JOIN users u ON t.user_id = u.id
      LEFT JOIN payment_proofs pp ON t.id = pp.ticket_id
      ORDER BY t.created_at DESC
      LIMIT 10;
    `);
    console.log('Recent tickets:', tickets.rows.length);
    tickets.rows.forEach((t, i) => {
      console.log(`  ${i+1}. ${t.buyer_name} - ${t.event_title} [${t.status}]`);
    });

    // 2. Check tickets table columns
    const cols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'tickets'
      ORDER BY ordinal_position;
    `);
    console.log('\nTickets table columns:', cols.rows.map(c => c.column_name).join(', '));

    // 3. Check if ticket_price column exists in events
    const eventCols = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'ticket_price';
    `);
    console.log('\nevents.ticket_price exists:', eventCols.rows.length > 0);

    // 4. Check payment_proofs table
    const ppCols = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payment_proofs'
      ORDER BY ordinal_position;
    `);
    console.log('payment_proofs columns:', ppCols.rows.map(c => c.column_name).join(', '));

    // 5. Test the exact query used by the approvals page
    console.log('\n=== Testing approvals page query ===');
    const testSociety = await pool.query(`SELECT id, name FROM societies WHERE status = 'APPROVED' LIMIT 1`);
    if (testSociety.rows.length > 0) {
      const sid = testSociety.rows[0].id;
      console.log('Testing with society:', testSociety.rows[0].name);

      try {
        const approvalQuery = await pool.query(`
          SELECT t.id, t.event_id, t.user_id, t.status, t.purchased_at, t.created_at,
                 e.title AS event_title, e.ticket_price,
                 u.full_name AS buyer_name, u.email AS buyer_email, u.avatar_url AS buyer_avatar,
                 pp.id AS proof_id, pp.proof_url, pp.proof_type, pp.status AS proof_status,
                 pp.rejection_reason
          FROM tickets t
          JOIN events e ON t.event_id = e.id
          JOIN users u ON t.user_id = u.id
          LEFT JOIN payment_proofs pp ON t.id = pp.ticket_id
          WHERE e.society_id = $1
          ORDER BY t.created_at DESC
        `, [sid]);
        console.log('Approvals query succeeded! Found', approvalQuery.rows.length, 'tickets');
      } catch (queryErr) {
        console.error('Approvals query FAILED:', queryErr.message);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
})();