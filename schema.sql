-- ============================================================================
-- UNIVERSITY SOCIETY & EVENT MANAGEMENT SYSTEM
-- Production-Grade PostgreSQL Schema
-- Hierarchy-Aware, RBAC-Correct, Schema-Locked
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ENUMERATIONS
-- ============================================================================

CREATE TYPE user_type_enum AS ENUM ('SUPER_ADMIN', 'STUDENT');
CREATE TYPE user_status_enum AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');
CREATE TYPE society_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEACTIVATED');
CREATE TYPE ticket_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE payment_proof_status_enum AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE chat_mode_enum AS ENUM ('OPEN', 'RESTRICTED', 'ANNOUNCEMENT_ONLY');
CREATE TYPE chat_permission_type_enum AS ENUM ('VIEW_CHAT', 'SEND_MESSAGE', 'MANAGE_CHAT');
CREATE TYPE rating_target_type_enum AS ENUM ('EVENT', 'SOCIETY');
CREATE TYPE content_scope_enum AS ENUM ('SOCIETY', 'WING', 'PORTFOLIO');
CREATE TYPE audit_action_enum AS ENUM (
    'ROLE_ASSIGNED', 'ROLE_REVOKED', 'ROLE_UPDATED',
    'PRIVILEGE_GRANTED', 'PRIVILEGE_REVOKED',
    'SOCIETY_APPROVED', 'SOCIETY_REJECTED', 'SOCIETY_DEACTIVATED', 'SOCIETY_REACTIVATED',
    'WING_CREATED', 'WING_DELETED',
    'PORTFOLIO_CREATED', 'PORTFOLIO_DELETED',
    'TICKET_APPROVED', 'TICKET_REJECTED',
    'PAYMENT_VERIFIED', 'PAYMENT_REJECTED',
    'QR_SCANNED', 'QR_REGENERATED',
    'TICKET_TRANSFERRED',
    'CHAT_CREATED', 'CHAT_UPDATED', 'CHAT_DELETED',
    'MEMBER_ADDED', 'MEMBER_REMOVED',
    'CONTENT_UPLOADED', 'CONTENT_DELETED',
    'EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_CANCELLED'
);

-- ============================================================================
-- 2. USERS
-- ============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    user_type       user_type_enum NOT NULL DEFAULT 'STUDENT',
    status          user_status_enum NOT NULL DEFAULT 'PENDING_VERIFICATION',
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_user_type ON users (user_type);
CREATE INDEX idx_users_status ON users (status);

-- ============================================================================
-- 3. OTP TOKENS
-- ============================================================================

CREATE TABLE otp_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_code        VARCHAR(10) NOT NULL,
    purpose         VARCHAR(50) NOT NULL DEFAULT 'EMAIL_VERIFICATION',
    is_used         BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at         TIMESTAMPTZ
);

CREATE INDEX idx_otp_user_id ON otp_tokens (user_id);
CREATE INDEX idx_otp_expires_at ON otp_tokens (expires_at);
CREATE INDEX idx_otp_cleanup ON otp_tokens (is_used, expires_at);

-- Prevent OTP reuse: once used or expired, it cannot be verified again
-- Enforced via application logic + is_used flag + expiry check

-- ============================================================================
-- 4. SOCIETIES
-- ============================================================================

CREATE TABLE societies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    logo_url        TEXT,
    status          society_status_enum NOT NULL DEFAULT 'PENDING',
    created_by      UUID NOT NULL REFERENCES users(id),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,                          -- soft delete
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_societies_status ON societies (status);
CREATE INDEX idx_societies_created_by ON societies (created_by);
CREATE INDEX idx_societies_deleted_at ON societies (deleted_at);

-- ============================================================================
-- 5. SOCIETY STATE CHANGES (AUDIT TRAIL)
-- ============================================================================

CREATE TABLE society_state_changes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id),
    from_status     society_status_enum,
    to_status       society_status_enum NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id),
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_society_state_society ON society_state_changes (society_id);
CREATE INDEX idx_society_state_changed_by ON society_state_changes (changed_by);

