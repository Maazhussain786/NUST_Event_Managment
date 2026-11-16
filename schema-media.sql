-- LEGACY: superseded by db/migrations (000_baseline.sql is the real schema).
-- Kept for reference only; do not run on a database set up with scripts/migrate.js.

-- ============================================================================
-- MEDIA & IMAGE HANDLING SCHEMA EXTENSION
-- Run AFTER schema.sql, schema-nust-additions.sql, schema-fixes.sql
-- ============================================================================
-- This migration adds:
--   1. society_media     — Society-level images (logo, cover, gallery)
--   2. event_media       — Event-level images & documents (gallery, documents)
--   3. posts             — Society/event posts (announcements, updates)
--   4. post_attachments  — Files attached to posts
--   5. event_notes       — Internal organizer-only notes on events
--   6. event_note_attachments — Files attached to event notes
--   + thumbnail_url column on events table
--   + New enums, indexes, constraints, triggers
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. NEW ENUMERATIONS
-- ============================================================================

CREATE TYPE society_media_type_enum AS ENUM (
    'LOGO',         -- Society logo (max 1 active)
    'COVER',        -- Society cover/header image (max 1 active)
    'GALLERY'       -- Society gallery images (unlimited)
);

CREATE TYPE event_media_type_enum AS ENUM (
    'GALLERY',      -- Event gallery images (unlimited)
    'DOCUMENT'      -- PDFs, docs attached to event (unlimited)
);

CREATE TYPE post_visibility_enum AS ENUM (
    'PUBLIC',           -- Visible to everyone
    'MEMBERS_ONLY'      -- Visible only to society members
);

-- Add new audit actions for media tracking
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'MEDIA_UPLOADED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'MEDIA_DELETED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'POST_CREATED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'POST_UPDATED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'POST_DELETED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'NOTE_CREATED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'NOTE_UPDATED';
ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'NOTE_DELETED';

-- ============================================================================
-- 1. ADD THUMBNAIL TO EVENTS TABLE
-- ============================================================================
-- thumbnail_url is 1:1 with the event (required for creation).
-- banner_url already exists on events table.
-- Both are stored directly on the event for fast list queries (no joins).

ALTER TABLE events ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- NOTE: For NEW events, enforce thumbnail_url NOT NULL at application layer.
-- We don't add NOT NULL here to avoid breaking existing rows.
-- Once all existing events have thumbnails, run:
--   ALTER TABLE events ALTER COLUMN thumbnail_url SET NOT NULL;

-- ============================================================================
-- 2. SOCIETY MEDIA TABLE
-- ============================================================================
-- Stores society-level images: logo, cover, and gallery.
-- Separate from the existing `content` table which handles generic file uploads.
-- This table is purpose-built for structured media with display ordering,
-- captions, and strict type constraints (LOGO = max 1, COVER = max 1).

CREATE TABLE society_media (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    media_type      society_media_type_enum NOT NULL,

    -- File metadata
    file_url        TEXT NOT NULL,
    file_name       VARCHAR(500),
    file_size_bytes BIGINT CHECK (file_size_bytes > 0),
    mime_type       VARCHAR(100) NOT NULL,

    -- Display
    caption         TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,

    -- Tracking
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- File type enforcement: only images for society media
    CONSTRAINT chk_society_media_mime CHECK (
        mime_type IN (
            'image/jpeg', 'image/jpg', 'image/png',
            'image/gif', 'image/webp', 'image/svg+xml'
        )
    )
);

-- Only ONE active logo per society
CREATE UNIQUE INDEX idx_society_media_one_logo
    ON society_media (society_id)
    WHERE media_type = 'LOGO' AND is_deleted = FALSE;

-- Only ONE active cover per society
CREATE UNIQUE INDEX idx_society_media_one_cover
    ON society_media (society_id)
    WHERE media_type = 'COVER' AND is_deleted = FALSE;

-- Query indexes
CREATE INDEX idx_society_media_society ON society_media (society_id);
CREATE INDEX idx_society_media_type ON society_media (society_id, media_type);
CREATE INDEX idx_society_media_uploaded_by ON society_media (uploaded_by);
CREATE INDEX idx_society_media_active ON society_media (society_id, media_type)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_society_media_gallery_order ON society_media (society_id, display_order)
    WHERE media_type = 'GALLERY' AND is_deleted = FALSE;

-- Auto-update updated_at
CREATE TRIGGER trg_society_media_updated_at
    BEFORE UPDATE ON society_media FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();


-- ============================================================================
-- 3. EVENT MEDIA TABLE
-- ============================================================================
-- Stores event-level media: gallery images and documents.
-- Thumbnail and banner are stored directly on the events table (1:1 fields).
-- This table handles multi-file scenarios: gallery photos, PDFs, attachments.

