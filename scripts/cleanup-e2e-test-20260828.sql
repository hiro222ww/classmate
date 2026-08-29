-- Cleanup for E2E_TEST_20260828 smoke data ONLY.
-- DO NOT RUN without reviewing the preview counts below.
-- Runs in a single transaction; aborts with RAISE if counts or safety checks fail.
-- Includes provisional classes and official promotions (e.g. クラス0080G / 0080H)
-- that were promoted_from_session_id from E2E sessions.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Target sets (E2E tag only)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _e2e_devices ON COMMIT DROP AS
SELECT DISTINCT up.device_id
FROM public.user_profiles up
WHERE up.display_name LIKE 'E2E_TEST_20260828%'
  AND up.device_id IS NOT NULL
  AND btrim(up.device_id) <> '';

CREATE TEMP TABLE _e2e_sessions ON COMMIT DROP AS
SELECT DISTINCT sm.session_id
FROM public.session_members sm
WHERE sm.display_name LIKE 'E2E_TEST_20260828%'
   OR sm.device_id IN (SELECT device_id FROM _e2e_devices);

CREATE TEMP TABLE _e2e_classes ON COMMIT DROP AS
SELECT DISTINCT c.id AS class_id
FROM public.classes c
WHERE c.id IN (
  SELECT s.class_id::uuid
  FROM public.sessions s
  WHERE s.id IN (SELECT session_id FROM _e2e_sessions)
    AND s.class_id IS NOT NULL
    AND btrim(s.class_id) <> ''
)
OR c.id IN (
  SELECT cm.class_id
  FROM public.class_memberships cm
  WHERE cm.device_id IN (SELECT device_id FROM _e2e_devices)
)
OR c.promoted_from_session_id IN (SELECT session_id FROM _e2e_sessions);

-- ---------------------------------------------------------------------------
-- 2) Safety: no non-E2E profiles/members mixed into target classes/sessions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_foreign_profiles integer;
  v_foreign_members integer;
  v_foreign_memberships integer;
BEGIN
  SELECT count(*)::integer INTO v_foreign_profiles
  FROM public.user_profiles up
  WHERE up.device_id IN (
    SELECT DISTINCT cm.device_id
    FROM public.class_memberships cm
    WHERE cm.class_id IN (SELECT class_id FROM _e2e_classes)
  )
  AND (
    up.display_name IS NULL
    OR up.display_name NOT LIKE 'E2E_TEST_20260828%'
  );

  IF v_foreign_profiles > 0 THEN
    RAISE EXCEPTION 'cleanup_aborted: % non-E2E profiles share target classes',
      v_foreign_profiles;
  END IF;

  SELECT count(*)::integer INTO v_foreign_members
  FROM public.session_members sm
  WHERE sm.session_id IN (SELECT session_id FROM _e2e_sessions)
    AND (
      sm.display_name IS NULL
      OR sm.display_name NOT LIKE 'E2E_TEST_20260828%'
    )
    AND sm.device_id NOT IN (SELECT device_id FROM _e2e_devices);

  IF v_foreign_members > 0 THEN
    RAISE EXCEPTION 'cleanup_aborted: % non-E2E session_members in target sessions',
      v_foreign_members;
  END IF;

  SELECT count(*)::integer INTO v_foreign_memberships
  FROM public.class_memberships cm
  WHERE cm.class_id IN (SELECT class_id FROM _e2e_classes)
    AND cm.device_id NOT IN (SELECT device_id FROM _e2e_devices);

  IF v_foreign_memberships > 0 THEN
    RAISE EXCEPTION 'cleanup_aborted: % non-E2E class_memberships on target classes',
      v_foreign_memberships;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Expected counts — UPDATE these from the agent preview before running.
