-- device ownership proof for bootstrap (prevents device_id hijacking)

ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS device_secret_hash text;
