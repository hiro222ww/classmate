-- Approve-and-publish-now: richer Buffer/X outcomes + claim lock.
-- Does not enable live SNS by itself; app still requires admin action + credentials.

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_external_status_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_external_status_check
  CHECK (
    external_status IS NULL
    OR external_status IN (
      'scheduled',
      'sent',
      'error',
      'buffer_accepted',
      'unknown'
    )
  );

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS external_permalink text NULL,
  ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS publish_claim_token uuid NULL,
  ADD COLUMN IF NOT EXISTS publish_outcome text NULL;

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_publish_outcome_check;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_publish_outcome_check
  CHECK (
    publish_outcome IS NULL
    OR publish_outcome IN (
      'x_published',
      'buffer_accepted',
      'failed',
      'unknown'
    )
  );

COMMENT ON COLUMN public.marketing_posts.external_permalink IS
  'Destination service URL (e.g. X status link) when Buffer returns externalLink.';
COMMENT ON COLUMN public.marketing_posts.publish_claimed_at IS
  'In-flight publish claim timestamp for double-submit prevention.';
COMMENT ON COLUMN public.marketing_posts.publish_claim_token IS
  'UUID claim token; success/failure updates must match the active claim.';
COMMENT ON COLUMN public.marketing_posts.publish_outcome IS
  'Terminal publish classification: x_published | buffer_accepted | failed | unknown.';

COMMENT ON COLUMN public.marketing_posts.external_status IS
  'Buffer/SNS lifecycle: scheduled | buffer_accepted | sent | error | unknown.';

-- Runtime toggle (no Vercel redeploy). Default OFF until operator enables
-- in admin UI. Cron never calls approve-and-publish-now.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (
  'marketing_immediate_publish_enabled',
  'false'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
