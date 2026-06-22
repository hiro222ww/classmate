-- Anonymous Auth + user_id identity layer (device_id remains for WebRTC/presence)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_unique
  ON user_profiles(user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_devices (
  device_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_devices_user_id_idx ON user_devices(user_id);

ALTER TABLE user_entitlements
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS user_entitlements_user_id_unique
  ON user_entitlements(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE user_billing_customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS user_billing_customers_user_id_unique
  ON user_billing_customers(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE user_match_prefs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS user_match_prefs_user_id_unique
  ON user_match_prefs(user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE class_memberships
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS class_memberships_user_id_idx
  ON class_memberships(user_id);

ALTER TABLE session_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS session_members_user_id_idx
  ON session_members(user_id);

ALTER TABLE user_reports
  ADD COLUMN IF NOT EXISTS reporter_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id);

ALTER TABLE user_blocks
  ADD COLUMN IF NOT EXISTS blocker_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS blocked_user_id uuid REFERENCES auth.users(id);

UPDATE class_memberships cm
SET user_id = ud.user_id
FROM user_devices ud
WHERE cm.device_id = ud.device_id
  AND cm.user_id IS NULL;

UPDATE session_members sm
SET user_id = ud.user_id
FROM user_devices ud
WHERE sm.device_id = ud.device_id
  AND sm.user_id IS NULL;

UPDATE user_entitlements ue
SET user_id = up.user_id
FROM user_profiles up
WHERE ue.device_id = up.device_id
  AND ue.user_id IS NULL
  AND up.user_id IS NOT NULL;

UPDATE user_billing_customers ubc
SET user_id = up.user_id
FROM user_profiles up
WHERE ubc.device_id = up.device_id
  AND ubc.user_id IS NULL
  AND up.user_id IS NOT NULL;

UPDATE user_match_prefs ump
SET user_id = up.user_id
FROM user_profiles up
WHERE ump.device_id = up.device_id
  AND ump.user_id IS NULL
  AND up.user_id IS NOT NULL;

UPDATE user_profiles up
SET user_id = ud.user_id
FROM user_devices ud
WHERE up.device_id = ud.device_id
  AND up.user_id IS NULL;

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_select_own ON user_profiles;
CREATE POLICY user_profiles_select_own ON user_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_profiles_update_own ON user_profiles;
CREATE POLICY user_profiles_update_own ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_profiles_insert_own ON user_profiles;
CREATE POLICY user_profiles_insert_own ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_devices_select_own ON user_devices;
CREATE POLICY user_devices_select_own ON user_devices
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_devices_insert_own ON user_devices;
CREATE POLICY user_devices_insert_own ON user_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_devices_update_own ON user_devices;
CREATE POLICY user_devices_update_own ON user_devices
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_entitlements_select_own ON user_entitlements;
CREATE POLICY user_entitlements_select_own ON user_entitlements
  FOR SELECT USING (auth.uid() = user_id);
