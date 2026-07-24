-- Email notification preferences (opt-in) + email dispatch columns on events.

CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  email_call_request boolean NOT NULL DEFAULT true,
  email_meeting_plan boolean NOT NULL DEFAULT true,
  unsubscribe_token text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_notification_prefs_unsubscribe_token_uidx
  ON public.user_notification_prefs (unsubscribe_token);

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_skipped_reason text;

CREATE INDEX IF NOT EXISTS notification_events_email_pending_idx
  ON public.notification_events (created_at)
  WHERE email_sent_at IS NULL;

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_prefs_select_own ON public.user_notification_prefs;
DROP POLICY IF EXISTS user_notification_prefs_insert_own ON public.user_notification_prefs;
DROP POLICY IF EXISTS user_notification_prefs_update_own ON public.user_notification_prefs;
DROP POLICY IF EXISTS user_notification_prefs_upsert_own ON public.user_notification_prefs;

-- App uses service role for prefs API; keep owner policies for completeness.
CREATE POLICY user_notification_prefs_select_own
  ON public.user_notification_prefs
  FOR SELECT
  TO authenticated
  USING (user_id::text = auth.uid()::text);

CREATE POLICY user_notification_prefs_insert_own
  ON public.user_notification_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY user_notification_prefs_update_own
  ON public.user_notification_prefs
  FOR UPDATE
  TO authenticated
  USING (user_id::text = auth.uid()::text)
  WITH CHECK (user_id::text = auth.uid()::text);