-- ============================================================================
-- 6. WINGS
-- ============================================================================

CREATE TABLE wings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    deleted_at      TIMESTAMPTZ,                          -- soft delete only
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wings_society ON wings (society_id);
CREATE INDEX idx_wings_deleted_at ON wings (deleted_at);
CREATE UNIQUE INDEX idx_wings_unique_name ON wings (society_id, name) WHERE deleted_at IS NULL;

-- ============================================================================
-- 7. PORTFOLIOS
-- ============================================================================

CREATE TABLE portfolios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wing_id         UUID NOT NULL REFERENCES wings(id),
    society_id      UUID NOT NULL REFERENCES societies(id),   -- denormalized for query perf
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    deleted_at      TIMESTAMPTZ,                              -- soft delete only
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolios_wing ON portfolios (wing_id);
CREATE INDEX idx_portfolios_society ON portfolios (society_id);
CREATE INDEX idx_portfolios_deleted_at ON portfolios (deleted_at);
CREATE UNIQUE INDEX idx_portfolios_unique_name ON portfolios (wing_id, name) WHERE deleted_at IS NULL;

-- ============================================================================
-- 8. ROLES (GENERIC, PER-SOCIETY)
-- ============================================================================

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    hierarchy_level INTEGER NOT NULL CHECK (hierarchy_level >= 0),
    is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,       -- for mandatory roles
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role names unique per society
CREATE UNIQUE INDEX idx_roles_unique_name ON roles (society_id, name);
CREATE INDEX idx_roles_society ON roles (society_id);
CREATE INDEX idx_roles_hierarchy ON roles (society_id, hierarchy_level);

-- ============================================================================
-- 9. PRIVILEGES (GLOBAL ACTIONS)
-- ============================================================================

