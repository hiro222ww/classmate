-- AI marketing posts (Phase 1).
-- Writes via service-role admin APIs only. RLS on, no public policies.
-- Do not apply to production without explicit operator approval.

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'x',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NULL REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'x'
    CHECK (channel IN ('x', 'instagram', 'tiktok', 'manual')),
  post_type text NOT NULL
    CHECK (post_type IN ('empathy', 'invite', 'intro')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'scheduled', 'published', 'rejected', 'failed')),
  body_text text NOT NULL,
  purpose text NULL,
  target_audience text NULL,
  cta text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  tracking_url text NULL,
  scheduled_at timestamptz NULL,
  published_at timestamptz NULL,
  rejected_at timestamptz NULL,
  rejection_reason text NULL,
  external_post_id text NULL,
  publish_error text NULL,
  generation_source text NOT NULL DEFAULT 'openai'
    CHECK (generation_source IN ('openai', 'template_fallback', 'manual')),
  similarity_score numeric NULL,
  model_name text NULL,
  prompt_tokens integer NULL,
  completion_tokens integer NULL,
  estimated_cost_usd numeric NULL,
  ai_run_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_posts_status_created_at_idx
  ON public.marketing_posts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_posts_channel_created_at_idx
  ON public.marketing_posts (channel, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_posts_scheduled_at_idx
  ON public.marketing_posts (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketing_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_kind text NOT NULL
    CHECK (run_kind IN ('daily_generate', 'manual_generate', 'weekly_report')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  model_name text NULL,
  prompt_tokens integer NULL,
  completion_tokens integer NULL,
  estimated_cost_usd numeric NULL,
  posts_created integer NOT NULL DEFAULT 0,
  error_message text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS marketing_ai_runs_started_at_idx
  ON public.marketing_ai_runs (started_at DESC);

ALTER TABLE public.marketing_posts
  DROP CONSTRAINT IF EXISTS marketing_posts_ai_run_id_fkey;

ALTER TABLE public.marketing_posts
  ADD CONSTRAINT marketing_posts_ai_run_id_fkey
  FOREIGN KEY (ai_run_id) REFERENCES public.marketing_ai_runs(id)
  ON DELETE SET NULL;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_posts IS
  'AI/admin-authored SNS draft posts. Service-role writes only; human approval required before publish. Retention target: keep >= 90 days; archive old draft/rejected as needed.';
COMMENT ON TABLE public.marketing_ai_runs IS
  'Audit log for AI marketing generation runs (tokens/cost/errors). Retention target: >= 90 days.';
