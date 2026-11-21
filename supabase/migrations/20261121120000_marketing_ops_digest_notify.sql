-- Allow ops digest notifications (email / Discord).
-- Does not enable sending; app gates remain OFF by default.

ALTER TABLE public.marketing_admin_notification_log
  DROP CONSTRAINT IF EXISTS marketing_admin_notification_log_kind_check;

ALTER TABLE public.marketing_admin_notification_log
  ADD CONSTRAINT marketing_admin_notification_log_kind_check
  CHECK (kind IN ('weekly_digest', 'urgent_proposal', 'ops_digest'));

ALTER TABLE public.marketing_admin_notification_log
  DROP CONSTRAINT IF EXISTS marketing_admin_notification_log_channel_check;

ALTER TABLE public.marketing_admin_notification_log
  ADD CONSTRAINT marketing_admin_notification_log_channel_check
  CHECK (channel IN ('email', 'web_push', 'discord', 'none'));

COMMENT ON TABLE public.marketing_admin_notification_log IS
  'Operator alerts: weekly proposals + daily ops digest (email/Discord). Never auto-publishes SNS.';