CREATE TABLE privileges (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed essential privileges
INSERT INTO privileges (name, description) VALUES
    ('CREATE_EVENT',      'Create events'),
    ('EDIT_EVENT',        'Edit events'),
    ('CANCEL_EVENT',      'Cancel events'),
    ('VERIFY_PAYMENTS',   'Verify payment proofs'),
    ('UPLOAD_CONTENT',    'Upload content (files, images, videos)'),
    ('DELETE_CONTENT',    'Delete content'),
    ('SEND_MESSAGE',      'Send messages in chats'),
    ('VIEW_CHAT',         'View chat messages'),
    ('MANAGE_CHAT',       'Create/edit/delete chats and manage chat permissions'),
    ('MANAGE_MEMBERS',    'Add/remove society members'),
    ('MANAGE_ROLES',      'Assign/revoke roles'),
    ('MANAGE_WINGS',      'Create/edit/soft-delete wings'),
    ('MANAGE_PORTFOLIOS', 'Create/edit/soft-delete portfolios'),
    ('VIEW_AUDIT_LOGS',   'View audit trail'),
    ('SCAN_QR',           'Scan QR codes for attendance'),
    ('TRANSFER_TICKET',   'Transfer tickets to other users'),
    ('VIEW_ANALYTICS',    'View society/event analytics');

-- ============================================================================
-- 10. ROLE-PRIVILEGE MAPPING
-- ============================================================================

CREATE TABLE role_privileges (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    privilege_id    UUID NOT NULL REFERENCES privileges(id) ON DELETE CASCADE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by      UUID REFERENCES users(id),

    UNIQUE (role_id, privilege_id)
);

CREATE INDEX idx_role_privileges_role ON role_privileges (role_id);
CREATE INDEX idx_role_privileges_privilege ON role_privileges (privilege_id);

-- ============================================================================
-- 11. SOCIETY MEMBERSHIPS (ROLE ASSIGNMENTS WITH SCOPE)
-- ============================================================================
-- This is the core RBAC table.
-- Each row assigns ONE role to a user at a specific scope.
-- Scope: society-wide (wing_id=NULL, portfolio_id=NULL),
--         wing-level (wing_id set, portfolio_id=NULL),
--         portfolio-level (both set).
-- ============================================================================

CREATE TABLE society_memberships (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    society_id      UUID NOT NULL REFERENCES societies(id),
    role_id         UUID NOT NULL REFERENCES roles(id),
    wing_id         UUID REFERENCES wings(id),
    portfolio_id    UUID REFERENCES portfolios(id),
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- used for tie-breaking
    assigned_by     UUID REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL CONSTRAINT: One role per user per scope
-- UNIQUE(user_id, society_id, wing_id, portfolio_id)
-- Since NULLs are distinct in PostgreSQL UNIQUE constraints, use a functional index
CREATE UNIQUE INDEX idx_unique_role_assignment
    ON society_memberships (
        user_id,
        society_id,
        COALESCE(wing_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(portfolio_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE is_active = TRUE;

CREATE INDEX idx_memberships_user ON society_memberships (user_id);
CREATE INDEX idx_memberships_society ON society_memberships (society_id);
CREATE INDEX idx_memberships_role ON society_memberships (role_id);
CREATE INDEX idx_memberships_wing ON society_memberships (wing_id);
CREATE INDEX idx_memberships_portfolio ON society_memberships (portfolio_id);
CREATE INDEX idx_memberships_assigned_at ON society_memberships (assigned_at);

-- Constraint: portfolio_id requires wing_id
ALTER TABLE society_memberships
    ADD CONSTRAINT chk_scope_hierarchy
    CHECK (
        (portfolio_id IS NULL) OR (wing_id IS NOT NULL)
    );

-- Constraint: role must belong to the same society
-- Enforced via trigger below

-- ============================================================================
-- 12. EVENT CATEGORIES
-- ============================================================================

CREATE TABLE event_categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. EVENTS
-- ============================================================================

CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id          UUID NOT NULL REFERENCES societies(id),
    wing_id             UUID REFERENCES wings(id),            -- optional attribution
    portfolio_id        UUID REFERENCES portfolios(id),       -- optional attribution
    category_id         UUID REFERENCES event_categories(id),
    title               VARCHAR(300) NOT NULL,
    description         TEXT,
    location            VARCHAR(500),
    venue_details       TEXT,
    is_paid             BOOLEAN NOT NULL DEFAULT FALSE,
    ticket_price        NUMERIC(10, 2) CHECK (ticket_price >= 0),
    max_tickets         INTEGER CHECK (max_tickets > 0),
    event_start         TIMESTAMPTZ NOT NULL,
    event_end           TIMESTAMPTZ NOT NULL,
    registration_start  TIMESTAMPTZ,
    registration_end    TIMESTAMPTZ,
    transfer_deadline   TIMESTAMPTZ,                          -- ticket transfer cutoff
    banner_url          TEXT,
    is_cancelled        BOOLEAN NOT NULL DEFAULT FALSE,
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_event_dates CHECK (event_end > event_start),
    CONSTRAINT chk_event_attribution CHECK (
        (portfolio_id IS NULL) OR (wing_id IS NOT NULL)
    )
);

CREATE INDEX idx_events_society ON events (society_id);
CREATE INDEX idx_events_wing ON events (wing_id);
CREATE INDEX idx_events_portfolio ON events (portfolio_id);
CREATE INDEX idx_events_category ON events (category_id);
CREATE INDEX idx_events_start ON events (event_start);
CREATE INDEX idx_events_end ON events (event_end);
CREATE INDEX idx_events_is_paid ON events (is_paid);
CREATE INDEX idx_events_location ON events (location);
CREATE INDEX idx_events_upcoming ON events (event_start) WHERE is_cancelled = FALSE;

-- ============================================================================
-- 14. TICKETS
-- ============================================================================

CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id),
    user_id         UUID NOT NULL REFERENCES users(id),       -- current owner
    status          ticket_status_enum NOT NULL DEFAULT 'PENDING',
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at     TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id),
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_event ON tickets (event_id);
CREATE INDEX idx_tickets_user ON tickets (user_id);
CREATE INDEX idx_tickets_status ON tickets (status);

-- ============================================================================
-- 15. PAYMENT PROOFS
-- ============================================================================

CREATE TABLE payment_proofs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id),
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    proof_url       TEXT NOT NULL,
    proof_type      VARCHAR(50),                              -- e.g. screenshot, receipt
    transaction_reference VARCHAR(200),
    student_note    TEXT,
    status          payment_proof_status_enum NOT NULL DEFAULT 'PENDING',
    verified_by     UUID REFERENCES users(id),
    verified_at     TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_proofs_ticket ON payment_proofs (ticket_id);
CREATE INDEX idx_payment_proofs_status ON payment_proofs (status);

-- Constraint: only one verified proof per ticket at a time
CREATE UNIQUE INDEX idx_one_verified_proof_per_ticket
    ON payment_proofs (ticket_id)
    WHERE status = 'VERIFIED';

-- ============================================================================
-- 16. QR CODES
-- ============================================================================

CREATE TABLE ticket_qr_codes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id),
    qr_data         TEXT NOT NULL UNIQUE,                     -- unique QR payload
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_scanned      BOOLEAN NOT NULL DEFAULT FALSE,
    scanned_at      TIMESTAMPTZ,
    scanned_by      UUID REFERENCES users(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_ticket ON ticket_qr_codes (ticket_id);
CREATE INDEX idx_qr_active ON ticket_qr_codes (ticket_id, is_active);
CREATE INDEX idx_qr_data ON ticket_qr_codes (qr_data);

-- Constraint: only one active QR per ticket
CREATE UNIQUE INDEX idx_one_active_qr_per_ticket
    ON ticket_qr_codes (ticket_id)
    WHERE is_active = TRUE;

-- ============================================================================
-- 17. TICKET TRANSFERS (APPEND-ONLY)
-- ============================================================================

CREATE TABLE ticket_transfers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id           UUID NOT NULL REFERENCES tickets(id),
    from_user_id        UUID NOT NULL REFERENCES users(id),
    to_user_id          UUID NOT NULL REFERENCES users(id),
    transferred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transfer_reason     TEXT,

    CONSTRAINT chk_no_self_transfer CHECK (from_user_id <> to_user_id)
);

