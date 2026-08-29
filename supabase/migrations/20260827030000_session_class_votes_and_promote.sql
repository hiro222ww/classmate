-- Phase 2: in-call class votes and provisional → official promotion.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS class_vote_reminders_sent integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.session_class_votes (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  user_id uuid NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, device_id)
);

CREATE INDEX IF NOT EXISTS session_class_votes_session_id_idx
  ON public.session_class_votes (session_id);

ALTER TABLE public.session_class_votes ENABLE ROW LEVEL SECURITY;

-- Promote provisional class when ≥3 yes votes exist for the session.
-- Idempotent when already official with promoted_from_session_id = p_session_id.
CREATE OR REPLACE FUNCTION public.promote_provisional_class_from_session(
  p_session_id uuid,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := p_session_id;
  v_device_id text := NULLIF(btrim(COALESCE(p_device_id, '')), '');
  v_class_id uuid;
  v_lifecycle text;
  v_promoted_from uuid;
  v_class_name text;
  v_vote_count integer := 0;
  v_lock_key text;
  v_voter record;
  v_user_id uuid;
BEGIN
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_session',
      'vote_count', 0
    );
  END IF;

  -- Serialize promote attempts per session.
  v_lock_key := 'promote_provisional_class:' || v_session_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT s.class_id::uuid
  INTO v_class_id
  FROM public.sessions s
  WHERE s.id = v_session_id
  LIMIT 1;

  IF v_class_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'session_not_found',
      'vote_count', 0
    );
  END IF;

  SELECT
    c.lifecycle,
    c.promoted_from_session_id,
    COALESCE(NULLIF(btrim(c.name), ''), 'クラス')
  INTO v_lifecycle, v_promoted_from, v_class_name
  FROM public.classes c
  WHERE c.id = v_class_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'class_not_found',
      'vote_count', 0
    );
  END IF;

  SELECT count(*)::integer
  INTO v_vote_count
  FROM public.session_class_votes v
  WHERE v.session_id = v_session_id;

  -- Already promoted from this session: idempotent success.
  IF
    lower(btrim(COALESCE(v_lifecycle, ''))) = 'official'
    AND v_promoted_from IS NOT NULL
    AND v_promoted_from = v_session_id
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'already_promoted',
      'promoted', true,
      'vote_count', v_vote_count,
      'class_id', v_class_id,
      'class_name', v_class_name
    );
  END IF;

  IF lower(btrim(COALESCE(v_lifecycle, ''))) <> 'provisional' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_provisional',
      'vote_count', v_vote_count,
      'class_id', v_class_id,
      'class_name', v_class_name,
      'lifecycle', v_lifecycle
    );
  END IF;

  IF v_vote_count < 3 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'need_more_votes',
      'vote_count', v_vote_count,
      'class_id', v_class_id,
      'class_name', v_class_name
    );
  END IF;

  -- Keep existing system serial name when already allocated; otherwise allocate.
  IF v_class_name IS NULL
     OR btrim(v_class_name) = ''
     OR btrim(v_class_name) = 'クラス'
     OR btrim(v_class_name) !~ '^クラス[0-9]{4}[A-Z]$'
  THEN
    v_class_name := public.allocate_system_class_name();
  END IF;

  UPDATE public.classes c
  SET
    lifecycle = 'official',
    promoted_from_session_id = v_session_id,
    name = v_class_name
  WHERE c.id = v_class_id
    AND c.lifecycle = 'provisional';

  IF NOT FOUND THEN
    -- Race: another txn may have promoted; re-read for idempotent result.
    SELECT
      c.lifecycle,
      c.promoted_from_session_id,
      COALESCE(NULLIF(btrim(c.name), ''), 'クラス')
    INTO v_lifecycle, v_promoted_from, v_class_name
    FROM public.classes c
    WHERE c.id = v_class_id
    LIMIT 1;

    IF
      lower(btrim(COALESCE(v_lifecycle, ''))) = 'official'
      AND v_promoted_from = v_session_id
    THEN
      RETURN jsonb_build_object(
        'ok', true,
        'reason', 'already_promoted',
        'promoted', true,
        'vote_count', v_vote_count,
        'class_id', v_class_id,
        'class_name', v_class_name
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'promote_race',
      'vote_count', v_vote_count,
      'class_id', v_class_id
    );
  END IF;

  -- Drop memberships for devices that did not vote yes.
  DELETE FROM public.class_memberships cm
  WHERE cm.class_id = v_class_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.session_class_votes v
      WHERE v.session_id = v_session_id
        AND v.device_id = cm.device_id
    );

  -- Ensure every voter has a class membership.
  FOR v_voter IN
    SELECT
      v.device_id,
      v.user_id
    FROM public.session_class_votes v
    WHERE v.session_id = v_session_id
  LOOP
    v_user_id := v_voter.user_id;
    IF v_user_id IS NULL THEN
      SELECT ud.user_id
      INTO v_user_id
      FROM public.user_devices ud
      WHERE ud.device_id = v_voter.device_id
      LIMIT 1;
    END IF;

    INSERT INTO public.class_memberships (device_id, class_id, user_id, joined_at)
    VALUES (v_voter.device_id, v_class_id, v_user_id, now())
    ON CONFLICT (device_id, class_id) DO UPDATE
      SET user_id = COALESCE(EXCLUDED.user_id, public.class_memberships.user_id);
  END LOOP;

  SELECT COALESCE(NULLIF(btrim(c.name), ''), v_class_name)
  INTO v_class_name
  FROM public.classes c
  WHERE c.id = v_class_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'promoted',
    'promoted', true,
    'vote_count', v_vote_count,
    'class_id', v_class_id,
    'class_name', v_class_name,
    'caller_device_id', v_device_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_provisional_class_from_session(uuid, text)
  TO service_role;
