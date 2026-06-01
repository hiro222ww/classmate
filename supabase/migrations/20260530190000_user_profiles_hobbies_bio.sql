-- Optional free-text profile fields
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS hobbies text,
  ADD COLUMN IF NOT EXISTS bio text;
