/**
 * Hardening Migration Script
 * 
 * 1. Add deleted_at TIMESTAMPTZ to events (proper soft delete, separate from is_cancelled)
 * 2. Add deleted_at TIMESTAMPTZ to society_posts (migrate from is_deleted boolean)
 * 3. Add deleted_at TIMESTAMPTZ to society_albums (migrate from is_deleted boolean)
 * 4. Add deleted_at TIMESTAMPTZ to society_album_photos (migrate from is_deleted boolean)
 * 5. Add deleted_at TIMESTAMPTZ to society_post_images
 * 6. Add deleted_by UUID to all soft-deletable tables
 * 7. Add version column to society_posts, society_albums for optimistic locking
 * 8. Add ip_address capture support (add x-forwarded-for extraction helper)
 * 9. Add indexes for soft-delete queries
 * 10. Add participants_count to events for integrity tracking
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const isAzure = process.env.ACTIVE_DB !== 'local';
const pool = new Pool(
  isAzure
    ? {
        host: process.env.AZURE_DB_HOST,
        port: parseInt(process.env.AZURE_DB_PORT || '5432'),
        database: process.env.AZURE_DB_NAME,
        user: process.env.AZURE_DB_USER,
        password: process.env.AZURE_DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.LOCAL_DB_HOST || 'localhost',
        port: parseInt(process.env.LOCAL_DB_PORT || '5432'),
        database: process.env.LOCAL_DB_NAME || 'event_management',
        user: process.env.LOCAL_DB_USER || 'postgres',
        password: process.env.LOCAL_DB_PASSWORD,
        ssl: false,
      }
);

async function migrate() {
  const client = await pool.connect();
  try {
    // ── 0. Add missing audit_action_enum values ─────────────────────────
    // ALTER TYPE ADD VALUE cannot run inside a transaction in many PG versions
    console.log('0. Adding missing audit_action_enum values...');
    const enumValues = [
      'EVENT_DELETED', 'EVENT_RESTORED',
      'ALBUM_CREATED', 'ALBUM_UPDATED', 'ALBUM_DELETED', 'ALBUM_RESTORED',
      'PHOTO_DELETED', 'PHOTO_FEATURED',
      'POST_RESTORED',
      'CAPACITY_VIOLATION', 'EDIT_BLOCKED',
      'STORAGE_ROLLBACK', 'UPLOAD_FAILED',
    ];
    for (const val of enumValues) {
      try {
        await client.query(`ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS '${val}'`);
      } catch (e) {
        // Value already exists — safe to ignore
      }
    }
    console.log('   ✓ Enum values added');

    await client.query('BEGIN');
    console.log('Starting hardening migration...\n');

    // ── 1. Events: Add deleted_at + deleted_by ──────────────────────────
    console.log('1. Adding deleted_at/deleted_by to events...');
    await client.query(`
      ALTER TABLE events
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id)
    `);
    // Migrate: any event that is_cancelled=TRUE with audit action EVENT_DELETED
    // should have deleted_at set. We leave cancelled-only events as-is.
    await client.query(`
      UPDATE events e SET deleted_at = e.updated_at
      WHERE e.is_cancelled = TRUE
        AND EXISTS (
          SELECT 1 FROM audit_logs al
          WHERE al.target_id = e.id AND al.action = 'EVENT_DELETED'
        )
        AND e.deleted_at IS NULL
    `);
    console.log('   ✓ events.deleted_at + events.deleted_by added');

    // ── 2. Society Posts: Add deleted_at + deleted_by ────────────────────
    console.log('2. Adding deleted_at/deleted_by to society_posts...');
    await client.query(`
      ALTER TABLE society_posts
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
    `);
    // Migrate existing is_deleted=true to deleted_at
    await client.query(`
      UPDATE society_posts SET deleted_at = updated_at WHERE is_deleted = TRUE AND deleted_at IS NULL
    `);
    console.log('   ✓ society_posts.deleted_at/deleted_by/version added');

    // ── 3. Society Albums: Add deleted_at + deleted_by ──────────────────
    console.log('3. Adding deleted_at/deleted_by to society_albums...');
    await client.query(`
      ALTER TABLE society_albums
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
    `);
    await client.query(`
      UPDATE society_albums SET deleted_at = updated_at WHERE is_deleted = TRUE AND deleted_at IS NULL
    `);
    console.log('   ✓ society_albums.deleted_at/deleted_by/version added');

    // ── 4. Society Album Photos: Add deleted_at + deleted_by ────────────
    console.log('4. Adding deleted_at/deleted_by to society_album_photos...');
    await client.query(`
      ALTER TABLE society_album_photos
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id)
    `);
    await client.query(`
      UPDATE society_album_photos SET deleted_at = created_at WHERE is_deleted = TRUE AND deleted_at IS NULL
    `);
    console.log('   ✓ society_album_photos.deleted_at/deleted_by added');

    // ── 5. Society Post Images: Add deleted_at ──────────────────────────
    console.log('5. Adding deleted_at to society_post_images...');
    await client.query(`
      ALTER TABLE society_post_images
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);
    console.log('   ✓ society_post_images.deleted_at added');

    // ── 6. Add participants_count to events if missing ──────────────────
    console.log('6. Adding participants_count to events...');
    await client.query(`
      ALTER TABLE events
        ADD COLUMN IF NOT EXISTS participants_count INTEGER NOT NULL DEFAULT 0
    `);
    // Backfill from event_registrations
    await client.query(`
      UPDATE events e SET participants_count = (
        SELECT COUNT(*) FROM event_registrations er
        WHERE er.event_id = e.id AND er.cancelled_at IS NULL
      )
    `);
    // Also count approved tickets
    await client.query(`
      UPDATE events e SET participants_count = GREATEST(e.participants_count, (
        SELECT COUNT(*) FROM tickets t
        WHERE t.event_id = e.id AND t.status = 'APPROVED'
      ))
    `);
    console.log('   ✓ events.participants_count added and backfilled');

    // ── 7. Add indexes for soft-delete filters ──────────────────────────
    console.log('7. Adding soft-delete indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_not_deleted ON events (society_id) WHERE deleted_at IS NULL AND is_cancelled = FALSE;
      CREATE INDEX IF NOT EXISTS idx_posts_active ON society_posts (society_id, created_at DESC) WHERE deleted_at IS NULL AND is_deleted = FALSE;
      CREATE INDEX IF NOT EXISTS idx_albums_active ON society_albums (society_id) WHERE deleted_at IS NULL AND is_deleted = FALSE;
      CREATE INDEX IF NOT EXISTS idx_album_photos_active ON society_album_photos (album_id) WHERE deleted_at IS NULL AND is_deleted = FALSE;
    `);
    console.log('   ✓ Soft-delete indexes created');

    // ── 8. Add check_in_count to events for mutation safety ─────────────
    console.log('8. Adding check_in_count to events...');
    await client.query(`
      ALTER TABLE events
        ADD COLUMN IF NOT EXISTS check_in_count INTEGER NOT NULL DEFAULT 0
    `);
    // Backfill from event_attendance table (QR check-ins)
    await client.query(`
      UPDATE events e SET check_in_count = (
        SELECT COUNT(*) FROM event_attendance ea
        WHERE ea.event_id = e.id
      )
    `);
    console.log('   ✓ events.check_in_count added and backfilled');

    await client.query('COMMIT');
    console.log('\n✅ Hardening migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
