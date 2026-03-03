// One-time migration: create society_profiles table
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432'),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS society_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        society_id UUID NOT NULL REFERENCES societies(id) UNIQUE,
        tagline VARCHAR(300),
        cover_url TEXT,
        mission TEXT,
        established_year INTEGER CHECK (established_year >= 1900 AND established_year <= 2100),
        faculty_advisor VARCHAR(200),
        contact_email VARCHAR(200),
        contact_phone VARCHAR(50),
        office_location VARCHAR(300),
        social_links JSONB DEFAULT '{}',
        primary_color VARCHAR(7),
        accent_color VARCHAR(7),
        ticket_footer_text TEXT,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        member_approval BOOLEAN NOT NULL DEFAULT FALSE,
        auto_approve_ticket BOOLEAN NOT NULL DEFAULT FALSE,
        pin_announcement TEXT,
        featured_event_id UUID REFERENCES events(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_society_profiles_society ON society_profiles (society_id)');

    // Create trigger only if it doesn't exist
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_society_profiles_updated_at') THEN
          CREATE TRIGGER trg_society_profiles_updated_at
            BEFORE UPDATE ON society_profiles FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    console.log('SUCCESS: society_profiles table created with index and trigger');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
