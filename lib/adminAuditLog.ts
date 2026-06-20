import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AdminAuditEntry = {
  actor: string;
  action: string;
  target?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAdminAuditLog(entry: AdminAuditEntry) {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[admin-audit] write failed", {
      action: entry.action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function adminActorFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return `admin:${forwarded.split(",")[0]?.trim() || "unknown"}`;
  return "admin:session";
}
