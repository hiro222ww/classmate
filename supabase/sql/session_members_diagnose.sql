-- session_members 診断 SQL（Supabase SQL Editor で実行）
-- ※ SELECT のみ。削除・更新は含みません。

-- 1) カラム定義
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'session_members'
ORDER BY ordinal_position;

-- 2) 制約（NOT NULL / FK / UNIQUE）
SELECT
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'session_members'
ORDER BY c.conname;

-- 3) インデックス
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'session_members'
ORDER BY indexname;

-- 4) display_name が NULL / 空の既存行
SELECT
  COUNT(*) FILTER (WHERE display_name IS NULL) AS null_display_name_count,
  COUNT(*) FILTER (WHERE display_name IS NOT NULL AND btrim(display_name) = '') AS empty_display_name_count,
  COUNT(*) AS total_rows
FROM public.session_members;

-- 5) 問題行サンプル（最大20件）
SELECT session_id, device_id, display_name, joined_at, is_in_call
FROM public.session_members
WHERE display_name IS NULL OR btrim(display_name) = ''
ORDER BY joined_at DESC NULLS LAST
LIMIT 20;
