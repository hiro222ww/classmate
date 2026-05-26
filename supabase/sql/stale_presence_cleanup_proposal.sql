-- Non-destructive cleanup proposals for stale presence / session display drift.
-- Review counts with SELECT before running UPDATE. Do NOT run DELETE without backup.

-- 1) Mark stale class_presence as offline (last seen > 10 minutes)
-- SELECT count(*) FROM public.class_presence
-- WHERE last_seen_at < now() - interval '10 minutes'
--   AND coalesce(status, '') <> 'offline';

UPDATE public.class_presence
SET
  status = 'offline',
  screen = 'offline'
WHERE last_seen_at < now() - interval '10 minutes'
  AND coalesce(status, '') <> 'offline';

-- 2) Clear call screen when heartbeat is stale but still says call (> 3 minutes)
-- SELECT count(*) FROM public.class_presence
-- WHERE screen = 'call'
--   AND last_seen_at < now() - interval '3 minutes';

UPDATE public.class_presence
SET
  screen = 'offline',
  status = 'offline'
WHERE screen = 'call'
  AND last_seen_at < now() - interval '3 minutes';

-- 3) Reset is_in_call on session_members when presence is clearly stale (optional)
-- Requires joining class_presence; only affects rows still flagged in_call.
-- SELECT count(*) FROM public.session_members sm
-- JOIN public.sessions s ON s.id = sm.session_id
-- LEFT JOIN public.class_presence cp
--   ON cp.device_id = sm.device_id AND cp.class_id = s.class_id::uuid
-- WHERE sm.is_in_call = true
--   AND (
--     cp.last_seen_at IS NULL
--     OR cp.last_seen_at < now() - interval '5 minutes'
--     OR coalesce(cp.screen, '') <> 'call'
--   );

UPDATE public.session_members sm
SET is_in_call = false
FROM public.sessions s
LEFT JOIN public.class_presence cp
  ON cp.device_id = sm.device_id
 AND cp.class_id = s.class_id::uuid
WHERE sm.session_id = s.id
  AND sm.is_in_call = true
  AND (
    cp.last_seen_at IS NULL
    OR cp.last_seen_at < now() - interval '5 minutes'
    OR coalesce(cp.screen, '') <> 'call'
  );

-- 4) Expire very old forming/waiting sessions (> 24h) as safety net (TTL admin setting is primary)
-- SELECT status, count(*) FROM public.sessions
-- WHERE lower(status) IN ('forming', 'waiting')
--   AND created_at < now() - interval '24 hours'
-- GROUP BY status;

UPDATE public.sessions
SET status = 'expired'
WHERE lower(btrim(coalesce(status, ''))) IN ('forming', 'waiting')
  AND created_at < now() - interval '24 hours';