CREATE INDEX idx_transfers_ticket ON ticket_transfers (ticket_id);
CREATE INDEX idx_transfers_from ON ticket_transfers (from_user_id);
CREATE INDEX idx_transfers_to ON ticket_transfers (to_user_id);

-- ============================================================================
-- 18. ATTENDANCE
-- ============================================================================

CREATE TABLE attendance (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id        UUID NOT NULL REFERENCES events(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    ticket_id       UUID NOT NULL REFERENCES tickets(id),
    qr_code_id      UUID NOT NULL REFERENCES ticket_qr_codes(id),
    scanned_by      UUID NOT NULL REFERENCES users(id),
    scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (event_id, user_id)                                -- one attendance per user per event
);

CREATE INDEX idx_attendance_event ON attendance (event_id);
CREATE INDEX idx_attendance_user ON attendance (user_id);

-- ============================================================================
-- 19. RATINGS
-- ============================================================================

CREATE TABLE ratings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),       -- stored internally
    target_type     rating_target_type_enum NOT NULL,
    target_id       UUID NOT NULL,                            -- event_id or society_id
    score           SMALLINT NOT NULL CHECK (score >= 1 AND score <= 5),
    review_text     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- one rating per user per target
    UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX idx_ratings_target ON ratings (target_type, target_id);
CREATE INDEX idx_ratings_user ON ratings (user_id);

-- ============================================================================
-- 20. CHATS
-- ============================================================================

