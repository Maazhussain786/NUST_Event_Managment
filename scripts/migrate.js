#!/usr/bin/env node
/**
 * Ordered SQL migration runner.
 *
 * Applies db/migrations/NNN_*.sql in filename order, each inside its own
 * transaction, and records what ran in the `schema_migrations` table.
 *
 * Target database follows the same rule as src/lib/db.ts:
 *   ACTIVE_DB=local  -> LOCAL_DB_* variables
 *   anything else    -> AZURE_DB_* variables
 *
 * Usage:
 *   node scripts/migrate.js                 apply pending migrations (local DB only)
 *   node scripts/migrate.js --status        list applied / pending migrations
 *   node scripts/migrate.js --create-db     create the local database first if missing
 *   node scripts/migrate.js --mark-baseline record 000_baseline.sql as applied without
 *                                           running it (for databases that already have
 *                                           the live schema, e.g. the shared Azure DB)
 *   node scripts/migrate.js --allow-remote  required to write to a non-local database
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Client } = require('pg');

const root = path.join(__dirname, '..');
// Same precedence as Next.js: real env > .env.local > .env
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const args = new Set(process.argv.slice(2));
const MIGRATIONS_DIR = path.join(root, 'db', 'migrations');
const isLocal = process.env.ACTIVE_DB === 'local';

function dbConfig(database) {
  if (isLocal) {
    return {
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '5432', 10),
      database: database || process.env.LOCAL_DB_NAME || 'event_management',
      user: process.env.LOCAL_DB_USER || 'postgres',
      password: process.env.LOCAL_DB_PASSWORD,
      ssl: false,
    };
  }
  return {
    host: process.env.AZURE_DB_HOST,
    port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
    database: database || process.env.AZURE_DB_NAME,
    user: process.env.AZURE_DB_USER,
    password: process.env.AZURE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  };
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function ensureDatabaseExists() {
  const target = dbConfig().database;
  const admin = new Client(dbConfig('postgres'));
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [target]);
    if (exists.rows.length === 0) {
      if (!/^[a-z_][a-z0-9_]*$/.test(target)) throw new Error(`Unsafe database name: ${target}`);
      await admin.query(`CREATE DATABASE ${target}`);
      console.log(`Created database ${target}`);
    }
  } finally {
    await admin.end();
  }
}

async function main() {
  const cfg = dbConfig();
  const label = `${isLocal ? 'LOCAL' : 'REMOTE'} ${cfg.host}/${cfg.database}`;
  const writes = !args.has('--status');

  if (writes && !isLocal && !args.has('--allow-remote')) {
    console.error(
      `Refusing to modify ${label}.\n` +
        'Set ACTIVE_DB=local to target the local database, or pass --allow-remote ' +
        'if you really mean to migrate the shared database.',
    );
    process.exit(1);
  }

  if (args.has('--create-db')) {
    if (!isLocal) throw new Error('--create-db only works with ACTIVE_DB=local');
    await ensureDatabaseExists();
  }

  const client = new Client(cfg);
  await client.connect();
  console.log(`Target: ${label}`);

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename   TEXT PRIMARY KEY,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    const applied = new Map(
      (await client.query('SELECT filename, checksum FROM public.schema_migrations')).rows.map(
        (r) => [r.filename, r.checksum],
      ),
    );
    const files = listMigrationFiles();

    if (args.has('--status')) {
      for (const f of files) {
        const sum = checksum(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
        const state = !applied.has(f)
          ? 'pending'
          : applied.get(f) === sum || applied.get(f) === 'baseline'
            ? 'applied'
            : 'applied (file changed since!)';
        console.log(`${state.padEnd(30)} ${f}`);
      }
      return;
    }

    if (args.has('--mark-baseline')) {
      await client.query(
        `INSERT INTO public.schema_migrations (filename, checksum) VALUES ('000_baseline.sql', 'baseline')
         ON CONFLICT (filename) DO NOTHING`,
      );
      applied.set('000_baseline.sql', 'baseline');
      console.log('Marked 000_baseline.sql as applied.');
    }

    let ran = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      process.stdout.write(`Applying ${f} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        // pg_dump output clears search_path; restore it for later statements.
        await client.query('SET search_path TO public');
        await client.query(
          'INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)',
          [f, checksum(sql)],
        );
        await client.query('COMMIT');
        console.log('ok');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('FAILED');
        console.error(`  ${err.message}${err.position ? ` (at character ${err.position})` : ''}`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(ran === 0 ? 'Nothing to apply; database is up to date.' : `Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
