const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = 3000;

// --- Database Connection ---
const pool = new Pool({
  host: 'eventmgmt-pg-server.postgres.database.azure.com',
  port: 5432,
  database: 'event_management',
  user: 'pgadmin',
  password: 'EventMgmt@2026!',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

// Verify connection on startup
pool.query('SELECT NOW()')
  .then(() => console.log('Connected to Azure PostgreSQL'))
  .catch(err => console.error('Database connection error:', err.message));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- API: Get all tables ---
app.get('/api/tables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    res.json(result.rows.map(r => r.table_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get all views ---
app.get('/api/views', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    res.json(result.rows.map(r => r.table_name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get all enums ---
app.get('/api/enums', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.typname AS enum_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get table schema (columns) ---
app.get('/api/tables/:name/schema', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await pool.query(`
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        tc.constraint_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_name = kcu.table_name
        AND c.column_name = kcu.column_name
        AND c.table_schema = kcu.table_schema
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position;
    `, [name]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get table data with pagination ---
app.get('/api/tables/:name/data', async (req, res) => {
  try {
    const { name } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Whitelist table name to prevent SQL injection
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      UNION
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = $1
    `, [name]);

    if (tableCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM "${name}"`);
    const totalRows = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(`SELECT * FROM "${name}" LIMIT $1 OFFSET $2`, [limit, offset]);

    res.json({
      table: name,
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit),
      columns: dataResult.fields.map(f => f.name),
      rows: dataResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get database stats ---
app.get('/api/stats', async (req, res) => {
  try {
    const tables = await pool.query(`
      SELECT schemaname, relname AS table_name, n_live_tup AS row_count
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname;
    `);

    const dbSize = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size;
    `);

    const tableSizes = await pool.query(`
      SELECT
        relname AS table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS total_size
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(quote_ident(relname)) DESC;
    `);

    res.json({
      databaseSize: dbSize.rows[0].size,
      tables: tables.rows,
      tableSizes: tableSizes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get functions ---
app.get('/api/functions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.proname AS function_name,
        pg_get_function_arguments(p.oid) AS arguments,
        t.typname AS return_type,
        p.prosrc AS source_code
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_type t ON p.prorettype = t.oid
      WHERE n.nspname = 'public'
      ORDER BY p.proname;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get triggers ---
app.get('/api/triggers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        trigger_name,
        event_manipulation,
        event_object_table,
        action_timing,
        action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Get indexes ---
app.get('/api/indexes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API: Run custom query (read-only) ---
app.post('/api/query', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'SQL query is required' });

    // Only allow SELECT queries
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return res.status(403).json({ error: 'Only SELECT queries are allowed' });
    }

    const result = await pool.query(sql);
    res.json({
      columns: result.fields.map(f => f.name),
      rows: result.rows,
      rowCount: result.rowCount,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Serve frontend ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Database Viewer running at http://localhost:${PORT}\n`);
});
