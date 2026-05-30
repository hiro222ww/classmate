-- Default TURN fallback OFF for existing deployments.
-- turn_fallback_enabled is ON only when explicitly true.

INSERT INTO voice_settings (
  id,
  voice_enabled,
  new_calls_enabled,
  turn_fallback_enabled,
  max_members_per_call,
  updated_at
)
VALUES (
  'global',
  true,
  true,
  false,
  5,
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  turn_fallback_enabled = false,
  updated_at = now();
