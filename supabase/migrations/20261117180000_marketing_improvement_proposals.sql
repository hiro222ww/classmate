-- Phase 4.1: improvement proposals + admin notification log.
-- Do not apply to production without operator approval.
-- Service-role writes only; RLS on, no public policies.
-- UI/image changes stay human-approved; SNS strategy may auto-activate separately.

CREATE TABLE IF NOT EXISTS public.marketing_improvement_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_report_id uuid NULL REFERENCES public.marketing_reports(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'ui_ux'
    CHECK (category IN ('ui_ux', 'funnel', 'copy', 'image', 'other')),
  area text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  detail_markdown text NULL,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'held', 'rejected')),
  fingerprint text NOT NULL,
  evidence_kind text NULL
    CHECK (evidence_kind IS NULL OR evidence_kind IN ('code_review', 'measured', 'hypothesis')),
  validation_kpi text NULL,
  image_prompt text NULL,
  composition_notes text NULL,
  metrics_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz NULL,
  notification_channel text NULL
    CHECK (notification_channel IS NULL OR notification_channel IN ('email', 'web_push', 'none')),
  reviewed_at timestamptz NULL,
  review_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_improvement_proposals_status_created_idx
  ON public.marketing_improvement_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_improvement_proposals_priority_idx
  ON public.marketing_improvement_proposals (priority, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_improvement_proposals_fingerprint_idx
  ON public.marketing_improvement_proposals (fingerprint);

-- Prevent duplicate open proposals with the same fingerprint.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_improvement_proposals_open_fingerprint_uidx
  ON public.marketing_improvement_proposals (fingerprint)
  WHERE status IN ('pending', 'held');

CREATE TABLE IF NOT EXISTS public.marketing_admin_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('weekly_digest', 'urgent_proposal')),
  fingerprint text NOT NULL,
  channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'web_push', 'none')),
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('sent', 'skipped_dup', 'failed', 'disabled')),
  subject text NULL,
  body_preview text NULL,
  report_id uuid NULL REFERENCES public.marketing_reports(id) ON DELETE SET NULL,
  proposal_ids uuid[] NOT NULL DEFAULT '{}',
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_admin_notification_log_created_idx
  ON public.marketing_admin_notification_log (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_admin_notification_log_fp_kind_uidx
  ON public.marketing_admin_notification_log (fingerprint, kind)
  WHERE status = 'sent';

ALTER TABLE public.marketing_improvement_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_admin_notification_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_improvement_proposals IS
  'Human-reviewed marketing/UI improvement proposals. Not auto-applied to production UI.';
COMMENT ON TABLE public.marketing_admin_notification_log IS
  'Deduped operator notification attempts (email preferred; web push not admin-targeted).';