CREATE TABLE chats (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id),
    wing_id         UUID REFERENCES wings(id),
    portfolio_id    UUID REFERENCES portfolios(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    mode            chat_mode_enum NOT NULL DEFAULT 'OPEN',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID NOT NULL REFERENCES users(id),
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_chat_scope CHECK (
        (portfolio_id IS NULL) OR (wing_id IS NOT NULL)
    )
);

CREATE INDEX idx_chats_society ON chats (society_id);
CREATE INDEX idx_chats_wing ON chats (wing_id);
CREATE INDEX idx_chats_portfolio ON chats (portfolio_id);
CREATE INDEX idx_chats_active ON chats (is_active);

-- ============================================================================
-- 21. CHAT ROLE PERMISSIONS
-- ============================================================================
-- Defines which roles have which permissions in a chat.
-- If no rows exist for a chat, fall back to authority-based resolution.

CREATE TABLE chat_role_permissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id         UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission      chat_permission_type_enum NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by      UUID REFERENCES users(id),

    UNIQUE (chat_id, role_id, permission)
);

CREATE INDEX idx_chat_perms_chat ON chat_role_permissions (chat_id);
CREATE INDEX idx_chat_perms_role ON chat_role_permissions (role_id);

-- ============================================================================
-- 22. CHAT MESSAGES
-- ============================================================================

CREATE TABLE chat_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id         UUID NOT NULL REFERENCES chats(id),
    sender_id       UUID NOT NULL REFERENCES users(id),
    content         TEXT NOT NULL,
    reply_to_id     UUID REFERENCES chat_messages(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_chat ON chat_messages (chat_id);
CREATE INDEX idx_messages_sender ON chat_messages (sender_id);
CREATE INDEX idx_messages_created ON chat_messages (chat_id, created_at);

-- ============================================================================
-- 23. CONTENT
-- ============================================================================

CREATE TABLE content (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    society_id      UUID NOT NULL REFERENCES societies(id),
    wing_id         UUID REFERENCES wings(id),
    portfolio_id    UUID REFERENCES portfolios(id),
    scope           content_scope_enum NOT NULL,
    title           VARCHAR(300),
    description     TEXT,
    file_url        TEXT NOT NULL,
    file_type       VARCHAR(50),                              -- image, video, document, etc.
    file_size_bytes BIGINT,
    mime_type       VARCHAR(100),
    uploaded_by     UUID NOT NULL REFERENCES users(id),
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_content_scope CHECK (
        (scope = 'SOCIETY' AND wing_id IS NULL AND portfolio_id IS NULL) OR
        (scope = 'WING' AND wing_id IS NOT NULL AND portfolio_id IS NULL) OR
        (scope = 'PORTFOLIO' AND wing_id IS NOT NULL AND portfolio_id IS NOT NULL)
    )
);

CREATE INDEX idx_content_society ON content (society_id);
CREATE INDEX idx_content_wing ON content (wing_id);
CREATE INDEX idx_content_portfolio ON content (portfolio_id);
CREATE INDEX idx_content_scope ON content (scope);
CREATE INDEX idx_content_uploaded_by ON content (uploaded_by);

-- ============================================================================
-- 24. NOTIFICATIONS
-- ============================================================================

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    title           VARCHAR(300) NOT NULL,
    body            TEXT,
    link            TEXT,                                      -- deep link to relevant resource
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id);
CREATE INDEX idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications (user_id, created_at DESC);

-- ============================================================================
-- 25. AUDIT LOGS
-- ============================================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action          audit_action_enum NOT NULL,
    performed_by    UUID NOT NULL REFERENCES users(id),
    society_id      UUID REFERENCES societies(id),
    target_type     VARCHAR(100),                              -- e.g. 'society_membership', 'ticket'
    target_id       UUID,                                      -- PK of affected row
    old_value       JSONB,
    new_value       JSONB,
    metadata        JSONB,                                     -- additional context
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_action ON audit_logs (action);
CREATE INDEX idx_audit_performed_by ON audit_logs (performed_by);
CREATE INDEX idx_audit_society ON audit_logs (society_id);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);

