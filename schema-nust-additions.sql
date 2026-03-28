-- ============================================================================
-- NUST-SPECIFIC SCHEMA ADDITIONS
-- Run AFTER the main schema.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. NUST SCHOOLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS nust_schools (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    abbreviation    VARCHAR(20) NOT NULL UNIQUE,
    full_name       VARCHAR(200) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO nust_schools (abbreviation, full_name) VALUES
    ('SEECS', 'School of Electrical Engineering & Computer Science'),
    ('SMME',  'School of Mechanical & Manufacturing Engineering'),
    ('SCME',  'School of Chemical & Materials Engineering'),
    ('SCEE',  'School of Civil & Environmental Engineering'),
    ('NBS',   'NUST Business School'),
    ('SADA',  'School of Art, Design & Architecture'),
    ('S3H',   'School of Social Sciences & Humanities'),
    ('NLS',   'NUST Law School'),
    ('SNS',   'School of Natural Sciences'),
    ('ASAB',  'Atta-ur-Rehman School of Applied Biosciences'),
    ('SINES', 'School of Interdisciplinary Engineering & Sciences')
ON CONFLICT (abbreviation) DO NOTHING;

-- ============================================================================
-- 2. ADD SCHOOL REFERENCE & SCOPE TO SOCIETIES
-- ============================================================================

ALTER TABLE societies ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES nust_schools(id);
ALTER TABLE societies ADD COLUMN IF NOT EXISTS is_nust_wide BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_societies_school ON societies (school_id);

-- ============================================================================
-- 3. FAVORITE SOCIETIES (USER BOOKMARKS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS favorite_societies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    society_id      UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, society_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorite_societies (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_society ON favorite_societies (society_id);

-- ============================================================================
-- 4. EVENT CATEGORIES (NUST-SPECIFIC SEED DATA)
-- ============================================================================

INSERT INTO event_categories (name, description) VALUES
    ('Gaming',      'Gaming tournaments and competitions'),
    ('Musical',     'Musical performances and concerts'),
    ('Hackathon',   'Coding competitions and hackathons'),
    ('Workshop',    'Educational workshops and training'),
    ('Seminar',     'Seminars and guest lectures'),
    ('Sports',      'Sports events and tournaments'),
    ('Cultural',    'Cultural festivals and celebrations'),
    ('Tech Talk',   'Technology discussions and presentations'),
    ('Networking',  'Professional networking events'),
    ('Exhibition',  'Art, science, and project exhibitions'),
    ('Competition', 'Academic and general competitions'),
    ('Social',      'Social gatherings and meetups')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 5. GALLERY IMAGES (USES CONTENT TABLE BUT SEED AN ENUM)
-- ============================================================================
-- Gallery images are stored in the existing `content` table
-- with file_type = 'image' and scope = 'SOCIETY' | 'WING' | 'PORTFOLIO'
-- No additional table needed.

-- ============================================================================
-- 6. SEED SUPER ADMIN USERS
-- ============================================================================

INSERT INTO users (email, password_hash, full_name, user_type, status) VALUES
    ('maazhussain972@gmail.com',
     -- bcrypt hash of "maaz@123"
     '$2a$12$xEHh4ib42sY1QMCgwi.yCefrlGGqa3fQH/pxmQjP3.CQhWd7Hxfz2',
     'Maaz Hussain',
     'SUPER_ADMIN',
     'ACTIVE'),
    ('abduldaym786@gmail.com',
     -- bcrypt hash of "daym@123"
     '$2a$12$TdNJHRJlXArS0cIq8DYNSu3ri2NcohaypIz0PAEF0AfrWOBpVjFtu',
     'Muhammad Abdul Daym',
     'SUPER_ADMIN',
     'ACTIVE'),
    ('bilalatif23@gmail.com',
     -- bcrypt hash of "bilal@123"
     '$2a$12$xZcw66AowAuK8HyBfnqWKO8YxEQL1H0CNCQieUgti3A9H.gaah6HS',
     'Muhammad Bilal Atif',
     'SUPER_ADMIN',
     'ACTIVE')
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    user_type = 'SUPER_ADMIN',
    status = 'ACTIVE',
    full_name = EXCLUDED.full_name;

COMMIT;
