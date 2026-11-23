-- Period-limited experience sessions (体験会) — additive, default OFF.
-- Does not alter random-match RPCs or existing session semantics except
-- closeEmptySessionIfNeeded skips live experience rooms (app-side).

CREATE TABLE IF NOT EXISTS public.experience_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '期間限定の体験会',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'ended'::text])),
  max_members integer NOT NULL DEFAULT 5
    CHECK (max_members >= 1 AND max_members <= 5),
  class_id uuid,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_events_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS experience_events_starts_at_idx
  ON public.experience_events (starts_at DESC);
CREATE INDEX IF NOT EXISTS experience_events_status_window_idx
  ON public.experience_events (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS experience_events_session_id_idx
  ON public.experience_events (session_id)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.experience_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.experience_events(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  user_id uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  talk_seconds integer NOT NULL DEFAULT 0,
  is_first_experience boolean NOT NULL DEFAULT false,
  used_random_after boolean NOT NULL DEFAULT false,
  used_class_after boolean NOT NULL DEFAULT false,
  UNIQUE (event_id, device_id)
);

CREATE INDEX IF NOT EXISTS experience_participations_device_idx
  ON public.experience_participations (device_id, joined_at DESC);

COMMENT ON TABLE public.experience_events IS
  'Temporary timed experience sessions (体験会). Feature gated by app_settings experience_sessions_feature_enabled.';
COMMENT ON TABLE public.experience_participations IS
  'Per-device join metrics for experience sessions. No PII beyond device/user ids.';

-- Default kill switch OFF (idempotent upsert).
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('experience_sessions_feature_enabled', 'false'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- Atomic join: one room per event, hard cap, allows solo, keeps room while event live.
CREATE OR REPLACE FUNCTION public.experience_event_join(
  p_event_id uuid,
  p_device_id text,
  p_display_name text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean := false;
  v_setting jsonb;
  v_event public.experience_events%ROWTYPE;
  v_now timestamptz := now();
  v_class_id uuid;
  v_session_id uuid;
  v_member_count integer := 0;
  v_already boolean := false;
  v_display text;
  v_first boolean := false;
BEGIN
  p_device_id := nullif(btrim(p_device_id), '');
  v_display := nullif(btrim(p_display_name), '');
  IF p_event_id IS NULL OR p_device_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_params');
  END IF;
  IF v_display IS NULL THEN
    v_display := '参加者';
  END IF;
  IF char_length(v_display) > 40 THEN
    v_display := left(v_display, 40);
  END IF;

  SELECT value INTO v_setting
  FROM public.app_settings
  WHERE key = 'experience_sessions_feature_enabled'
  LIMIT 1;

  IF v_setting IS NULL THEN
    v_enabled := false;
  ELSIF jsonb_typeof(v_setting) = 'boolean' THEN
    v_enabled := (v_setting = 'true'::jsonb);
  ELSIF jsonb_typeof(v_setting) = 'number' THEN
    v_enabled := ((v_setting #>> '{}')::numeric <> 0);
  ELSE
    v_enabled := lower(trim(both '"' from COALESCE(v_setting #>> '{}', '')))
      IN ('1', 'true', 'yes', 'on');
  END IF;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_disabled');
  END IF;

  SELECT * INTO v_event
  FROM public.experience_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_found');
  END IF;

  IF v_event.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_cancelled');
  END IF;

  IF v_now < v_event.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_not_started');
  END IF;

  IF v_now >= v_event.ends_at OR v_event.status = 'ended' THEN
    IF v_event.status <> 'ended' THEN
      UPDATE public.experience_events
      SET status = 'ended', updated_at = v_now
      WHERE id = v_event.id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'event_ended');
  END IF;

  -- Ensure dedicated class + session (1 room / event).
  v_class_id := v_event.class_id;
  v_session_id := v_event.session_id;

  IF v_class_id IS NULL THEN
    INSERT INTO public.classes (
      name, description, world_key, topic_key, min_age, is_sensitive, is_user_created, lifecycle
    ) VALUES (
      COALESCE(nullif(btrim(v_event.title), ''), '期間限定の体験会'),
      '体験会専用ルーム',
      -- Must reference existing worlds.world_key (FK). topic_key left null.
      'default',
      NULL,
      18,
      false,
      false,
      'official'
    )
    RETURNING id INTO v_class_id;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.sessions (class_id, topic, status, capacity, entry_mode)
    VALUES (
      v_class_id::text,
      COALESCE(nullif(btrim(v_event.title), ''), '期間限定の体験会'),
      'active',
      LEAST(GREATEST(v_event.max_members, 2), 5),
      'voice'
    )
    RETURNING id INTO v_session_id;
  ELSE
    -- Re-open if previous empty-close happened; keep room during live window.
    UPDATE public.sessions
    SET status = 'active',
        capacity = LEAST(GREATEST(v_event.max_members, 2), 5),
        entry_mode = 'voice',
        class_id = COALESCE(class_id, v_class_id::text)
    WHERE id = v_session_id
      AND lower(btrim(status)) IN ('closed', 'ended', 'expired', 'forming', 'waiting', 'active');
  END IF;

  UPDATE public.experience_events
  SET class_id = v_class_id,
      session_id = v_session_id,
      updated_at = v_now
  WHERE id = v_event.id;

  SELECT EXISTS (
    SELECT 1 FROM public.session_members sm
    WHERE sm.session_id = v_session_id AND sm.device_id = p_device_id
  ) INTO v_already;

  SELECT COUNT(*)::int INTO v_member_count
  FROM public.session_members sm
  WHERE sm.session_id = v_session_id
    AND sm.device_id IS NOT NULL
    AND btrim(sm.device_id) <> '';

  IF NOT v_already AND v_member_count >= v_event.max_members THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'event_full',
      'member_count', v_member_count,
      'max_members', v_event.max_members,
      'session_id', v_session_id,
      'class_id', v_class_id
    );
  END IF;

  INSERT INTO public.session_members AS sm (
    session_id, device_id, display_name, is_in_call, user_id
  ) VALUES (
    v_session_id, p_device_id, v_display, true, p_user_id
  )
  ON CONFLICT (session_id, device_id) DO UPDATE
  SET is_in_call = true,
      display_name = COALESCE(nullif(btrim(EXCLUDED.display_name), ''), sm.display_name),
      user_id = COALESCE(sm.user_id, EXCLUDED.user_id);

  -- Class membership so call page membership checks pass.
  INSERT INTO public.class_memberships (class_id, device_id, user_id, role, status)
  VALUES (v_class_id, p_device_id, p_user_id, 'member', 'active')
  ON CONFLICT (device_id, class_id) DO UPDATE
  SET status = 'active',
      left_at = NULL,
      user_id = COALESCE(public.class_memberships.user_id, EXCLUDED.user_id);

  SELECT COUNT(*)::int INTO v_member_count
  FROM public.session_members sm
  WHERE sm.session_id = v_session_id
    AND sm.device_id IS NOT NULL
    AND btrim(sm.device_id) <> '';

  -- Hard safety: if somehow over cap, remove this joiner and reject.
  IF v_member_count > v_event.max_members THEN
    DELETE FROM public.session_members
    WHERE session_id = v_session_id AND device_id = p_device_id;
    SELECT COUNT(*)::int INTO v_member_count
    FROM public.session_members sm
    WHERE sm.session_id = v_session_id
      AND sm.device_id IS NOT NULL
      AND btrim(sm.device_id) <> '';
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'event_full',
      'member_count', v_member_count,
      'max_members', v_event.max_members
    );
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.experience_participations ep
    WHERE ep.device_id = p_device_id
  ) INTO v_first;

  INSERT INTO public.experience_participations (
    event_id, device_id, user_id, joined_at, left_at, is_first_experience
  ) VALUES (
    v_event.id, p_device_id, p_user_id, v_now, NULL, v_first
  )
  ON CONFLICT (event_id, device_id) DO UPDATE
  SET joined_at = EXCLUDED.joined_at,
      left_at = NULL,
      user_id = COALESCE(public.experience_participations.user_id, EXCLUDED.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'session_id', v_session_id,
    'class_id', v_class_id,
    'member_count', v_member_count,
    'max_members', v_event.max_members,
    'ends_at', v_event.ends_at,
    'rejoined', v_already
  );
END;
$$;

REVOKE ALL ON FUNCTION public.experience_event_join(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.experience_event_join(uuid, text, text, uuid) TO service_role;