--    Mismatch → EXCEPTION → full ROLLBACK.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- Expected values from 2026-08-29 REST preview (update if counts drift):
  exp_devices integer := 102;
  exp_sessions integer := 35;
  exp_classes integer := 35;
  exp_funnel integer := NULL;            -- fill after NOTICE preview if desired
  exp_votes integer := 29;
  exp_presence integer := NULL;
  exp_session_members integer := 73;
  exp_class_memberships integer := 63;
  exp_match_prefs integer := NULL;
  exp_profiles integer := 102;

  got_devices integer;
  got_sessions integer;
  got_classes integer;
  got_funnel integer;
  got_votes integer;
  got_presence integer;
  got_session_members integer;
  got_class_memberships integer;
  got_match_prefs integer;
  got_profiles integer;
BEGIN
  SELECT count(*)::integer INTO got_devices FROM _e2e_devices;
  SELECT count(*)::integer INTO got_sessions FROM _e2e_sessions;
  SELECT count(*)::integer INTO got_classes FROM _e2e_classes;

  SELECT count(*)::integer INTO got_funnel
  FROM public.product_funnel_events fe
  WHERE fe.device_id IN (SELECT device_id FROM _e2e_devices)
     OR fe.session_id IN (SELECT session_id FROM _e2e_sessions)
     OR fe.class_id IN (SELECT class_id FROM _e2e_classes);

  SELECT count(*)::integer INTO got_votes
  FROM public.session_class_votes v
  WHERE v.session_id IN (SELECT session_id FROM _e2e_sessions)
     OR v.device_id IN (SELECT device_id FROM _e2e_devices);

  SELECT count(*)::integer INTO got_presence
  FROM public.class_presence cp
  WHERE cp.device_id IN (SELECT device_id FROM _e2e_devices)
     OR cp.class_id IN (SELECT class_id FROM _e2e_classes);

  SELECT count(*)::integer INTO got_session_members
  FROM public.session_members sm
  WHERE sm.session_id IN (SELECT session_id FROM _e2e_sessions)
     OR sm.device_id IN (SELECT device_id FROM _e2e_devices);

  SELECT count(*)::integer INTO got_class_memberships
  FROM public.class_memberships cm
  WHERE cm.device_id IN (SELECT device_id FROM _e2e_devices)
     OR cm.class_id IN (SELECT class_id FROM _e2e_classes);

  SELECT count(*)::integer INTO got_match_prefs
  FROM public.user_match_prefs ump
  WHERE ump.device_id IN (SELECT device_id FROM _e2e_devices);

  SELECT count(*)::integer INTO got_profiles
  FROM public.user_profiles up
  WHERE up.device_id IN (SELECT device_id FROM _e2e_devices);

  -- Soft gate: only enforce when expectations are filled in.
  IF exp_devices IS NOT NULL AND got_devices <> exp_devices THEN
    RAISE EXCEPTION 'cleanup_aborted: devices got=% expected=%', got_devices, exp_devices;
  END IF;
  IF exp_sessions IS NOT NULL AND got_sessions <> exp_sessions THEN
    RAISE EXCEPTION 'cleanup_aborted: sessions got=% expected=%', got_sessions, exp_sessions;
  END IF;
  IF exp_classes IS NOT NULL AND got_classes <> exp_classes THEN
    RAISE EXCEPTION 'cleanup_aborted: classes got=% expected=%', got_classes, exp_classes;
  END IF;
  IF exp_funnel IS NOT NULL AND got_funnel <> exp_funnel THEN
    RAISE EXCEPTION 'cleanup_aborted: funnel got=% expected=%', got_funnel, exp_funnel;
  END IF;
  IF exp_votes IS NOT NULL AND got_votes <> exp_votes THEN
    RAISE EXCEPTION 'cleanup_aborted: votes got=% expected=%', got_votes, exp_votes;
  END IF;
  IF exp_presence IS NOT NULL AND got_presence <> exp_presence THEN
    RAISE EXCEPTION 'cleanup_aborted: presence got=% expected=%', got_presence, exp_presence;
  END IF;
  IF exp_session_members IS NOT NULL AND got_session_members <> exp_session_members THEN
    RAISE EXCEPTION 'cleanup_aborted: session_members got=% expected=%',
      got_session_members, exp_session_members;
  END IF;
  IF exp_class_memberships IS NOT NULL AND got_class_memberships <> exp_class_memberships THEN
    RAISE EXCEPTION 'cleanup_aborted: class_memberships got=% expected=%',
      got_class_memberships, exp_class_memberships;
  END IF;
  IF exp_match_prefs IS NOT NULL AND got_match_prefs <> exp_match_prefs THEN
    RAISE EXCEPTION 'cleanup_aborted: match_prefs got=% expected=%',
      got_match_prefs, exp_match_prefs;
  END IF;
  IF exp_profiles IS NOT NULL AND got_profiles <> exp_profiles THEN
    RAISE EXCEPTION 'cleanup_aborted: profiles got=% expected=%', got_profiles, exp_profiles;
  END IF;

  RAISE NOTICE 'cleanup preview devices=% sessions=% classes=% funnel=% votes=% presence=% sm=% cm=% prefs=% profiles=%',
    got_devices, got_sessions, got_classes, got_funnel, got_votes, got_presence,
    got_session_members, got_class_memberships, got_match_prefs, got_profiles;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Deletes in FK-safe order
