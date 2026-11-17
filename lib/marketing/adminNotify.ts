import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getMarketingAdminNotifyEmail,
  getMarketingAppOrigin,
  isMarketingAdminNotifyEnabled,
} from "@/lib/marketing/config";
import {
  markProposalsNotified,
  type ImprovementProposalRow,
} from "@/lib/marketing/proposals";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
} from "@/lib/emailSender";

export type AdminNotifyKind = "weekly_digest" | "urgent_proposal";

export type AdminNotifyResult = {
  ok: boolean;
  channel: "email" | "web_push" | "none";
  status: "sent" | "skipped_dup" | "failed" | "disabled";
  error?: string;
  fingerprint?: string;
};

/**
 * Web Push today targets class_memberships devices only — not admin cookie users.
 * Prefer transactional email for operator alerts until an admin push registry exists.
 */
export function getAdminNotifyChannelCapability(): {
  webPushCanTargetAdmins: false;
  emailAvailable: boolean;
  preferred: "email" | "none";
  reason: string;
} {
  const emailAvailable = isTransactionalEmailConfigured();
  return {
    webPushCanTargetAdmins: false,
    emailAvailable,
    preferred: emailAvailable ? "email" : "none",
    reason:
      "Web Push subscriptions are scoped to class members (device_id). Admin marketing uses cookie auth without a push registry, so operator alerts use email when configured.",
  };
}

