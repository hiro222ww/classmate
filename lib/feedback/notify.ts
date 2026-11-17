import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getMarketingAdminNotifyEmail,
  getMarketingAppOrigin,
  isMarketingAdminNotifyEnabled,
} from "@/lib/marketing/config";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
} from "@/lib/emailSender";
import type { FeedbackCategory, FeedbackSeverity } from "@/lib/feedback/types";

/**
 * Critical/safety feedback alerts. Reuses marketing admin email gates.
 * Dedupes per cluster within 24h so the same theme does not spam operators.
 */
export async function notifySafetyFeedback(params: {
  feedbackId: string;
  clusterId: string;
  summary: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
}): Promise<{ ok: boolean; status: "sent" | "skipped_dup" | "disabled" | "failed"; error?: string }> {
  if (!isMarketingAdminNotifyEnabled()) {
    return { ok: true, status: "disabled" };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("user_feedback")
    .select("id", { count: "exact", head: true })
    .eq("cluster_id", params.clusterId)
    .not("notified_at", "is", null)
    .gte("notified_at", since);
  if ((count ?? 0) > 0) {
    return { ok: true, status: "skipped_dup" };
  }

  const to = getMarketingAdminNotifyEmail();
  if (!isTransactionalEmailConfigured() || !to) {
    return { ok: false, status: "failed", error: "email_not_configured" };
  }

  const adminUrl = `${getMarketingAppOrigin()}/admin/feedback`;
  const fp = createHash("sha256")
    .update(`safety_feedback|${params.clusterId}|${since.slice(0, 10)}`)
    .digest("hex")
    .slice(0, 16);
  const subject = `【Classmate】安全/重大フィードバック要確認 (${params.severity})`;
  const text = [
    "重大または安全関連のフィードバックが届きました。",
    "AIだけで却下・自動処理しないでください。管理画面で確認してください。",
    "",
    `カテゴリ: ${params.category}`,
    `深刻度: ${params.severity}`,
    `要約（マスキング済）: ${params.summary}`,
    `cluster: ${params.clusterId.slice(0, 8)}…`,
    `feedback: ${params.feedbackId.slice(0, 8)}…`,
    `dedupe: ${fp}`,
    "",
    `管理画面: ${adminUrl}`,
  ].join("\n");

  const sent = await sendTransactionalEmail({
    to,
    subject,
    text,
    html: `<p>重大または安全関連のフィードバックが届きました。</p><p><strong>AIだけで却下しないでください。</strong></p><p>${params.summary}</p><p><a href="${adminUrl}">管理画面で確認</a></p>`,
  });
  if (!sent.ok) return { ok: false, status: "failed", error: sent.error };
  return { ok: true, status: "sent" };
}
