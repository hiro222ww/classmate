-- Multi-device login: resolve profile age + class membership via user_id (user_devices)

CREATE OR REPLACE FUNCTION public.profile_age_for_device(p_device_id text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH actor AS (
    SELECT ud.user_id
    FROM public.user_devices ud
    WHERE ud.device_id = p_device_id
    LIMIT 1
  )
  SELECT CASE
    WHEN up.birth_date IS NULL THEN NULL
    ELSE (
      date_part('year', age(current_date, up.birth_date::date))
    )::integer
  END
  FROM public.user_profiles up
  WHERE up.device_id = p_device_id
     OR (
       up.user_id IS NOT NULL
       AND up.user_id = (SELECT user_id FROM actor)
     )
  ORDER BY CASE WHEN up.device_id = p_device_id THEN 0 ELSE 1 END
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.profile_age_for_device(text) TO service_role;

CREATE OR REPLACE FUNCTION public.match_join_atomic_v3(
  p_device_id text,
  p_display_name text,
  p_forced_class_id uuid DEFAULT NULL,
  p_world_key text DEFAULT 'default',
  p_topic_key text DEFAULT NULL,
  p_requested_capacity integer DEFAULT 5,
  p_class_slots integer DEFAULT 1,
  p_blocked_device_ids text[] DEFAULT ARRAY[]::text[],
  p_requested_min_age integer DEFAULT NULL,
  p_requested_max_age integer DEFAULT NULL
)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  session_id uuid,
  session_status text,
  session_created_at timestamptz,
  reused boolean,
  already_joined boolean,
  current_count integer,
  expired_count integer,
  candidate_session_count integer,
  created_new_session boolean,
  created_new_class boolean,
  race_merged boolean
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
  v_display_name text;
  v_requested_capacity integer;
  v_class_slots integer;
  v_status text;
  v_is_forced boolean;
  v_class_candidate record;
  v_found_class boolean := false;
  v_recruitment_ttl_minutes integer := 5;
  v_recruitment_unlimited boolean := false;
  v_recruitment_cutoff timestamptz;
  v_world_key text;
  v_topic_lock_key text;
  v_expired_count integer := 0;
  v_candidate_session_count integer := 0;
  v_created_new_session boolean := false;
  v_created_new_class boolean := false;
  v_expired_batch integer := 0;
  v_topic_min_age integer := 0;
  v_topic_is_sensitive boolean := false;
  v_match_lock_key text;
  v_requester_age integer;
  v_req_min_age integer;
  v_req_max_age integer;
  v_race_merged boolean := false;
  v_alt_session_id uuid;
  v_alt_class_id uuid;
  v_alt_class_name text;
  v_alt_match_deadline timestamptz;
  v_alt_session_status text;
  v_alt_session_created_at timestamptz;
  v_user_id uuid;
BEGIN
  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RAISE EXCEPTION 'device_id_missing';
  END IF;

  SELECT ud.user_id
  INTO v_user_id
  FROM public.user_devices ud
  WHERE ud.device_id = p_device_id
  LIMIT 1;

  v_world_key := COALESCE(NULLIF(btrim(p_world_key), ''), 'default');

  SELECT
    COALESCE((value->>'unlimited')::boolean, false),
    COALESCE(
      NULLIF((value->>'minutes')::integer, 0),
      NULLIF(value::text::integer, 0)
    )
  INTO v_recruitment_unlimited, v_recruitment_ttl_minutes
  FROM public.app_settings
  WHERE key = 'recruitment_session_ttl_minutes';

  IF v_recruitment_unlimited THEN
    v_recruitment_ttl_minutes := NULL;
    v_recruitment_cutoff := NULL;
  ELSE
    IF v_recruitment_ttl_minutes IS NULL OR v_recruitment_ttl_minutes <= 0 THEN
      v_recruitment_ttl_minutes := 5;
    END IF;

    v_recruitment_ttl_minutes := GREATEST(1, LEAST(1440, v_recruitment_ttl_minutes));
    v_recruitment_cutoff := now() - (v_recruitment_ttl_minutes || ' minutes')::interval;
  END IF;

  v_display_name := COALESCE(NULLIF(btrim(p_display_name), ''), '参加者');
  v_requested_capacity := GREATEST(2, LEAST(5, COALESCE(p_requested_capacity, 5)));
  v_class_slots := GREATEST(1, COALESCE(p_class_slots, 1));
  v_is_forced := p_forced_class_id IS NOT NULL;
  v_allow_reentry := v_is_forced;

  v_req_min_age := COALESCE(p_requested_min_age, 0);
  v_req_max_age := COALESCE(p_requested_max_age, 120);
  IF v_req_min_age > v_req_max_age THEN
    v_req_min_age := v_req_max_age;
  END IF;

  v_requester_age := public.profile_age_for_device(p_device_id);

  IF NOT v_is_forced AND v_requester_age IS NULL THEN
    RAISE EXCEPTION 'profile_age_required';
  END IF;

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
    IF NOT v_recruitment_unlimited THEN
      UPDATE public.sessions s
      SET status = 'expired'
      FROM public.classes c
      WHERE c.id = s.class_id::uuid
        AND c.world_key = v_world_key
        AND (
          (p_topic_key IS NOT NULL AND c.topic_key = p_topic_key)
          OR (p_topic_key IS NULL AND c.topic_key IS NULL)
        )
        AND lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
        AND s.created_at < v_recruitment_cutoff;

      GET DIAGNOSTICS v_expired_batch = ROW_COUNT;
      v_expired_count := v_expired_count + v_expired_batch;
    END IF;

    -- Serialize all concurrent joins for the same world+topic (age/capacity filter in loop).
    v_match_lock_key :=
      'match:' ||
      v_world_key || ':' ||
      COALESCE(p_topic_key, 'free');

    PERFORM pg_advisory_xact_lock(hashtextextended(v_match_lock_key, 0));

    IF NOT v_recruitment_unlimited THEN
      UPDATE public.sessions s
      SET status = 'expired'
      FROM public.classes c
      WHERE c.id = s.class_id::uuid
        AND c.world_key = v_world_key
        AND (
          (p_topic_key IS NOT NULL AND c.topic_key = p_topic_key)
          OR (p_topic_key IS NULL AND c.topic_key IS NULL)
        )
        AND lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
        AND s.created_at < v_recruitment_cutoff;

      GET DIAGNOSTICS v_expired_batch = ROW_COUNT;
      v_expired_count := v_expired_count + v_expired_batch;
    END IF;

    v_found_class := false;
    v_chosen_session_id := NULL;
    v_reused := false;
    v_created_new_class := false;
    v_created_new_session := false;

    SELECT count(*)::integer
    INTO v_candidate_session_count
    FROM public.sessions s
    INNER JOIN public.classes c ON c.id = s.class_id::uuid
    WHERE c.world_key = v_world_key
      AND (
        (p_topic_key IS NOT NULL AND c.topic_key = p_topic_key)
        OR (p_topic_key IS NULL AND c.topic_key IS NULL)
      )
      AND (
        c.match_deadline_at IS NULL
        OR c.match_deadline_at >= now()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.class_memberships cm
        WHERE (
          cm.device_id = p_device_id
          OR (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        )
          AND cm.class_id = c.id
      )
      AND lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
      AND (v_recruitment_unlimited OR s.created_at >= v_recruitment_cutoff);

    FOR v_session IN
      SELECT
        s.id,
        s.status,
        s.created_at,
        s.capacity,
        c.id AS class_row_id,
        COALESCE(NULLIF(btrim(c.name), ''), 'クラス') AS class_row_name,
        c.match_deadline_at AS class_match_deadline_at
      FROM public.sessions s
      INNER JOIN public.classes c ON c.id = s.class_id::uuid
      WHERE c.world_key = v_world_key
        AND (
          (p_topic_key IS NOT NULL AND c.topic_key = p_topic_key)
          OR (p_topic_key IS NULL AND c.topic_key IS NULL)
        )
        AND (
          c.match_deadline_at IS NULL
          OR c.match_deadline_at >= now()
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.class_memberships cm
          WHERE (
          cm.device_id = p_device_id
          OR (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        )
            AND cm.class_id = c.id
        )
        AND lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
        AND (v_recruitment_unlimited OR s.created_at >= v_recruitment_cutoff)
      ORDER BY s.created_at ASC
      FOR UPDATE OF s
    LOOP
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

      IF NOT v_is_forced
         AND NOT public.session_age_match_ok(
           v_session.id,
           v_requester_age,
           v_req_min_age,
           v_req_max_age
         ) THEN
        CONTINUE;
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
        v_class_id := v_session.class_row_id;
        v_class_name := v_session.class_row_name;
        v_match_deadline_at := v_session.class_match_deadline_at;
        v_reused := true;
        v_found_class := true;
        EXIT;
      END IF;
    END LOOP;

    -- Pre-create re-search under topic lock (catch sessions committed just before create).
    IF NOT v_found_class THEN
      FOR v_session IN
        SELECT
          s.id,
          s.status,
          s.created_at,
          s.capacity,
          c.id AS class_row_id,
          COALESCE(NULLIF(btrim(c.name), ''), 'クラス') AS class_row_name,
          c.match_deadline_at AS class_match_deadline_at
        FROM public.sessions s
        INNER JOIN public.classes c ON c.id = s.class_id::uuid
        WHERE c.world_key = v_world_key
          AND (
            (p_topic_key IS NOT NULL AND c.topic_key = p_topic_key)
            OR (p_topic_key IS NULL AND c.topic_key IS NULL)
          )
          AND (
            c.match_deadline_at IS NULL
            OR c.match_deadline_at >= now()
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.class_memberships cm
            WHERE (
          cm.device_id = p_device_id
          OR (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        )
              AND cm.class_id = c.id
          )
          AND lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
          AND (v_recruitment_unlimited OR s.created_at >= v_recruitment_cutoff)
        ORDER BY s.created_at ASC
        FOR UPDATE OF s
      LOOP
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

        IF NOT v_is_forced
           AND NOT public.session_age_match_ok(
             v_session.id,
             v_requester_age,
             v_req_min_age,
             v_req_max_age
           ) THEN
          CONTINUE;
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
          v_class_id := v_session.class_row_id;
          v_class_name := v_session.class_row_name;
          v_match_deadline_at := v_session.class_match_deadline_at;
          v_reused := true;
          v_found_class := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_found_class THEN
      v_class_name := public.allocate_system_class_name();
      v_topic_min_age := 0;
      v_topic_is_sensitive := false;

      IF p_topic_key IS NOT NULL THEN
        SELECT
          COALESCE(t.min_age, 0),
          COALESCE(t.is_sensitive, false)
        INTO v_topic_min_age, v_topic_is_sensitive
        FROM public.topics t
        WHERE t.topic_key = p_topic_key
        LIMIT 1;
      END IF;

      INSERT INTO public.classes (
        name,
        description,
        world_key,
        topic_key,
        min_age,
        is_sensitive,
        is_user_created
      )
      VALUES (
        v_class_name,
        '',
        v_world_key,
        p_topic_key,
        v_topic_min_age,
        v_topic_is_sensitive,
        false
      )
      RETURNING id, name, match_deadline_at
      INTO v_class_id, v_class_name, v_match_deadline_at;

      INSERT INTO public.sessions (class_id, topic, status, capacity)
      VALUES (v_class_id::text, v_class_name, 'forming', v_requested_capacity)
      RETURNING id, status, created_at
      INTO v_chosen_session_id, v_session_status, v_session_created_at;

      v_reused := false;
      v_created_new_session := true;
      v_created_new_class := true;
      v_found_class := true;

      -- If another device created a duplicate class/session moments ago, join that instead.
      SELECT
        s2.id,
        c2.id,
        COALESCE(NULLIF(btrim(c2.name), ''), 'クラス'),
        c2.match_deadline_at,
        COALESCE(s2.status, 'forming'),
        s2.created_at
      INTO
        v_alt_session_id,
        v_alt_class_id,
        v_alt_class_name,
        v_alt_match_deadline,
        v_alt_session_status,
        v_alt_session_created_at
      FROM public.sessions s2
      INNER JOIN public.classes c2 ON c2.id = s2.class_id::uuid
      WHERE c2.world_key = v_world_key
        AND (
          (p_topic_key IS NOT NULL AND c2.topic_key = p_topic_key)
          OR (p_topic_key IS NULL AND c2.topic_key IS NULL)
        )
        AND c2.id IS DISTINCT FROM v_class_id
        AND lower(btrim(COALESCE(s2.status, ''))) IN ('forming', 'waiting')
        AND (v_recruitment_unlimited OR s2.created_at >= v_recruitment_cutoff)
        AND s2.created_at >= now() - interval '3 minutes'
        AND s2.id IS DISTINCT FROM v_chosen_session_id
      ORDER BY
        (
          SELECT count(*)::integer
          FROM public.session_members sm2
          WHERE sm2.session_id = s2.id
        ) DESC,
        s2.created_at ASC
      LIMIT 1
      FOR UPDATE OF s2;

      IF v_alt_session_id IS NOT NULL THEN
        SELECT count(*)::integer
        INTO v_member_count
        FROM public.session_members sm
        WHERE sm.session_id = v_alt_session_id;

        SELECT COALESCE(s2.capacity, v_requested_capacity)
        INTO v_capacity
        FROM public.sessions s2
        WHERE s2.id = v_alt_session_id;

        IF v_member_count < v_capacity
           AND (
             v_is_forced
             OR public.session_age_match_ok(
               v_alt_session_id,
               v_requester_age,
               v_req_min_age,
               v_req_max_age
             )
           ) THEN
          UPDATE public.sessions
          SET status = 'expired'
          WHERE id = v_chosen_session_id;

          v_chosen_session_id := v_alt_session_id;
          v_class_id := v_alt_class_id;
          v_class_name := v_alt_class_name;
          v_match_deadline_at := v_alt_match_deadline;
          v_session_status := v_alt_session_status;
          v_session_created_at := v_alt_session_created_at;
          v_reused := true;
          v_created_new_class := false;
          v_created_new_session := false;
          v_race_merged := true;
        END IF;
      END IF;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_class_id::text, 0));

  IF NOT v_recruitment_unlimited THEN
    UPDATE public.sessions s
    SET status = 'expired'
    WHERE s.class_id::uuid = v_class_id
      AND lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
      AND s.created_at < v_recruitment_cutoff
      AND s.id IS DISTINCT FROM v_chosen_session_id;

    GET DIAGNOSTICS v_expired_batch = ROW_COUNT;
    v_expired_count := v_expired_count + v_expired_batch;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.class_memberships cm
    WHERE (
          cm.device_id = p_device_id
          OR (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        )
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
  INNER JOIN public.classes c ON c.id = cm.class_id
  WHERE (
          cm.device_id = p_device_id
          OR (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        )
    AND NOT public.is_legacy_entry_class_name(c.name);

  IF NOT v_class_member AND NOT v_is_forced THEN
    IF v_membership_count >= v_class_slots THEN
      RAISE EXCEPTION 'class_slots_limit'
        USING DETAIL = json_build_object(
          'currentCount', v_membership_count,
          'classSlots', v_class_slots
        )::text;
    END IF;

    INSERT INTO public.class_memberships (device_id, class_id, user_id)
    VALUES (p_device_id, v_class_id, v_user_id)
    ON CONFLICT (device_id, class_id) DO UPDATE
    SET user_id = COALESCE(class_memberships.user_id, EXCLUDED.user_id);
  ELSIF NOT v_class_member THEN
    INSERT INTO public.class_memberships (device_id, class_id, user_id)
    VALUES (p_device_id, v_class_id, v_user_id)
    ON CONFLICT (device_id, class_id) DO UPDATE
    SET user_id = COALESCE(class_memberships.user_id, EXCLUDED.user_id);
  END IF;

  SELECT count(*)::integer
  INTO v_membership_count
  FROM public.class_memberships cm
  INNER JOIN public.classes c ON c.id = cm.class_id
  WHERE (
          cm.device_id = p_device_id
          OR (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        )
    AND NOT public.is_legacy_entry_class_name(c.name);

  IF v_is_forced THEN
    v_chosen_session_id := NULL;
    v_reused := false;

    FOR v_session IN
      SELECT s.id, s.status, s.created_at, s.capacity
      FROM public.sessions s
      WHERE s.class_id::uuid = v_class_id
        AND (
          lower(btrim(COALESCE(s.status, ''))) IN ('active', 'closed', 'expired')
          OR (
            lower(btrim(COALESCE(s.status, ''))) IN ('forming', 'waiting')
            AND (v_recruitment_unlimited OR s.created_at >= v_recruitment_cutoff)
          )
        )
      ORDER BY
        CASE lower(btrim(COALESCE(s.status, '')))
          WHEN 'active' THEN 0
          WHEN 'closed' THEN 1
          WHEN 'expired' THEN 2
          WHEN 'waiting' THEN 3
          WHEN 'forming' THEN 4
          ELSE 5
        END,
        s.created_at DESC
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
      v_created_new_session := true;
    END IF;
  END IF;

  IF v_chosen_session_id IS NULL THEN
    RAISE EXCEPTION 'session_create_failed'
      USING DETAIL = json_build_object('classId', v_class_id)::text;
  END IF;

  INSERT INTO public.session_members AS sm (
    session_id,
    device_id,
    user_id,
    display_name,
    joined_at,
    is_in_call
  )
  VALUES (
    v_chosen_session_id,
    p_device_id,
    v_user_id,
    v_display_name,
    now(),
    false
  )
  ON CONFLICT (session_id, device_id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    joined_at = EXCLUDED.joined_at,
    is_in_call = false,
    user_id = COALESCE(sm.user_id, EXCLUDED.user_id);

  RETURN QUERY
  SELECT
    v_class_id,
    v_class_name,
    v_chosen_session_id,
    v_session_status,
    v_session_created_at,
    v_reused,
    v_already_joined,
    v_membership_count,
    v_expired_count,
    v_candidate_session_count,
    v_created_new_session,
    v_created_new_class,
    v_race_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_join_atomic_v3(
  text, text, uuid, text, text, integer, integer, text[], integer, integer
) TO service_role;

NOTIFY pgrst, 'reload schema';
