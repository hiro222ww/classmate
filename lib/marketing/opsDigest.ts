import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getMarketingAdminNotifyEmail,
  getMarketingAppOrigin,
  getMarketingDiscordWebhookUrl,
  getMarketingPostReviewUrl,
  isMarketingAdminNotifyEnabled,
  isMarketingOpsDigestEnabled,
} from "@/lib/marketing/config";
import { loadMarketingDashboardMetrics } from "@/lib/marketing/metrics";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
} from "@/lib/emailSender";
import {
  isDiscordWebhookConfigured,
  sendDiscordWebhookMessage,
} from "@/lib/marketing/discordWebhook";

export type OpsDigestChannelResult = {
  channel: "email" | "discord" | "none";
  status: "sent" | "skipped_dup" | "failed" | "disabled";
  error?: string;
};

export type OpsDigestResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  fingerprint?: string;
  email?: OpsDigestChannelResult;
  discord?: OpsDigestChannelResult;
  candidateIds?: string[];
};

type DraftCandidate = {
  id: string;
  post_type: string;
  body_text: string;
  status: string;
  quality_score: number | null;
  charter_compliance: string | null;
  utm_content: string | null;
  created_at: string;
};

function jstDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function preferredNightTypes(jstDate: string): string[] {
  // Rotate emphasis: empathy/question first for night reach.
  const day = Number(String(jstDate).replace(/\D/g, "").slice(-2)) || 1;
  const cycle = [
    ["question", "empathy"],
    ["empathy", "invite"],
    ["question", "intro"],
    ["empathy", "question"],
  ];
  return cycle[day % cycle.length];
}

function fingerprintFor(params: {
  jstDate: string;
  candidateIds: string[];
}): string {
  const ids = [...params.candidateIds].sort().join(",");
  return createHash("sha256")
    .update(`ops_digest|${params.jstDate}|${ids}`)
    .digest("hex")
    .slice(0, 40);
}

