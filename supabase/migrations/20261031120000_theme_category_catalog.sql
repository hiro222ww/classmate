-- Theme major/sub category catalog (home + 探す).
-- Independent of Stripe / topics.monthly_price / theme_billing_enabled.
-- Seed keeps all categories coming_soon so paid themes are not accidentally published.

CREATE TABLE IF NOT EXISTS public.theme_major_categories (
  id text PRIMARY KEY,
  label text NOT NULL,
  hint text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  icon_key text NOT NULL DEFAULT 'chat',
  tone text NOT NULL,
  tint text NOT NULL DEFAULT '',
  border text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'coming_soon'
    CHECK (status IN ('live', 'coming_soon', 'hidden')),
  featured_on_home boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  orphan_match_pattern text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.theme_sub_categories (
  id text PRIMARY KEY,
  major_id text NOT NULL REFERENCES public.theme_major_categories (id) ON DELETE CASCADE,
  label text NOT NULL,
  hint text,
  topic_keys text[] NOT NULL DEFAULT '{}'::text[],
  match_pattern text,
  status text
    CHECK (status IS NULL OR status IN ('live', 'coming_soon', 'hidden')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS theme_major_categories_order_idx
  ON public.theme_major_categories (display_order, id);

CREATE INDEX IF NOT EXISTS theme_sub_categories_major_order_idx
  ON public.theme_sub_categories (major_id, display_order, id);

ALTER TABLE public.theme_major_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_sub_categories ENABLE ROW LEVEL SECURITY;

-- Public read for anon/authenticated (catalog is non-sensitive display data).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'theme_major_categories'
      AND policyname = 'theme_major_categories_public_read'
  ) THEN
    CREATE POLICY theme_major_categories_public_read
      ON public.theme_major_categories
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'theme_sub_categories'
      AND policyname = 'theme_sub_categories_public_read'
  ) THEN
    CREATE POLICY theme_sub_categories_public_read
      ON public.theme_sub_categories
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Writes go through service role (admin API). No public INSERT/UPDATE/DELETE policies.

INSERT INTO public.theme_major_categories (
  id, label, hint, description, icon_key, tone, tint, border,
  status, featured_on_home, display_order, orphan_match_pattern
) VALUES
  ('chat', '雑談・交流', '気軽に話す', '', 'chat', 'chat',
   'linear-gradient(180deg, rgba(255,247,237,0.95), rgba(255,255,255,0.95))',
   'rgba(249, 115, 22, 0.22)', 'coming_soon', true, 10,
   '雑談|交流|おしゃべり|フリートーク|chat|talk|友だち|友達'),
  ('hobby', '趣味・エンタメ', '好きを共有', '', 'hobby', 'hobby',
   'linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.95))',
   'rgba(139, 92, 246, 0.22)', 'coming_soon', true, 20,
   '趣味|hobby|ゲーム|音楽|映画|アニメ|漫画|ドラマ'),
  ('school', '学校・勉強', '学びの場', '', 'school', 'school',
   'linear-gradient(180deg, rgba(236,254,255,0.95), rgba(255,255,255,0.95))',
   'rgba(20, 184, 166, 0.22)', 'coming_soon', true, 30,
   '学校|勉強|学習|部活|study|school|受験'),
  ('daily', '暮らし・日常', 'ふだんのこと', '', 'daily', 'daily',
   'linear-gradient(180deg, rgba(240,249,255,0.95), rgba(255,255,255,0.95))',
   'rgba(56, 189, 248, 0.25)', 'coming_soon', true, 40,
   '日常|暮らし|生活|旅行|夜|まったり|旅|ごはん|食事'),
  ('relationship', '恋愛・人間関係', '気持ちを整理', '', 'relationship', 'relationship',
   'linear-gradient(180deg, rgba(255,241,242,0.95), rgba(255,255,255,0.95))',
   'rgba(244, 63, 94, 0.2)', 'coming_soon', false, 50,
   '恋愛|恋|人間関係|好きな人|対人'),
  ('identity', 'アイデンティティ・多様性', '自分らしく', '', 'identity', 'identity',
   'linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.95))',
   'rgba(124, 58, 237, 0.2)', 'coming_soon', false, 60,
   'lgbtq|lgbt|セクシュアリティ|アイデンティティ|多様性|ジェンダー|クィア'),
  ('beauty', '美容・ファッション', '見た目の話', '', 'beauty', 'beauty',
   'linear-gradient(180deg, rgba(253,242,248,0.95), rgba(255,255,255,0.95))',
   'rgba(236, 72, 153, 0.2)', 'coming_soon', false, 70,
   '美容|ファッション|メイク|コスメ|スキンケア|コーデ'),
  ('sports', 'スポーツ・健康', 'からだのこと', '', 'sports', 'sports',
   'linear-gradient(180deg, rgba(240,253,244,0.95), rgba(255,255,255,0.95))',
   'rgba(34, 197, 94, 0.22)', 'coming_soon', false, 80,
   'スポーツ|健康|フィットネス|筋トレ|運動|ヨガ'),
  ('career', '仕事・キャリア', '働き方の話', '', 'career', 'career',
   'linear-gradient(180deg, rgba(239,246,255,0.95), rgba(255,255,255,0.95))',
   'rgba(59, 130, 246, 0.22)', 'coming_soon', false, 90,
   '仕事|キャリア|職場|職業|就活|転職|バイト'),
  ('creative', '創作・クリエイティブ', 'つくる話', '', 'creative', 'creative',
   'linear-gradient(180deg, rgba(254,249,195,0.9), rgba(255,255,255,0.95))',
   'rgba(234, 179, 8, 0.28)', 'coming_soon', false, 100,
   '創作|イラスト|クリエイティブ|デザイン|アート|小説')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.theme_sub_categories (
  id, major_id, label, hint, topic_keys, match_pattern, status, display_order
) VALUES
  ('chat-casual', 'chat', '雑談', NULL, '{}', '雑談|交流|おしゃべり|フリートーク|chat|talk', NULL, 10),
  ('chat-friends', 'chat', '友だち作り', NULL, '{}', '友だち|友達作り|友人', NULL, 20),
  ('hobby-game', 'hobby', 'ゲーム', NULL, '{}', 'ゲーム|game|esports|eスポーツ', NULL, 10),
  ('hobby-music', 'hobby', '音楽', NULL, '{}', '音楽|music|歌|メロディ', NULL, 20),
  ('hobby-anime', 'hobby', 'アニメ・漫画', NULL, '{}', 'アニメ|漫画|マンガ', NULL, 30),
  ('hobby-movie', 'hobby', '映画・ドラマ', NULL, '{}', '映画|ドラマ|movie', NULL, 40),
  ('school-boys', 'school', '男子校', NULL, ARRAY['boys-school'], NULL, NULL, 10),
  ('school-girls', 'school', '女子校', NULL, ARRAY['girls-school'], NULL, NULL, 20),
  ('school-study', 'school', '勉強', NULL, '{}', '勉強|学習|study|受験|宿題', NULL, 30),
  ('school-club', 'school', '部活', NULL, '{}', '部活|クラブ活動', NULL, 40),
  ('daily-life', 'daily', '日常', NULL, '{}', '日常|暮らし|生活|まったり|夜|おやすみ', NULL, 10),
  ('daily-travel', 'daily', '旅行', NULL, '{}', '旅行|travel|旅|観光', NULL, 20),
  ('daily-food', 'daily', 'ごはん', NULL, '{}', 'ごはん|食事|料理|グルメ|ご飯', NULL, 30),
  ('rel-love', 'relationship', '恋愛相談', NULL, '{}', '恋愛|恋|好きな人', NULL, 10),
  ('rel-friendship', 'relationship', '人間関係', NULL, '{}', '人間関係|友人関係|対人', NULL, 20),
  ('id-lgbtq', 'identity', 'LGBTQ+', 'プライバシーに配慮した場（準備中）', '{}',
   'lgbtq|lgbt|セクシュアリティ|セクシュアル|クィア|ゲイ|レズ|バイ|トランス|非二元|Xジェンダー|アセク|アロマン', NULL, 10),
  ('id-self', 'identity', '自分らしさ', NULL, '{}', 'アイデンティティ|多様性|自分らしさ|ジェンダー', NULL, 20),
  ('beauty-care', 'beauty', '美容', NULL, '{}', '美容|スキンケア|メイク|コスメ', NULL, 10),
  ('beauty-fashion', 'beauty', 'ファッション', NULL, '{}', 'ファッション|コーデ|服|髪型', NULL, 20),
  ('sports-play', 'sports', 'スポーツ', NULL, '{}', 'スポーツ|サッカー|野球|バスケ|運動', NULL, 10),
  ('sports-health', 'sports', '健康・フィットネス', NULL, '{}', '健康|フィットネス|筋トレ|ヨガ|ダイエット', NULL, 20),
  ('career-work', 'career', '仕事', NULL, '{}', '仕事|職場|職業|バイト|アルバイト', NULL, 10),
  ('career-path', 'career', 'キャリア', NULL, '{}', 'キャリア|転職|就活|進路', NULL, 20),
  ('creative-art', 'creative', 'イラスト・絵', NULL, '{}', 'イラスト|絵|絵画|アート', NULL, 10),
  ('creative-make', 'creative', '創作', NULL, '{}', '創作|小説|詩|デザイン|クリエイティブ|ものづくり', NULL, 20)
ON CONFLICT (id) DO NOTHING;
