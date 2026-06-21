ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS terms_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS guidelines_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_consent_version text;
