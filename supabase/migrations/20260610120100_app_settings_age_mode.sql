INSERT INTO app_settings (key, value, updated_at)
VALUES ('age_mode', '"post_high_school_only"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
