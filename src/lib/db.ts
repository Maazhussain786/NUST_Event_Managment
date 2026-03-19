import { Pool, PoolConfig } from 'pg';

/**
 * Database connection pool.
 * Respects ACTIVE_DB env var to switch between Azure (cloud) and Local configs.
 *
 * Pool settings optimized for:
 * - Statement timeout: 30s max per query (prevents runaway queries)
 * - Connection timeout: 10s (fail fast on connection issues)
 * - Idle timeout: 30s (release connections not in use)
 * - Application name: helps identify connections in pg_stat_activity
 */

const isAzure = process.env.ACTIVE_DB !== 'local';
const appName = 'nust-events';

const azureConfig: PoolConfig = {
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432'),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
  } as PoolConfig['ssl'],
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  application_name: appName,
  statement_timeout: 30000, // 30 seconds max per query
  query_timeout: 30000,
};

const localConfig: PoolConfig = {
  host: process.env.LOCAL_DB_HOST || 'localhost',
  port: parseInt(process.env.LOCAL_DB_PORT || '5432'),
  database: process.env.LOCAL_DB_NAME || 'event_management',
  user: process.env.LOCAL_DB_USER || 'postgres',
  password: process.env.LOCAL_DB_PASSWORD,
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  application_name: appName,
  statement_timeout: 30000,
  query_timeout: 30000,
};

const pool = new Pool(isAzure ? azureConfig : localConfig);

// Log pool errors (connection issues, etc.)
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Query', { text: text.substring(0, 80), duration, rows: result.rowCount });
  }
  return result;
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default pool;
