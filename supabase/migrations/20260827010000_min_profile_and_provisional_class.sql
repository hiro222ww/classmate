-- Phase 1: declared age, provisional classes, session join window columns.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS declared_age integer,
  ADD COLUMN IF NOT EXISTS declared_age_as_of date;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_declared_age_range;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_declared_age_range
  CHECK (
    declared_age IS NULL
    OR (declared_age >= 0 AND declared_age <= 120)
  );

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS promoted_from_session_id uuid;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_lifecycle_check;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_lifecycle_check
  CHECK (lifecycle IN ('provisional', 'official'));

CREATE UNIQUE INDEX IF NOT EXISTS classes_promoted_from_session_id_unique
  ON public.classes (promoted_from_session_id)
  WHERE promoted_from_session_id IS NOT NULL;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS join_open_until timestamptz,
  ADD COLUMN IF NOT EXISTS members_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lobby_extended_once boolean NOT NULL DEFAULT false;

-- Effective age: birth_date wins; else declared_age advanced by calendar years since as_of.
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
  ),
  profile AS (
    SELECT
      up.birth_date,
      up.declared_age,
      up.declared_age_as_of
    FROM public.user_profiles up
    WHERE up.device_id = p_device_id
       OR (
         up.user_id IS NOT NULL
         AND up.user_id = (SELECT user_id FROM actor)
       )
    ORDER BY CASE WHEN up.device_id = p_device_id THEN 0 ELSE 1 END
    LIMIT 1
  )
  SELECT CASE
    WHEN profile.birth_date IS NOT NULL THEN (
      date_part('year', age(current_date, profile.birth_date::date))
    )::integer
    WHEN profile.declared_age IS NOT NULL THEN (
      profile.declared_age
      + GREATEST(
          0,
          date_part(
            'year',
            age(
              current_date,
              COALESCE(profile.declared_age_as_of, current_date)
            )
          )::integer
        )
    )
    ELSE NULL
  END
  FROM profile;
$$;

GRANT EXECUTE ON FUNCTION public.profile_age_for_device(text) TO service_role;

CREATE OR REPLACE FUNCTION public.is_billable_class_for_slots(
  p_name text,
  p_lifecycle text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    NOT public.is_legacy_entry_class_name(p_name)
    AND COALESCE(NULLIF(btrim(p_lifecycle), ''), 'official') <> 'provisional';
$$;

GRANT EXECUTE ON FUNCTION public.is_billable_class_for_slots(text, text) TO service_role;

-- Free-queue system classes (no topic, not user-created) start as provisional.
CREATE OR REPLACE FUNCTION public.classes_default_provisional_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lifecycle IS NULL OR NEW.lifecycle = 'official' THEN
    IF NEW.topic_key IS NULL AND COALESCE(NEW.is_user_created, false) = false THEN
      NEW.lifecycle := 'provisional';
    ELSE
      NEW.lifecycle := COALESCE(NEW.lifecycle, 'official');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classes_default_provisional_lifecycle ON public.classes;
CREATE TRIGGER trg_classes_default_provisional_lifecycle
  BEFORE INSERT ON public.classes
  FOR EACH ROW
  EXECUTE PROCEDURE public.classes_default_provisional_lifecycle();
