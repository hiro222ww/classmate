-- X initial-exposure: human-reviewed reply suggestions (no auto-posting).
-- Do not apply to production without operator approval.
-- Service-role writes only; RLS on, no public policies.

CREATE TABLE IF NOT EXISTS public.marketing_reply_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  source_post_id text NULL,
  source_author text NULL,
  source_body text NULL,
  selection_reason text NOT NULL DEFAULT '',
  reply_drafts jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_draft_index int NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'posted', 'skipped', 'needs_body')),
  naturalness_score int NULL CHECK (naturalness_score IS NULL OR (naturalness_score >= 0 AND naturalness_score <= 100)),
  promo_score int NULL CHECK (promo_score IS NULL OR (promo_score >= 0 AND promo_score <= 100)),
  charter_compliance text NULL
    CHECK (charter_compliance IS NULL OR charter_compliance IN ('ok', 'needs_review')),
  charter_notes text NULL,
  evaluation_notes text NULL,
  utm_content text NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- metrics example keys (all optional / never invent):
  -- source_views, profile_visits, site_visits, registrations, call_started, recorded_at
  posted_at timestamptz NULL,
  skipped_at timestamptz NULL,
  skip_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_reply_suggestions_status_created_idx
  ON public.marketing_reply_suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_reply_suggestions_created_idx
  ON public.marketing_reply_suggestions (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_reply_suggestions_source_url_pending_uidx
  ON public.marketing_reply_suggestions (source_url)
  WHERE status IN ('pending', 'ready', 'needs_body');

ALTER TABLE public.marketing_reply_suggestions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_reply_suggestions IS
  'Operator-curated X reply drafts for initial exposure. AI drafts only; humans post manually. Never auto-replies.';
