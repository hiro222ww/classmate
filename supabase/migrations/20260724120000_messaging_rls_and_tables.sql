-- Ensure messaging tables exist, enable RLS, and publish Realtime.
-- Idempotent: safe to re-run after a partial apply.
--
-- Type-safety note:
-- Some environments store identity / foreign keys as text while auth.uid() is uuid.
-- Always compare via ::text (never cast existing columns to ::uuid) so migration
-- does not fail on non-UUID historical values.

CREATE TABLE IF NOT EXISTS public.room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  device_id text NOT NULL,
  display_name text NOT NULL DEFAULT '参加者',
  message text NOT NULL DEFAULT '',
  image_path text NULL,
  message_type text NOT NULL DEFAULT 'text',
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_messages_session_created_idx
  ON public.room_messages (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.class_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id text NOT NULL,
  device_id text NOT NULL,
  message text NOT NULL DEFAULT '',
  msg_type text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_messages_class_created_idx
  ON public.class_messages (class_id, created_at DESC);

ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_messages_select_members ON public.room_messages;
DROP POLICY IF EXISTS room_messages_insert_members ON public.room_messages;
DROP POLICY IF EXISTS room_messages_update_own ON public.room_messages;
DROP POLICY IF EXISTS class_messages_select_members ON public.class_messages;
DROP POLICY IF EXISTS class_messages_insert_members ON public.class_messages;

-- SELECT: Realtime needs SELECT. Membership is enforced on API fetch/send.
-- Keep USING(true) for anon device-id clients without JWT claims.
CREATE POLICY room_messages_select_members
  ON public.room_messages
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY room_messages_insert_members
  ON public.room_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id::text = room_messages.session_id::text
        AND (
          sm.device_id::text = room_messages.device_id::text
          OR (
            sm.user_id IS NOT NULL
            AND sm.user_id::text = auth.uid()::text
          )
        )
    )
  );

CREATE POLICY room_messages_update_own
  ON public.room_messages
  FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id::text = room_messages.session_id::text
        AND (
          sm.device_id::text = room_messages.device_id::text
          OR (
            sm.user_id IS NOT NULL
            AND sm.user_id::text = auth.uid()::text
          )
        )
    )
  )
  WITH CHECK (true);

CREATE POLICY class_messages_select_members
  ON public.class_messages
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY class_messages_insert_members
  ON public.class_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.class_memberships cm
      WHERE cm.class_id::text = class_messages.class_id::text
        AND (
          cm.device_id::text = class_messages.device_id::text
          OR (
            cm.user_id IS NOT NULL
            AND cm.user_id::text = auth.uid()::text
          )
        )
    )
  );

-- Realtime publication: ignore if already added or publication missing.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.class_messages;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
