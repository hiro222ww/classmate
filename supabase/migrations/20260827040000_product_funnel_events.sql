-- Product funnel events for random-call launch analytics.
-- Writes only via service-role API; RLS enabled with no public policies.

CREATE TABLE IF NOT EXISTS public.product_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  device_id text NULL,
  user_id uuid NULL,
  session_id uuid NULL,
  class_id uuid NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_funnel_events_created_at_idx
  ON public.product_funnel_events (created_at DESC);

CREATE INDEX IF NOT EXISTS product_funnel_events_event_name_created_at_idx
  ON public.product_funnel_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS product_funnel_events_device_id_created_at_idx
  ON public.product_funnel_events (device_id, created_at DESC);

ALTER TABLE public.product_funnel_events ENABLE ROW LEVEL SECURITY;
