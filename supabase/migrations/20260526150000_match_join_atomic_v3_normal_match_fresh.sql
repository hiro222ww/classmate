-- Normal match (p_forced_class_id IS NULL): do not re-enter old active sessions.
-- Only forced path may join active/closed/expired sessions for existing members.
-- Apply in Supabase SQL Editor, then NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.match_join_atomic_v3(
  p_device_id text,
  p_display_name text,
  p_forced_class_id uuid DEFAULT NULL,
  p_world_key text DEFAULT 'default',
  p_topic_key text DEFAULT NULL,
  p_requested_capacity integer DEFAULT 5,
  p_class_slots integer DEFAULT 1,
  p_blocked_device_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  session_id uuid,
  session_status text,
  session_created_at timestamptz,
  reused boolean,
  already_joined boolean,
  current_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_class_id uuid;
  v_class_name text;
  v_match_deadline_at timestamptz;
  v_allow_reentry boolean;
  v_class_member boolean;
  v_membership_count integer;
  v_already_joined boolean;
  v_chosen_session_id uuid;
  v_session_status text;
  v_session_created_at timestamptz;
  v_reused boolean := false;
  v_capacity integer;
  v_member_count integer;
  v_session record;
  v_blocking_status text;
  v_allowed_statuses text[];
  v_display_name text;
  v_requested_capacity integer;
  v_class_slots integer;
  v_status text;
  v_is_forced boolean;
  v_class_candidate record;
  v_found_class boolean := false;
  v_had_candidates boolean := false;
BEGIN
  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'device_id_missing';
  END IF;

  v_display_name := COALESCE(NULLIF(btrim(p_display_name), ''), '参加者');
  v_requested_capacity := GREATEST(2, LEAST(5, COALESCE(p_requested_capacity, 5)));
  v_class_slots := GREATEST(1, COALESCE(p_class_slots, 1));
  v_is_forced := p_forced_class_id IS NOT NULL;
  v_allow_reentry := v_is_forced;

  IF v_is_forced THEN
    SELECT
      c.id,
      COALESCE(NULLIF(btrim(c.name), ''), 'クラス'),
      c.match_deadline_at
    INTO v_class_id, v_class_name, v_match_deadline_at
    FROM public.classes c
    WHERE c.id = p_forced_class_id;

    IF v_class_id IS NULL THEN
      RAISE EXCEPTION 'forced_class_not_found'
        USING DETAIL = json_build_object('classId', p_forced_class_id)::text;
    END IF;

    v_found_class := true;
  ELSE
    FOR v_class_candidate IN
      SELECT
        c.id,
        COALESCE(NULLIF(btrim(c.name), ''), 'クラス') AS name,
        c.match_deadline_at,
        EXISTS (
          SELECT 1
          FROM public.class_memberships cm
          WHERE cm.device_id = p_device_id
            AND cm.class_id = c.id
        ) AS is_member
      FROM public.classes c
      WHERE c.world_key = COALESCE(NULLIF(btrim(p_world_key), ''), 'default')
        AND (
          (p_topic_key IS NOT NULL AND c.topic_key = p_topic_key)
          OR (p_topic_key IS NULL AND c.topic_key IS NULL)
        )
        AND (
          c.match_deadline_at IS NULL
          OR c.match_deadline_at >= now()
        )
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.class_memberships cm
            WHERE cm.device_id = p_device_id
              AND cm.class_id = c.id
          ) THEN 1
          ELSE 0
        END,
        c.created_at ASC
    LOOP
      v_had_candidates := true;
      v_class_id := v_class_candidate.id;
      v_class_name := v_class_candidate.name;
      v_match_deadline_at := v_class_candidate.match_deadline_at;
      v_class_member := v_class_candidate.is_member;
      v_chosen_session_id := NULL;
      v_reused := false;

      IF v_allow_reentry AND v_class_member THEN
        v_allowed_statuses := ARRAY['forming', 'waiting', 'active', 'closed', 'expired'];
      ELSE
        v_allowed_statuses := ARRAY['forming', 'waiting'];
      END IF;

      FOR v_session IN
        SELECT s.id, s.status, s.created_at, s.capacity
        FROM public.sessions s
        WHERE s.class_id::uuid = v_class_id
          AND lower(btrim(COALESCE(s.status, ''))) = ANY (v_allowed_statuses)
        ORDER BY s.created_at ASC
        LIMIT 10
        FOR UPDATE OF s
      LOOP
        v_status := lower(btrim(COALESCE(v_session.status, '')));

        IF NOT (v_allow_reentry AND v_class_member)
           AND v_status IN ('active', 'closed', 'expired') THEN
          CONTINUE;
        END IF;

        IF p_blocked_device_ids IS NOT NULL AND cardinality(p_blocked_device_ids) > 0 THEN
          IF EXISTS (
            SELECT 1
            FROM public.session_members sm
            WHERE sm.session_id = v_session.id
              AND sm.device_id = ANY (p_blocked_device_ids)
          ) THEN
            CONTINUE;
          END IF;
        END IF;

        SELECT count(*)::integer
        INTO v_member_count
        FROM public.session_members sm
        WHERE sm.session_id = v_session.id;

        v_capacity := COALESCE(v_session.capacity, v_requested_capacity);

        IF v_member_count < v_capacity THEN
          v_chosen_session_id := v_session.id;
          v_session_status := COALESCE(v_session.status, 'forming');
          v_session_created_at := v_session.created_at;
          v_reused := true;
          v_found_class := true;
          EXIT;
        END IF;
      END LOOP;

      IF v_chosen_session_id IS NOT NULL THEN
        EXIT;
      END IF;

      IF NOT (v_allow_reentry AND v_class_member) THEN
        IF EXISTS (
          SELECT 1
          FROM public.sessions s
          WHERE s.class_id::uuid = v_class_id
            AND lower(btrim(COALESCE(s.status, ''))) IN ('active', 'closed', 'expired')
        ) THEN
          CONTINUE;
        END IF;

        INSERT INTO public.sessions (class_id, topic, status, capacity)
        VALUES (v_class_id::text, v_class_name, 'forming', v_requested_capacity)
        RETURNING id, status, created_at
        INTO v_chosen_session_id, v_session_status, v_session_created_at;

        v_reused := false;
        v_found_class := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_found_class THEN
      IF NOT v_had_candidates THEN
        RAISE EXCEPTION 'class_not_found'
          USING DETAIL = json_build_object(
            'worldKey', COALESCE(NULLIF(btrim(p_world_key), ''), 'default'),
            'topicKey', p_topic_key
          )::text;
      END IF;

      RAISE EXCEPTION 'recruitment_closed'
        USING DETAIL = json_build_object('sessionStatus', 'active')::text;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_class_id::text, 0));

  SELECT EXISTS (
    SELECT 1
    FROM public.class_memberships cm
    WHERE cm.device_id = p_device_id
      AND cm.class_id = v_class_id
  )
  INTO v_class_member;

  v_already_joined := v_class_member;

  IF v_is_forced
     AND NOT v_class_member
     AND v_match_deadline_at IS NOT NULL
     AND v_match_deadline_at < now() THEN
    RAISE EXCEPTION 'match_deadline_passed'
      USING DETAIL = json_build_object('matchDeadlineAt', v_match_deadline_at)::text;
  END IF;

  SELECT count(*)::integer
  INTO v_membership_count
  FROM public.class_memberships cm
  WHERE cm.device_id = p_device_id;

  IF NOT v_class_member THEN
    IF v_membership_count >= v_class_slots THEN
      RAISE EXCEPTION 'class_slots_limit'
        USING DETAIL = json_build_object(
          'currentCount', v_membership_count,
          'classSlots', v_class_slots
        )::text;
    END IF;

    INSERT INTO public.class_memberships (device_id, class_id)
    VALUES (p_device_id, v_class_id)
    ON CONFLICT (device_id, class_id) DO NOTHING;
  END IF;

  SELECT count(*)::integer
  INTO v_membership_count
  FROM public.class_memberships cm
  WHERE cm.device_id = p_device_id;

  IF v_is_forced THEN
    IF v_allow_reentry AND v_class_member THEN
      v_allowed_statuses := ARRAY['forming', 'waiting', 'active', 'closed', 'expired'];
    ELSE
      v_allowed_statuses := ARRAY['forming', 'waiting'];
    END IF;

    v_chosen_session_id := NULL;
    v_reused := false;

    FOR v_session IN
      SELECT s.id, s.status, s.created_at, s.capacity
      FROM public.sessions s
      WHERE s.class_id::uuid = v_class_id
        AND lower(btrim(COALESCE(s.status, ''))) = ANY (v_allowed_statuses)
      ORDER BY s.created_at ASC
      LIMIT 10
      FOR UPDATE OF s
    LOOP
      v_status := lower(btrim(COALESCE(v_session.status, '')));

      IF NOT (v_allow_reentry AND v_class_member)
         AND v_status IN ('active', 'closed', 'expired') THEN
        CONTINUE;
      END IF;

      IF p_blocked_device_ids IS NOT NULL AND cardinality(p_blocked_device_ids) > 0 THEN
        IF EXISTS (
          SELECT 1
          FROM public.session_members sm
          WHERE sm.session_id = v_session.id
            AND sm.device_id = ANY (p_blocked_device_ids)
        ) THEN
          CONTINUE;
        END IF;
      END IF;

      SELECT count(*)::integer
      INTO v_member_count
      FROM public.session_members sm
      WHERE sm.session_id = v_session.id;

      v_capacity := COALESCE(v_session.capacity, v_requested_capacity);

      IF v_member_count < v_capacity THEN
        v_chosen_session_id := v_session.id;
        v_session_status := COALESCE(v_session.status, 'forming');
        v_session_created_at := v_session.created_at;
        v_reused := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_chosen_session_id IS NULL THEN
      IF NOT (v_allow_reentry AND v_class_member) THEN
        IF v_match_deadline_at IS NOT NULL AND v_match_deadline_at < now() THEN
          RAISE EXCEPTION 'match_deadline_passed'
            USING DETAIL = json_build_object('matchDeadlineAt', v_match_deadline_at)::text;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.sessions s
          WHERE s.class_id::uuid = v_class_id
            AND lower(btrim(COALESCE(s.status, ''))) IN ('active', 'closed', 'expired')
        ) THEN
          SELECT s.status
          INTO v_blocking_status
          FROM public.sessions s
          WHERE s.class_id::uuid = v_class_id
            AND lower(btrim(COALESCE(s.status, ''))) IN ('active', 'closed', 'expired')
          ORDER BY s.created_at DESC
          LIMIT 1;

          RAISE EXCEPTION 'recruitment_closed'
            USING DETAIL = json_build_object('sessionStatus', v_blocking_status)::text;
        END IF;
      END IF;

      INSERT INTO public.sessions (class_id, topic, status, capacity)
      VALUES (v_class_id::text, v_class_name, 'forming', v_requested_capacity)
      RETURNING id, status, created_at
      INTO v_chosen_session_id, v_session_status, v_session_created_at;

      v_reused := false;
    END IF;
  END IF;

  IF v_chosen_session_id IS NULL THEN
    RAISE EXCEPTION 'session_create_failed'
      USING DETAIL = json_build_object('classId', v_class_id)::text;
  END IF;

  INSERT INTO public.session_members AS sm (
    session_id,
    device_id,
    display_name,
    joined_at,
    is_in_call
  )
  VALUES (
    v_chosen_session_id,
    p_device_id,
    v_display_name,
    now(),
    false
  )
  ON CONFLICT (session_id, device_id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    joined_at = EXCLUDED.joined_at,
    is_in_call = false;

  RETURN QUERY
  SELECT
    v_class_id,
    v_class_name,
    v_chosen_session_id,
    v_session_status,
    v_session_created_at,
    v_reused,
    v_already_joined,
    v_membership_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_join_atomic_v3(
  text, text, uuid, text, text, integer, integer, text[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
