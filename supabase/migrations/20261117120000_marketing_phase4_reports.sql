-- Phase 4: weekly reports + versioned generation strategies.
-- Do not apply to production without operator approval.
-- Service-role writes only; RLS on, no public policies.

CREATE TABLE IF NOT EXISTS public.marketing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_kind text NOT NULL DEFAULT 'weekly'
    CHECK (report_kind IN ('weekly', 'manual')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'failed')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_markdown text NULL,
  ui_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  strategy_suggestions jsonb NOT NULL DEFAULT '{}'::jsonb,
  uncertainty_notes text[] NOT NULL DEFAULT '{}',
  model_name text NULL,
  prompt_tokens integer NULL,
  completion_tokens integer NULL,
  estimated_cost_usd numeric NULL,
  ai_run_id uuid NULL REFERENCES public.marketing_ai_runs(id) ON DELETE SET NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_reports_created_at_idx
  ON public.marketing_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  source_report_id uuid NULL REFERENCES public.marketing_reports(id) ON DELETE SET NULL,
  guidance jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_addon text NOT NULL DEFAULT '',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  deactivated_at timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_strategy_versions_version_uidx
  ON public.marketing_strategy_versions (version);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_strategy_versions_one_active_uidx
  ON public.marketing_strategy_versions (status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketing_strategy_versions_created_at_idx
  ON public.marketing_strategy_versions (created_at DESC);

ALTER TABLE public.marketing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_strategy_versions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_reports IS
  'Weekly/manual marketing analysis reports. No PII; aggregated metrics only.';
COMMENT ON TABLE public.marketing_strategy_versions IS
  'Versioned generation guidance applied to draft creation only (not auto-publish).';
