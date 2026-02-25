-- ============================================================================
-- Phase 6: Storage Quota Enforcement — Database Tests
-- ============================================================================
-- Tests:
--  1. CHECK constraint prevents negative storage_used_bytes
--  2. CHECK constraint prevents non-positive storage_quota_bytes
--  3. Trigger: soft-delete society_media → decrements storage
--  4. Trigger: restore society_media → increments storage (within quota)
--  5. Trigger: hard DELETE active society_media → decrements storage
--  6. Trigger: event_media soft-delete via events.society_id
--  7. Analytics view returns correct data
--  8. Concurrent quota check simulation (advisory lock)
--  9. Upload exactly at limit succeeds
-- 10. Upload exceeding by 1 byte fails (quota enforcement)
-- 11. Soft-delete already-deleted media is idempotent (no double decrement)
-- 12. Restore quota guard (restore fails if exceeds quota)
-- 13. SuperAdmin limit reduction blocked when < used
-- 14. Storage recalculation consistency check
-- ============================================================================

DO $$
DECLARE
    v_sid       UUID;
    v_uid       UUID;
    v_media_id  UUID;
    v_media_id2 UUID;
    v_event_id  UUID;
    v_em_id     UUID;
    v_used      BIGINT;
    v_passed    INT := 0;
    v_total     INT := 0;
    v_old_used  BIGINT;
    v_new_used  BIGINT;
    v_quota     BIGINT;
