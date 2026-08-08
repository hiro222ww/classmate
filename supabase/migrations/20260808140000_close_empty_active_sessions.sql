-- One-time cleanup: close zombie active sessions that have no real members.
-- Historical gap: class leave deleted session_members without closing the session.
-- Does not touch class_memberships, class_presence, or sessions that still have members.

UPDATE public.sessions AS s
SET status = 'closed'
WHERE lower(btrim(COALESCE(s.status, ''))) = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.session_members AS sm
    WHERE sm.session_id = s.id
      AND sm.device_id IS NOT NULL
      AND btrim(sm.device_id) <> ''
  );
