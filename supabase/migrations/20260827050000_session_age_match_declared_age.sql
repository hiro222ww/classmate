-- Fix session_age_match_ok to use profile_age_for_device (declared_age + birth_date).
-- Without this, min-profile users (declared_age only) block all session merges.

CREATE OR REPLACE FUNCTION public.session_age_match_ok(
  p_session_id uuid,
  p_requester_age integer,
  p_requested_min_age integer,
  p_requested_max_age integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.session_members sm
    LEFT JOIN public.user_match_prefs ump ON ump.device_id = sm.device_id
    CROSS JOIN LATERAL (
      SELECT public.profile_age_for_device(sm.device_id) AS member_age
    ) ages
    WHERE sm.session_id = p_session_id
      AND (
        ages.member_age IS NULL
        OR ages.member_age < p_requested_min_age
        OR ages.member_age > p_requested_max_age
        OR p_requester_age < COALESCE(ump.min_age, 0)
        OR p_requester_age > COALESCE(ump.max_age, 120)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.session_age_match_ok(uuid, integer, integer, integer)
  TO service_role;
