CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx
  ON admin_audit_logs (action);