CREATE TABLE event_media (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    media_type      event_media_type_enum NOT NULL,

    -- File metadata
    file_url        TEXT NOT NULL,
    file_name       VARCHAR(500),
    file_size_bytes BIGINT CHECK (file_size_bytes > 0),
    mime_type       VARCHAR(100) NOT NULL,

    -- Display
    caption         TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,

    -- Tracking
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- File type enforcement
    CONSTRAINT chk_event_media_mime CHECK (
        CASE
            WHEN media_type = 'GALLERY' THEN
                mime_type IN (
                    'image/jpeg', 'image/jpg', 'image/png',
                    'image/gif', 'image/webp'
                )
            WHEN media_type = 'DOCUMENT' THEN
                mime_type IN (
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'image/jpeg', 'image/jpg', 'image/png'
                )
            ELSE FALSE
        END
    )
);

-- Query indexes
CREATE INDEX idx_event_media_event ON event_media (event_id);
CREATE INDEX idx_event_media_type ON event_media (event_id, media_type);
CREATE INDEX idx_event_media_uploaded_by ON event_media (uploaded_by);
CREATE INDEX idx_event_media_active ON event_media (event_id, media_type)
    WHERE is_deleted = FALSE;
CREATE INDEX idx_event_media_gallery_order ON event_media (event_id, display_order)
    WHERE media_type = 'GALLERY' AND is_deleted = FALSE;

-- Auto-update updated_at
CREATE TRIGGER trg_event_media_updated_at
    BEFORE UPDATE ON event_media FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();


-- ============================================================================
-- 4. POSTS TABLE
-- ============================================================================
-- Posts can be:
--   a) Society-wide (event_id = NULL) — announcements, updates
--   b) Event-specific (event_id set) — event updates, recaps
-- Created by authorized society members (President, VP, Director).
-- Members can only view.

CREATE TABLE posts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    event_id        UUID REFERENCES events(id) ON DELETE CASCADE,   -- NULL = society-wide post
    author_id       UUID NOT NULL REFERENCES users(id),

    -- Content
    title           VARCHAR(500),
    body            TEXT NOT NULL,
    visibility      post_visibility_enum NOT NULL DEFAULT 'PUBLIC',

    -- Flags
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- If event_id is set, it must belong to the same society
    -- (enforced via trigger below)
    CONSTRAINT chk_post_body_not_empty CHECK (LENGTH(TRIM(body)) > 0)
);

-- Query indexes
CREATE INDEX idx_posts_society ON posts (society_id);
CREATE INDEX idx_posts_event ON posts (event_id);
CREATE INDEX idx_posts_author ON posts (author_id);
CREATE INDEX idx_posts_active ON posts (society_id, is_deleted)
    WHERE is_deleted = FALSE;

-- Society feed: pinned first, then newest
CREATE INDEX idx_posts_society_feed ON posts (society_id, is_pinned DESC, created_at DESC)
    WHERE is_deleted = FALSE;

-- Event feed: newest first
CREATE INDEX idx_posts_event_feed ON posts (event_id, created_at DESC)
    WHERE is_deleted = FALSE AND event_id IS NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER trg_posts_updated_at
    BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- Validate event belongs to same society
CREATE OR REPLACE FUNCTION fn_validate_post_event_society()
RETURNS TRIGGER AS $$
DECLARE
    event_society UUID;
BEGIN
    IF NEW.event_id IS NOT NULL THEN
        SELECT society_id INTO event_society
        FROM events WHERE id = NEW.event_id;

        IF event_society IS NULL THEN
            RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
        END IF;
        IF event_society <> NEW.society_id THEN
            RAISE EXCEPTION 'Event % belongs to society %, not %',
                NEW.event_id, event_society, NEW.society_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_post_event_society
    BEFORE INSERT OR UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION fn_validate_post_event_society();


-- ============================================================================
-- 5. POST ATTACHMENTS TABLE
-- ============================================================================
-- Images and files attached to posts.
-- Supports multiple attachments per post with ordering.

CREATE TABLE post_attachments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id         UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

    -- File metadata
    file_url        TEXT NOT NULL,
    file_name       VARCHAR(500),
    file_size_bytes BIGINT CHECK (file_size_bytes > 0),
    mime_type       VARCHAR(100) NOT NULL,

    -- Display
    caption         TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,

    -- Tracking
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- File type enforcement: images and PDFs
    CONSTRAINT chk_post_attachment_mime CHECK (
        mime_type IN (
            'image/jpeg', 'image/jpg', 'image/png',
            'image/gif', 'image/webp',
            'application/pdf'
        )
    )
);

-- Query indexes
CREATE INDEX idx_post_attachments_post ON post_attachments (post_id);
CREATE INDEX idx_post_attachments_uploaded_by ON post_attachments (uploaded_by);
CREATE INDEX idx_post_attachments_active ON post_attachments (post_id, display_order)
    WHERE is_deleted = FALSE;


