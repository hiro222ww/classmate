-- Per-class read cursor for class_messages unread badges

CREATE TABLE IF NOT EXISTS public.class_message_reads (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, device_id)
);

CREATE INDEX IF NOT EXISTS class_message_reads_device_id_idx
  ON public.class_message_reads (device_id);

CREATE INDEX IF NOT EXISTS class_message_reads_last_read_at_idx
  ON public.class_message_reads (last_read_at);
