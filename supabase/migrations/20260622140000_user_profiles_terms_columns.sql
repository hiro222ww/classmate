-- Legal consent columns (idempotent; safe if 20260610130000 was partially applied)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS terms_agreed_at timestamptz;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS privacy_agreed_at timestamptz;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS guidelines_agreed_at timestamptz;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS legal_consent_version text;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS terms_version text;