function digestFingerprint(params: {
  kind: AdminNotifyKind;
  proposalIds: string[];
  reportId?: string | null;
}): string {
  const ids = [...params.proposalIds].sort().join(",");
  const raw = `${params.kind}|${params.reportId ?? ""}|${ids}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

async function alreadySent(fingerprint: string, kind: AdminNotifyKind): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("marketing_admin_notification_log")
    .select("id")
    .eq("fingerprint", fingerprint)
    .eq("kind", kind)
    .eq("status", "sent")
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function writeLog(row: {
  kind: AdminNotifyKind;
  fingerprint: string;
  channel: "email" | "web_push" | "none";
  status: "sent" | "skipped_dup" | "failed" | "disabled";
  subject?: string | null;
  body_preview?: string | null;
  report_id?: string | null;
  proposal_ids: string[];
  error_message?: string | null;
}): Promise<void> {
  await supabaseAdmin.from("marketing_admin_notification_log").insert(row);
}

function buildEmailContent(params: {
  kind: AdminNotifyKind;
  proposals: ImprovementProposalRow[];
  reportId?: string | null;
}): { subject: string; text: string; html: string; adminUrl: string } {
  const origin = getMarketingAppOrigin();
  const adminUrl = `${origin}/admin/marketing`;
  const high = params.proposals.filter((p) => p.priority === "high").length;
  const subject =
    params.kind === "urgent_proposal"
      ? `【Classmate】重要度の高い改善提案が${params.proposals.length}件あります`
      : `【Classmate】週次の改善提案が${params.proposals.length}件あります` +
        (high ? `（うち高優先 ${high}）` : "");

  const lines = [
    params.kind === "urgent_proposal"
      ? "重要度の高い改善提案が生成されました。"
      : "週次分析に基づく改善提案が生成されました。",
    "",
    ...params.proposals.slice(0, 12).map(
      (p, i) =>
        `${i + 1}. [${p.priority}] ${p.area}: ${p.title}\n   ${p.summary}`
    ),
    "",
    `管理画面（採用・保留・却下）: ${adminUrl}`,
    params.reportId ? `レポートID: ${params.reportId}` : "",
    "",
    "※ SNS公開・UI/画像の本番変更は承認後のみです。",
    "※ 投稿方針（strategy）は自動反映される場合があります（公開はしません）。",
  ].filter(Boolean);

  const text = lines.join("\n");
  const html = `<p>${lines[0]}</p><ol>${params.proposals
    .slice(0, 12)
    .map(
      (p) =>
        `<li><strong>[${p.priority}] ${escapeHtml(p.area)}</strong>: ${escapeHtml(p.title)}<br/><span style="color:#475569">${escapeHtml(p.summary)}</span></li>`
    )
    .join("")}</ol><p><a href="${adminUrl}">管理画面で確認する</a></p><p style="color:#64748b;font-size:12px">SNS公開・UI/画像変更は承認後のみ。</p>`;

  return { subject, text, html, adminUrl };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Notify operators about new proposals.
 * Gated by MARKETING_ADMIN_NOTIFY_ENABLED=1. Dedupes by fingerprint+kind.
 * Does not send when disabled (safe default for local/CI).
 */
export async function notifyAdminsOfProposals(params: {
  kind: AdminNotifyKind;
  proposals: ImprovementProposalRow[];
  reportId?: string | null;
}): Promise<AdminNotifyResult> {
  const proposalIds = params.proposals.map((p) => p.id);
  const fingerprint = digestFingerprint({
    kind: params.kind,
    proposalIds,
    reportId: params.reportId,
  });

  if (!params.proposals.length) {
    return { ok: true, channel: "none", status: "disabled", fingerprint };
  }

  if (!isMarketingAdminNotifyEnabled()) {
    await writeLog({
      kind: params.kind,
      fingerprint,
      channel: "none",
      status: "disabled",
      subject: null,
      body_preview: "notify_disabled",
      report_id: params.reportId ?? null,
      proposal_ids: proposalIds,
    });
    return { ok: true, channel: "none", status: "disabled", fingerprint };
  }

  if (await alreadySent(fingerprint, params.kind)) {
    await writeLog({
      kind: params.kind,
      fingerprint,
      channel: "none",
      status: "skipped_dup",
      report_id: params.reportId ?? null,
      proposal_ids: proposalIds,
    });
    return { ok: true, channel: "none", status: "skipped_dup", fingerprint };
  }

  const capability = getAdminNotifyChannelCapability();
  const to = getMarketingAdminNotifyEmail();
  if (!capability.emailAvailable || !to) {
    await writeLog({
      kind: params.kind,
      fingerprint,
      channel: "none",
      status: "failed",
      error_message: !to ? "admin_email_missing" : "email_not_configured",
      report_id: params.reportId ?? null,
      proposal_ids: proposalIds,
    });
    return {
      ok: false,
      channel: "none",
      status: "failed",
      error: !to ? "admin_email_missing" : "email_not_configured",
      fingerprint,
    };
  }

  const content = buildEmailContent(params);
  const sent = await sendTransactionalEmail({
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sent.ok) {
    await writeLog({
      kind: params.kind,
      fingerprint,
      channel: "email",
      status: "failed",
      subject: content.subject,
      body_preview: content.text.slice(0, 240),
      error_message: sent.error,
      report_id: params.reportId ?? null,
      proposal_ids: proposalIds,
    });
    return {
      ok: false,
      channel: "email",
      status: "failed",
      error: sent.error,
      fingerprint,
    };
  }

  await writeLog({
    kind: params.kind,
    fingerprint,
    channel: "email",
    status: "sent",
    subject: content.subject,
    body_preview: content.text.slice(0, 240),
    report_id: params.reportId ?? null,
    proposal_ids: proposalIds,
  });
  await markProposalsNotified({ ids: proposalIds, channel: "email" });

  return { ok: true, channel: "email", status: "sent", fingerprint };
}

/**
 * Split weekly proposals into digest + optional urgent high-priority batch.
 * Urgent uses a separate kind so it can notify even when digest was already sent
 * for a different set — still deduped per fingerprint.
 */
export async function notifyWeeklyProposalBatches(params: {
  proposals: ImprovementProposalRow[];
  reportId?: string | null;
}): Promise<{ digest: AdminNotifyResult; urgent: AdminNotifyResult | null }> {
  const digest = await notifyAdminsOfProposals({
    kind: "weekly_digest",
    proposals: params.proposals,
    reportId: params.reportId,
  });

  const high = params.proposals.filter((p) => p.priority === "high");
  if (!high.length) {
    return { digest, urgent: null };
  }

  const urgent = await notifyAdminsOfProposals({
    kind: "urgent_proposal",
    proposals: high,
    reportId: params.reportId,
  });
  return { digest, urgent };
}
