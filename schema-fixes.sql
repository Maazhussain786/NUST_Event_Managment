-- LEGACY: superseded by db/migrations (000_baseline.sql is the real schema).
-- Kept for reference only; do not run on a database set up with scripts/migrate.js.

-- ============================================================================
-- SCHEMA FIXES — Missing Tables & Columns
-- Run AFTER schema.sql AND schema-nust-additions.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO SOCIETIES
-- ============================================================================

ALTER TABLE societies ADD COLUMN IF NOT EXISTS contact_number VARCHAR(50);
ALTER TABLE societies ADD COLUMN IF NOT EXISTS president_name VARCHAR(200);
ALTER TABLE societies ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ============================================================================
-- 2. INVITE TOKENS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS invite_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token           VARCHAR(255) NOT NULL UNIQUE,
    society_id      UUID NOT NULL REFERENCES societies(id),
    wing_id         UUID REFERENCES wings(id),
    portfolio_id    UUID REFERENCES portfolios(id),
    role_name       VARCHAR(100) NOT NULL,
    invited_email   VARCHAR(255) NOT NULL,
    invited_by      UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    accepted_by     UUID REFERENCES users(id),
    accepted_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_invite_scope CHECK (
        (portfolio_id IS NULL) OR (wing_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens (token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_society ON invite_tokens (society_id);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON invite_tokens (invited_email);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_status ON invite_tokens (status);

-- ============================================================================
-- 3. SOCIETY SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS society_settings (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id              UUID NOT NULL REFERENCES societies(id) UNIQUE,
    event_creation_role     VARCHAR(100) NOT NULL DEFAULT 'Director',
    chat_management_role    VARCHAR(100) NOT NULL DEFAULT 'Vice President',
    content_upload_role     VARCHAR(100) NOT NULL DEFAULT 'Deputy Director',
    ticketing_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    transfer_policy         VARCHAR(20) NOT NULL DEFAULT 'ALLOWED'
                            CHECK (transfer_policy IN ('ALLOWED', 'RESTRICTED', 'DISABLED')),
    transfer_deadline_hours INTEGER NOT NULL DEFAULT 24,
    payment_provider        VARCHAR(50),
    payment_recipient_name  VARCHAR(200),
    payment_account_number  VARCHAR(100),
    payment_iban            VARCHAR(100),
    payment_instructions    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_society_settings_society ON society_settings (society_id);

-- Auto-update updated_at for society_settings
CREATE TRIGGER trg_society_settings_updated_at
    BEFORE UPDATE ON society_settings FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;
