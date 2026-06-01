-- Push notification pipeline: durable event log (no push sender yet)

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  actor_device_id text NOT NULL,
  target_scope text NOT NULL DEFAULT 'class_members',
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  push_sent_at timestamptz,
  push_skipped_reason text
);

CREATE INDEX IF NOT EXISTS notification_events_class_created_idx
  ON public.notification_events (class_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_events_type_created_idx
  ON public.notification_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_events_push_pending_idx
  ON public.notification_events (created_at)
  WHERE push_sent_at IS NULL;

-- Extra lookup indexes for active call requests
CREATE INDEX IF NOT EXISTS class_call_requests_expires_at_idx
  ON public.class_call_requests (expires_at);

CREATE INDEX IF NOT EXISTS class_call_requests_class_id_idx
  ON public.class_call_requests (class_id);
