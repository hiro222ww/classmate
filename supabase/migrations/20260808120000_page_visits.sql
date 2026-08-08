-- Page visit logs for admin ops analytics (no IP storage).
-- Writes only via service-role API; RLS enabled with no public policies.

CREATE TABLE IF NOT EXISTS public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  device_id text NULL,
  path text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  referrer text NULL,
  user_agent text NULL
);

CREATE INDEX IF NOT EXISTS page_visits_visited_at_idx
  ON public.page_visits (visited_at DESC);

CREATE INDEX IF NOT EXISTS page_visits_path_visited_at_idx
  ON public.page_visits (path, visited_at DESC);

CREATE INDEX IF NOT EXISTS page_visits_device_path_visited_at_idx
  ON public.page_visits (device_id, path, visited_at DESC);

CREATE INDEX IF NOT EXISTS page_visits_user_path_visited_at_idx
  ON public.page_visits (user_id, path, visited_at DESC);

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
