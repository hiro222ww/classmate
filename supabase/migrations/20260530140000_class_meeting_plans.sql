-- Next meeting time per class (one active plan; history kept for future use)

CREATE TABLE IF NOT EXISTS public.class_meeting_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  note text,
  created_by_device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  canceled_at timestamptz
);

CREATE INDEX IF NOT EXISTS class_meeting_plans_class_active_idx
  ON public.class_meeting_plans (class_id, created_at DESC)
  WHERE canceled_at IS NULL;
