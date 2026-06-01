-- Profile age visibility (display-only; filtering logic unchanged)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS show_age boolean NOT NULL DEFAULT true;