async function alreadySent(fingerprint: string): Promise<boolean> {
  // Email logs use the base fingerprint; Discord uses `${fingerprint}-discord`.
  // Dedup must treat either channel's successful send as already delivered.
  const fingerprints = [fingerprint, `${fingerprint}-discord`];
  const { data } = await supabaseAdmin
    .from("marketing_admin_notification_log")
    .select("id")
    .in("fingerprint", fingerprints)
    .eq("kind", "ops_digest")
    .eq("status", "sent")
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function writeLog(row: {
  fingerprint: string;
  channel: "email" | "discord" | "none";
  status: "sent" | "skipped_dup" | "failed" | "disabled";
  subject?: string | null;
  body_preview?: string | null;
  proposal_ids?: string[];
  error_message?: string | null;
}): Promise<void> {
  await supabaseAdmin.from("marketing_admin_notification_log").insert({
    kind: "ops_digest",
    fingerprint: row.fingerprint,
    channel: row.channel,
    status: row.status,
    subject: row.subject ?? null,
    body_preview: row.body_preview ?? null,
    proposal_ids: row.proposal_ids ?? [],
    error_message: row.error_message ?? null,
  });
}

function pickCandidates(
  drafts: DraftCandidate[],
  preferred: string[]
): DraftCandidate[] {
  const picked: DraftCandidate[] = [];
  for (const type of preferred) {
    const hit = drafts.find(
      (d) => d.post_type === type && !picked.some((p) => p.id === d.id)
    );
    if (hit) picked.push(hit);
  }
  for (const d of drafts) {
    if (picked.length >= 2) break;
    if (!picked.some((p) => p.id === d.id)) picked.push(d);
  }
  return picked.slice(0, 2);
}

function buildMessage(params: {
  jstDate: string;
  candidates: DraftCandidate[];
  visits: number;
  registrations: number;
  callStarted: number;
  publishedCount: number;
  adminUrl: string;
}): { subject: string; text: string; discord: string } {
  const lines: string[] = [];
  lines.push(`【Classmate】マーケ運用ダイジェスト ${params.jstDate}`);
  lines.push("");
  lines.push("■ これまでの結果（直近14日・UTM）");
  lines.push(`- 公開/予約済み投稿: ${params.publishedCount}`);
  lines.push(`- 流入(visits): ${params.visits}`);
  lines.push(`- 登録(min_profile_saved): ${params.registrations}`);
  lines.push(`- 通話開始(call_started): ${params.callStarted}`);
  lines.push("");
  lines.push("■ 今夜こう出しましょう（案・未承認）");
  if (!params.candidates.length) {
    lines.push("- 候補draftがありません。朝の生成または手動生成を確認してください。");
  } else {
    params.candidates.forEach((c, i) => {
      const reviewUrl = getMarketingPostReviewUrl(c.id);
      lines.push(
        `${i + 1}. [${c.post_type}] ${c.body_text.replace(/\s+/g, " ").slice(0, 120)}`
      );
      lines.push(
        `   quality=${c.quality_score ?? "-"} charter=${c.charter_compliance ?? "-"}`
      );
      lines.push(`   レビュー（承認/却下）: ${reviewUrl}`);
    });
  }
  lines.push("");
  lines.push(
    "※ リンク先で承認しても SNS には出ません。公開は管理画面の「Bufferへ予約」等の別操作です。"
  );
  lines.push(`管理画面一覧: ${params.adminUrl}`);
  const text = lines.join("\n");
  return {
    subject: `【Classmate】今夜の投稿案 ${params.jstDate}`,
    text,
    discord: text,
  };
}

/**
 * Build + send evening ops digest (email and/or Discord).
 * Never publishes SNS. Never auto-approves drafts.
 */
export async function sendMarketingOpsDigest(): Promise<OpsDigestResult> {
  if (!isMarketingOpsDigestEnabled()) {
    return {
      ok: true,
      email: { channel: "none", status: "disabled" },
      discord: { channel: "none", status: "disabled" },
      detail: "Set MARKETING_OPS_DIGEST_ENABLED=1 after operator approval.",
    };
  }

  const jstDate = jstDateString();
  const adminUrl = `${getMarketingAppOrigin()}/admin/marketing`;

  const { data: draftRows } = await supabaseAdmin
    .from("marketing_posts")
    .select(
      "id, post_type, body_text, status, quality_score, charter_compliance, utm_content, created_at"
    )
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(20);

  const drafts = (draftRows ?? []) as DraftCandidate[];
  const preferred = preferredNightTypes(jstDate);
  const candidates = pickCandidates(drafts, preferred);
  const candidateIds = candidates.map((c) => c.id);
  const fingerprint = fingerprintFor({ jstDate, candidateIds });

  if (await alreadySent(fingerprint)) {
    await writeLog({
      fingerprint,
      channel: "none",
      status: "skipped_dup",
      proposal_ids: candidateIds,
    });
    return {
      ok: true,
      fingerprint,
      candidateIds,
      email: { channel: "none", status: "skipped_dup" },
      discord: { channel: "none", status: "skipped_dup" },
    };
  }

  const metricsLoaded = await loadMarketingDashboardMetrics({ rangeDays: 14 });
  let visits = 0;
  let registrations = 0;
  let callStarted = 0;
  if (metricsLoaded.ok) {
    visits = metricsLoaded.metrics.postPerformance.reduce(
      (s, p) => s + p.visits,
      0
    );
    registrations = metricsLoaded.metrics.postPerformance.reduce(
      (s, p) => s + p.registrations,
      0
    );
    callStarted = metricsLoaded.metrics.postPerformance.reduce(
      (s, p) => s + p.callStarted,
      0
    );
  }

  const { count: publishedCount } = await supabaseAdmin
    .from("marketing_posts")
    .select("id", { count: "exact", head: true })
    .in("status", ["published", "scheduled"]);

  const message = buildMessage({
    jstDate,
    candidates,
    visits,
    registrations,
    callStarted,
    publishedCount: publishedCount ?? 0,
    adminUrl,
  });

  const emailEnabled =
    isMarketingAdminNotifyEnabled() && isTransactionalEmailConfigured();
  const to = getMarketingAdminNotifyEmail();
  const discordUrl = getMarketingDiscordWebhookUrl();
  const discordEnabled = isDiscordWebhookConfigured(discordUrl);

  if (!emailEnabled && !discordEnabled) {
    await writeLog({
      fingerprint,
      channel: "none",
      status: "failed",
      proposal_ids: candidateIds,
      error_message: "no_notify_channel_configured",
      body_preview: message.text.slice(0, 240),
    });
    return {
      ok: false,
      error: "no_notify_channel_configured",
      detail:
        "Enable email (MARKETING_ADMIN_NOTIFY_ENABLED + Resend) and/or MARKETING_DISCORD_WEBHOOK_URL.",
      fingerprint,
      candidateIds,
      email: { channel: "none", status: "failed", error: "email_unavailable" },
      discord: {
        channel: "none",
        status: "failed",
        error: "discord_unavailable",
      },
    };
  }

  let emailResult: OpsDigestChannelResult = {
    channel: "none",
    status: "disabled",
  };
  let discordResult: OpsDigestChannelResult = {
    channel: "none",
    status: "disabled",
  };

  if (emailEnabled) {
    if (!to) {
      emailResult = {
        channel: "none",
        status: "failed",
        error: "admin_email_missing",
      };
    } else {
      const sent = await sendTransactionalEmail({
        to,
        subject: message.subject,
        text: message.text,
        html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${message.text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre>`,
      });
      emailResult = sent.ok
        ? { channel: "email", status: "sent" }
        : { channel: "email", status: "failed", error: sent.error };
      await writeLog({
        fingerprint,
        channel: "email",
        status: emailResult.status,
        subject: message.subject,
        body_preview: message.text.slice(0, 240),
        proposal_ids: candidateIds,
        error_message: emailResult.error ?? null,
      });
    }
  }

  if (discordEnabled) {
    const sent = await sendDiscordWebhookMessage({
      webhookUrl: discordUrl,
      content: message.discord,
    });
    discordResult = sent.ok
      ? { channel: "discord", status: "sent" }
      : { channel: "discord", status: "failed", error: sent.error };
    await writeLog({
      fingerprint: `${fingerprint}-discord`,
      channel: "discord",
      status: discordResult.status,
      subject: message.subject,
      body_preview: message.discord.slice(0, 240),
      proposal_ids: candidateIds,
      error_message: discordResult.error ?? null,
    });
  }

  const anySent =
    emailResult.status === "sent" || discordResult.status === "sent";
  return {
    ok: anySent,
    error: anySent ? undefined : "all_channels_failed",
    fingerprint,
    candidateIds,
    email: emailResult,
    discord: discordResult,
  };
}
