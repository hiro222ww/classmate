-- Lightweight "今ひま？" call-out per class (one active request, 15 min TTL)

CREATE TABLE IF NOT EXISTS public.class_call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by_device_id text NOT NULL,
  message text NOT NULL DEFAULT '今ひま？',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  canceled_at timestamptz
);

CREATE INDEX IF NOT EXISTS class_call_requests_class_active_idx
  ON public.class_call_requests (class_id, created_at DESC)
  WHERE canceled_at IS NULL;
