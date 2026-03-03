/**
 * Migration: Add society_posts, society_albums, society_album_photos tables
 * Run: node scripts/migrate-posts-albums.js
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

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Society Posts (Facebook-style feed) ───────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_posts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES users(id),
        content TEXT,
        post_type VARCHAR(20) DEFAULT 'TEXT' CHECK (post_type IN ('TEXT','IMAGE','GALLERY','EVENT_SHARE')),
        shared_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
        is_pinned BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Post Images (multiple images per post) ───────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_post_images (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        post_id UUID NOT NULL REFERENCES society_posts(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255),
        file_size_bytes INTEGER DEFAULT 0,
        mime_type VARCHAR(50),
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Photo Albums ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_albums (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(30) DEFAULT 'GENERAL' CHECK (category IN ('GENERAL','EVENTS','ACHIEVEMENTS','TEAM','OTHER')),
        cover_photo_id UUID,
        photo_count INTEGER DEFAULT 0,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Album Photos ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_album_photos (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        album_id UUID NOT NULL REFERENCES society_albums(id) ON DELETE CASCADE,
        society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255),
        file_size_bytes INTEGER DEFAULT 0,
        mime_type VARCHAR(50),
        caption TEXT,
        is_featured BOOLEAN DEFAULT FALSE,
        display_order INTEGER DEFAULT 0,
        uploaded_by UUID NOT NULL REFERENCES users(id),
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── Indexes ──────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_society_posts_society ON society_posts(society_id, created_at DESC) WHERE is_deleted = FALSE`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_society_posts_pinned ON society_posts(society_id) WHERE is_pinned = TRUE AND is_deleted = FALSE`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_post_images_post ON society_post_images(post_id, display_order)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_society_albums_society ON society_albums(society_id) WHERE is_deleted = FALSE`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_album_photos_album ON society_album_photos(album_id, display_order) WHERE is_deleted = FALSE`);

    await client.query('COMMIT');
    console.log('✅ Migration complete: society_posts, society_post_images, society_albums, society_album_photos');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
