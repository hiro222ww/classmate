-- Expand marketing post types + optional quality / expected_action fields.
-- Do not apply to production without operator approval.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_post_type_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_post_type_check
  CHECK (post_type IN ('empathy', 'question', 'intro', 'invite', 'story'));

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS expected_action text NULL,
  ADD COLUMN IF NOT EXISTS quality_score numeric NULL,
  ADD COLUMN IF NOT EXISTS quality_notes text NULL;

COMMENT ON COLUMN public.marketing_posts.expected_action IS
  'Expected user behavior for the draft (e.g. reply, visit profile, join call).';
COMMENT ON COLUMN public.marketing_posts.quality_score IS
  'Heuristic 0–100 quality score after generation (not an estimate of growth).';