-- ============================================================================
-- 26. TRIGGERS & FUNCTIONS
-- ============================================================================

-- 26.1 Auto-update updated_at columns
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_societies_updated_at
    BEFORE UPDATE ON societies FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_wings_updated_at
    BEFORE UPDATE ON wings FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_portfolios_updated_at
    BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON society_memberships FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_payment_proofs_updated_at
    BEFORE UPDATE ON payment_proofs FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_chats_updated_at
    BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_content_updated_at
    BEFORE UPDATE ON content FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_ratings_updated_at
    BEFORE UPDATE ON ratings FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- 26.2 Validate role belongs to same society on membership insert/update
CREATE OR REPLACE FUNCTION fn_validate_membership_role()
RETURNS TRIGGER AS $$
DECLARE
    role_society UUID;
BEGIN
    SELECT society_id INTO role_society FROM roles WHERE id = NEW.role_id;
    IF role_society IS NULL THEN
        RAISE EXCEPTION 'Role % does not exist', NEW.role_id;
    END IF;
    IF role_society <> NEW.society_id THEN
        RAISE EXCEPTION 'Role % belongs to society %, not %', NEW.role_id, role_society, NEW.society_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_membership_role
    BEFORE INSERT OR UPDATE ON society_memberships
    FOR EACH ROW EXECUTE FUNCTION fn_validate_membership_role();

-- 26.3 Validate wing belongs to same society
CREATE OR REPLACE FUNCTION fn_validate_membership_wing()
RETURNS TRIGGER AS $$
DECLARE
    wing_society UUID;
BEGIN
    IF NEW.wing_id IS NOT NULL THEN
        SELECT society_id INTO wing_society FROM wings WHERE id = NEW.wing_id;
        IF wing_society <> NEW.society_id THEN
            RAISE EXCEPTION 'Wing % does not belong to society %', NEW.wing_id, NEW.society_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_membership_wing
    BEFORE INSERT OR UPDATE ON society_memberships
    FOR EACH ROW EXECUTE FUNCTION fn_validate_membership_wing();

-- 26.4 Validate portfolio belongs to the specified wing
CREATE OR REPLACE FUNCTION fn_validate_membership_portfolio()
RETURNS TRIGGER AS $$
DECLARE
    portfolio_wing UUID;
BEGIN
    IF NEW.portfolio_id IS NOT NULL THEN
        SELECT wing_id INTO portfolio_wing FROM portfolios WHERE id = NEW.portfolio_id;
        IF portfolio_wing <> NEW.wing_id THEN
            RAISE EXCEPTION 'Portfolio % does not belong to wing %', NEW.portfolio_id, NEW.wing_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_membership_portfolio
    BEFORE INSERT OR UPDATE ON society_memberships
    FOR EACH ROW EXECUTE FUNCTION fn_validate_membership_portfolio();

-- 26.5 Log society state changes automatically
CREATE OR REPLACE FUNCTION fn_log_society_state_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, COALESCE(NEW.approved_by, NEW.created_by));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_society_state_change
    AFTER UPDATE ON societies
    FOR EACH ROW EXECUTE FUNCTION fn_log_society_state_change();

-- 26.6 Prevent ticket transfer after QR scan or deadline
CREATE OR REPLACE FUNCTION fn_validate_ticket_transfer()
RETURNS TRIGGER AS $$
DECLARE
    qr_scanned BOOLEAN;
    transfer_deadline TIMESTAMPTZ;
