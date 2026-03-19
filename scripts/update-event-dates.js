/**
 * Update event dates to future dates for testing
 * Run: node scripts/update-event-dates.js
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const isAzure = process.env.ACTIVE_DB !== 'local';

const pool = new Pool(isAzure ? {
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
  ssl: false,
});

async function updateEventDates() {
  const client = await pool.connect();
  try {
    // Get all events
    const events = await client.query(`SELECT id, title, event_start, event_end FROM events ORDER BY event_start`);
    console.log(`Found ${events.rows.length} events\n`);

    // Update each event to be in the future
    // Space them out over the next 2 months
    const now = new Date();
    
    for (let i = 0; i < events.rows.length; i++) {
      const event = events.rows[i];
      
      // Calculate new start date: spread events over next 60 days
      const daysOffset = Math.floor((i / events.rows.length) * 60) + 3; // Start 3 days from now
      const hoursOffset = (i % 3) * 4 + 10; // Vary times: 10am, 2pm, 6pm
      
      const newStart = new Date(now);
      newStart.setDate(newStart.getDate() + daysOffset);
      newStart.setHours(hoursOffset, 0, 0, 0);
      
      // Event duration: 3 hours
      const newEnd = new Date(newStart);
      newEnd.setHours(newEnd.getHours() + 3);
      
      // Registration ends 1 day before event
      const regEnd = new Date(newStart);
      regEnd.setDate(regEnd.getDate() - 1);
      
      await client.query(
        `UPDATE events 
         SET event_start = $1, event_end = $2, registration_end = $3, updated_at = NOW()
         WHERE id = $4`,
        [newStart.toISOString(), newEnd.toISOString(), regEnd.toISOString(), event.id]
      );
      
      console.log(`✓ ${event.title}`);
      console.log(`  Old: ${new Date(event.event_start).toLocaleString()}`);
      console.log(`  New: ${newStart.toLocaleString()}\n`);
    }

    console.log(`\n✅ Updated ${events.rows.length} events to future dates`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

updateEventDates();
