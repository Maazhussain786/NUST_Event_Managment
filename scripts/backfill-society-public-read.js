/*
 * Backfill MongoDB read model for public society profiles.
 * Safe: reads from Postgres and upserts into MongoDB.
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'event_management';

if (!mongoUri) {
  console.error('Missing MONGODB_URI in .env.local');
  process.exit(1);
}

const pgPool = new Pool({
  host: process.env.AZURE_DB_HOST,
  port: parseInt(process.env.AZURE_DB_PORT || '5432', 10),
  database: process.env.AZURE_DB_NAME,
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function fetchSocietyPublicFromPostgres(client, id) {
  const societyResult = await client.query(
    `SELECT s.id, s.name, s.description, s.logo_url, s.status,
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
     GROUP BY s.id, ns.full_name, ns.abbreviation`,
    [id],
  );

  if (societyResult.rows.length === 0) {
    return null;
  }

  const profileResult = await client.query(
    `SELECT tagline, cover_url, mission, established_year, faculty_advisor,
            contact_email, contact_phone, office_location, social_links,
            primary_color, accent_color, pin_announcement, featured_event_id, is_public
     FROM society_profiles WHERE society_id = $1`,
    [id],
  );

  const eventsResult = await client.query(
    `SELECT e.id, e.title, e.description, e.banner_url, e.location,
            e.event_start, e.event_end, e.ticket_price, e.visibility,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'APPROVED') AS tickets_sold
     FROM events e
     LEFT JOIN tickets t ON e.id = t.event_id
     WHERE e.society_id = $1 AND e.is_cancelled = FALSE
           AND e.visibility = 'PUBLIC'
     GROUP BY e.id
     ORDER BY e.event_start DESC
     LIMIT 12`,
    [id],
  );

  const teamResult = await client.query(
    `SELECT sm.id AS membership_id, u.id AS user_id, u.full_name, u.avatar_url,
            r.name AS role_name, r.hierarchy_level,
            w.name AS wing_name, p.name AS portfolio_name
     FROM society_memberships sm
     JOIN users u ON sm.user_id = u.id
     JOIN roles r ON sm.role_id = r.id
     LEFT JOIN wings w ON sm.wing_id = w.id
     LEFT JOIN portfolios p ON sm.portfolio_id = p.id
     WHERE sm.society_id = $1 AND sm.is_active = TRUE AND r.hierarchy_level >= 3
     ORDER BY r.hierarchy_level DESC, u.full_name ASC`,
    [id],
  );

  const galleryResult = await client.query(
    `SELECT c.id, c.title, c.description, c.file_url, c.file_type,
            c.created_at, u.full_name AS uploaded_by
     FROM content c
     JOIN users u ON c.uploaded_by = u.id
     WHERE c.society_id = $1 AND c.scope = 'SOCIETY'
     ORDER BY c.created_at DESC
     LIMIT 24`,
    [id],
  );

  const wingsResult = await client.query(
    `SELECT w.id, w.name, w.description,
            COUNT(DISTINCT sm.user_id) FILTER (WHERE sm.is_active = TRUE) AS member_count
     FROM wings w
     LEFT JOIN society_memberships sm ON sm.wing_id = w.id AND sm.is_active = TRUE
     WHERE w.society_id = $1
     GROUP BY w.id
     ORDER BY w.name`,
    [id],
  );

  return {
    society: societyResult.rows[0],
    profile: profileResult.rows[0] || null,
    events: eventsResult.rows,
    team: teamResult.rows,
    gallery: galleryResult.rows,
    wings: wingsResult.rows,
  };
}

async function run() {
  const pgClient = await pgPool.connect();
  const mongoClient = new MongoClient(mongoUri);

  try {
    await mongoClient.connect();
    const db = mongoClient.db(mongoDbName);
    const collection = db.collection('society_public_read');

    const societies = await pgClient.query(
      `SELECT id FROM societies WHERE status = 'APPROVED' ORDER BY created_at DESC`,
    );

    console.log(`Backfilling ${societies.rows.length} societies...`);

    for (const row of societies.rows) {
      const data = await fetchSocietyPublicFromPostgres(pgClient, row.id);
      if (!data) continue;

      const doc = {
        _id: row.id,
        ...data,
        updatedAt: new Date(),
      };

      await collection.updateOne({ _id: row.id }, { $set: doc }, { upsert: true });
      console.log(`- upserted ${row.id}`);
    }

    console.log('Backfill complete.');
  } finally {
    pgClient.release();
    await pgPool.end();
    await mongoClient.close();
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
