/**
 * Super Admin Sync Script
 * - Ensures exactly the required super admins exist and are active
 * - Deprovisions legacy super-admin email safely (without hard-deleting FK-linked users)
 * - Removes legacy email references from all public-table email columns
 *
 * Run:
 *   node scripts/sync-super-admins.js
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const LEGACY_SUPER_ADMIN_EMAIL = 'mhussain.bscs24seecs@seecs.edu.pk';

const TARGET_SUPER_ADMINS = [
  {
    name: 'Maaz Hussain',
    email: 'maazhussain972@gmail.com',
    password: 'maaz@123',
  },
  {
    name: 'Muhammad Abdul Daym',
    email: 'abduldaym786@gmail.com',
    password: 'daym@123',
  },
  {
    name: 'Muhammad Bilal Atif',
    email: 'bilalatif23@gmail.com',
    password: 'bilal@123',
  },
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createPool() {
  const isAzure = process.env.ACTIVE_DB !== 'local';
  return new Pool(
    isAzure
      ? {
          host: process.env.AZURE_DB_HOST,
          port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
          database: process.env.AZURE_DB_NAME,
          user: process.env.AZURE_DB_USER,
          password: process.env.AZURE_DB_PASSWORD,
          ssl: { rejectUnauthorized: false },
          max: 10,
        }
      : {
          host: process.env.LOCAL_DB_HOST || 'localhost',
          port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
          database: process.env.LOCAL_DB_NAME || 'event_management',
          user: process.env.LOCAL_DB_USER || 'postgres',
          password: process.env.LOCAL_DB_PASSWORD,
          ssl: false,
          max: 10,
        }
  );
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

async function syncSuperAdmins() {
  const pool = createPool();
  let client;

  const normalizedTargets = TARGET_SUPER_ADMINS.map((admin) => ({
    ...admin,
    email: normalizeEmail(admin.email),
  }));

  const uniqueEmails = new Set(normalizedTargets.map((a) => a.email));
  if (uniqueEmails.size !== normalizedTargets.length) {
    throw new Error('TARGET_SUPER_ADMINS contains duplicate emails');
  }

  const legacyEmail = normalizeEmail(LEGACY_SUPER_ADMIN_EMAIL);
  const scrubAlias = `removed+${legacyEmail.replace(/[^a-z0-9]/g, '_')}@deactivated.local`;

  try {
    client = await pool.connect();
    console.log('Starting super-admin synchronization...');
    await client.query('BEGIN');

    const targetAdminIds = [];
    for (const admin of normalizedTargets) {
      const passwordHash = await bcrypt.hash(admin.password, 12);
      const upsert = await client.query(
        `INSERT INTO users (email, password_hash, full_name, user_type, status)
         VALUES ($1, $2, $3, 'SUPER_ADMIN', 'ACTIVE')
         ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name,
             user_type = 'SUPER_ADMIN',
             status = 'ACTIVE'
         RETURNING id, email`,
        [admin.email, passwordHash, admin.name]
      );
      targetAdminIds.push(upsert.rows[0].id);
      console.log(`  Upserted super admin: ${upsert.rows[0].email}`);
    }

    // Ensure no extra super admins remain.
    const demoted = await client.query(
      `UPDATE users
       SET user_type = 'STUDENT',
           status = CASE WHEN status = 'SUSPENDED' THEN status ELSE 'ACTIVE' END
       WHERE user_type = 'SUPER_ADMIN'
         AND NOT (id = ANY($1::uuid[]))
       RETURNING id, email`,
      [targetAdminIds]
    );
    if (demoted.rowCount > 0) {
      console.log(`  Demoted ${demoted.rowCount} legacy super admin(s)`);
    }

    // Deprovision legacy account email safely (keep row to preserve FK references).
    const legacyUsers = await client.query(
      `SELECT id, email
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [legacyEmail]
    );

    let deprovisionedUsers = 0;
    for (const row of legacyUsers.rows) {
      if (targetAdminIds.includes(row.id)) {
        continue;
      }
      const disabledEmail = `removed+${row.id}@deactivated.local`;
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const randomHash = await bcrypt.hash(randomPassword, 12);

      await client.query(
        `UPDATE users
         SET email = $1,
             password_hash = $2,
             user_type = 'STUDENT',
             status = 'SUSPENDED',
             full_name = CASE
               WHEN full_name ILIKE '%(Deactivated)%' THEN full_name
               ELSE full_name || ' (Deactivated)'
             END
         WHERE id = $3`,
        [disabledEmail, randomHash, row.id]
      );
      deprovisionedUsers += 1;
    }

    // Remove the legacy email string from all email-like columns (all relevant tables).
    const emailColumns = await client.query(
      `SELECT c.table_schema, c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
       WHERE c.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'
         AND c.column_name ILIKE '%email%'
         AND c.data_type IN ('character varying', 'text', 'citext')
         AND NOT (c.table_name = 'users' AND c.column_name = 'email')
       ORDER BY c.table_name, c.column_name`
    );

    let scrubbedReferences = 0;
    for (const col of emailColumns.rows) {
      const table = `${quoteIdent(col.table_schema)}.${quoteIdent(col.table_name)}`;
      const column = quoteIdent(col.column_name);
      const updated = await client.query(
        `UPDATE ${table}
         SET ${column} = $1
         WHERE ${column} IS NOT NULL
           AND LOWER(${column}) = LOWER($2)`,
        [scrubAlias, legacyEmail]
      );
      scrubbedReferences += updated.rowCount;
    }

    const finalAdmins = await client.query(
      `SELECT id, email, full_name, user_type, status, password_hash
       FROM users
       WHERE user_type = 'SUPER_ADMIN'
       ORDER BY email`
    );

    if (finalAdmins.rows.length !== normalizedTargets.length) {
      throw new Error(
        `Expected ${normalizedTargets.length} super admins, found ${finalAdmins.rows.length}`
      );
    }

    const duplicateAdmins = await client.query(
      `SELECT LOWER(email) AS email_key, COUNT(*)::int AS count
       FROM users
       WHERE user_type = 'SUPER_ADMIN'
       GROUP BY LOWER(email)
       HAVING COUNT(*) > 1`
    );
    if (duplicateAdmins.rowCount > 0) {
      throw new Error('Duplicate super-admin emails detected after sync');
    }

    for (const target of normalizedTargets) {
      const row = finalAdmins.rows.find((admin) => admin.email === target.email);
      if (!row) {
        throw new Error(`Missing required super admin: ${target.email}`);
      }
      if (row.status !== 'ACTIVE') {
        throw new Error(`Super admin not ACTIVE: ${target.email}`);
      }
      if (row.user_type !== 'SUPER_ADMIN') {
        throw new Error(`Super admin role mismatch: ${target.email}`);
      }

      const passwordOk = await bcrypt.compare(target.password, row.password_hash);
      if (!passwordOk) {
        throw new Error(`Password hash verification failed for ${target.email}`);
      }
    }

    await client.query('COMMIT');

    console.log('\nSuper-admin synchronization completed successfully.');
    console.log(`- Required super admins active: ${normalizedTargets.length}`);
    console.log(`- Legacy super-admin users deprovisioned: ${deprovisionedUsers}`);
    console.log(`- Legacy email references scrubbed: ${scrubbedReferences}`);
    console.log('\nFinal super-admin accounts:');
    for (const admin of finalAdmins.rows) {
      console.log(`  - ${admin.full_name} <${admin.email}>`);
    }
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('Super-admin synchronization failed:', error.message);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

if (require.main === module) {
  syncSuperAdmins().catch(() => process.exit(1));
}

module.exports = { syncSuperAdmins };
