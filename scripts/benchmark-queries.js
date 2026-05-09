/*
 * Benchmark selected read-heavy SQL queries to identify high-ROI MongoDB read models.
 * Safe: SELECT-only, no mutations.
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

function msFromHrtime(start) {
  const diff = process.hrtime(start);
  return diff[0] * 1000 + diff[1] / 1e6;
}

async function explainAndTime(client, label, sql, params = []) {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
  const explainResult = await client.query(explainSql, params);
  const planRoot = explainResult.rows[0]['QUERY PLAN'][0];
  const executionTime = planRoot['Execution Time'];
  const planningTime = planRoot['Planning Time'];
  const actualRows = planRoot.Plan ? planRoot.Plan['Actual Rows'] : null;

  // Run a few times to get a rough average wall time.
  const iterations = 5;
  let total = 0;
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime();
    await client.query(sql, params);
    total += msFromHrtime(start);
  }
  const avg = total / iterations;

  return {
    label,
    executionTimeMs: executionTime,
    planningTimeMs: planningTime,
    actualRows,
    avgWallTimeMs: avg,
  };
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [tableName],
  );
  return result.rows.length > 0;
}

async function pickIds(client) {
  const society = await client.query(
    `SELECT id FROM societies WHERE status = 'APPROVED' ORDER BY created_at DESC LIMIT 1`,
  );
  const event = await client.query(
    `SELECT id FROM events WHERE deleted_at IS NULL AND is_cancelled = FALSE ORDER BY created_at DESC LIMIT 1`,
  );
  return {
    societyId: society.rows[0]?.id || null,
    eventId: event.rows[0]?.id || null,
  };
}

async function run() {
  const client = await pool.connect();
  try {
    const ids = await pickIds(client);
    if (!ids.societyId || !ids.eventId) {
      console.log('Not enough data to benchmark (missing society or event).');
      return;
    }

    const results = [];

    // Events list (home/events)
    const eventsListSql = `
      SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.registration_end, e.ticket_price, e.max_tickets, e.is_paid,
             e.category_id, ec.name AS category_name,
             s.id AS society_id,
             CASE
               WHEN creator.user_type = 'SUPER_ADMIN' THEN
                 CONCAT_WS(' | ', s.name, 'NUST Administration', NULLIF(ch.cohost_society_names, ''))
               ELSE
                 CONCAT_WS(
                   ' | ',
                   s.name,
                   CASE WHEN ch.has_nust_admin THEN 'NUST Administration' ELSE NULL END,
                   NULLIF(ch.cohost_society_names, '')
                 )
             END AS society_name,
             s.logo_url AS society_logo,
             COALESCE(tc.tickets_sold, 0) AS tickets_sold
      FROM events e
      LEFT JOIN event_categories ec ON e.category_id = ec.id
      JOIN societies s ON e.society_id = s.id
      LEFT JOIN users creator ON creator.id = e.created_by
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
        FROM tickets t
        WHERE t.event_id = e.id
      ) tc ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          BOOL_OR(eco.cohost_type = 'NUST_ADMIN' AND eco.status = 'ACTIVE') AS has_nust_admin,
          STRING_AGG(DISTINCT sc.name, ' | ') FILTER (
            WHERE eco.cohost_type = 'SOCIETY'
              AND eco.status = 'ACTIVE'
              AND sc.id IS NOT NULL
              AND sc.id != e.society_id
          ) AS cohost_society_names
        FROM event_cohosts eco
        LEFT JOIN societies sc ON sc.id = eco.society_id
        WHERE eco.event_id = e.id
      ) ch ON TRUE
      WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL
      ORDER BY e.event_start ASC
      LIMIT $1 OFFSET $2
    `;

    const hasEventCohosts = await tableExists(client, 'event_cohosts');
    if (hasEventCohosts) {
      results.push(await explainAndTime(client, 'events:list', eventsListSql, [20, 0]));
    } else {
      results.push({ label: 'events:list', skipped: true, reason: 'event_cohosts missing' });
    }

    // Trending events
    const trendingSql = `
      SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
              ec.name AS category_name,
              s.id AS society_id, s.name AS society_name, s.logo_url AS society_logo,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       LEFT JOIN tickets t ON e.id = t.event_id
       WHERE e.is_cancelled = FALSE AND e.deleted_at IS NULL AND e.event_end >= NOW()
       GROUP BY e.id, ec.name, s.id
       ORDER BY tickets_sold DESC, e.event_start ASC
       LIMIT 10
    `;
    results.push(await explainAndTime(client, 'events:trending', trendingSql));

    // Event detail (core query)
    const eventDetailSql = `
      SELECT e.id, e.title, e.description, e.banner_url, e.location, e.venue_details,
              e.event_start, e.event_end, e.ticket_price, e.max_tickets, e.is_paid,
              e.registration_start, e.registration_end, e.category_id, e.is_cancelled,
              e.max_participants, e.participants_count,
              ec.name AS category_name,
              s.id AS society_id,
              CASE
                WHEN creator.user_type = 'SUPER_ADMIN' THEN
                  CONCAT_WS(' | ', s.name, 'NUST Administration', NULLIF(ch.cohost_society_names, ''))
                ELSE
                  CONCAT_WS(
                    ' | ',
                    s.name,
                    CASE WHEN ch.has_nust_admin THEN 'NUST Administration' ELSE NULL END,
                    NULLIF(ch.cohost_society_names, '')
                  )
              END AS society_name,
              s.logo_url AS society_logo,
              COALESCE(tc.tickets_sold, 0) AS tickets_sold,
              COALESCE(tc.tickets_reserved, 0) AS tickets_reserved,
              COALESCE(rt.avg_rating, 0)::numeric(3,2) AS avg_rating,
              COALESCE(rt.rating_count, 0) AS rating_count,
              COALESCE(ch.has_nust_admin, FALSE) AS has_nust_administration,
              COALESCE(ch.cohost_society_names, '') AS cohost_society_names
       FROM events e
       LEFT JOIN event_categories ec ON e.category_id = ec.id
       JOIN societies s ON e.society_id = s.id
       LEFT JOIN users creator ON creator.id = e.created_by
       LEFT JOIN LATERAL (
         SELECT
           COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold,
           COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('PENDING', 'APPROVED')) AS tickets_reserved
         FROM tickets t
         WHERE t.event_id = e.id
       ) tc ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(AVG(r.score), 0) AS avg_rating,
           COUNT(DISTINCT r.id) AS rating_count
         FROM ratings r
         WHERE r.target_type = 'EVENT' AND r.target_id = e.id
       ) rt ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           BOOL_OR(eco.cohost_type = 'NUST_ADMIN' AND eco.status = 'ACTIVE') AS has_nust_admin,
           STRING_AGG(DISTINCT sc.name, ' | ') FILTER (
             WHERE eco.cohost_type = 'SOCIETY'
               AND eco.status = 'ACTIVE'
               AND sc.id IS NOT NULL
               AND sc.id != e.society_id
           ) AS cohost_society_names
         FROM event_cohosts eco
         LEFT JOIN societies sc ON sc.id = eco.society_id
         WHERE eco.event_id = e.id
       ) ch ON TRUE
       WHERE e.id = $1 AND e.deleted_at IS NULL
    `;
    if (hasEventCohosts) {
      results.push(await explainAndTime(client, 'events:detail', eventDetailSql, [ids.eventId]));
    } else {
      results.push({ label: 'events:detail', skipped: true, reason: 'event_cohosts missing' });
    }

    // Society public profile: core query
    const societyCoreSql = `
      SELECT s.id, s.name, s.description, s.logo_url, s.status,
              s.is_nust_wide, s.created_at,
              ns.full_name AS school_name, ns.abbreviation AS school_abbr,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count,
              COALESCE(AVG(r.score), 0)::numeric(3,2) AS avg_rating,
              COUNT(DISTINCT r.id) AS rating_count
       FROM societies s
       LEFT JOIN nust_schools ns ON s.school_id = ns.id
       LEFT JOIN society_memberships sm ON s.id = sm.society_id AND sm.is_active = TRUE
       LEFT JOIN ratings r ON r.target_type = 'SOCIETY' AND r.target_id = s.id
       WHERE s.id = $1 AND s.status = 'APPROVED'
       GROUP BY s.id, ns.full_name, ns.abbreviation
    `;
    results.push(await explainAndTime(client, 'society:public:core', societyCoreSql, [ids.societyId]));

    const societyEventsSql = `
      SELECT e.id, e.title, e.description, e.banner_url, e.location,
              e.event_start, e.event_end, e.ticket_price, e.visibility,
              COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
       FROM events e
       LEFT JOIN tickets t ON e.id = t.event_id
       WHERE e.society_id = $1 AND e.is_cancelled = FALSE
             AND e.visibility = 'PUBLIC'
       GROUP BY e.id
       ORDER BY e.event_start DESC
       LIMIT 12
    `;
    results.push(await explainAndTime(client, 'society:public:events', societyEventsSql, [ids.societyId]));

    const societyTeamSql = `
      SELECT sm.id AS membership_id, u.id AS user_id, u.full_name, u.avatar_url,
              r.name AS role_name, r.hierarchy_level,
              w.name AS wing_name, p.name AS portfolio_name
       FROM society_memberships sm
       JOIN users u ON sm.user_id = u.id
       JOIN roles r ON sm.role_id = r.id
       LEFT JOIN wings w ON sm.wing_id = w.id
       LEFT JOIN portfolios p ON sm.portfolio_id = p.id
       WHERE sm.society_id = $1 AND sm.is_active = TRUE AND r.hierarchy_level >= 3
       ORDER BY r.hierarchy_level DESC, u.full_name ASC
    `;
    results.push(await explainAndTime(client, 'society:public:team', societyTeamSql, [ids.societyId]));

    const societyGallerySql = `
      SELECT c.id, c.title, c.description, c.file_url, c.file_type,
              c.created_at, u.full_name AS uploaded_by
       FROM content c
       JOIN users u ON c.uploaded_by = u.id
       WHERE c.society_id = $1 AND c.scope = 'SOCIETY'
       ORDER BY c.created_at DESC
       LIMIT 24
    `;
    results.push(await explainAndTime(client, 'society:public:gallery', societyGallerySql, [ids.societyId]));

    const societyWingsSql = `
      SELECT w.id, w.name, w.description,
              COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count
       FROM wings w
       LEFT JOIN society_memberships sm ON sm.wing_id = w.id AND sm.is_active = TRUE
       WHERE w.society_id = $1
       GROUP BY w.id
       ORDER BY w.name
    `;
    results.push(await explainAndTime(client, 'society:public:wings', societyWingsSql, [ids.societyId]));

    console.log('\n=== Query Benchmarks (Azure) ===');
    for (const r of results) {
      if (r.skipped) {
        console.log(`- ${r.label}: SKIPPED (${r.reason})`);
        continue;
      }
      console.log(
        `- ${r.label}: exec=${r.executionTimeMs?.toFixed(2)}ms, plan=${r.planningTimeMs?.toFixed(2)}ms, avg=${r.avgWallTimeMs?.toFixed(2)}ms, rows=${r.actualRows}`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