-- ============================================================================
-- 6. EVENT NOTES TABLE (INTERNAL / ORGANIZER-ONLY)
-- ============================================================================
-- Internal notes visible only to event organizers.
-- NOT public. Used for coordination, logistics, reminders.
-- Only accessible by President, VP, Director, or SuperAdmin.

CREATE TABLE event_notes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id),

    -- Content
    title           VARCHAR(500),
    body            TEXT NOT NULL,

    -- Flags
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_note_body_not_empty CHECK (LENGTH(TRIM(body)) > 0)
);

-- Query indexes
CREATE INDEX idx_event_notes_event ON event_notes (event_id);
CREATE INDEX idx_event_notes_author ON event_notes (author_id);
CREATE INDEX idx_event_notes_active ON event_notes (event_id, created_at DESC)
    WHERE is_deleted = FALSE;

-- Auto-update updated_at
CREATE TRIGGER trg_event_notes_updated_at
    BEFORE UPDATE ON event_notes FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();


-- ============================================================================
-- 7. EVENT NOTE ATTACHMENTS TABLE
-- ============================================================================
-- Files attached to internal event notes (images, PDFs, docs).

CREATE TABLE event_note_attachments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id         UUID NOT NULL REFERENCES event_notes(id) ON DELETE CASCADE,

    -- File metadata
    file_url        TEXT NOT NULL,
    file_name       VARCHAR(500),
    file_size_bytes BIGINT CHECK (file_size_bytes > 0),
    mime_type       VARCHAR(100) NOT NULL,

    -- Tracking
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- File type enforcement: images, PDFs, documents
    CONSTRAINT chk_note_attachment_mime CHECK (
        mime_type IN (
            'image/jpeg', 'image/jpg', 'image/png',
            'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    )
);

-- Query indexes
CREATE INDEX idx_note_attachments_note ON event_note_attachments (note_id);
CREATE INDEX idx_note_attachments_uploaded_by ON event_note_attachments (uploaded_by);
CREATE INDEX idx_note_attachments_active ON event_note_attachments (note_id)
    WHERE is_deleted = FALSE;


-- ============================================================================
-- 8. NEW PRIVILEGES FOR MEDIA/POSTS/NOTES
-- ============================================================================

INSERT INTO privileges (name, description) VALUES
    ('CREATE_POST',         'Create society/event posts'),
    ('EDIT_POST',           'Edit existing posts'),
    ('DELETE_POST',         'Soft-delete posts'),
    ('UPLOAD_MEDIA',        'Upload media (images, documents) to events/societies'),
    ('DELETE_MEDIA',        'Soft-delete media files'),
    ('CREATE_EVENT_NOTE',   'Create internal event notes'),
    ('EDIT_EVENT_NOTE',     'Edit internal event notes'),
    ('DELETE_EVENT_NOTE',   'Soft-delete internal event notes'),
    ('VIEW_EVENT_NOTES',    'View internal event notes (organizers only)')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- 9. HELPER VIEWS
-- ============================================================================

-- 9.1 Active society media (gallery)
CREATE OR REPLACE VIEW v_society_gallery AS
SELECT
    sm.id,
    sm.society_id,
    s.name AS society_name,
    sm.media_type,
    sm.file_url,
    sm.file_name,
    sm.caption,
    sm.display_order,
    sm.uploaded_by,
    u.full_name AS uploaded_by_name,
    sm.created_at
FROM society_media sm
JOIN societies s ON s.id = sm.society_id
JOIN users u ON u.id = sm.uploaded_by
WHERE sm.is_deleted = FALSE
ORDER BY sm.display_order ASC, sm.created_at DESC;

-- 9.2 Active event media (gallery + documents)
CREATE OR REPLACE VIEW v_event_gallery AS
SELECT
    em.id,
    em.event_id,
    e.title AS event_title,
    e.society_id,
    em.media_type,
    em.file_url,
    em.file_name,
    em.caption,
    em.display_order,
    em.uploaded_by,
    u.full_name AS uploaded_by_name,
    em.created_at
FROM event_media em
JOIN events e ON e.id = em.event_id
JOIN users u ON u.id = em.uploaded_by
WHERE em.is_deleted = FALSE
ORDER BY em.display_order ASC, em.created_at DESC;

-- 9.3 Society post feed (pinned first, then newest)
CREATE OR REPLACE VIEW v_society_posts AS
SELECT
    p.id,
    p.society_id,
    p.event_id,
    e.title AS event_title,
    p.author_id,
    u.full_name AS author_name,
    u.avatar_url AS author_avatar,
    p.title,
    p.body,
    p.visibility,
    p.is_pinned,
    p.created_at,
    p.updated_at,
    (SELECT COUNT(*) FROM post_attachments pa
     WHERE pa.post_id = p.id AND pa.is_deleted = FALSE) AS attachment_count
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN events e ON e.id = p.event_id
WHERE p.is_deleted = FALSE
ORDER BY p.is_pinned DESC, p.created_at DESC;


-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;
