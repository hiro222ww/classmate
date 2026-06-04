-- P2P on/off for voice transport (static TURN uses existing turn_fallback_enabled).

ALTER TABLE public.voice_settings
  ADD COLUMN IF NOT EXISTS p2p_enabled boolean DEFAULT true;

UPDATE public.voice_settings
SET p2p_enabled = true
WHERE p2p_enabled IS NULL;

INSERT INTO public.voice_settings (
  id,
  voice_enabled,
  new_calls_enabled,
  p2p_enabled,
  turn_fallback_enabled,
  max_members_per_call,
  updated_at
)
VALUES (
  'global',
  true,
  true,
  true,
  false,
  5,
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  p2p_enabled = COALESCE(public.voice_settings.p2p_enabled, EXCLUDED.p2p_enabled, true),
  updated_at = now();