BEGIN
    -- Check if QR has been scanned
    SELECT EXISTS(
        SELECT 1 FROM ticket_qr_codes
        WHERE ticket_id = NEW.ticket_id AND is_scanned = TRUE
    ) INTO qr_scanned;

    IF qr_scanned THEN
        RAISE EXCEPTION 'Cannot transfer ticket % - QR code already scanned', NEW.ticket_id;
    END IF;

    -- Check transfer deadline
    SELECT e.transfer_deadline INTO transfer_deadline
    FROM events e
    JOIN tickets t ON t.event_id = e.id
    WHERE t.id = NEW.ticket_id;

    IF transfer_deadline IS NOT NULL AND NOW() > transfer_deadline THEN
        RAISE EXCEPTION 'Cannot transfer ticket % - transfer deadline has passed', NEW.ticket_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_ticket_transfer
    BEFORE INSERT ON ticket_transfers
    FOR EACH ROW EXECUTE FUNCTION fn_validate_ticket_transfer();

-- 26.7 Mark QR as single-use on scan
CREATE OR REPLACE FUNCTION fn_enforce_single_use_qr()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_scanned = TRUE AND NEW.is_scanned = TRUE THEN
        RAISE EXCEPTION 'QR code % has already been scanned', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_single_use_qr
    BEFORE UPDATE ON ticket_qr_codes
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_single_use_qr();

-- 26.8 Prevent re-use of OTP
CREATE OR REPLACE FUNCTION fn_prevent_otp_reuse()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_used = TRUE THEN
        RAISE EXCEPTION 'OTP % has already been used', OLD.id;
    END IF;
    IF NEW.is_used = TRUE THEN
        NEW.used_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_otp_reuse
    BEFORE UPDATE ON otp_tokens
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_otp_reuse();

-- ============================================================================
-- 27. AUTHORITY RESOLUTION FUNCTION
-- ============================================================================
-- Determines if user_a can manage user_b within a society.
-- Returns TRUE if user_a has authority over user_b.
-- Super Admins bypass this check entirely (handled at application layer).

