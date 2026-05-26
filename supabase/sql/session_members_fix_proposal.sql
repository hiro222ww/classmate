-- session_members 修正 migration 案
-- ※ 本番適用前に diagnose SQL で現状確認してください。
-- ※ 破壊的操作（DROP/TRUNCATE/DELETE）は含みません。

BEGIN;

-- A) 既存 NULL / 空 display_name を埋める（upsert 更新時の NOT NULL 対策）
UPDATE public.session_members
SET display_name = '参加者'
WHERE display_name IS NULL OR btrim(display_name) = '';

-- B) 今後 INSERT で display_name 省略時の保険（任意）
ALTER TABLE public.session_members
  ALTER COLUMN display_name SET DEFAULT '参加者';

-- C) joined_at / is_in_call のデフォルトを明示（列が存在する場合）
ALTER TABLE public.session_members
  ALTER COLUMN joined_at SET DEFAULT now();

ALTER TABLE public.session_members
  ALTER COLUMN is_in_call SET DEFAULT false;

-- D) photo_path 列が必要な場合のみ（現在の DB には無い想定）
--    join-by-invite 等で使うなら追加。不要ならコメントのまま。
-- ALTER TABLE public.session_members
--   ADD COLUMN IF NOT EXISTS photo_path text;

-- E) display_name を NOT NULL のまま維持（既に NOT NULL なら no-op）
ALTER TABLE public.session_members
  ALTER COLUMN display_name SET NOT NULL;

COMMIT;

-- 適用後確認
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'session_members'
ORDER BY ordinal_position;
