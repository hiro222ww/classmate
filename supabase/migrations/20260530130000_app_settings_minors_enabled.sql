-- 未成年登録 ON/OFF（デフォルト OFF）
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('minors_enabled', 'false'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
