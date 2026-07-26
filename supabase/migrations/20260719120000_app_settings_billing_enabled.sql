-- Per-category billing kill switches (slot vs theme).
-- Missing keys are safe in app code (slot defaults ON, theme defaults OFF).
-- Do not overwrite values already set by operators.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES
  ('slot_billing_enabled', '{"enabled": true}'::jsonb, now()),
  ('theme_billing_enabled', '{"enabled": false}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
