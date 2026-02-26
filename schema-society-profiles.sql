-- ============================================================================
-- SOCIETY PROFILES — Public-facing branding & personalization
-- ============================================================================
-- Extends the societies table with fields needed for the public society page.
-- Stored separately to avoid schema migration on the core societies table.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS society_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id          UUID NOT NULL REFERENCES societies(id) UNIQUE,
    tagline             VARCHAR(300),
    cover_url           TEXT,
    mission             TEXT,
    established_year    INTEGER CHECK (established_year >= 1900 AND established_year <= 2100),
    faculty_advisor     VARCHAR(200),
    contact_email       VARCHAR(200),
    contact_phone       VARCHAR(50),
    office_location     VARCHAR(300),
    social_links        JSONB DEFAULT '{}',      -- { instagram, facebook, twitter, linkedin, website, youtube }
    primary_color       VARCHAR(7),              -- hex e.g. #FF9F43
    accent_color        VARCHAR(7),
    ticket_footer_text  TEXT,
    is_public           BOOLEAN NOT NULL DEFAULT TRUE,
    member_approval     BOOLEAN NOT NULL DEFAULT FALSE,
    auto_approve_ticket BOOLEAN NOT NULL DEFAULT FALSE,
    pin_announcement    TEXT,
    featured_event_id   UUID REFERENCES events(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_society_profiles_society ON society_profiles (society_id);

-- Auto-update updated_at
CREATE TRIGGER trg_society_profiles_updated_at
    BEFORE UPDATE ON society_profiles FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

COMMIT;
