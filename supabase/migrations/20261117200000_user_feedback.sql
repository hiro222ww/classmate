-- User product feedback (bugs / requests / UX) — separate from user_reports (peer abuse).
-- Do not apply to production without operator approval.
-- Service-role writes; RLS on; no public policies.
-- body_raw is for human operators only; AI/aggregation must use body_redacted.

CREATE TABLE IF NOT EXISTS public.user_feedback_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'request', 'ux', 'safety', 'other')),
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'held', 'resolved', 'dismissed')),
  report_count integer NOT NULL DEFAULT 0,
  unique_reporter_count integer NOT NULL DEFAULT 0,
  call_impact text NOT NULL DEFAULT 'none'
    CHECK (call_impact IN ('none', 'possible', 'likely')),
  safety_flag boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_feedback_clusters_fingerprint_uidx
  ON public.user_feedback_clusters (fingerprint);

CREATE INDEX IF NOT EXISTS user_feedback_clusters_status_seen_idx
  ON public.user_feedback_clusters (status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  user_id uuid NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug', 'request', 'ux', 'safety', 'other')),
  body_raw text NOT NULL,
  body_redacted text NOT NULL,
  page_context text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'held', 'resolved', 'dismissed')),
  ai_category text NULL
    CHECK (ai_category IS NULL OR ai_category IN ('bug', 'request', 'ux', 'safety', 'other')),
  ai_summary text NULL,
  ai_severity text NULL
    CHECK (ai_severity IS NULL OR ai_severity IN ('critical', 'high', 'medium', 'low')),
  ai_tags text[] NOT NULL DEFAULT '{}',
  call_impact text NOT NULL DEFAULT 'none'
    CHECK (call_impact IN ('none', 'possible', 'likely')),
  safety_flag boolean NOT NULL DEFAULT false,
  cluster_id uuid NULL REFERENCES public.user_feedback_clusters(id) ON DELETE SET NULL,
  unique_voice_key text NOT NULL,
  analysis_source text NOT NULL DEFAULT 'heuristic'
    CHECK (analysis_source IN ('heuristic', 'openai', 'manual')),
  notified_at timestamptz NULL,
  admin_note text NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_created_idx
  ON public.user_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS user_feedback_status_idx
  ON public.user_feedback (status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_feedback_cluster_idx
  ON public.user_feedback (cluster_id);

CREATE INDEX IF NOT EXISTS user_feedback_unique_voice_idx
  ON public.user_feedback (unique_voice_key, created_at DESC);

CREATE INDEX IF NOT EXISTS user_feedback_safety_idx
  ON public.user_feedback (safety_flag)
  WHERE safety_flag = true;

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feedback_clusters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_feedback IS
  'In-app product feedback. body_raw for admins only; AI uses body_redacted. Safety items require human review.';
COMMENT ON TABLE public.user_feedback_clusters IS
  'Grouped anonymized feedback themes; unique_reporter_count dedupes same device.';
COMMENT ON COLUMN public.user_feedback.body_raw IS
  'Original user text for operator review. Never send to external AI.';
COMMENT ON COLUMN public.user_feedback.body_redacted IS
  'Masked text for classification/clustering/weekly aggregates.';
