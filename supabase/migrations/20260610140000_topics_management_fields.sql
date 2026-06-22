ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepting_new_users boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS badge_label text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE topics
SET
  is_active = NOT COALESCE(is_archived, false),
  is_paid = COALESCE(monthly_price, 0) > 0,
  updated_at = now()
WHERE is_active IS DISTINCT FROM NOT COALESCE(is_archived, false)
   OR is_paid IS DISTINCT FROM (COALESCE(monthly_price, 0) > 0);

INSERT INTO topics (
  topic_key,
  title,
  description,
  is_sensitive,
  min_age,
  monthly_price,
  gender_restriction,
  is_archived,
  is_active,
  is_paid,
  display_order,
  accepting_new_users
)
VALUES
  (
    'boys-school',
    '男子校',
    '男性ユーザー向けの少人数テーマクラス',
    false,
    0,
    400,
    'male',
    false,
    true,
    true,
    1,
    true
  ),
  (
    'girls-school',
    '女子校',
    '女性ユーザー向けの少人数テーマクラス',
    false,
    0,
    400,
    'female',
    false,
    true,
    true,
    2,
    true
  )
ON CONFLICT (topic_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  gender_restriction = EXCLUDED.gender_restriction,
  monthly_price = EXCLUDED.monthly_price,
  is_paid = EXCLUDED.is_paid,
  display_order = EXCLUDED.display_order,
  is_archived = false,
  updated_at = now();