-- ---------------------------------------------------------------------------
DELETE FROM public.product_funnel_events fe
WHERE fe.device_id IN (SELECT device_id FROM _e2e_devices)
   OR fe.session_id IN (SELECT session_id FROM _e2e_sessions)
   OR fe.class_id IN (SELECT class_id FROM _e2e_classes);

DELETE FROM public.session_class_votes v
WHERE v.session_id IN (SELECT session_id FROM _e2e_sessions)
   OR v.device_id IN (SELECT device_id FROM _e2e_devices);

DELETE FROM public.class_presence cp
WHERE cp.device_id IN (SELECT device_id FROM _e2e_devices)
   OR cp.class_id IN (SELECT class_id FROM _e2e_classes);

DELETE FROM public.session_members sm
WHERE sm.session_id IN (SELECT session_id FROM _e2e_sessions)
   OR sm.device_id IN (SELECT device_id FROM _e2e_devices);

DELETE FROM public.class_memberships cm
WHERE cm.device_id IN (SELECT device_id FROM _e2e_devices)
   OR cm.class_id IN (SELECT class_id FROM _e2e_classes);

DELETE FROM public.sessions s
WHERE s.id IN (SELECT session_id FROM _e2e_sessions)
   OR (
     s.class_id IS NOT NULL
     AND btrim(s.class_id) <> ''
     AND s.class_id::uuid IN (SELECT class_id FROM _e2e_classes)
   );

-- Safe for official promotions (0080G/H): only E2E-backed classes
DELETE FROM public.classes c
WHERE c.id IN (SELECT class_id FROM _e2e_classes)
  AND (
    c.lifecycle = 'provisional'
    OR c.promoted_from_session_id IN (SELECT session_id FROM _e2e_sessions)
    OR COALESCE(c.is_user_created, false) = false
  );

DELETE FROM public.user_match_prefs ump
WHERE ump.device_id IN (SELECT device_id FROM _e2e_devices);

DELETE FROM public.user_profiles up
WHERE up.device_id IN (SELECT device_id FROM _e2e_devices);

DELETE FROM public.user_devices ud
WHERE ud.device_id IN (SELECT device_id FROM _e2e_devices);

-- ---------------------------------------------------------------------------
-- 5) Post-delete asserts (any leftover E2E tag → rollback)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  leftover integer;
BEGIN
  SELECT count(*)::integer INTO leftover
  FROM public.user_profiles
  WHERE display_name LIKE 'E2E_TEST_20260828%';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'cleanup_aborted: % E2E profiles remain after delete', leftover;
  END IF;

  SELECT count(*)::integer INTO leftover
  FROM public.session_members
  WHERE display_name LIKE 'E2E_TEST_20260828%';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'cleanup_aborted: % E2E session_members remain', leftover;
  END IF;
END $$;

COMMIT;

-- Optional post-check (outside txn):
-- SELECT count(*) FROM user_profiles WHERE display_name LIKE 'E2E_TEST_20260828%';