CREATE OR REPLACE FUNCTION fn_can_manage(
    p_user_a UUID,
    p_user_b UUID,
    p_society_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    a_level INTEGER;
    b_level INTEGER;
    a_assigned TIMESTAMPTZ;
    b_assigned TIMESTAMPTZ;
BEGIN
    -- Get the highest authority (lowest hierarchy_level) for user A in this society
    SELECT r.hierarchy_level, sm.assigned_at
    INTO a_level, a_assigned
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_a
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
    ORDER BY r.hierarchy_level ASC, sm.assigned_at ASC
    LIMIT 1;

    -- Get the highest authority for user B
    SELECT r.hierarchy_level, sm.assigned_at
    INTO b_level, b_assigned
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_b
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
    ORDER BY r.hierarchy_level ASC, sm.assigned_at ASC
    LIMIT 1;

    -- If either user has no membership, return FALSE
    IF a_level IS NULL OR b_level IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Lower number = higher authority
    IF a_level < b_level THEN
        RETURN TRUE;
    ELSIF a_level = b_level THEN
        -- Earlier assignment wins
        RETURN a_assigned < b_assigned;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 28. PRIVILEGE CHECK FUNCTION
-- ============================================================================
-- Checks if a user has a specific privilege within a given scope.
-- Returns TRUE if user has the privilege (via any of their roles).

CREATE OR REPLACE FUNCTION fn_has_privilege(
    p_user_id UUID,
    p_society_id UUID,
    p_privilege_name VARCHAR,
    p_wing_id UUID DEFAULT NULL,
    p_portfolio_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    has_priv BOOLEAN;
BEGIN
    -- Check if user is SUPER_ADMIN (bypass all checks)
    IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND user_type = 'SUPER_ADMIN') THEN
        RETURN TRUE;
    END IF;

    -- Check if user has the privilege via any of their active roles in this society
    -- that are at the appropriate scope level or higher
    SELECT EXISTS(
        SELECT 1
        FROM society_memberships sm
        JOIN roles r ON r.id = sm.role_id
        JOIN role_privileges rp ON rp.role_id = r.id
        JOIN privileges p ON p.id = rp.privilege_id
        WHERE sm.user_id = p_user_id
          AND sm.society_id = p_society_id
          AND sm.is_active = TRUE
          AND p.name = p_privilege_name
          -- Scope containment: society > wing > portfolio
          -- A society-level role covers everything
          -- A wing-level role covers its wing and portfolios within
          -- A portfolio-level role covers only that portfolio
          AND (
              -- Society-wide scope: covers everything
              (sm.wing_id IS NULL AND sm.portfolio_id IS NULL)
              OR
              -- Wing scope: matches if target is same wing or portfolio under that wing
              (sm.wing_id IS NOT NULL AND sm.portfolio_id IS NULL
               AND (p_wing_id IS NULL OR sm.wing_id = p_wing_id))
              OR
              -- Portfolio scope: matches only same portfolio
              (sm.portfolio_id IS NOT NULL
               AND sm.wing_id = p_wing_id
               AND sm.portfolio_id = p_portfolio_id)
          )
    ) INTO has_priv;

    RETURN has_priv;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 29. HELPER VIEWS
-- ============================================================================

-- 29.1 Active society members with resolved roles
CREATE OR REPLACE VIEW v_active_memberships AS
SELECT
    sm.id AS membership_id,
    sm.user_id,
    u.full_name,
    u.email,
    sm.society_id,
    s.name AS society_name,
    sm.role_id,
    r.name AS role_name,
    r.hierarchy_level,
    sm.wing_id,
    w.name AS wing_name,
    sm.portfolio_id,
    p.name AS portfolio_name,
    sm.assigned_at,
    sm.is_active
FROM society_memberships sm
JOIN users u ON u.id = sm.user_id
JOIN societies s ON s.id = sm.society_id
JOIN roles r ON r.id = sm.role_id
LEFT JOIN wings w ON w.id = sm.wing_id
LEFT JOIN portfolios p ON p.id = sm.portfolio_id
WHERE sm.is_active = TRUE;

-- 29.2 Upcoming events
CREATE OR REPLACE VIEW v_upcoming_events AS
SELECT
    e.*,
    s.name AS society_name,
    w.name AS wing_name,
    p.name AS portfolio_name,
    ec.name AS category_name,
    (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id AND t.status = 'APPROVED') AS tickets_sold
FROM events e
JOIN societies s ON s.id = e.society_id
LEFT JOIN wings w ON w.id = e.wing_id
LEFT JOIN portfolios p ON p.id = e.portfolio_id
LEFT JOIN event_categories ec ON ec.id = e.category_id
WHERE e.event_start > NOW()
  AND e.is_cancelled = FALSE
  AND s.status = 'APPROVED'
ORDER BY e.event_start ASC;

-- 29.3 Unread notification count per user
CREATE OR REPLACE VIEW v_unread_notification_counts AS
SELECT
    user_id,
    COUNT(*) AS unread_count
FROM notifications
WHERE is_read = FALSE
GROUP BY user_id;

-- ============================================================================
-- 30. OTP CLEANUP FUNCTION (PERIODIC MAINTENANCE)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_cleanup_expired_otps()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM otp_tokens
    WHERE (is_used = TRUE OR expires_at < NOW())
      AND created_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 31. TICKET QR REGENERATION ON TRANSFER
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_regenerate_qr_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
    -- Deactivate old QR codes for prior owner.
    -- A fresh signed QR is generated lazily by application APIs using src/lib/qr.ts.
    UPDATE ticket_qr_codes
    SET is_active = FALSE
    WHERE ticket_id = NEW.ticket_id AND is_active = TRUE;

    -- Update ticket ownership; checked_in_at is reset for safety.
    UPDATE tickets
    SET user_id = NEW.to_user_id,
        checked_in_at = NULL,
        updated_at = NOW()
    WHERE id = NEW.ticket_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_regenerate_qr_on_transfer
    AFTER INSERT ON ticket_transfers
    FOR EACH ROW EXECUTE FUNCTION fn_regenerate_qr_on_transfer();

-- ============================================================================
-- DONE
-- ============================================================================

COMMIT;