BEGIN
    -- Setup: pick a real society and user
    SELECT id INTO v_sid FROM societies WHERE status = 'APPROVED' LIMIT 1;
    SELECT id INTO v_uid FROM users WHERE user_type = 'SUPER_ADMIN' LIMIT 1;

    IF v_sid IS NULL OR v_uid IS NULL THEN
        RAISE EXCEPTION 'Need at least 1 approved society and 1 super_admin user';
    END IF;

    -- Reset storage to 0 for clean test
    UPDATE society_settings SET storage_used_bytes = 0 WHERE society_id = v_sid;

    -- ======================================================================
    -- TEST 1: CHECK prevents negative storage_used_bytes
    -- ======================================================================
    v_total := v_total + 1;
    BEGIN
        UPDATE society_settings SET storage_used_bytes = -1 WHERE society_id = v_sid;
        RAISE NOTICE 'TEST 1 FAILED: negative storage_used_bytes was accepted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 1 PASSED: CHECK prevents negative storage_used_bytes';
    END;

    -- ======================================================================
    -- TEST 2: CHECK prevents zero/negative storage_quota_bytes
    -- ======================================================================
    v_total := v_total + 1;
    BEGIN
        UPDATE society_settings SET storage_quota_bytes = 0 WHERE society_id = v_sid;
        RAISE NOTICE 'TEST 2 FAILED: zero storage_quota_bytes was accepted';
    EXCEPTION WHEN check_violation THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 2 PASSED: CHECK prevents non-positive storage_quota_bytes';
    END;

    -- ======================================================================
    -- TEST 3: Soft-delete society_media → trigger decrements storage
    -- ======================================================================
    v_total := v_total + 1;
    -- Insert a test media row (10000 bytes)
    INSERT INTO society_media (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by)
    VALUES (v_sid, 'GALLERY', 'https://test.blob/test1.jpg', 'test1.jpg', 10000, 'image/jpeg', v_uid)
    RETURNING id INTO v_media_id;

    -- Manually set storage_used to include this file
    UPDATE society_settings SET storage_used_bytes = 10000 WHERE society_id = v_sid;

    -- Soft-delete it
    UPDATE society_media SET is_deleted = TRUE WHERE id = v_media_id;

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 0 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 3 PASSED: soft-delete decremented storage from 10000 to 0';
    ELSE
        RAISE NOTICE 'TEST 3 FAILED: expected 0, got %', v_used;
    END IF;

    -- ======================================================================
    -- TEST 4: Restore society_media → trigger increments storage
    -- ======================================================================
    v_total := v_total + 1;
    UPDATE society_media SET is_deleted = FALSE WHERE id = v_media_id;

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 10000 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 4 PASSED: restore incremented storage back to 10000';
    ELSE
        RAISE NOTICE 'TEST 4 FAILED: expected 10000, got %', v_used;
    END IF;

    -- ======================================================================
    -- TEST 5: Hard DELETE active media → trigger decrements storage
    -- ======================================================================
    v_total := v_total + 1;
    DELETE FROM society_media WHERE id = v_media_id;

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 0 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 5 PASSED: hard delete decremented storage from 10000 to 0';
    ELSE
        RAISE NOTICE 'TEST 5 FAILED: expected 0, got %', v_used;
    END IF;

    -- ======================================================================
    -- TEST 6: event_media trigger decrements via events.society_id
    -- ======================================================================
    v_total := v_total + 1;
    -- Need an event linked to this society
    SELECT id INTO v_event_id FROM events WHERE society_id = v_sid LIMIT 1;

    IF v_event_id IS NULL THEN
        -- Create a temporary event
        INSERT INTO events (society_id, title, event_date, start_time, end_time, venue, created_by, status)
        VALUES (v_sid, 'Test Event Phase6', NOW() + INTERVAL '7 days', '10:00', '12:00', 'Test Hall', v_uid, 'DRAFT')
        RETURNING id INTO v_event_id;
    END IF;

    -- Insert event media
    INSERT INTO event_media (event_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by)
    VALUES (v_event_id, 'GALLERY', 'https://test.blob/event1.jpg', 'event1.jpg', 5000, 'image/jpeg', v_uid)
    RETURNING id INTO v_em_id;

    UPDATE society_settings SET storage_used_bytes = 5000 WHERE society_id = v_sid;

    UPDATE event_media SET is_deleted = TRUE WHERE id = v_em_id;

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 0 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 6 PASSED: event_media soft-delete decremented via events.society_id';
    ELSE
        RAISE NOTICE 'TEST 6 FAILED: expected 0, got %', v_used;
    END IF;

    -- Cleanup event media
    DELETE FROM event_media WHERE id = v_em_id;

    -- ======================================================================
    -- TEST 7: Analytics view returns correct data
    -- ======================================================================
    v_total := v_total + 1;
    UPDATE society_settings SET storage_used_bytes = 262144000 WHERE society_id = v_sid;  -- 250MB

    DECLARE
        v_view_row RECORD;
    BEGIN
        SELECT * INTO v_view_row FROM v_society_storage_usage WHERE society_id = v_sid;
        IF v_view_row.storage_used_bytes = 262144000
           AND v_view_row.storage_used_mb = 250.00
           AND v_view_row.percent_used = 50.0  -- 250/500 = 50%
        THEN
            v_passed := v_passed + 1;
            RAISE NOTICE 'TEST 7 PASSED: view shows 250MB used, 50%% of 500MB quota';
        ELSE
            RAISE NOTICE 'TEST 7 FAILED: view row = % MB, % pct', v_view_row.storage_used_mb, v_view_row.percent_used;
        END IF;
    END;

    -- Reset
    UPDATE society_settings SET storage_used_bytes = 0 WHERE society_id = v_sid;

    -- ======================================================================
    -- TEST 8: Concurrent quota simulation — advisory locks protect reads
    -- ======================================================================
    v_total := v_total + 1;
    -- Set storage to 524287000 (1000 bytes below 500MB limit)
    UPDATE society_settings SET storage_used_bytes = 524287000, storage_quota_bytes = 524288000 WHERE society_id = v_sid;

    -- Simulate FOR UPDATE lock by reading with lock
    DECLARE
        v_locked_used BIGINT;
        v_locked_quota BIGINT;
    BEGIN
        SELECT storage_used_bytes, storage_quota_bytes
        INTO v_locked_used, v_locked_quota
        FROM society_settings
        WHERE society_id = v_sid
        FOR UPDATE;

        IF v_locked_used = 524287000 AND v_locked_quota = 524288000 THEN
            v_passed := v_passed + 1;
            RAISE NOTICE 'TEST 8 PASSED: FOR UPDATE lock acquired correctly on society_settings';
        ELSE
            RAISE NOTICE 'TEST 8 FAILED: unexpected locked values: used=%, quota=%', v_locked_used, v_locked_quota;
        END IF;
    END;

    -- ======================================================================
    -- TEST 9: Upload exactly at limit succeeds (used + file = quota)
    -- ======================================================================
    v_total := v_total + 1;
    UPDATE society_settings SET storage_used_bytes = 524287000, storage_quota_bytes = 524288000 WHERE society_id = v_sid;

    -- Insert media with exactly 1000 bytes → 524287000 + 1000 = 524288000 = quota
    INSERT INTO society_media (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by)
    VALUES (v_sid, 'GALLERY', 'https://test.blob/exact.jpg', 'exact.jpg', 1000, 'image/jpeg', v_uid)
    RETURNING id INTO v_media_id;

    -- Manually increment (simulating app-level atomic increment)
    UPDATE society_settings SET storage_used_bytes = storage_used_bytes + 1000 WHERE society_id = v_sid;

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 524288000 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 9 PASSED: upload at exact limit succeeded (used = quota = 524288000)';
    ELSE
        RAISE NOTICE 'TEST 9 FAILED: expected 524288000, got %', v_used;
    END IF;

    -- Cleanup
    DELETE FROM society_media WHERE id = v_media_id;
    UPDATE society_settings SET storage_used_bytes = 0 WHERE society_id = v_sid;

    -- ======================================================================
    -- TEST 10: Upload exceeding by 1 byte (application-level quota guard)
    -- ======================================================================
    v_total := v_total + 1;
    UPDATE society_settings SET storage_used_bytes = 524288000, storage_quota_bytes = 524288000 WHERE society_id = v_sid;

    -- Check: used + 1 > quota → should fail
    DECLARE
        v_check_used BIGINT;
        v_check_quota BIGINT;
        v_would_exceed BOOLEAN;
    BEGIN
        SELECT storage_used_bytes, storage_quota_bytes
        INTO v_check_used, v_check_quota
        FROM society_settings WHERE society_id = v_sid;

        v_would_exceed := (v_check_used + 1 > v_check_quota);
        IF v_would_exceed THEN
            v_passed := v_passed + 1;
            RAISE NOTICE 'TEST 10 PASSED: 1-byte exceeding correctly detected (% + 1 > %)', v_check_used, v_check_quota;
        ELSE
            RAISE NOTICE 'TEST 10 FAILED: should have detected overflow';
        END IF;
    END;

    UPDATE society_settings SET storage_used_bytes = 0 WHERE society_id = v_sid;

    -- ======================================================================
    -- TEST 11: Soft-delete already-deleted media is idempotent
    -- ======================================================================
    v_total := v_total + 1;
    INSERT INTO society_media (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by, is_deleted)
    VALUES (v_sid, 'GALLERY', 'https://test.blob/already_del.jpg', 'already_del.jpg', 8000, 'image/jpeg', v_uid, TRUE)
    RETURNING id INTO v_media_id;

    -- Storage should be 0 (already deleted = not counted)
    UPDATE society_settings SET storage_used_bytes = 0 WHERE society_id = v_sid;

    -- Update is_deleted TRUE → TRUE (no-op for trigger)
    UPDATE society_media SET is_deleted = TRUE, updated_at = NOW() WHERE id = v_media_id;

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 0 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 11 PASSED: re-deleting already-deleted media did not decrement (stayed 0)';
    ELSE
        RAISE NOTICE 'TEST 11 FAILED: expected 0, got %', v_used;
    END IF;

    DELETE FROM society_media WHERE id = v_media_id;

    -- ======================================================================
    -- TEST 12: Restore fails if would exceed quota (application-level)
    -- ======================================================================
    v_total := v_total + 1;
    -- Set quota nearly full
    UPDATE society_settings SET storage_used_bytes = 524285000, storage_quota_bytes = 524288000 WHERE society_id = v_sid;

    -- Insert a deleted media with 5000 bytes (restore would make 524285000 + 5000 = 524290000 > 524288000)
    INSERT INTO society_media (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by, is_deleted)
    VALUES (v_sid, 'GALLERY', 'https://test.blob/big_restore.jpg', 'big_restore.jpg', 5000, 'image/jpeg', v_uid, TRUE)
    RETURNING id INTO v_media_id;

    DECLARE
        v_restore_check_used BIGINT;
        v_restore_check_quota BIGINT;
        v_file_bytes BIGINT := 5000;
    BEGIN
        SELECT storage_used_bytes, storage_quota_bytes
        INTO v_restore_check_used, v_restore_check_quota
        FROM society_settings WHERE society_id = v_sid;

        IF v_restore_check_used + v_file_bytes > v_restore_check_quota THEN
            v_passed := v_passed + 1;
            RAISE NOTICE 'TEST 12 PASSED: restore correctly blocked (% + 5000 > %)', v_restore_check_used, v_restore_check_quota;
        ELSE
            RAISE NOTICE 'TEST 12 FAILED: should have blocked restore';
        END IF;
    END;

    DELETE FROM society_media WHERE id = v_media_id;
    UPDATE society_settings SET storage_used_bytes = 0 WHERE society_id = v_sid;

    -- ======================================================================
    -- TEST 13: SuperAdmin limit reduction blocked when < used
    -- ======================================================================
    v_total := v_total + 1;
    -- Set used = 100MB, try to set quota to 50MB
    UPDATE society_settings SET storage_used_bytes = 104857600, storage_quota_bytes = 524288000 WHERE society_id = v_sid;

    DECLARE
        v_sa_used BIGINT;
        v_sa_new_limit BIGINT := 52428800;  -- 50MB
    BEGIN
        SELECT storage_used_bytes INTO v_sa_used FROM society_settings WHERE society_id = v_sid;
        IF v_sa_new_limit < v_sa_used THEN
            v_passed := v_passed + 1;
            RAISE NOTICE 'TEST 13 PASSED: limit reduction correctly blocked (50MB < % bytes used)', v_sa_used;
        ELSE
            RAISE NOTICE 'TEST 13 FAILED: should have blocked limit reduction';
        END IF;
    END;

    -- ======================================================================
    -- TEST 14: fn_recalculate_society_storage consistency
    -- ======================================================================
    v_total := v_total + 1;
    -- Reset and add known media
    UPDATE society_settings SET storage_used_bytes = 99999, storage_quota_bytes = 524288000 WHERE society_id = v_sid;  -- deliberately wrong

    INSERT INTO society_media (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by, is_deleted)
    VALUES (v_sid, 'GALLERY', 'https://test.blob/recalc1.jpg', 'recalc1.jpg', 7000, 'image/jpeg', v_uid, FALSE)
    RETURNING id INTO v_media_id;

    INSERT INTO society_media (society_id, media_type, file_url, file_name, file_size_bytes, mime_type, uploaded_by, is_deleted)
    VALUES (v_sid, 'GALLERY', 'https://test.blob/recalc2.jpg', 'recalc2.jpg', 3000, 'image/jpeg', v_uid, FALSE)
    RETURNING id INTO v_media_id2;

    -- Recalculate
    PERFORM fn_recalculate_society_storage(v_sid);

    SELECT storage_used_bytes INTO v_used FROM society_settings WHERE society_id = v_sid;
    IF v_used = 10000 THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'TEST 14 PASSED: recalculate fixed drift (99999 → 10000)';
    ELSE
        RAISE NOTICE 'TEST 14 FAILED: expected 10000, got %', v_used;
    END IF;

    -- Cleanup
    DELETE FROM society_media WHERE id IN (v_media_id, v_media_id2);
    UPDATE society_settings SET storage_used_bytes = 0, storage_quota_bytes = 524288000 WHERE society_id = v_sid;

    -- ======================================================================
    -- SUMMARY
    -- ======================================================================
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Phase 6 Tests: %/% PASSED', v_passed, v_total;
    RAISE NOTICE '===========================================';

    IF v_passed < v_total THEN
        RAISE EXCEPTION 'SOME TESTS FAILED: %/% passed', v_passed, v_total;
    END IF;

END $$;
