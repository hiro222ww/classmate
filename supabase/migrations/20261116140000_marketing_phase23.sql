-- Phase 2/3: UTM on page_visits + Buffer publish metadata on marketing_posts.
-- Do not apply to production without explicit operator approval.
-- No IP / new device identifiers. UTM values are campaign params only.

ALTER TABLE public.page_visits
  ADD COLUMN IF NOT EXISTS utm_source text NULL,
  ADD COLUMN IF NOT EXISTS utm_medium text NULL,
  ADD COLUMN IF NOT EXISTS utm_campaign text NULL,
  ADD COLUMN IF NOT EXISTS utm_content text NULL;

CREATE INDEX IF NOT EXISTS page_visits_utm_source_visited_at_idx
  ON public.page_visits (utm_source, visited_at DESC)
  WHERE utm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS page_visits_utm_content_visited_at_idx
  ON public.page_visits (utm_content, visited_at DESC)
  WHERE utm_content IS NOT NULL;

CREATE INDEX IF NOT EXISTS page_visits_utm_campaign_visited_at_idx
  ON public.page_visits (utm_campaign, visited_at DESC)
  WHERE utm_campaign IS NOT NULL;

COMMENT ON COLUMN public.page_visits.utm_source IS
  'First-party campaign attribution (utm_source). Not a personal identifier.';
COMMENT ON COLUMN public.page_visits.utm_content IS
  'Post-level attribution key (utm_content), e.g. post_YYYYMMDD_n.';

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS external_status text NULL
    CHECK (external_status IS NULL OR external_status IN ('scheduled', 'sent', 'error')),
  ADD COLUMN IF NOT EXISTS external_due_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.marketing_posts.external_status IS
  'Buffer/SNS lifecycle: scheduled (queued) vs sent (live) vs error. Distinct from local status.';
COMMENT ON COLUMN public.marketing_posts.external_due_at IS
  'Scheduled publish time returned by Buffer (UTC).';
