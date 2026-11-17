-- AI Operating Charter: operator-approved policies + ideas for Classmate AI ops.
-- Independent of Phase 1–4 production rollout — do not apply without approval.
-- Service-role only; RLS on; no public policies.
-- Never store secrets. Free-text memos are untrusted input.

CREATE TABLE IF NOT EXISTS public.ai_operating_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL
    CHECK (category IN (
      'philosophy',
      'audience',
      'brand_world',
      'sns',
      'ui_ux',
      'home_visual',
      'kpi',
      'prohibitions',
      'idea'
    )),
  title text NOT NULL,
  body text NOT NULL,
  importance text NOT NULL DEFAULT 'medium'
    CHECK (importance IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'idea_unadopted'
    CHECK (status IN (
      'active',
      'inactive',
      'idea_unadopted',
      'pending_approval',
      'archived'
    )),
  priority_tier integer NOT NULL DEFAULT 5
    CHECK (priority_tier BETWEEN 1 AND 5),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'memo_ai', 'ai_proposal')),
  version integer NOT NULL DEFAULT 1,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  deactivated_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ai_operating_policies_status_tier_idx
  ON public.ai_operating_policies (status, priority_tier, importance);

CREATE INDEX IF NOT EXISTS ai_operating_policies_category_idx
  ON public.ai_operating_policies (category, status);

CREATE UNIQUE INDEX IF NOT EXISTS ai_operating_policies_active_fingerprint_uidx
  ON public.ai_operating_policies (fingerprint)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.ai_operating_policy_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.ai_operating_policies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  action text NOT NULL
    CHECK (action IN (
      'create',
      'edit',
      'deactivate',
      'reactivate',
      'restore',
      'propose',
      'approve',
      'reject'
    )),
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  importance text NOT NULL,
  status text NOT NULL,
  priority_tier integer NOT NULL,
  change_note text NULL,
  actor text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, version)
);

CREATE INDEX IF NOT EXISTS ai_operating_policy_revisions_policy_idx
  ON public.ai_operating_policy_revisions (policy_id, version DESC);

CREATE TABLE IF NOT EXISTS public.ai_operating_policy_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text text NOT NULL,
  sanitized_text text NOT NULL,
  ai_category text NULL,
  ai_title text NULL,
  ai_importance text NULL,
  duplicate_of_policy_id uuid NULL REFERENCES public.ai_operating_policies(id) ON DELETE SET NULL,
  conflict_with_policy_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'inbox'
    CHECK (status IN (
      'inbox',
      'classified',
      'promoted',
      'rejected',
      'needs_approval'
    )),
  analysis_notes text NULL,
  resulting_policy_id uuid NULL REFERENCES public.ai_operating_policies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_operating_policy_memos_status_idx
  ON public.ai_operating_policy_memos (status, created_at DESC);

-- Link generated artifacts to the charter snapshot used at generation time.
ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS charter_policy_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS charter_compliance text NULL
    CHECK (charter_compliance IS NULL OR charter_compliance IN ('ok', 'needs_review', 'skipped'));

ALTER TABLE public.marketing_reports
  ADD COLUMN IF NOT EXISTS charter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.marketing_improvement_proposals
  ADD COLUMN IF NOT EXISTS charter_alignment text NULL;
ALTER TABLE public.marketing_improvement_proposals
  ADD COLUMN IF NOT EXISTS charter_policy_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.ai_operating_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_operating_policy_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_operating_policy_memos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_operating_policies IS
  'Operator charter policies/ideas for Classmate AI. Active rows feed generation/analysis.';
COMMENT ON TABLE public.ai_operating_policy_revisions IS
  'Immutable revision history for charter policies.';
COMMENT ON TABLE public.ai_operating_policy_memos IS
  'Untrusted free-text operator memos awaiting classify/promote.';
