/**
 * Migration: Add invite_tokens table, Director/Deputy Director roles,
 * role-limit constraints, and society_settings table.
 *
 * Run: node scripts/migrate-roles.js
 */
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432'),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting role-hierarchy migration...\n');

    // 1. Create invite_tokens table
    console.log('📨 Creating invite_tokens table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(64) UNIQUE NOT NULL,
        society_id UUID NOT NULL REFERENCES societies(id),
        wing_id UUID REFERENCES wings(id),
        portfolio_id UUID REFERENCES portfolios(id),
        role_name VARCHAR(50) NOT NULL,
        invited_email VARCHAR(255) NOT NULL,
        invited_by UUID NOT NULL REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
        accepted_by UUID REFERENCES users(id),
        accepted_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON invite_tokens(invited_email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invite_tokens_society ON invite_tokens(society_id);`);
    console.log('  ✓ invite_tokens table created');

    // 2. Create society_settings table
    console.log('📋 Creating society_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id UUID UNIQUE NOT NULL REFERENCES societies(id),
        event_creation_role VARCHAR(50) NOT NULL DEFAULT 'Vice President',
        chat_management_role VARCHAR(50) NOT NULL DEFAULT 'Vice President',
        content_upload_role VARCHAR(50) NOT NULL DEFAULT 'Director',
        ticketing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        transfer_policy VARCHAR(20) NOT NULL DEFAULT 'ALLOWED'
          CHECK (transfer_policy IN ('ALLOWED', 'RESTRICTED', 'DISABLED')),
        transfer_deadline_hours INT NOT NULL DEFAULT 24,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('  ✓ society_settings table created');

    // 3. Add contact_number and president_name to societies (for registration)
    console.log('📝 Adding registration fields to societies...');
    await client.query(`
      ALTER TABLE societies
        ADD COLUMN IF NOT EXISTS contact_number VARCHAR(20),
        ADD COLUMN IF NOT EXISTS president_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS supporting_doc_url TEXT;
    `);
    console.log('  ✓ Added contact_number, president_name, rejection_reason, supporting_doc_url');

    // 4. Add Director & Deputy Director roles to all existing societies
    console.log('🎭 Adding Director & Deputy Director system roles...');
    const societies = await client.query(
      `SELECT id FROM societies WHERE status = 'APPROVED'`
    );
    for (const soc of societies.rows) {
      await client.query(`
        INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
        VALUES ($1, 'Director', 'Portfolio Director', 5, TRUE)
        ON CONFLICT (society_id, name) DO NOTHING
      `, [soc.id]);
      await client.query(`
        INSERT INTO roles (society_id, name, description, hierarchy_level, is_system_role)
        VALUES ($1, 'Deputy Director', 'Deputy Portfolio Director', 3, TRUE)
        ON CONFLICT (society_id, name) DO NOTHING
      `, [soc.id]);
    }
    console.log(`  ✓ Director & Deputy Director roles added to ${societies.rows.length} societies`);

    // 5. Assign privileges to VP, Director, Deputy Director roles using batch SQL
    console.log('🛡️ Assigning privileges to new roles...');
    
    // Batch: VP privileges
    await client.query(`
      INSERT INTO role_privileges (role_id, privilege_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN privileges p
      WHERE r.name = 'Vice President' AND r.is_system_role = TRUE
        AND p.name IN ('CREATE_EVENT','EDIT_EVENT','CANCEL_EVENT','UPLOAD_CONTENT',
          'DELETE_CONTENT','SEND_MESSAGE','VIEW_CHAT','MANAGE_CHAT',
          'MANAGE_MEMBERS','MANAGE_PORTFOLIOS','SCAN_QR','VIEW_ANALYTICS')
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✓ VP privileges assigned');

    // Batch: Director privileges
    await client.query(`
      INSERT INTO role_privileges (role_id, privilege_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN privileges p
      WHERE r.name = 'Director' AND r.is_system_role = TRUE
        AND p.name IN ('CREATE_EVENT','EDIT_EVENT','UPLOAD_CONTENT','SEND_MESSAGE',
          'VIEW_CHAT','MANAGE_MEMBERS','SCAN_QR')
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✓ Director privileges assigned');

    // Batch: Deputy Director privileges
    await client.query(`
      INSERT INTO role_privileges (role_id, privilege_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN privileges p
      WHERE r.name = 'Deputy Director' AND r.is_system_role = TRUE
        AND p.name IN ('UPLOAD_CONTENT','SEND_MESSAGE','VIEW_CHAT','SCAN_QR')
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✓ Deputy Director privileges assigned');

    // 6. Create default society_settings for existing societies
    console.log('⚙️ Creating default settings for existing societies...');
    for (const soc of societies.rows) {
      await client.query(`
        INSERT INTO society_settings (society_id)
        VALUES ($1)
        ON CONFLICT (society_id) DO NOTHING
      `, [soc.id]);
    }
    console.log(`  ✓ Settings created for ${societies.rows.length} societies`);

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
