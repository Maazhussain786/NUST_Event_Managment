-- Baseline: exact schema of the live database as of 2026-11-16 (pg_dump --schema-only).
-- Apply only to an EMPTY database. Later changes go in numbered files after this one.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: audit_action_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action_enum AS ENUM (
    'ROLE_ASSIGNED',
    'ROLE_REVOKED',
    'ROLE_UPDATED',
    'PRIVILEGE_GRANTED',
    'PRIVILEGE_REVOKED',
    'SOCIETY_APPROVED',
    'SOCIETY_REJECTED',
    'SOCIETY_DEACTIVATED',
    'SOCIETY_REACTIVATED',
    'WING_CREATED',
    'WING_DELETED',
    'PORTFOLIO_CREATED',
    'PORTFOLIO_DELETED',
    'TICKET_APPROVED',
    'TICKET_REJECTED',
    'PAYMENT_VERIFIED',
    'PAYMENT_REJECTED',
    'QR_SCANNED',
    'QR_REGENERATED',
    'TICKET_TRANSFERRED',
    'CHAT_CREATED',
    'CHAT_UPDATED',
    'CHAT_DELETED',
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'CONTENT_UPLOADED',
    'CONTENT_DELETED',
    'EVENT_CREATED',
    'EVENT_UPDATED',
    'EVENT_CANCELLED',
    'MEDIA_UPLOADED',
    'MEDIA_DELETED',
    'POST_CREATED',
    'POST_UPDATED',
    'POST_DELETED',
    'NOTE_CREATED',
    'NOTE_UPDATED',
    'NOTE_DELETED',
    'MEMBER_SUSPENDED',
    'MEMBER_REACTIVATED',
    'SOCIETY_SUSPENDED',
    'PRESIDENCY_TRANSFERRED',
    'SUPERADMIN_OVERRIDE',
    'EVENT_REGISTERED',
    'EVENT_WAITLISTED',
    'QUOTA_EXCEEDED',
    'STORAGE_DECREMENT',
    'STORAGE_LIMIT_UPDATED',
    'EVENT_DELETED',
    'EVENT_RESTORED',
    'ALBUM_CREATED',
    'ALBUM_UPDATED',
    'ALBUM_DELETED',
    'ALBUM_RESTORED',
    'PHOTO_DELETED',
    'PHOTO_FEATURED',
    'POST_RESTORED',
    'CAPACITY_VIOLATION',
    'EDIT_BLOCKED',
    'STORAGE_ROLLBACK',
    'UPLOAD_FAILED',
    'SOCIETY_INFO_REQUESTED',
    'EVENT_BROADCAST_CREATED',
    'EVENT_BROADCAST_SENT',
    'EVENT_BROADCAST_CANCELLED'
);


--
-- Name: chat_mode_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_mode_enum AS ENUM (
    'OPEN',
    'RESTRICTED',
    'ANNOUNCEMENT_ONLY'
);


--
-- Name: chat_permission_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_permission_type_enum AS ENUM (
    'VIEW_CHAT',
    'SEND_MESSAGE',
    'MANAGE_CHAT'
);


--
-- Name: content_scope_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.content_scope_enum AS ENUM (
    'SOCIETY',
    'WING',
    'PORTFOLIO'
);


--
-- Name: event_media_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_media_type_enum AS ENUM (
    'GALLERY',
    'DOCUMENT'
);


--
-- Name: event_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status_enum AS ENUM (
    'DRAFT',
    'UPCOMING',
    'ONGOING',
    'COMPLETED',
    'ARCHIVED',
    'CANCELLED'
);


--
-- Name: event_visibility_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_visibility_enum AS ENUM (
    'PUBLIC',
    'MEMBERS_ONLY'
);


--
-- Name: payment_proof_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_proof_status_enum AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED'
);


--
-- Name: post_visibility_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_visibility_enum AS ENUM (
    'PUBLIC',
    'MEMBERS_ONLY'
);


--
-- Name: rating_target_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.rating_target_type_enum AS ENUM (
    'EVENT',
    'SOCIETY'
);


--
-- Name: society_media_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.society_media_type_enum AS ENUM (
    'LOGO',
    'COVER',
    'GALLERY'
);


--
-- Name: society_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.society_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'DEACTIVATED',
    'INFO_REQUESTED',
    'SUSPENDED'
);


--
-- Name: ticket_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: user_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status_enum AS ENUM (
    'PENDING_VERIFICATION',
    'ACTIVE',
    'SUSPENDED'
);


--
-- Name: user_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_type_enum AS ENUM (
    'SUPER_ADMIN',
    'STUDENT'
);


