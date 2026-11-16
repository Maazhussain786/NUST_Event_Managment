#!/usr/bin/env node
/**
 * Super admin sync — makes sure the platform administrators' accounts exist and
 * are SUPER_ADMIN. It NEVER sets or resets an existing password.
 *
 *   SUPER_ADMINS="Maaz Hussain <maazhussain972@gmail.com>, Muhammad Abdul Daym <abduldaym786@gmail.com>"
 *   node scripts/sync-super-admins.js [--demote-others] [--allow-remote]
 *
 * New accounts get a random password; the person sets their own with
 * "Forgot password" on the sign-in page.
 * --demote-others turns every other SUPER_ADMIN into a normal account.
 * --allow-remote is required to touch a non-local database (ACTIVE_DB != local).
 */
const crypto = require('crypto');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const args = new Set(process.argv.slice(2));
const isLocal = process.env.ACTIVE_DB === 'local';

const DEFAULT_ADMINS =
  'Maaz Hussain <maazhussain972@gmail.com>, Muhammad Abdul Daym <abduldaym786@gmail.com>, Muhammad Bilal Atif <bilalatif23@gmail.com>';

function parseAdmins(raw) {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*<\s*([^>]+)\s*>$/);
      const name = (match ? match[1] : entry.split('@')[0]).trim();
      const email = (match ? match[2] : entry).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid email in SUPER_ADMINS: ${entry}`);
      return { name: name || email, email };
    });
}

function dbConfig() {
  if (isLocal) {
    return {
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
      database: process.env.LOCAL_DB_NAME || 'event_management',
      user: process.env.LOCAL_DB_USER || 'postgres',
      password: process.env.LOCAL_DB_PASSWORD,
    };
  }
  return {
    host: process.env.AZURE_DB_HOST,
    port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
    database: process.env.AZURE_DB_NAME,
    user: process.env.AZURE_DB_USER,
    password: process.env.AZURE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  };
}

async function main() {
  if (!isLocal && !args.has('--allow-remote')) {
    console.error('Refusing to change a non-local database. Set ACTIVE_DB=local, or pass --allow-remote.');
    process.exit(1);
  }
  const admins = parseAdmins(process.env.SUPER_ADMINS || DEFAULT_ADMINS);
  const client = new Client(dbConfig());
  await client.connect();
  try {
    await client.query('BEGIN');
    const ids = [];
    for (const admin of admins) {
      const existing = await client.query('SELECT id, user_type FROM users WHERE email = $1', [admin.email]);
      if (existing.rows[0]) {
        await client.query(
          `UPDATE users SET user_type = 'SUPER_ADMIN', status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [existing.rows[0].id],
        );
        ids.push(existing.rows[0].id);
        console.log(`  ${admin.email}: ${existing.rows[0].user_type === 'SUPER_ADMIN' ? 'already super admin' : 'promoted to super admin'} (password unchanged)`);
      } else {
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('base64url'), 12);
        const created = await client.query(
          `INSERT INTO users (email, password_hash, full_name, user_type, status, email_verified_at)
           VALUES ($1, $2, $3, 'SUPER_ADMIN', 'ACTIVE', NOW()) RETURNING id`,
          [admin.email, hash, admin.name],
        );
        ids.push(created.rows[0].id);
        console.log(`  ${admin.email}: created — set a password with "Forgot password" on the sign-in page`);
      }
    }
    if (args.has('--demote-others')) {
      const demoted = await client.query(
        `UPDATE users SET user_type = 'STUDENT', updated_at = NOW()
         WHERE user_type = 'SUPER_ADMIN' AND NOT (id = ANY($1::uuid[])) RETURNING email`,
        [ids],
      );
      for (const row of demoted.rows) console.log(`  demoted ${row.email}`);
    }
    await client.query('COMMIT');
    console.log('Done.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Super admin sync failed:', error.message);
  process.exit(1);
});