--
-- Name: fn_calculate_event_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_calculate_event_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Cancelled events always stay cancelled
    IF NEW.is_cancelled = TRUE THEN
        NEW.status := 'CANCELLED';
        RETURN NEW;
    END IF;

    -- Don't auto-calculate if explicitly set to ARCHIVED
    IF NEW.status = 'ARCHIVED' THEN
        RETURN NEW;
    END IF;

    -- Don't override DRAFT unless dates say otherwise
    IF NEW.status = 'DRAFT' AND TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' THEN
        -- Only auto-promote DRAFT to UPCOMING/ONGOING/COMPLETED if registration_end is set
        -- This allows saving partial events as drafts
        IF NEW.registration_end IS NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Auto-calculate based on dates
    IF NEW.event_end < NOW() THEN
        NEW.status := 'COMPLETED';
    ELSIF NEW.event_start <= NOW() AND NEW.event_end >= NOW() THEN
        NEW.status := 'ONGOING';
    ELSIF NEW.event_start > NOW() THEN
        -- Keep DRAFT on INSERT if no registration_end set
        IF TG_OP = 'INSERT' AND NEW.registration_end IS NULL THEN
            NEW.status := 'DRAFT';
        ELSE
            NEW.status := 'UPCOMING';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_can_manage(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_can_manage(p_user_a uuid, p_user_b uuid, p_society_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_a_level INTEGER;
    v_b_level INTEGER;
    v_a_assigned TIMESTAMPTZ;
    v_b_assigned TIMESTAMPTZ;
    v_society_status TEXT;
BEGIN
    -- Check society exists and is approved
    SELECT status::TEXT INTO v_society_status FROM societies WHERE id = p_society_id;
    IF v_society_status IS NULL OR v_society_status <> 'APPROVED' THEN
        RETURN FALSE;
    END IF;

    -- Get the HIGHEST authority role for user A in this society
    -- Higher hierarchy_level = higher authority (President=10 > Member=1)
    SELECT r.hierarchy_level, sm.assigned_at
    INTO v_a_level, v_a_assigned
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_a
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
      AND sm.suspended_at IS NULL
    ORDER BY r.hierarchy_level DESC, sm.assigned_at ASC
    LIMIT 1;

    -- Get the highest authority role for user B
    SELECT r.hierarchy_level, sm.assigned_at
    INTO v_b_level, v_b_assigned
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.user_id = p_user_b
      AND sm.society_id = p_society_id
      AND sm.is_active = TRUE
      AND sm.suspended_at IS NULL
    ORDER BY r.hierarchy_level DESC, sm.assigned_at ASC
    LIMIT 1;

    -- If either user has no active, non-suspended membership, return FALSE
    IF v_a_level IS NULL OR v_b_level IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Higher number = higher authority
    IF v_a_level > v_b_level THEN
        RETURN TRUE;
    ELSIF v_a_level = v_b_level THEN
        -- Same level: earlier assignment wins (seniority)
        RETURN v_a_assigned < v_b_assigned;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;


--
-- Name: fn_check_ticket_capacity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_ticket_capacity(p_event_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
      DECLARE
        v_max_participants INTEGER;
        v_participants_count INTEGER;
        v_reserved_count INTEGER;
      BEGIN
        SELECT max_participants, participants_count, reserved_count
        INTO v_max_participants, v_participants_count, v_reserved_count
        FROM events
        WHERE id = p_event_id
        FOR UPDATE;

        -- No capacity limit
        IF v_max_participants IS NULL THEN
          RETURN TRUE;
        END IF;

        -- Check if approving one more ticket would exceed capacity
        IF v_participants_count >= v_max_participants THEN
          RETURN FALSE;
        END IF;

        RETURN TRUE;
      END;
      $$;


--
-- Name: fn_cleanup_expired_otps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_cleanup_expired_otps() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM otp_tokens
    WHERE (is_used = TRUE OR expires_at < NOW())
      AND created_at < NOW() - INTERVAL '7 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


--
-- Name: fn_enforce_one_president(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_enforce_one_president() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_role_name TEXT;
    v_existing_count INTEGER;
BEGIN
    -- Skip check if membership is being deactivated
    IF NEW.is_active = FALSE THEN
        RETURN NEW;
    END IF;

    -- Look up the role name
    SELECT name INTO v_role_name FROM roles WHERE id = NEW.role_id;

    -- Only enforce for President role
    IF v_role_name IS DISTINCT FROM 'President' THEN
        RETURN NEW;
    END IF;

    -- Count existing active Presidents for this society
    -- Exclude the current row (handles UPDATE case)
    SELECT COUNT(*) INTO v_existing_count
    FROM society_memberships sm
    JOIN roles r ON r.id = sm.role_id
    WHERE sm.society_id = NEW.society_id
      AND sm.is_active = TRUE
      AND r.name = 'President'
      AND r.is_system_role = TRUE
      AND sm.id IS DISTINCT FROM NEW.id;

    IF v_existing_count > 0 THEN
        RAISE EXCEPTION 
            'PRESIDENT_LIMIT_VIOLATED: Society % already has an active President. '
            'Deactivate the current President before assigning a new one.',
            NEW.society_id
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_enforce_single_use_qr(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_enforce_single_use_qr() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.is_scanned = TRUE AND NEW.is_scanned = TRUE THEN
        RAISE EXCEPTION 'QR code % has already been scanned', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_event_media_storage_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_event_media_storage_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_society_id UUID;
BEGIN
    SELECT society_id INTO v_society_id FROM events WHERE id = OLD.event_id;

    IF v_society_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = v_society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = v_society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = v_society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: fn_has_privilege(uuid, uuid, character varying, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_has_privilege(p_user_id uuid, p_society_id uuid, p_privilege_name character varying, p_wing_id uuid DEFAULT NULL::uuid, p_portfolio_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_has_priv BOOLEAN;
    v_society_status TEXT;
BEGIN
    -- ---------------------------------------------------------------
    -- Step 1: Check society is APPROVED
    -- Even SUPER_ADMIN should not silently operate on deactivated societies
    -- without the application layer being aware. We return TRUE for SA
    -- so the app layer can handle it, but regular users are blocked.
    -- ---------------------------------------------------------------
    SELECT status::TEXT INTO v_society_status
    FROM societies
    WHERE id = p_society_id;

    -- Society doesn't exist
    IF v_society_status IS NULL THEN
        RETURN FALSE;
    END IF;

    -- ---------------------------------------------------------------
    -- Step 2: SUPER_ADMIN bypass
    -- Returns TRUE so application layer can proceed + audit log.
    -- For deactivated societies, SA still gets TRUE — the app layer
    -- must decide whether to allow the action and log it.
    -- ---------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM users 
        WHERE id = p_user_id 
          AND user_type = 'SUPER_ADMIN'
          AND status = 'ACTIVE'
    ) THEN
        RETURN TRUE;
    END IF;

    -- ---------------------------------------------------------------
    -- Step 3: Block if society is not APPROVED (for non-SA users)
    -- ---------------------------------------------------------------
    IF v_society_status <> 'APPROVED' THEN
        RETURN FALSE;
    END IF;

    -- ---------------------------------------------------------------
    -- Step 4: Check privilege via active, non-suspended memberships
    -- with scope containment
    -- ---------------------------------------------------------------
    SELECT EXISTS(
        SELECT 1
        FROM society_memberships sm
        JOIN roles r ON r.id = sm.role_id
        JOIN role_privileges rp ON rp.role_id = r.id
        JOIN privileges p ON p.id = rp.privilege_id
        WHERE sm.user_id = p_user_id
          AND sm.society_id = p_society_id
          AND sm.is_active = TRUE
          AND sm.suspended_at IS NULL          -- not suspended
          AND p.name = p_privilege_name
          -- Scope containment: society > wing > portfolio
          AND (
              -- Society-wide scope: covers everything
              (sm.wing_id IS NULL AND sm.portfolio_id IS NULL)
              OR
              -- Wing scope: matches if target is same wing or any portfolio under it
              (sm.wing_id IS NOT NULL AND sm.portfolio_id IS NULL
               AND (p_wing_id IS NULL OR sm.wing_id = p_wing_id))
              OR
              -- Portfolio scope: matches only exact portfolio
              (sm.portfolio_id IS NOT NULL
               AND sm.wing_id = p_wing_id
               AND sm.portfolio_id = p_portfolio_id)
          )
    ) INTO v_has_priv;

    RETURN v_has_priv;
END;
$$;


--
-- Name: fn_log_society_state_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_log_society_state_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO society_state_changes (society_id, from_status, to_status, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, COALESCE(NEW.approved_by, NEW.created_by));
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_note_attachment_storage_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_note_attachment_storage_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_society_id UUID;
BEGIN
    SELECT e.society_id INTO v_society_id
    FROM event_notes en
    JOIN events e ON e.id = en.event_id
    WHERE en.id = OLD.note_id;

    IF v_society_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = v_society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = v_society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = v_society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: fn_post_attachment_storage_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_attachment_storage_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_society_id UUID;
BEGIN
    SELECT society_id INTO v_society_id FROM posts WHERE id = OLD.post_id;

    IF v_society_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = v_society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = v_society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = v_society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: fn_prevent_otp_reuse(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_prevent_otp_reuse() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.is_used = TRUE THEN
        RAISE EXCEPTION 'OTP % has already been used', OLD.id;
    END IF;
    IF NEW.is_used = TRUE THEN
        NEW.used_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_recalculate_society_storage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_society_storage(p_society_id uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_bytes BIGINT := 0;
    calculated BIGINT;
BEGIN
    -- Society media
    SELECT COALESCE(SUM(file_size_bytes), 0) INTO calculated
    FROM society_media WHERE society_id = p_society_id AND is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Event media (through events)
    SELECT COALESCE(SUM(em.file_size_bytes), 0) INTO calculated
    FROM event_media em
    JOIN events e ON e.id = em.event_id
    WHERE e.society_id = p_society_id AND em.is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Post attachments (through posts)
    SELECT COALESCE(SUM(pa.file_size_bytes), 0) INTO calculated
    FROM post_attachments pa
    JOIN posts p ON p.id = pa.post_id
    WHERE p.society_id = p_society_id AND pa.is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Note attachments (through event_notes -> events)
    SELECT COALESCE(SUM(ena.file_size_bytes), 0) INTO calculated
    FROM event_note_attachments ena
    JOIN event_notes en ON en.id = ena.note_id
    JOIN events e ON e.id = en.event_id
    WHERE e.society_id = p_society_id AND ena.is_deleted = FALSE;
    total_bytes := total_bytes + calculated;

    -- Update the tracked value
    UPDATE society_settings
    SET storage_used_bytes = total_bytes
    WHERE society_id = p_society_id;

    RETURN total_bytes;
END;
$$;


--
-- Name: fn_regenerate_qr_on_transfer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_regenerate_qr_on_transfer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Deactivate old QR codes
    UPDATE ticket_qr_codes
    SET is_active = FALSE
    WHERE ticket_id = NEW.ticket_id AND is_active = TRUE;

    -- Generate new QR code
    INSERT INTO ticket_qr_codes (ticket_id, qr_data, is_active)
    VALUES (NEW.ticket_id, encode(gen_random_bytes(32), 'hex'), TRUE);

    -- Update ticket ownership
    UPDATE tickets
    SET user_id = NEW.to_user_id, updated_at = NOW()
    WHERE id = NEW.ticket_id;

    RETURN NEW;
END;
$$;


--
-- Name: fn_society_media_storage_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_society_media_storage_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.is_deleted IS DISTINCT FROM NEW.is_deleted THEN
        IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
            -- Soft-delete: decrement
            UPDATE society_settings
            SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
            WHERE society_id = OLD.society_id;
        ELSIF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
            -- Restore: increment
            UPDATE society_settings
            SET storage_used_bytes = storage_used_bytes + COALESCE(NEW.file_size_bytes, 0)
            WHERE society_id = NEW.society_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_deleted = FALSE THEN
        -- Hard-delete of active row: decrement
        UPDATE society_settings
        SET storage_used_bytes = GREATEST(0, storage_used_bytes - COALESCE(OLD.file_size_bytes, 0))
        WHERE society_id = OLD.society_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: fn_update_participants_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_participants_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.cancelled_at IS NULL THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- cancelled_at changed from NULL → non-NULL (cancellation)
        IF OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = NEW.event_id;
        -- cancelled_at changed from non-NULL → NULL (re-registration)
        ELSIF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.cancelled_at IS NULL THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = OLD.event_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: fn_update_ticket_participants_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_ticket_participants_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Transitioning TO APPROVED
        IF OLD.status != 'APPROVED' AND NEW.status = 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count + 1
            WHERE id = NEW.event_id;
        -- Transitioning FROM APPROVED
        ELSIF OLD.status = 'APPROVED' AND NEW.status != 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = NEW.event_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'APPROVED' THEN
            UPDATE events SET participants_count = participants_count - 1
            WHERE id = OLD.event_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: fn_update_ticket_reserved_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_ticket_reserved_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          -- New PENDING ticket reserves capacity
          IF NEW.status = 'PENDING' THEN
            UPDATE events SET reserved_count = reserved_count + 1
            WHERE id = NEW.event_id;
          END IF;
          RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE' THEN
          -- Moving TO PENDING
          IF OLD.status != 'PENDING' AND NEW.status = 'PENDING' THEN
            UPDATE events SET reserved_count = reserved_count + 1
            WHERE id = NEW.event_id;
          -- Moving FROM PENDING (to APPROVED, REJECTED, CANCELLED, etc.)
          ELSIF OLD.status = 'PENDING' AND NEW.status != 'PENDING' THEN
            UPDATE events SET reserved_count = GREATEST(0, reserved_count - 1)
            WHERE id = NEW.event_id;
          END IF;
          RETURN NEW;
        END IF;

        IF TG_OP = 'DELETE' THEN
          IF OLD.status = 'PENDING' THEN
            UPDATE events SET reserved_count = GREATEST(0, reserved_count - 1)
            WHERE id = OLD.event_id;
          END IF;
          RETURN OLD;
        END IF;

        RETURN NULL;
      END;
      $$;


--
-- Name: fn_update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: fn_validate_membership_portfolio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_membership_portfolio() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_validate_membership_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_membership_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_validate_membership_wing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_membership_wing() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_validate_post_event_society(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_post_event_society() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_validate_ticket_transfer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_ticket_transfer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: normalize_users_email_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_users_email_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.email := LOWER(BTRIM(NEW.email));
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    qr_code_id uuid NOT NULL,
    scanned_by uuid NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    action public.audit_action_enum NOT NULL,
    performed_by uuid NOT NULL,
    society_id uuid,
    target_type character varying(100),
    target_id uuid,
    old_value jsonb,
    new_value jsonb,
    metadata jsonb,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    chat_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    reply_to_id uuid,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_role_permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    chat_id uuid NOT NULL,
    role_id uuid NOT NULL,
    permission public.chat_permission_type_enum NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    wing_id uuid,
    portfolio_id uuid,
    name character varying(200) NOT NULL,
    description text,
    mode public.chat_mode_enum DEFAULT 'OPEN'::public.chat_mode_enum NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_chat_scope CHECK (((portfolio_id IS NULL) OR (wing_id IS NOT NULL)))
);


--
-- Name: content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    wing_id uuid,
    portfolio_id uuid,
    scope public.content_scope_enum NOT NULL,
    title character varying(300),
    description text,
    file_url text NOT NULL,
    file_type character varying(50),
    file_size_bytes bigint,
    mime_type character varying(100),
    uploaded_by uuid NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_content_scope CHECK ((((scope = 'SOCIETY'::public.content_scope_enum) AND (wing_id IS NULL) AND (portfolio_id IS NULL)) OR ((scope = 'WING'::public.content_scope_enum) AND (wing_id IS NOT NULL) AND (portfolio_id IS NULL)) OR ((scope = 'PORTFOLIO'::public.content_scope_enum) AND (wing_id IS NOT NULL) AND (portfolio_id IS NOT NULL))))
);


--
-- Name: event_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_attendance (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ticket_id uuid,
    registration_id uuid,
    qr_code_id uuid,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_in_by uuid NOT NULL
);


--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_cohosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_cohosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    cohost_type text NOT NULL,
    society_id uuid,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    source_request_id uuid,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_event_cohosts_society_required CHECK ((((cohost_type = 'SOCIETY'::text) AND (society_id IS NOT NULL)) OR ((cohost_type = 'NUST_ADMIN'::text) AND (society_id IS NULL)))),
    CONSTRAINT event_cohosts_cohost_type_check CHECK ((cohost_type = ANY (ARRAY['SOCIETY'::text, 'NUST_ADMIN'::text]))),
    CONSTRAINT event_cohosts_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'REMOVED'::text])))
);


--
-- Name: event_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_media (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    media_type public.event_media_type_enum NOT NULL,
    file_url text NOT NULL,
    file_name character varying(500),
    file_size_bytes bigint,
    mime_type character varying(100) NOT NULL,
    caption text,
    display_order integer DEFAULT 0 NOT NULL,
    uploaded_by uuid NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_event_media_mime CHECK (
CASE
    WHEN (media_type = 'GALLERY'::public.event_media_type_enum) THEN ((mime_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/jpg'::character varying, 'image/png'::character varying, 'image/gif'::character varying, 'image/webp'::character varying])::text[]))
    WHEN (media_type = 'DOCUMENT'::public.event_media_type_enum) THEN ((mime_type)::text = ANY ((ARRAY['application/pdf'::character varying, 'application/msword'::character varying, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::character varying, 'image/jpeg'::character varying, 'image/jpg'::character varying, 'image/png'::character varying])::text[]))
    ELSE false
END),
    CONSTRAINT event_media_file_size_bytes_check CHECK ((file_size_bytes > 0))
);


--
-- Name: event_note_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_note_attachments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    note_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name character varying(500),
    file_size_bytes bigint,
    mime_type character varying(100) NOT NULL,
    uploaded_by uuid NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_note_attachment_mime CHECK (((mime_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/jpg'::character varying, 'image/png'::character varying, 'image/gif'::character varying, 'image/webp'::character varying, 'application/pdf'::character varying, 'application/msword'::character varying, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::character varying])::text[]))),
    CONSTRAINT event_note_attachments_file_size_bytes_check CHECK ((file_size_bytes > 0))
);


--
-- Name: event_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    author_id uuid NOT NULL,
    title character varying(500),
    body text NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_note_body_not_empty CHECK ((length(TRIM(BOTH FROM body)) > 0))
);


--
-- Name: event_push_notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_push_notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id uuid NOT NULL,
    notification_type text NOT NULL,
    trigger_time timestamp with time zone NOT NULL,
    dedupe_key text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatch_status text DEFAULT 'QUEUED'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    last_attempted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    provider_stats jsonb
);


--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_registrations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone
);


--
-- Name: event_update_broadcast_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_update_broadcast_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broadcast_id uuid NOT NULL,
    user_id uuid NOT NULL,
    notification_id uuid,
    push_message_key text,
    push_status text DEFAULT 'QUEUED'::text NOT NULL,
    delivery_status text DEFAULT 'QUEUED'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_update_broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_update_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    society_id uuid NOT NULL,
    event_id uuid NOT NULL,
    created_by uuid NOT NULL,
    update_type text DEFAULT 'GENERAL'::text NOT NULL,
    severity text DEFAULT 'INFO'::text NOT NULL,
    title character varying(300) NOT NULL,
    message text NOT NULL,
    include_push boolean DEFAULT true NOT NULL,
    include_in_app boolean DEFAULT true NOT NULL,
    target_scope text DEFAULT 'ALL_PARTICIPANTS'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    recipient_count integer DEFAULT 0 NOT NULL,
    in_app_delivered_count integer DEFAULT 0 NOT NULL,
    push_token_count integer DEFAULT 0 NOT NULL,
    push_sent_count integer DEFAULT 0 NOT NULL,
    push_failed_count integer DEFAULT 0 NOT NULL,
    last_error text,
    is_automated boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_event_update_broadcast_channel CHECK (((include_push = true) OR (include_in_app = true)))
);


--
-- Name: event_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_waitlist (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    "position" integer NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    promoted_at timestamp with time zone,
    cancelled_at timestamp with time zone
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    wing_id uuid,
    portfolio_id uuid,
    category_id uuid,
    title character varying(300) NOT NULL,
    description text,
    location character varying(500),
    venue_details text,
    is_paid boolean DEFAULT false NOT NULL,
    ticket_price numeric(10,2),
    max_tickets integer,
    event_start timestamp with time zone NOT NULL,
    event_end timestamp with time zone NOT NULL,
    registration_start timestamp with time zone,
    registration_end timestamp with time zone,
    transfer_deadline timestamp with time zone,
    banner_url text,
    is_cancelled boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'APPROVED'::character varying,
    thumbnail_url text,
    visibility public.event_visibility_enum DEFAULT 'PUBLIC'::public.event_visibility_enum NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    registration_link character varying(500),
    max_participants integer,
    participants_count integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    check_in_count integer DEFAULT 0 NOT NULL,
    reserved_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_event_attribution CHECK (((portfolio_id IS NULL) OR (wing_id IS NOT NULL))),
    CONSTRAINT chk_event_dates CHECK ((event_end > event_start)),
    CONSTRAINT events_max_participants_check CHECK ((max_participants >= 1)),
    CONSTRAINT events_max_tickets_check CHECK ((max_tickets > 0)),
    CONSTRAINT events_ticket_price_check CHECK ((ticket_price >= (0)::numeric))
);


--
-- Name: favorite_societies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_societies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    society_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invite_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token character varying(64) NOT NULL,
    society_id uuid NOT NULL,
    wing_id uuid,
    portfolio_id uuid,
    role_name character varying(50) NOT NULL,
    invited_email character varying(255) NOT NULL,
    invited_by uuid NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    accepted_by uuid,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invite_tokens_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACCEPTED'::character varying, 'EXPIRED'::character varying, 'REVOKED'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(300) NOT NULL,
    body text,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nust_schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nust_schools (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    abbreviation character varying(20) NOT NULL,
    full_name character varying(200) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otp_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    otp_code character varying(10) NOT NULL,
    purpose character varying(50) DEFAULT 'EMAIL_VERIFICATION'::character varying NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: payment_proofs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_proofs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    proof_url text NOT NULL,
    proof_type character varying(50),
    status public.payment_proof_status_enum DEFAULT 'PENDING'::public.payment_proof_status_enum NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_blackout_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_blackout_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    scope text DEFAULT 'ALL'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_cohost_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_cohost_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    requesting_society_id uuid NOT NULL,
    host_society_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    reason text,
    admin_note text,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    request_type text DEFAULT 'SOCIETY'::text,
    cohost_society_id uuid,
    decided_at timestamp with time zone,
    CONSTRAINT chk_platform_cohost_requests_request_type CHECK ((request_type = ANY (ARRAY['SOCIETY'::text, 'NUST_ADMIN'::text])))
);


--
-- Name: platform_emergency_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_emergency_flags (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    severity text DEFAULT 'HIGH'::text NOT NULL,
    toggled_by uuid,
    toggled_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_event_controls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_event_controls (
    event_id uuid NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_feature_flags (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    category text DEFAULT 'General'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_incident_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_incident_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incident_id uuid NOT NULL,
    note text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    severity text DEFAULT 'LOW'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    created_by uuid NOT NULL,
    assigned_to uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_notification_reads (
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    priority text DEFAULT 'NORMAL'::text NOT NULL,
    target_type text DEFAULT 'ALL'::text NOT NULL,
    target_id uuid,
    scheduled_at timestamp with time zone,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_system_config (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    value text NOT NULL,
    type text DEFAULT 'string'::text NOT NULL,
    unit text,
    category text DEFAULT 'General'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_university_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_university_events (
    event_id uuid NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    priority_rank integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: portfolios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wing_id uuid NOT NULL,
    society_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    created_by uuid NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_attachments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    post_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name character varying(500),
    file_size_bytes bigint,
    mime_type character varying(100) NOT NULL,
    caption text,
    display_order integer DEFAULT 0 NOT NULL,
    uploaded_by uuid NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_post_attachment_mime CHECK (((mime_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/jpg'::character varying, 'image/png'::character varying, 'image/gif'::character varying, 'image/webp'::character varying, 'application/pdf'::character varying])::text[]))),
    CONSTRAINT post_attachments_file_size_bytes_check CHECK ((file_size_bytes > 0))
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    event_id uuid,
    author_id uuid NOT NULL,
    title character varying(500),
    body text NOT NULL,
    visibility public.post_visibility_enum DEFAULT 'PUBLIC'::public.post_visibility_enum NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_post_body_not_empty CHECK ((length(TRIM(BOTH FROM body)) > 0))
);


--
-- Name: privileges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privileges (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    target_type public.rating_target_type_enum NOT NULL,
    target_id uuid NOT NULL,
    score smallint NOT NULL,
    review_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ratings_score_check CHECK (((score >= 1) AND (score <= 5)))
);


--
-- Name: role_privileges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_privileges (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    role_id uuid NOT NULL,
    privilege_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    hierarchy_level integer NOT NULL,
    is_system_role boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roles_hierarchy_level_check CHECK ((hierarchy_level >= 0))
);


--
-- Name: societies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.societies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    logo_url text,
    status public.society_status_enum DEFAULT 'PENDING'::public.society_status_enum NOT NULL,
    created_by uuid NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    school_id uuid,
    is_nust_wide boolean DEFAULT true NOT NULL,
    contact_number character varying(20),
    president_name character varying(255),
    rejection_reason text,
    supporting_doc_url text,
    faculty_advisor_name character varying(200),
    justification text,
    admin_message text,
    contact_email character varying(200)
);


--
-- Name: society_album_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_album_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    album_id uuid NOT NULL,
    society_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name character varying(255),
    file_size_bytes integer DEFAULT 0,
    mime_type character varying(50),
    caption text,
    is_featured boolean DEFAULT false,
    display_order integer DEFAULT 0,
    uploaded_by uuid NOT NULL,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: society_albums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_albums (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    society_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    category character varying(30) DEFAULT 'GENERAL'::character varying,
    cover_photo_id uuid,
    photo_count integer DEFAULT 0,
    is_deleted boolean DEFAULT false,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT society_albums_category_check CHECK (((category)::text = ANY ((ARRAY['GENERAL'::character varying, 'EVENTS'::character varying, 'ACHIEVEMENTS'::character varying, 'TEAM'::character varying, 'OTHER'::character varying])::text[])))
);


--
-- Name: society_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    society_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    application_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    review_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    interview_scheduled_at timestamp with time zone,
    interview_mode text,
    interview_location text,
    interview_meeting_link text,
    interview_notes text,
    member_notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT society_join_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'INTERVIEW_SCHEDULED'::text, 'APPROVED'::text, 'REJECTED'::text, 'WITHDRAWN'::text])))
);


--
-- Name: society_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_media (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    media_type public.society_media_type_enum NOT NULL,
    file_url text NOT NULL,
    file_name character varying(500),
    file_size_bytes bigint,
    mime_type character varying(100) NOT NULL,
    caption text,
    display_order integer DEFAULT 0 NOT NULL,
    uploaded_by uuid NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_society_media_mime CHECK (((mime_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/jpg'::character varying, 'image/png'::character varying, 'image/gif'::character varying, 'image/webp'::character varying, 'image/svg+xml'::character varying])::text[]))),
    CONSTRAINT society_media_file_size_bytes_check CHECK ((file_size_bytes > 0))
);


--
-- Name: society_member_privilege_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_member_privilege_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    privilege_id uuid NOT NULL,
    is_granted boolean NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: society_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_memberships (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    society_id uuid NOT NULL,
    role_id uuid NOT NULL,
    wing_id uuid,
    portfolio_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    suspended_at timestamp with time zone,
    suspended_by uuid,
    suspension_reason text,
    CONSTRAINT chk_scope_hierarchy CHECK (((portfolio_id IS NULL) OR (wing_id IS NOT NULL))),
    CONSTRAINT chk_suspension_requires_inactive CHECK (((suspended_at IS NULL) OR (is_active = false)))
);


--
-- Name: society_payment_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_payment_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    society_id uuid NOT NULL,
    wallet_type character varying(20) NOT NULL,
    account_title character varying(200) NOT NULL,
    account_number character varying(100),
    iban character varying(50),
    bank_name character varying(150),
    branch_name character varying(150),
    instructions text,
    is_enabled boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_wallet_fields_by_type CHECK (((((wallet_type)::text = ANY ((ARRAY['EASYPAISA'::character varying, 'JAZZCASH'::character varying])::text[])) AND (account_number IS NOT NULL) AND (length(btrim((account_number)::text)) > 0)) OR (((wallet_type)::text = 'BANK'::text) AND (iban IS NOT NULL) AND (length(btrim((iban)::text)) > 0) AND (bank_name IS NOT NULL) AND (length(btrim((bank_name)::text)) > 0)))),
    CONSTRAINT society_payment_wallets_wallet_type_check CHECK (((wallet_type)::text = ANY ((ARRAY['EASYPAISA'::character varying, 'JAZZCASH'::character varying, 'BANK'::character varying])::text[])))
);


--
-- Name: society_post_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_post_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    file_url text NOT NULL,
    file_name character varying(255),
    file_size_bytes integer DEFAULT 0,
    mime_type character varying(50),
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: society_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    society_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text,
    post_type character varying(20) DEFAULT 'TEXT'::character varying,
    shared_event_id uuid,
    is_pinned boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    like_count integer DEFAULT 0,
    comment_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    deleted_by uuid,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT society_posts_post_type_check CHECK (((post_type)::text = ANY ((ARRAY['TEXT'::character varying, 'IMAGE'::character varying, 'GALLERY'::character varying, 'EVENT_SHARE'::character varying])::text[])))
);


--
-- Name: society_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_profiles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    tagline character varying(300),
    cover_url text,
    mission text,
    established_year integer,
    faculty_advisor character varying(200),
    contact_email character varying(200),
    contact_phone character varying(50),
    office_location character varying(300),
    social_links jsonb DEFAULT '{}'::jsonb,
    primary_color character varying(7),
    accent_color character varying(7),
    ticket_footer_text text,
    is_public boolean DEFAULT true NOT NULL,
    member_approval boolean DEFAULT false NOT NULL,
    auto_approve_ticket boolean DEFAULT false NOT NULL,
    pin_announcement text,
    featured_event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT society_profiles_established_year_check CHECK (((established_year >= 1900) AND (established_year <= 2100)))
);


--
-- Name: society_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    society_id uuid NOT NULL,
    event_creation_role character varying(50) DEFAULT 'Vice President'::character varying NOT NULL,
    chat_management_role character varying(50) DEFAULT 'Vice President'::character varying NOT NULL,
    content_upload_role character varying(50) DEFAULT 'Director'::character varying NOT NULL,
    ticketing_enabled boolean DEFAULT true NOT NULL,
    transfer_policy character varying(20) DEFAULT 'ALLOWED'::character varying NOT NULL,
    transfer_deadline_hours integer DEFAULT 24 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_quota_bytes bigint DEFAULT 524288000 NOT NULL,
    storage_used_bytes bigint DEFAULT 0 NOT NULL,
    payment_provider character varying(50),
    payment_recipient_name character varying(200),
    payment_account_number character varying(100),
    payment_iban character varying(100),
    payment_instructions text,
    CONSTRAINT chk_storage_quota_minimum CHECK ((storage_quota_bytes >= 104857600)),
    CONSTRAINT chk_storage_quota_positive CHECK ((storage_quota_bytes > 0)),
    CONSTRAINT chk_storage_used_non_negative CHECK ((storage_used_bytes >= 0)),
    CONSTRAINT society_settings_transfer_policy_check CHECK (((transfer_policy)::text = ANY ((ARRAY['ALLOWED'::character varying, 'RESTRICTED'::character varying, 'DISABLED'::character varying])::text[])))
);


--
-- Name: society_state_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society_state_changes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    from_status public.society_status_enum,
    to_status public.society_status_enum NOT NULL,
    changed_by uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_qr_codes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid,
    qr_data text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_scanned boolean DEFAULT false NOT NULL,
    scanned_at timestamp with time zone,
    scanned_by uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    registration_id uuid,
    CONSTRAINT chk_qr_target_exclusive CHECK ((((ticket_id IS NOT NULL) AND (registration_id IS NULL)) OR ((ticket_id IS NULL) AND (registration_id IS NOT NULL))))
);


--
-- Name: ticket_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_transfers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    transferred_at timestamp with time zone DEFAULT now() NOT NULL,
    transfer_reason text,
    CONSTRAINT chk_no_self_transfer CHECK ((from_user_id <> to_user_id))
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.ticket_status_enum DEFAULT 'PENDING'::public.ticket_status_enum NOT NULL,
    purchased_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_reference uuid DEFAULT public.uuid_generate_v4(),
    checked_in_at timestamp with time zone,
    selected_wallet_id uuid
);


--
-- Name: upload_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    society_id uuid,
    file_url text NOT NULL,
    file_name character varying(500),
    file_size_bytes bigint NOT NULL,
    mime_type character varying(100),
    container_name character varying(100) NOT NULL,
    blob_name character varying(1000) NOT NULL,
    entity_type character varying(50),
    entity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_push_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_push_preferences (
    user_id uuid NOT NULL,
    event_starting_soon boolean DEFAULT true NOT NULL,
    registration_closing_soon boolean DEFAULT true NOT NULL,
    limited_seats_left boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'unknown'::text NOT NULL,
    device_id text,
    app_version text,
    locale text,
    timezone text,
    is_active boolean DEFAULT true NOT NULL,
    invalidated_reason text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(200) NOT NULL,
    user_type public.user_type_enum DEFAULT 'STUDENT'::public.user_type_enum NOT NULL,
    status public.user_status_enum DEFAULT 'PENDING_VERIFICATION'::public.user_status_enum NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_email_lowercase_ck CHECK (((email)::text = lower(btrim((email)::text))))
);


--
-- Name: wings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    society_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    created_by uuid NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_active_memberships; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_memberships AS
 SELECT sm.id AS membership_id,
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
    sm.is_active,
    sm.suspended_at,
    sm.suspended_by,
    sm.suspension_reason
   FROM (((((public.society_memberships sm
     JOIN public.users u ON ((u.id = sm.user_id)))
     JOIN public.societies s ON ((s.id = sm.society_id)))
     JOIN public.roles r ON ((r.id = sm.role_id)))
     LEFT JOIN public.wings w ON ((w.id = sm.wing_id)))
     LEFT JOIN public.portfolios p ON ((p.id = sm.portfolio_id)))
  WHERE (sm.is_active = true);


--
-- Name: v_event_attendance_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_attendance_stats AS
 SELECT id AS event_id,
    title,
    society_id,
    status,
    participants_count,
    ( SELECT count(*) AS count
           FROM public.event_attendance ea
          WHERE (ea.event_id = e.id)) AS checked_in_count,
        CASE
            WHEN (participants_count > 0) THEN round((((( SELECT count(*) AS count
               FROM public.event_attendance ea
              WHERE (ea.event_id = e.id)))::numeric / (participants_count)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS attendance_rate,
        CASE
            WHEN (participants_count > 0) THEN round(((((participants_count - ( SELECT count(*) AS count
               FROM public.event_attendance ea
              WHERE (ea.event_id = e.id))))::numeric / (participants_count)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS no_show_rate
   FROM public.events e;


--
-- Name: v_event_gallery; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_gallery AS
 SELECT em.id,
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
   FROM ((public.event_media em
     JOIN public.events e ON ((e.id = em.event_id)))
     JOIN public.users u ON ((u.id = em.uploaded_by)))
  WHERE (em.is_deleted = false)
  ORDER BY em.display_order, em.created_at DESC;


--
-- Name: v_event_registration_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_registration_stats AS
 SELECT id AS event_id,
    title,
    society_id,
    status,
    max_participants,
    participants_count,
        CASE
            WHEN (max_participants IS NOT NULL) THEN round((((participants_count)::numeric / (max_participants)::numeric) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS fill_percentage,
    ( SELECT count(*) AS count
           FROM public.event_waitlist w
          WHERE ((w.event_id = e.id) AND (w.cancelled_at IS NULL) AND (w.promoted_at IS NULL))) AS waitlist_count
   FROM public.events e;


--
-- Name: v_event_revenue; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_revenue AS
 SELECT e.id AS event_id,
    e.title,
    e.society_id,
    e.ticket_price,
    count(t.id) FILTER (WHERE (t.status = 'APPROVED'::public.ticket_status_enum)) AS approved_tickets,
    count(t.id) FILTER (WHERE (t.status = 'PENDING'::public.ticket_status_enum)) AS pending_tickets,
    count(t.id) FILTER (WHERE (t.status = 'CANCELLED'::public.ticket_status_enum)) AS cancelled_tickets,
    count(t.id) FILTER (WHERE (t.status = 'REJECTED'::public.ticket_status_enum)) AS rejected_tickets,
    COALESCE(sum(e.ticket_price) FILTER (WHERE (t.status = 'APPROVED'::public.ticket_status_enum)), (0)::numeric) AS total_revenue,
    ( SELECT count(*) AS count
           FROM public.event_attendance ea
          WHERE (ea.event_id = e.id)) AS checked_in_count
   FROM (public.events e
     LEFT JOIN public.tickets t ON ((t.event_id = e.id)))
  WHERE (e.is_paid = true)
  GROUP BY e.id, e.title, e.society_id, e.ticket_price;


--
-- Name: v_society_event_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_society_event_stats AS
 SELECT e.society_id,
    s.name AS society_name,
    count(DISTINCT e.id) AS total_events,
    count(DISTINCT e.id) FILTER (WHERE ((e.status)::text = 'UPCOMING'::text)) AS upcoming_events,
    count(DISTINCT e.id) FILTER (WHERE ((e.status)::text = 'ONGOING'::text)) AS ongoing_events,
    count(DISTINCT e.id) FILTER (WHERE ((e.status)::text = 'COMPLETED'::text)) AS completed_events,
    count(DISTINCT e.id) FILTER (WHERE ((e.status)::text = 'CANCELLED'::text)) AS cancelled_events,
    sum(e.participants_count) AS total_registrations
   FROM (public.events e
     JOIN public.societies s ON ((s.id = e.society_id)))
  GROUP BY e.society_id, s.name;


--
-- Name: v_society_gallery; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_society_gallery AS
 SELECT sm.id,
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
   FROM ((public.society_media sm
     JOIN public.societies s ON ((s.id = sm.society_id)))
     JOIN public.users u ON ((u.id = sm.uploaded_by)))
  WHERE (sm.is_deleted = false)
  ORDER BY sm.display_order, sm.created_at DESC;


--
-- Name: v_society_member_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_society_member_stats AS
 SELECT sm.society_id,
    s.name AS society_name,
    count(*) FILTER (WHERE ((sm.is_active = true) AND (sm.suspended_at IS NULL))) AS active_members,
    count(*) FILTER (WHERE ((sm.is_active = true) AND (sm.suspended_at IS NOT NULL))) AS suspended_members,
    count(*) FILTER (WHERE (sm.is_active = false)) AS inactive_members,
    count(*) AS total_members
   FROM (public.society_memberships sm
     JOIN public.societies s ON ((s.id = sm.society_id)))
  GROUP BY sm.society_id, s.name;


--
-- Name: v_society_posts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_society_posts AS
 SELECT p.id,
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
    ( SELECT count(*) AS count
           FROM public.post_attachments pa
          WHERE ((pa.post_id = p.id) AND (pa.is_deleted = false))) AS attachment_count
   FROM ((public.posts p
     JOIN public.users u ON ((u.id = p.author_id)))
     LEFT JOIN public.events e ON ((e.id = p.event_id)))
  WHERE (p.is_deleted = false)
  ORDER BY p.is_pinned DESC, p.created_at DESC;


--
-- Name: v_society_storage_usage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_society_storage_usage AS
 SELECT s.id AS society_id,
    s.name AS society_name,
    s.status AS society_status,
    COALESCE(ss.storage_used_bytes, (0)::bigint) AS storage_used_bytes,
    round(((COALESCE(ss.storage_used_bytes, (0)::bigint))::numeric / ((1024 * 1024))::numeric), 2) AS storage_used_mb,
    COALESCE(ss.storage_quota_bytes, (524288000)::bigint) AS storage_quota_bytes,
    round(((COALESCE(ss.storage_quota_bytes, (524288000)::bigint))::numeric / ((1024 * 1024))::numeric), 2) AS storage_limit_mb,
        CASE
            WHEN (COALESCE(ss.storage_quota_bytes, (524288000)::bigint) > 0) THEN round((((COALESCE(ss.storage_used_bytes, (0)::bigint))::numeric / (COALESCE(ss.storage_quota_bytes, (524288000)::bigint))::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS percent_used
   FROM (public.societies s
     LEFT JOIN public.society_settings ss ON ((ss.society_id = s.id)));


--
-- Name: v_unread_notification_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_unread_notification_counts AS
 SELECT user_id,
    count(*) AS unread_count
   FROM public.notifications
  WHERE (is_read = false)
  GROUP BY user_id;


--
-- Name: v_upcoming_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_upcoming_events AS
 SELECT e.id,
    e.society_id,
    e.wing_id,
    e.portfolio_id,
    e.category_id,
    e.title,
    e.description,
    e.location,
    e.venue_details,
    e.is_paid,
    e.ticket_price,
    e.max_tickets,
    e.event_start,
    e.event_end,
    e.registration_start,
    e.registration_end,
    e.transfer_deadline,
    e.banner_url,
    e.is_cancelled,
    e.created_by,
    e.created_at,
    e.updated_at,
    s.name AS society_name,
    w.name AS wing_name,
    p.name AS portfolio_name,
    ec.name AS category_name,
    ( SELECT count(*) AS count
           FROM public.tickets t
          WHERE ((t.event_id = e.id) AND (t.status = 'APPROVED'::public.ticket_status_enum))) AS tickets_sold
   FROM ((((public.events e
     JOIN public.societies s ON ((s.id = e.society_id)))
     LEFT JOIN public.wings w ON ((w.id = e.wing_id)))
     LEFT JOIN public.portfolios p ON ((p.id = e.portfolio_id)))
     LEFT JOIN public.event_categories ec ON ((ec.id = e.category_id)))
  WHERE ((e.event_start > now()) AND (e.is_cancelled = false) AND (s.status = 'APPROVED'::public.society_status_enum))
  ORDER BY e.event_start;


--
-- Name: attendance attendance_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_role_permissions chat_role_permissions_chat_id_role_id_permission_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_role_permissions
    ADD CONSTRAINT chat_role_permissions_chat_id_role_id_permission_key UNIQUE (chat_id, role_id, permission);


--
-- Name: chat_role_permissions chat_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_role_permissions
    ADD CONSTRAINT chat_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (id);


--
-- Name: content content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content
    ADD CONSTRAINT content_pkey PRIMARY KEY (id);


--
-- Name: event_attendance event_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_name_key UNIQUE (name);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: event_cohosts event_cohosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_pkey PRIMARY KEY (id);


--
-- Name: event_media event_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_media
    ADD CONSTRAINT event_media_pkey PRIMARY KEY (id);


--
-- Name: event_note_attachments event_note_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_note_attachments
    ADD CONSTRAINT event_note_attachments_pkey PRIMARY KEY (id);


--
-- Name: event_notes event_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notes
    ADD CONSTRAINT event_notes_pkey PRIMARY KEY (id);


--
-- Name: event_push_notification_log event_push_notification_log_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_push_notification_log
    ADD CONSTRAINT event_push_notification_log_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: event_push_notification_log event_push_notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_push_notification_log
    ADD CONSTRAINT event_push_notification_log_pkey PRIMARY KEY (id);


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);


--
-- Name: event_update_broadcast_recipients event_update_broadcast_recipients_broadcast_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcast_recipients
    ADD CONSTRAINT event_update_broadcast_recipients_broadcast_id_user_id_key UNIQUE (broadcast_id, user_id);


--
-- Name: event_update_broadcast_recipients event_update_broadcast_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcast_recipients
    ADD CONSTRAINT event_update_broadcast_recipients_pkey PRIMARY KEY (id);


--
-- Name: event_update_broadcasts event_update_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcasts
    ADD CONSTRAINT event_update_broadcasts_pkey PRIMARY KEY (id);


--
-- Name: event_waitlist event_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_waitlist
    ADD CONSTRAINT event_waitlist_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: favorite_societies favorite_societies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_societies
    ADD CONSTRAINT favorite_societies_pkey PRIMARY KEY (id);


--
-- Name: favorite_societies favorite_societies_user_id_society_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_societies
    ADD CONSTRAINT favorite_societies_user_id_society_id_key UNIQUE (user_id, society_id);


--
-- Name: invite_tokens invite_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);


--
-- Name: invite_tokens invite_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_token_key UNIQUE (token);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nust_schools nust_schools_abbreviation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nust_schools
    ADD CONSTRAINT nust_schools_abbreviation_key UNIQUE (abbreviation);


--
-- Name: nust_schools nust_schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nust_schools
    ADD CONSTRAINT nust_schools_pkey PRIMARY KEY (id);


--
-- Name: otp_tokens otp_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_tokens
    ADD CONSTRAINT otp_tokens_pkey PRIMARY KEY (id);


--
-- Name: payment_proofs payment_proofs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_pkey PRIMARY KEY (id);


--
-- Name: platform_blackout_dates platform_blackout_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_blackout_dates
    ADD CONSTRAINT platform_blackout_dates_pkey PRIMARY KEY (id);


--
-- Name: platform_cohost_requests platform_cohost_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_pkey PRIMARY KEY (id);


--
-- Name: platform_emergency_flags platform_emergency_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_emergency_flags
    ADD CONSTRAINT platform_emergency_flags_pkey PRIMARY KEY (key);


--
-- Name: platform_event_controls platform_event_controls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_event_controls
    ADD CONSTRAINT platform_event_controls_pkey PRIMARY KEY (event_id);


--
-- Name: platform_feature_flags platform_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_feature_flags
    ADD CONSTRAINT platform_feature_flags_pkey PRIMARY KEY (key);


--
-- Name: platform_incident_notes platform_incident_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_incident_notes
    ADD CONSTRAINT platform_incident_notes_pkey PRIMARY KEY (id);


--
-- Name: platform_incidents platform_incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_incidents
    ADD CONSTRAINT platform_incidents_pkey PRIMARY KEY (id);


--
-- Name: platform_notification_reads platform_notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_notification_reads
    ADD CONSTRAINT platform_notification_reads_pkey PRIMARY KEY (notification_id, user_id);


--
-- Name: platform_notifications platform_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_notifications
    ADD CONSTRAINT platform_notifications_pkey PRIMARY KEY (id);


--
-- Name: platform_system_config platform_system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_system_config
    ADD CONSTRAINT platform_system_config_pkey PRIMARY KEY (key);


--
-- Name: platform_university_events platform_university_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_university_events
    ADD CONSTRAINT platform_university_events_pkey PRIMARY KEY (event_id);


--
-- Name: portfolios portfolios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_pkey PRIMARY KEY (id);


--
-- Name: post_attachments post_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_attachments
    ADD CONSTRAINT post_attachments_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: privileges privileges_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privileges
    ADD CONSTRAINT privileges_name_key UNIQUE (name);


--
-- Name: privileges privileges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privileges
    ADD CONSTRAINT privileges_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_user_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_target_type_target_id_key UNIQUE (user_id, target_type, target_id);


--
-- Name: role_privileges role_privileges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_privileges
    ADD CONSTRAINT role_privileges_pkey PRIMARY KEY (id);


--
-- Name: role_privileges role_privileges_role_id_privilege_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_privileges
    ADD CONSTRAINT role_privileges_role_id_privilege_id_key UNIQUE (role_id, privilege_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: societies societies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.societies
    ADD CONSTRAINT societies_pkey PRIMARY KEY (id);


--
-- Name: society_album_photos society_album_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_album_photos
    ADD CONSTRAINT society_album_photos_pkey PRIMARY KEY (id);


--
-- Name: society_albums society_albums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_albums
    ADD CONSTRAINT society_albums_pkey PRIMARY KEY (id);


--
-- Name: society_join_requests society_join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_join_requests
    ADD CONSTRAINT society_join_requests_pkey PRIMARY KEY (id);


--
-- Name: society_media society_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_media
    ADD CONSTRAINT society_media_pkey PRIMARY KEY (id);


--
-- Name: society_member_privilege_overrides society_member_privilege_overrid_membership_id_privilege_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_member_privilege_overrides
    ADD CONSTRAINT society_member_privilege_overrid_membership_id_privilege_id_key UNIQUE (membership_id, privilege_id);


--
-- Name: society_member_privilege_overrides society_member_privilege_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_member_privilege_overrides
    ADD CONSTRAINT society_member_privilege_overrides_pkey PRIMARY KEY (id);


--
-- Name: society_memberships society_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_pkey PRIMARY KEY (id);


--
-- Name: society_payment_wallets society_payment_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_payment_wallets
    ADD CONSTRAINT society_payment_wallets_pkey PRIMARY KEY (id);


--
-- Name: society_post_images society_post_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_post_images
    ADD CONSTRAINT society_post_images_pkey PRIMARY KEY (id);


--
-- Name: society_posts society_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_posts
    ADD CONSTRAINT society_posts_pkey PRIMARY KEY (id);


--
-- Name: society_profiles society_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_profiles
    ADD CONSTRAINT society_profiles_pkey PRIMARY KEY (id);


--
-- Name: society_profiles society_profiles_society_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_profiles
    ADD CONSTRAINT society_profiles_society_id_key UNIQUE (society_id);


--
-- Name: society_settings society_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_settings
    ADD CONSTRAINT society_settings_pkey PRIMARY KEY (id);


--
-- Name: society_settings society_settings_society_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_settings
    ADD CONSTRAINT society_settings_society_id_key UNIQUE (society_id);


--
-- Name: society_state_changes society_state_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_state_changes
    ADD CONSTRAINT society_state_changes_pkey PRIMARY KEY (id);


--
-- Name: ticket_qr_codes ticket_qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_qr_codes
    ADD CONSTRAINT ticket_qr_codes_pkey PRIMARY KEY (id);


--
-- Name: ticket_qr_codes ticket_qr_codes_qr_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_qr_codes
    ADD CONSTRAINT ticket_qr_codes_qr_data_key UNIQUE (qr_data);


--
-- Name: ticket_transfers ticket_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_payment_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_payment_reference_key UNIQUE (payment_reference);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: upload_logs upload_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_logs
    ADD CONSTRAINT upload_logs_pkey PRIMARY KEY (id);


--
-- Name: event_attendance uq_attendance_event_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT uq_attendance_event_user UNIQUE (event_id, user_id);


--
-- Name: event_registrations uq_event_registration; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT uq_event_registration UNIQUE (event_id, user_id);


--
-- Name: tickets uq_ticket_event_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT uq_ticket_event_user UNIQUE (event_id, user_id);


--
-- Name: event_waitlist uq_waitlist_entry; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_waitlist
    ADD CONSTRAINT uq_waitlist_entry UNIQUE (event_id, user_id);


--
-- Name: user_push_preferences user_push_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_preferences
    ADD CONSTRAINT user_push_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_push_tokens user_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_push_tokens user_push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_token_key UNIQUE (token);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wings wings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wings
    ADD CONSTRAINT wings_pkey PRIMARY KEY (id);


--
-- Name: idx_album_photos_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_album_photos_active ON public.society_album_photos USING btree (album_id) WHERE ((deleted_at IS NULL) AND (is_deleted = false));


--
-- Name: idx_album_photos_album; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_album_photos_album ON public.society_album_photos USING btree (album_id, display_order) WHERE (is_deleted = false);


--
-- Name: idx_albums_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_albums_active ON public.society_albums USING btree (society_id) WHERE ((deleted_at IS NULL) AND (is_deleted = false));


--
-- Name: idx_attendance_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_event ON public.attendance USING btree (event_id);


--
-- Name: idx_attendance_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_user ON public.attendance USING btree (user_id);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created_desc ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_performed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_performed_by ON public.audit_logs USING btree (performed_by);


--
-- Name: idx_audit_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_society ON public.audit_logs USING btree (society_id);


--
-- Name: idx_audit_society_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_society_created ON public.audit_logs USING btree (society_id, created_at DESC);


--
-- Name: idx_audit_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_target ON public.audit_logs USING btree (target_type, target_id);


--
-- Name: idx_chat_perms_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_perms_chat ON public.chat_role_permissions USING btree (chat_id);


--
-- Name: idx_chat_perms_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_perms_role ON public.chat_role_permissions USING btree (role_id);


--
-- Name: idx_chats_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_active ON public.chats USING btree (is_active);


--
-- Name: idx_chats_portfolio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_portfolio ON public.chats USING btree (portfolio_id);


--
-- Name: idx_chats_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_society ON public.chats USING btree (society_id);


--
-- Name: idx_chats_wing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_wing ON public.chats USING btree (wing_id);


--
-- Name: idx_content_portfolio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_portfolio ON public.content USING btree (portfolio_id);


--
-- Name: idx_content_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_scope ON public.content USING btree (scope);


--
-- Name: idx_content_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_society ON public.content USING btree (society_id);


--
-- Name: idx_content_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_uploaded_by ON public.content USING btree (uploaded_by);


--
-- Name: idx_content_wing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_wing ON public.content USING btree (wing_id);


--
-- Name: idx_event_attendance_checkin_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_attendance_checkin_by ON public.event_attendance USING btree (checked_in_by);


--
-- Name: idx_event_attendance_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_attendance_event ON public.event_attendance USING btree (event_id);


--
-- Name: idx_event_attendance_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_attendance_user ON public.event_attendance USING btree (user_id);


--
-- Name: idx_event_cohosts_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_event_id ON public.event_cohosts USING btree (event_id);


--
-- Name: idx_event_cohosts_society_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_society_id ON public.event_cohosts USING btree (society_id, cohost_type, status);


--
-- Name: idx_event_media_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_media_active ON public.event_media USING btree (event_id, media_type) WHERE (is_deleted = false);


--
-- Name: idx_event_media_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_media_event ON public.event_media USING btree (event_id);


--
-- Name: idx_event_media_gallery_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_media_gallery_order ON public.event_media USING btree (event_id, display_order) WHERE ((media_type = 'GALLERY'::public.event_media_type_enum) AND (is_deleted = false));


--
-- Name: idx_event_media_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_media_type ON public.event_media USING btree (event_id, media_type);


--
-- Name: idx_event_media_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_media_uploaded_by ON public.event_media USING btree (uploaded_by);


--
-- Name: idx_event_notes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notes_active ON public.event_notes USING btree (event_id, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_event_notes_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notes_author ON public.event_notes USING btree (author_id);


--
-- Name: idx_event_notes_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_notes_event ON public.event_notes USING btree (event_id);


--
-- Name: idx_event_push_notification_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_push_notification_lookup ON public.event_push_notification_log USING btree (user_id, event_id, notification_type, trigger_time);


--
-- Name: idx_event_push_notification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_push_notification_status ON public.event_push_notification_log USING btree (dispatch_status, created_at DESC);


--
-- Name: idx_event_registrations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_registrations_active ON public.event_registrations USING btree (event_id) WHERE (cancelled_at IS NULL);


--
-- Name: idx_event_registrations_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_registrations_event ON public.event_registrations USING btree (event_id);


--
-- Name: idx_event_registrations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_registrations_user ON public.event_registrations USING btree (user_id);


--
-- Name: idx_event_update_broadcast_recipients_broadcast; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_update_broadcast_recipients_broadcast ON public.event_update_broadcast_recipients USING btree (broadcast_id);


--
-- Name: idx_event_update_broadcast_recipients_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_update_broadcast_recipients_user ON public.event_update_broadcast_recipients USING btree (user_id, created_at DESC);


--
-- Name: idx_event_update_broadcasts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_update_broadcasts_event ON public.event_update_broadcasts USING btree (event_id, created_at DESC);


--
-- Name: idx_event_update_broadcasts_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_update_broadcasts_society ON public.event_update_broadcasts USING btree (society_id, created_at DESC);


--
-- Name: idx_event_update_broadcasts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_update_broadcasts_status ON public.event_update_broadcasts USING btree (status, scheduled_at, created_at DESC);


--
-- Name: idx_events_active_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_active_status ON public.events USING btree (status) WHERE (is_cancelled = false);


--
-- Name: idx_events_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_category ON public.events USING btree (category_id);


--
-- Name: idx_events_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_end ON public.events USING btree (event_end);


--
-- Name: idx_events_is_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_is_paid ON public.events USING btree (is_paid);


--
-- Name: idx_events_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_location ON public.events USING btree (location);


--
-- Name: idx_events_not_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_not_deleted ON public.events USING btree (society_id) WHERE ((deleted_at IS NULL) AND (is_cancelled = false));


--
-- Name: idx_events_portfolio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_portfolio ON public.events USING btree (portfolio_id);


--
-- Name: idx_events_registration_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_registration_end ON public.events USING btree (registration_end);


--
-- Name: idx_events_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_society ON public.events USING btree (society_id);


--
-- Name: idx_events_society_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_society_start ON public.events USING btree (society_id, event_start);


--
-- Name: idx_events_society_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_society_status ON public.events USING btree (society_id, status);


--
-- Name: idx_events_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_start ON public.events USING btree (event_start);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_upcoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_upcoming ON public.events USING btree (event_start) WHERE (is_cancelled = false);


--
-- Name: idx_events_wing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_wing ON public.events USING btree (wing_id);


--
-- Name: idx_favorites_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_society ON public.favorite_societies USING btree (society_id);


--
-- Name: idx_favorites_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorites_user ON public.favorite_societies USING btree (user_id);


--
-- Name: idx_invite_tokens_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invite_tokens_email ON public.invite_tokens USING btree (invited_email);


--
-- Name: idx_invite_tokens_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invite_tokens_society ON public.invite_tokens USING btree (society_id);


--
-- Name: idx_invite_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invite_tokens_token ON public.invite_tokens USING btree (token);


--
-- Name: idx_join_requests_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_join_requests_society ON public.society_join_requests USING btree (society_id, status, created_at DESC);


--
-- Name: idx_join_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_join_requests_user ON public.society_join_requests USING btree (user_id, created_at DESC);


--
-- Name: idx_memberships_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_active ON public.society_memberships USING btree (society_id, user_id) WHERE ((is_active = true) AND (suspended_at IS NULL));


--
-- Name: idx_memberships_assigned_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_assigned_at ON public.society_memberships USING btree (assigned_at);


--
-- Name: idx_memberships_portfolio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_portfolio ON public.society_memberships USING btree (portfolio_id);


--
-- Name: idx_memberships_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_role ON public.society_memberships USING btree (role_id);


--
-- Name: idx_memberships_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_society ON public.society_memberships USING btree (society_id);


--
-- Name: idx_memberships_society_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_society_active ON public.society_memberships USING btree (society_id) WHERE (is_active = true);


--
-- Name: idx_memberships_suspended; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_suspended ON public.society_memberships USING btree (society_id, suspended_at) WHERE (suspended_at IS NOT NULL);


--
-- Name: idx_memberships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_user ON public.society_memberships USING btree (user_id);


--
-- Name: idx_memberships_wing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_wing ON public.society_memberships USING btree (wing_id);


--
-- Name: idx_messages_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_chat ON public.chat_messages USING btree (chat_id);


--
-- Name: idx_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created ON public.chat_messages USING btree (chat_id, created_at);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.chat_messages USING btree (sender_id);


--
-- Name: idx_note_attachments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_attachments_active ON public.event_note_attachments USING btree (note_id) WHERE (is_deleted = false);


--
-- Name: idx_note_attachments_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_attachments_note ON public.event_note_attachments USING btree (note_id);


--
-- Name: idx_note_attachments_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_attachments_uploaded_by ON public.event_note_attachments USING btree (uploaded_by);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_one_active_qr_per_registration; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_qr_per_registration ON public.ticket_qr_codes USING btree (registration_id) WHERE ((is_active = true) AND (registration_id IS NOT NULL));


--
-- Name: idx_one_active_qr_per_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_qr_per_ticket ON public.ticket_qr_codes USING btree (ticket_id) WHERE (is_active = true);


--
-- Name: idx_one_verified_proof_per_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_verified_proof_per_ticket ON public.payment_proofs USING btree (ticket_id) WHERE (status = 'VERIFIED'::public.payment_proof_status_enum);


--
-- Name: idx_otp_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_cleanup ON public.otp_tokens USING btree (is_used, expires_at);


--
-- Name: idx_otp_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_expires_at ON public.otp_tokens USING btree (expires_at);


--
-- Name: idx_otp_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_user_id ON public.otp_tokens USING btree (user_id);


--
-- Name: idx_payment_proofs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_proofs_status ON public.payment_proofs USING btree (status);


--
-- Name: idx_payment_proofs_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_proofs_ticket ON public.payment_proofs USING btree (ticket_id);


--
-- Name: idx_platform_cohost_requests_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_cohost_requests_event_status ON public.platform_cohost_requests USING btree (event_id, status);


--
-- Name: idx_platform_cohost_requests_request_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_cohost_requests_request_type ON public.platform_cohost_requests USING btree (request_type);


--
-- Name: idx_portfolios_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolios_deleted_at ON public.portfolios USING btree (deleted_at);


--
-- Name: idx_portfolios_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolios_society ON public.portfolios USING btree (society_id);


--
-- Name: idx_portfolios_unique_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_portfolios_unique_name ON public.portfolios USING btree (wing_id, name) WHERE (deleted_at IS NULL);


--
-- Name: idx_portfolios_wing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolios_wing ON public.portfolios USING btree (wing_id);


--
-- Name: idx_post_attachments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_attachments_active ON public.post_attachments USING btree (post_id, display_order) WHERE (is_deleted = false);


--
-- Name: idx_post_attachments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_attachments_post ON public.post_attachments USING btree (post_id);


--
-- Name: idx_post_attachments_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_attachments_uploaded_by ON public.post_attachments USING btree (uploaded_by);


--
-- Name: idx_post_images_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_images_post ON public.society_post_images USING btree (post_id, display_order);


--
-- Name: idx_posts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_active ON public.posts USING btree (society_id, is_deleted) WHERE (is_deleted = false);


--
-- Name: idx_posts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author ON public.posts USING btree (author_id);


--
-- Name: idx_posts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_event ON public.posts USING btree (event_id);


--
-- Name: idx_posts_event_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_event_feed ON public.posts USING btree (event_id, created_at DESC) WHERE ((is_deleted = false) AND (event_id IS NOT NULL));


--
-- Name: idx_posts_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_society ON public.posts USING btree (society_id);


--
-- Name: idx_posts_society_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_society_feed ON public.posts USING btree (society_id, is_pinned DESC, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_qr_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_active ON public.ticket_qr_codes USING btree (ticket_id, is_active);


--
-- Name: idx_qr_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_data ON public.ticket_qr_codes USING btree (qr_data);


--
-- Name: idx_qr_registration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_registration ON public.ticket_qr_codes USING btree (registration_id) WHERE (registration_id IS NOT NULL);


--
-- Name: idx_qr_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_ticket ON public.ticket_qr_codes USING btree (ticket_id);


--
-- Name: idx_ratings_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_target ON public.ratings USING btree (target_type, target_id);


--
-- Name: idx_ratings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_user ON public.ratings USING btree (user_id);


--
-- Name: idx_role_privileges_privilege; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_privileges_privilege ON public.role_privileges USING btree (privilege_id);


--
-- Name: idx_role_privileges_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_privileges_role ON public.role_privileges USING btree (role_id);


--
-- Name: idx_roles_hierarchy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_hierarchy ON public.roles USING btree (society_id, hierarchy_level);


--
-- Name: idx_roles_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_society ON public.roles USING btree (society_id);


--
-- Name: idx_roles_unique_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_roles_unique_name ON public.roles USING btree (society_id, name);


--
-- Name: idx_smpo_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smpo_membership ON public.society_member_privilege_overrides USING btree (membership_id);


--
-- Name: idx_smpo_privilege; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smpo_privilege ON public.society_member_privilege_overrides USING btree (privilege_id);


--
-- Name: idx_societies_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_societies_created_by ON public.societies USING btree (created_by);


--
-- Name: idx_societies_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_societies_deleted_at ON public.societies USING btree (deleted_at);


--
-- Name: idx_societies_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_societies_school ON public.societies USING btree (school_id);


--
-- Name: idx_societies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_societies_status ON public.societies USING btree (status);


--
-- Name: idx_society_albums_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_albums_society ON public.society_albums USING btree (society_id) WHERE (is_deleted = false);


--
-- Name: idx_society_media_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_media_active ON public.society_media USING btree (society_id, media_type) WHERE (is_deleted = false);


--
-- Name: idx_society_media_gallery_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_media_gallery_order ON public.society_media USING btree (society_id, display_order) WHERE ((media_type = 'GALLERY'::public.society_media_type_enum) AND (is_deleted = false));


--
-- Name: idx_society_media_one_cover; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_society_media_one_cover ON public.society_media USING btree (society_id) WHERE ((media_type = 'COVER'::public.society_media_type_enum) AND (is_deleted = false));


--
-- Name: idx_society_media_one_logo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_society_media_one_logo ON public.society_media USING btree (society_id) WHERE ((media_type = 'LOGO'::public.society_media_type_enum) AND (is_deleted = false));


--
-- Name: idx_society_media_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_media_society ON public.society_media USING btree (society_id);


--
-- Name: idx_society_media_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_media_type ON public.society_media USING btree (society_id, media_type);


--
-- Name: idx_society_media_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_media_uploaded_by ON public.society_media USING btree (uploaded_by);


--
-- Name: idx_society_payment_wallets_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_payment_wallets_enabled ON public.society_payment_wallets USING btree (society_id, is_enabled);


--
-- Name: idx_society_payment_wallets_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_payment_wallets_society ON public.society_payment_wallets USING btree (society_id);


--
-- Name: idx_society_posts_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_posts_pinned ON public.society_posts USING btree (society_id) WHERE ((is_pinned = true) AND (is_deleted = false));


--
-- Name: idx_society_posts_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_posts_society ON public.society_posts USING btree (society_id, created_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_society_profiles_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_profiles_society ON public.society_profiles USING btree (society_id);


--
-- Name: idx_society_settings_quota; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_settings_quota ON public.society_settings USING btree (society_id, storage_used_bytes);


--
-- Name: idx_society_state_changed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_state_changed_by ON public.society_state_changes USING btree (changed_by);


--
-- Name: idx_society_state_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_society_state_society ON public.society_state_changes USING btree (society_id);


--
-- Name: idx_tickets_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_event ON public.tickets USING btree (event_id);


--
-- Name: idx_tickets_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_event_status ON public.tickets USING btree (event_id, status);


--
-- Name: idx_tickets_payment_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_payment_ref ON public.tickets USING btree (payment_reference);


--
-- Name: idx_tickets_selected_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_selected_wallet ON public.tickets USING btree (selected_wallet_id);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);


--
-- Name: idx_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_user ON public.tickets USING btree (user_id);


--
-- Name: idx_transfers_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_from ON public.ticket_transfers USING btree (from_user_id);


--
-- Name: idx_transfers_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_ticket ON public.ticket_transfers USING btree (ticket_id);


--
-- Name: idx_transfers_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_to ON public.ticket_transfers USING btree (to_user_id);


--
-- Name: idx_unique_role_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_role_assignment ON public.society_memberships USING btree (user_id, society_id, COALESCE(wing_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(portfolio_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (is_active = true);


--
-- Name: idx_upload_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_logs_created ON public.upload_logs USING btree (created_at);


--
-- Name: idx_upload_logs_society_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_logs_society_time ON public.upload_logs USING btree (society_id, created_at DESC);


--
-- Name: idx_upload_logs_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_logs_user_time ON public.upload_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_user_push_tokens_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_push_tokens_user_active ON public.user_push_tokens USING btree (user_id, is_active);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email_lower_unique ON public.users USING btree (lower(btrim((email)::text)));


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_user_type ON public.users USING btree (user_type);


--
-- Name: idx_waitlist_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_active ON public.event_waitlist USING btree (event_id, "position") WHERE ((cancelled_at IS NULL) AND (promoted_at IS NULL));


--
-- Name: idx_waitlist_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_event ON public.event_waitlist USING btree (event_id);


--
-- Name: idx_waitlist_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_user ON public.event_waitlist USING btree (user_id);


--
-- Name: idx_wings_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wings_deleted_at ON public.wings USING btree (deleted_at);


--
-- Name: idx_wings_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wings_society ON public.wings USING btree (society_id);


--
-- Name: idx_wings_unique_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_wings_unique_name ON public.wings USING btree (society_id, name) WHERE (deleted_at IS NULL);


--
-- Name: uq_society_wallet_default_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_society_wallet_default_active ON public.society_payment_wallets USING btree (society_id) WHERE ((is_default = true) AND (is_enabled = true));


--
-- Name: ux_event_cohost_nust_admin_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_event_cohost_nust_admin_active ON public.event_cohosts USING btree (event_id, cohost_type, status);


--
-- Name: ux_event_cohost_society_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_event_cohost_society_active ON public.event_cohosts USING btree (event_id, society_id, cohost_type, status);


--
-- Name: ux_pending_nust_admin_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_pending_nust_admin_request ON public.platform_cohost_requests USING btree (event_id, requesting_society_id, status, request_type);


--
-- Name: ux_pending_society_cohost_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_pending_society_cohost_request ON public.platform_cohost_requests USING btree (event_id, requesting_society_id, cohost_society_id, status, request_type);


--
-- Name: chats trg_chats_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: content trg_content_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_content_updated_at BEFORE UPDATE ON public.content FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: society_memberships trg_enforce_one_president; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_one_president BEFORE INSERT OR UPDATE ON public.society_memberships FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_one_president();


--
-- Name: ticket_qr_codes trg_enforce_single_use_qr; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_single_use_qr BEFORE UPDATE ON public.ticket_qr_codes FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_single_use_qr();


--
-- Name: event_media trg_event_media_storage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_media_storage AFTER DELETE OR UPDATE OF is_deleted ON public.event_media FOR EACH ROW EXECUTE FUNCTION public.fn_event_media_storage_sync();


--
-- Name: event_media trg_event_media_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_media_updated_at BEFORE UPDATE ON public.event_media FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: event_notes trg_event_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_notes_updated_at BEFORE UPDATE ON public.event_notes FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: events trg_event_status_auto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_status_auto BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.fn_calculate_event_status();


--
-- Name: events trg_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: society_memberships trg_memberships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_memberships_updated_at BEFORE UPDATE ON public.society_memberships FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: chat_messages trg_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_messages_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: users trg_normalize_users_email; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_users_email BEFORE INSERT OR UPDATE OF email ON public.users FOR EACH ROW EXECUTE FUNCTION public.normalize_users_email_fn();


--
-- Name: event_note_attachments trg_note_attachment_storage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_note_attachment_storage AFTER DELETE OR UPDATE OF is_deleted ON public.event_note_attachments FOR EACH ROW EXECUTE FUNCTION public.fn_note_attachment_storage_sync();


--
-- Name: event_registrations trg_participants_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participants_count AFTER INSERT OR DELETE OR UPDATE OF cancelled_at ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION public.fn_update_participants_count();


--
-- Name: payment_proofs trg_payment_proofs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_proofs_updated_at BEFORE UPDATE ON public.payment_proofs FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: portfolios trg_portfolios_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_portfolios_updated_at BEFORE UPDATE ON public.portfolios FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: post_attachments trg_post_attachment_storage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_attachment_storage AFTER DELETE OR UPDATE OF is_deleted ON public.post_attachments FOR EACH ROW EXECUTE FUNCTION public.fn_post_attachment_storage_sync();


--
-- Name: posts trg_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: otp_tokens trg_prevent_otp_reuse; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_otp_reuse BEFORE UPDATE ON public.otp_tokens FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_otp_reuse();


--
-- Name: ratings trg_ratings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ratings_updated_at BEFORE UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: ticket_transfers trg_regenerate_qr_on_transfer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_regenerate_qr_on_transfer AFTER INSERT ON public.ticket_transfers FOR EACH ROW EXECUTE FUNCTION public.fn_regenerate_qr_on_transfer();


--
-- Name: roles trg_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: societies trg_societies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_societies_updated_at BEFORE UPDATE ON public.societies FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: society_media trg_society_media_storage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_society_media_storage AFTER DELETE OR UPDATE OF is_deleted ON public.society_media FOR EACH ROW EXECUTE FUNCTION public.fn_society_media_storage_sync();


--
-- Name: society_media trg_society_media_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_society_media_updated_at BEFORE UPDATE ON public.society_media FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: society_profiles trg_society_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_society_profiles_updated_at BEFORE UPDATE ON public.society_profiles FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: societies trg_society_state_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_society_state_change AFTER UPDATE ON public.societies FOR EACH ROW EXECUTE FUNCTION public.fn_log_society_state_change();


--
-- Name: tickets trg_ticket_participants_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ticket_participants_count AFTER INSERT OR DELETE OR UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.fn_update_ticket_participants_count();


--
-- Name: tickets trg_ticket_reserved_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ticket_reserved_count AFTER INSERT OR DELETE OR UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.fn_update_ticket_reserved_count();


--
-- Name: tickets trg_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: society_memberships trg_validate_membership_portfolio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_membership_portfolio BEFORE INSERT OR UPDATE ON public.society_memberships FOR EACH ROW EXECUTE FUNCTION public.fn_validate_membership_portfolio();


--
-- Name: society_memberships trg_validate_membership_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_membership_role BEFORE INSERT OR UPDATE ON public.society_memberships FOR EACH ROW EXECUTE FUNCTION public.fn_validate_membership_role();


--
-- Name: society_memberships trg_validate_membership_wing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_membership_wing BEFORE INSERT OR UPDATE ON public.society_memberships FOR EACH ROW EXECUTE FUNCTION public.fn_validate_membership_wing();


--
-- Name: posts trg_validate_post_event_society; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_post_event_society BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.fn_validate_post_event_society();


--
-- Name: ticket_transfers trg_validate_ticket_transfer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_ticket_transfer BEFORE INSERT ON public.ticket_transfers FOR EACH ROW EXECUTE FUNCTION public.fn_validate_ticket_transfer();


--
-- Name: wings trg_wings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wings_updated_at BEFORE UPDATE ON public.wings FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: attendance attendance_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: attendance attendance_qr_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.ticket_qr_codes(id);


--
-- Name: attendance attendance_scanned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES public.users(id);


--
-- Name: attendance attendance_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: chat_messages chat_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id);


--
-- Name: chat_messages chat_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.chat_messages(id);


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: chat_role_permissions chat_role_permissions_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_role_permissions
    ADD CONSTRAINT chat_role_permissions_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: chat_role_permissions chat_role_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_role_permissions
    ADD CONSTRAINT chat_role_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: chat_role_permissions chat_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_role_permissions
    ADD CONSTRAINT chat_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: chats chats_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: chats chats_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);


--
-- Name: chats chats_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: chats chats_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_wing_id_fkey FOREIGN KEY (wing_id) REFERENCES public.wings(id);


--
-- Name: content content_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content
    ADD CONSTRAINT content_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);


--
-- Name: content content_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content
    ADD CONSTRAINT content_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: content content_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content
    ADD CONSTRAINT content_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: content content_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content
    ADD CONSTRAINT content_wing_id_fkey FOREIGN KEY (wing_id) REFERENCES public.wings(id);


--
-- Name: event_attendance event_attendance_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.users(id);


--
-- Name: event_attendance event_attendance_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_attendance event_attendance_qr_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.ticket_qr_codes(id);


--
-- Name: event_attendance event_attendance_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id);


--
-- Name: event_attendance event_attendance_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: event_attendance event_attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_attendance
    ADD CONSTRAINT event_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_cohosts event_cohosts_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id);


--
-- Name: event_cohosts event_cohosts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_cohosts event_cohosts_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: event_cohosts event_cohosts_source_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES public.platform_cohost_requests(id) ON DELETE SET NULL;


--
-- Name: event_media event_media_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_media
    ADD CONSTRAINT event_media_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_media event_media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_media
    ADD CONSTRAINT event_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: event_note_attachments event_note_attachments_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_note_attachments
    ADD CONSTRAINT event_note_attachments_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.event_notes(id) ON DELETE CASCADE;


--
-- Name: event_note_attachments event_note_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_note_attachments
    ADD CONSTRAINT event_note_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: event_notes event_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notes
    ADD CONSTRAINT event_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: event_notes event_notes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_notes
    ADD CONSTRAINT event_notes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_push_notification_log event_push_notification_log_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_push_notification_log
    ADD CONSTRAINT event_push_notification_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_push_notification_log event_push_notification_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_push_notification_log
    ADD CONSTRAINT event_push_notification_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_update_broadcast_recipients event_update_broadcast_recipients_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcast_recipients
    ADD CONSTRAINT event_update_broadcast_recipients_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.event_update_broadcasts(id) ON DELETE CASCADE;


--
-- Name: event_update_broadcast_recipients event_update_broadcast_recipients_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcast_recipients
    ADD CONSTRAINT event_update_broadcast_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE SET NULL;


--
-- Name: event_update_broadcast_recipients event_update_broadcast_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcast_recipients
    ADD CONSTRAINT event_update_broadcast_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: event_update_broadcasts event_update_broadcasts_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcasts
    ADD CONSTRAINT event_update_broadcasts_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);


--
-- Name: event_update_broadcasts event_update_broadcasts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcasts
    ADD CONSTRAINT event_update_broadcasts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: event_update_broadcasts event_update_broadcasts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcasts
    ADD CONSTRAINT event_update_broadcasts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_update_broadcasts event_update_broadcasts_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_update_broadcasts
    ADD CONSTRAINT event_update_broadcasts_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: event_waitlist event_waitlist_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_waitlist
    ADD CONSTRAINT event_waitlist_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_waitlist event_waitlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_waitlist
    ADD CONSTRAINT event_waitlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: events events_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.event_categories(id);


--
-- Name: events events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: events events_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: events events_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);


--
-- Name: events events_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: events events_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_wing_id_fkey FOREIGN KEY (wing_id) REFERENCES public.wings(id);


--
-- Name: favorite_societies favorite_societies_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_societies
    ADD CONSTRAINT favorite_societies_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: favorite_societies favorite_societies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_societies
    ADD CONSTRAINT favorite_societies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invite_tokens invite_tokens_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.users(id);


--
-- Name: invite_tokens invite_tokens_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: invite_tokens invite_tokens_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);


--
-- Name: invite_tokens invite_tokens_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: invite_tokens invite_tokens_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_wing_id_fkey FOREIGN KEY (wing_id) REFERENCES public.wings(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: otp_tokens otp_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_tokens
    ADD CONSTRAINT otp_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payment_proofs payment_proofs_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: payment_proofs payment_proofs_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: payment_proofs payment_proofs_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: platform_blackout_dates platform_blackout_dates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_blackout_dates
    ADD CONSTRAINT platform_blackout_dates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: platform_cohost_requests platform_cohost_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: platform_cohost_requests platform_cohost_requests_cohost_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_cohost_society_id_fkey FOREIGN KEY (cohost_society_id) REFERENCES public.societies(id);


--
-- Name: platform_cohost_requests platform_cohost_requests_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: platform_cohost_requests platform_cohost_requests_host_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_host_society_id_fkey FOREIGN KEY (host_society_id) REFERENCES public.societies(id);


--
-- Name: platform_cohost_requests platform_cohost_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: platform_cohost_requests platform_cohost_requests_requesting_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_cohost_requests
    ADD CONSTRAINT platform_cohost_requests_requesting_society_id_fkey FOREIGN KEY (requesting_society_id) REFERENCES public.societies(id);


--
-- Name: platform_emergency_flags platform_emergency_flags_toggled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_emergency_flags
    ADD CONSTRAINT platform_emergency_flags_toggled_by_fkey FOREIGN KEY (toggled_by) REFERENCES public.users(id);


--
-- Name: platform_event_controls platform_event_controls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_event_controls
    ADD CONSTRAINT platform_event_controls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: platform_event_controls platform_event_controls_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_event_controls
    ADD CONSTRAINT platform_event_controls_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: platform_incident_notes platform_incident_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_incident_notes
    ADD CONSTRAINT platform_incident_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: platform_incident_notes platform_incident_notes_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_incident_notes
    ADD CONSTRAINT platform_incident_notes_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.platform_incidents(id) ON DELETE CASCADE;


--
-- Name: platform_incidents platform_incidents_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_incidents
    ADD CONSTRAINT platform_incidents_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: platform_incidents platform_incidents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_incidents
    ADD CONSTRAINT platform_incidents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: platform_notification_reads platform_notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_notification_reads
    ADD CONSTRAINT platform_notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.platform_notifications(id) ON DELETE CASCADE;


--
-- Name: platform_notification_reads platform_notification_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_notification_reads
    ADD CONSTRAINT platform_notification_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: platform_notifications platform_notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_notifications
    ADD CONSTRAINT platform_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: platform_university_events platform_university_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_university_events
    ADD CONSTRAINT platform_university_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: portfolios portfolios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: portfolios portfolios_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: portfolios portfolios_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolios
    ADD CONSTRAINT portfolios_wing_id_fkey FOREIGN KEY (wing_id) REFERENCES public.wings(id);


--
-- Name: post_attachments post_attachments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_attachments
    ADD CONSTRAINT post_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_attachments post_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_attachments
    ADD CONSTRAINT post_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: posts posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: posts posts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: posts posts_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: role_privileges role_privileges_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_privileges
    ADD CONSTRAINT role_privileges_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: role_privileges role_privileges_privilege_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_privileges
    ADD CONSTRAINT role_privileges_privilege_id_fkey FOREIGN KEY (privilege_id) REFERENCES public.privileges(id) ON DELETE CASCADE;


--
-- Name: role_privileges role_privileges_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_privileges
    ADD CONSTRAINT role_privileges_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: societies societies_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.societies
    ADD CONSTRAINT societies_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: societies societies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.societies
    ADD CONSTRAINT societies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: societies societies_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.societies
    ADD CONSTRAINT societies_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.nust_schools(id);


--
-- Name: society_album_photos society_album_photos_album_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_album_photos
    ADD CONSTRAINT society_album_photos_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.society_albums(id) ON DELETE CASCADE;


--
-- Name: society_album_photos society_album_photos_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_album_photos
    ADD CONSTRAINT society_album_photos_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: society_album_photos society_album_photos_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_album_photos
    ADD CONSTRAINT society_album_photos_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: society_album_photos society_album_photos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_album_photos
    ADD CONSTRAINT society_album_photos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: society_albums society_albums_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_albums
    ADD CONSTRAINT society_albums_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: society_albums society_albums_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_albums
    ADD CONSTRAINT society_albums_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: society_albums society_albums_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_albums
    ADD CONSTRAINT society_albums_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: society_join_requests society_join_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_join_requests
    ADD CONSTRAINT society_join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: society_join_requests society_join_requests_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_join_requests
    ADD CONSTRAINT society_join_requests_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: society_join_requests society_join_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_join_requests
    ADD CONSTRAINT society_join_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: society_media society_media_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_media
    ADD CONSTRAINT society_media_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: society_media society_media_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_media
    ADD CONSTRAINT society_media_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: society_member_privilege_overrides society_member_privilege_overrides_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_member_privilege_overrides
    ADD CONSTRAINT society_member_privilege_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: society_member_privilege_overrides society_member_privilege_overrides_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_member_privilege_overrides
    ADD CONSTRAINT society_member_privilege_overrides_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.society_memberships(id) ON DELETE CASCADE;


--
-- Name: society_member_privilege_overrides society_member_privilege_overrides_privilege_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_member_privilege_overrides
    ADD CONSTRAINT society_member_privilege_overrides_privilege_id_fkey FOREIGN KEY (privilege_id) REFERENCES public.privileges(id) ON DELETE CASCADE;


--
-- Name: society_memberships society_memberships_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: society_memberships society_memberships_portfolio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);


--
-- Name: society_memberships society_memberships_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: society_memberships society_memberships_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: society_memberships society_memberships_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public.users(id);


--
-- Name: society_memberships society_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: society_memberships society_memberships_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_memberships
    ADD CONSTRAINT society_memberships_wing_id_fkey FOREIGN KEY (wing_id) REFERENCES public.wings(id);


--
-- Name: society_payment_wallets society_payment_wallets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_payment_wallets
    ADD CONSTRAINT society_payment_wallets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: society_payment_wallets society_payment_wallets_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_payment_wallets
    ADD CONSTRAINT society_payment_wallets_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: society_post_images society_post_images_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_post_images
    ADD CONSTRAINT society_post_images_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.society_posts(id) ON DELETE CASCADE;


--
-- Name: society_posts society_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_posts
    ADD CONSTRAINT society_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: society_posts society_posts_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_posts
    ADD CONSTRAINT society_posts_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: society_posts society_posts_shared_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_posts
    ADD CONSTRAINT society_posts_shared_event_id_fkey FOREIGN KEY (shared_event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: society_posts society_posts_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_posts
    ADD CONSTRAINT society_posts_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id) ON DELETE CASCADE;


--
-- Name: society_profiles society_profiles_featured_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_profiles
    ADD CONSTRAINT society_profiles_featured_event_id_fkey FOREIGN KEY (featured_event_id) REFERENCES public.events(id);


--
-- Name: society_profiles society_profiles_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_profiles
    ADD CONSTRAINT society_profiles_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: society_settings society_settings_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_settings
    ADD CONSTRAINT society_settings_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: society_state_changes society_state_changes_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_state_changes
    ADD CONSTRAINT society_state_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: society_state_changes society_state_changes_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society_state_changes
    ADD CONSTRAINT society_state_changes_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: ticket_qr_codes ticket_qr_codes_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_qr_codes
    ADD CONSTRAINT ticket_qr_codes_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON DELETE CASCADE;


--
-- Name: ticket_qr_codes ticket_qr_codes_scanned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_qr_codes
    ADD CONSTRAINT ticket_qr_codes_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES public.users(id);


--
-- Name: ticket_qr_codes ticket_qr_codes_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_qr_codes
    ADD CONSTRAINT ticket_qr_codes_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: ticket_transfers ticket_transfers_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id);


--
-- Name: ticket_transfers ticket_transfers_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);


--
-- Name: ticket_transfers ticket_transfers_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_transfers
    ADD CONSTRAINT ticket_transfers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id);


--
-- Name: tickets tickets_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: tickets tickets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: tickets tickets_selected_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_selected_wallet_id_fkey FOREIGN KEY (selected_wallet_id) REFERENCES public.society_payment_wallets(id);


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: upload_logs upload_logs_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_logs
    ADD CONSTRAINT upload_logs_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- Name: upload_logs upload_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_logs
    ADD CONSTRAINT upload_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_push_preferences user_push_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_preferences
    ADD CONSTRAINT user_push_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_push_tokens user_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wings wings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wings
    ADD CONSTRAINT wings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: wings wings_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wings
    ADD CONSTRAINT wings_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.societies(id);


--
-- PostgreSQL database dump complete
--


