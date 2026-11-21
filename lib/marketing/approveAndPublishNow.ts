import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { bufferPublishAdapter } from "@/lib/marketing/adapters/buffer";
import { isImmediatePublishEnabled } from "@/lib/marketing/immediatePublishSettings";
import { checkTextAgainstCharter } from "@/lib/marketing/operatingCharter/compliance";
import { listActivePolicies } from "@/lib/marketing/operatingCharter/store";
import {
  getMarketingDiscordWebhookUrl,
  getMarketingPostReviewUrl,
} from "@/lib/marketing/config";
import {
  isDiscordWebhookConfigured,
  sendDiscordWebhookMessage,
} from "@/lib/marketing/discordWebhook";
import type { MarketingPostRow } from "@/lib/marketing/types";
import { writeAdminAuditLog } from "@/lib/adminAuditLog";

export type PublishOutcome =
  | "x_published"
  | "buffer_accepted"
  | "failed"
  | "unknown";

export type ApproveAndPublishNowResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  retryable?: boolean;
  outcome?: PublishOutcome;
  post?: MarketingPostRow;
  externalPermalink?: string | null;
  dryRun?: boolean;
};

const CLAIM_TTL_MS = 3 * 60 * 1000;
const ALLOWED_STATUSES = new Set([
  "draft",
  "approved",
  "scheduled",
  "failed",
  "rejected",
]);

async function notifyDiscordPublishResult(params: {
  outcome: PublishOutcome;
  post: MarketingPostRow;
  permalink?: string | null;
  error?: string;
}): Promise<void> {
  const url = getMarketingDiscordWebhookUrl();
  if (!isDiscordWebhookConfigured(url)) return;

  const review = getMarketingPostReviewUrl(params.post.id);
  const lines = [
    `【Classmate】公開結果: ${params.outcome}`,
    `id=${params.post.id.slice(0, 8)}…`,
    `本文: ${String(params.post.body_text ?? "").replace(/\s+/g, " ").slice(0, 120)}`,
  ];
  if (params.permalink) lines.push(`X: ${params.permalink}`);
  if (params.error) lines.push(`原因: ${params.error}`);
  lines.push(`管理: ${review}`);
  await sendDiscordWebhookMessage({ webhookUrl: url, content: lines.join("\n") });
}

/**
 * Explicit operator action: approve (if needed) + Buffer shareNow for one post.
 * Never called from Cron. Double-submit guarded by claim token.
 */
export async function approveAndPublishNow(params: {
  postId: string;
  actor: string;
  /** Simulation only — never hits Buffer. */
  dryRun?: boolean;
  forceCharter?: boolean;
}): Promise<ApproveAndPublishNowResult> {
  const id = String(params.postId ?? "").trim();
  if (!id) return { ok: false, error: "id_required" };

  const enabled = await isImmediatePublishEnabled();
  if (!enabled && !params.dryRun) {
    return {
      ok: false,
      error: "immediate_publish_disabled",
      detail:
        "Runtime gate off (app_settings.marketing_immediate_publish_enabled) or FORCE_OFF / missing Buffer credentials.",
    };
  }

  const { data: row, error: loadError } = await supabaseAdmin
    .from("marketing_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return { ok: false, error: "load_failed", detail: loadError.message };
  }
  if (!row) return { ok: false, error: "not_found" };

  const post = row as MarketingPostRow & {
    external_status?: string | null;
    publish_claimed_at?: string | null;
    publish_claim_token?: string | null;
    publish_outcome?: string | null;
    external_permalink?: string | null;
    charter_compliance?: string | null;
  };

  if (post.external_post_id) {
    return {
      ok: false,
      error: "already_sent",
      detail: "Already has Buffer external_post_id — refusing double send.",
      post: post as MarketingPostRow,
    };
  }

  if (!ALLOWED_STATUSES.has(post.status)) {
    return {
      ok: false,
      error: "not_publishable",
      detail: `status=${post.status}`,
    };
  }

  if (post.publish_outcome === "unknown" && post.publish_claimed_at) {
    const claimedAt = new Date(post.publish_claimed_at).getTime();
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < CLAIM_TTL_MS) {
      return {
        ok: false,
        error: "result_unknown_no_auto_retry",
        detail:
          "Previous attempt ended in unknown — do not auto-retry. Confirm on Buffer/X first.",
        outcome: "unknown",
        post: post as MarketingPostRow,
      };
    }
  }

  const policies = await listActivePolicies();
  const compliance = checkTextAgainstCharter({
    text: post.body_text,
    policies,
  });
  if (compliance.status === "needs_review" && !params.forceCharter) {
    return {
      ok: false,
      error: "charter_needs_review",
      detail: compliance.conflicts.map((c) => c.reason).join("; ") || "needs_review",
    };
  }

  const claimToken = randomUUID();
  const nowIso = new Date().toISOString();
  const claimCutoff = new Date(Date.now() - CLAIM_TTL_MS).toISOString();

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("marketing_posts")
    .update({
      status: post.status === "draft" || post.status === "rejected" ? "approved" : post.status,
      publish_claimed_at: nowIso,
      publish_claim_token: claimToken,
      publish_attempts: Number(post.publish_attempts ?? 0) + 1,
      publish_error: null,
      charter_compliance: compliance.status,
      updated_at: nowIso,
    })
    .eq("id", id)
    .is("external_post_id", null)
    .or(
      `publish_claimed_at.is.null,publish_claimed_at.lt.${claimCutoff}`
    )
    .select("*")
    .maybeSingle();

  if (claimError) {
    return { ok: false, error: "claim_failed", detail: claimError.message };
  }
  if (!claimed) {
    return {
      ok: false,
      error: "in_flight_or_sent",
      detail: "Another publish claim is active or the post was already sent.",
    };
  }

  await writeAdminAuditLog({
    actor: params.actor,
    action: "marketing.approve_and_publish_now.claim",
    target: id,
    before: { status: post.status },
    after: { claimToken: "(set)", dryRun: Boolean(params.dryRun) },
  });

  if (params.dryRun) {
    await supabaseAdmin
      .from("marketing_posts")
      .update({
        publish_claimed_at: null,
        publish_claim_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("publish_claim_token", claimToken);

    return {
      ok: true,
      dryRun: true,
      outcome: "buffer_accepted",
      detail: "dry_run_no_buffer_call",
      post: claimed as MarketingPostRow,
    };
  }

  let adapterResult: Awaited<ReturnType<typeof bufferPublishAdapter.publish>>;
  try {
    adapterResult = await bufferPublishAdapter.publish({
      postId: id,
      bodyText: post.body_text,
      trackingUrl: post.tracking_url,
      scheduledAt: null,
      intent: "now",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "publish_threw";
    const { data: unknownRow } = await supabaseAdmin
      .from("marketing_posts")
      .update({
        publish_outcome: "unknown",
        external_status: "unknown",
        publish_error: `unknown:${message}`,
        // Keep claim briefly so auto-retry is blocked; TTL clears later.
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("publish_claim_token", claimToken)
      .select("*")
      .maybeSingle();

    await notifyDiscordPublishResult({
      outcome: "unknown",
      post: (unknownRow as MarketingPostRow) ?? (claimed as MarketingPostRow),
      error: message,
    });

    return {
      ok: false,
      error: "result_unknown",
      detail: message,
      outcome: "unknown",
      retryable: false,
      post: (unknownRow as MarketingPostRow) ?? (claimed as MarketingPostRow),
    };
  }

  if (!adapterResult.ok) {
    const timedOut = adapterResult.error === "buffer_timeout";
    const outcome: PublishOutcome = timedOut ? "unknown" : "failed";
    const { data: failedRow } = await supabaseAdmin
      .from("marketing_posts")
      .update({
        status: timedOut ? "approved" : "failed",
        publish_outcome: outcome,
        external_status: timedOut ? "unknown" : "error",
        publish_error: [adapterResult.error, adapterResult.detail]
          .filter(Boolean)
          .join(": "),
        publish_claimed_at: timedOut ? claimed.publish_claimed_at : null,
        publish_claim_token: timedOut ? claimToken : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("publish_claim_token", claimToken)
      .select("*")
      .maybeSingle();

    await writeAdminAuditLog({
      actor: params.actor,
      action: "marketing.approve_and_publish_now.failed",
      target: id,
      after: { outcome, error: adapterResult.error },
    });

    await notifyDiscordPublishResult({
      outcome,
      post: (failedRow as MarketingPostRow) ?? (claimed as MarketingPostRow),
      error: [adapterResult.error, adapterResult.detail].filter(Boolean).join(": "),
    });

    return {
      ok: false,
      error: adapterResult.error,
      detail: adapterResult.detail,
      retryable: false,
      outcome,
      post: (failedRow as MarketingPostRow) ?? (claimed as MarketingPostRow),
    };
  }

  const sentLive = !adapterResult.scheduledOnly;
  const outcome: PublishOutcome = sentLive ? "x_published" : "buffer_accepted";
  const permalink = adapterResult.externalPermalink ?? null;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("marketing_posts")
    .update({
      external_post_id: adapterResult.externalPostId ?? null,
      external_status: sentLive ? "sent" : "buffer_accepted",
      external_permalink: permalink,
      external_due_at: adapterResult.dueAt ?? null,
      publish_outcome: outcome,
      status: sentLive ? "published" : "scheduled",
      published_at: sentLive ? new Date().toISOString() : null,
      publish_error: null,
      publish_claimed_at: null,
      publish_claim_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("publish_claim_token", claimToken)
    .is("external_post_id", null)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: "update_failed", detail: updateError.message };
  }
  if (!updated) {
    return {
      ok: false,
      error: "concurrent_send",
      detail: "Claim lost after Buffer accepted — check Buffer/X manually; no auto-retry.",
      outcome: "unknown",
    };
  }

  await writeAdminAuditLog({
    actor: params.actor,
    action: "marketing.approve_and_publish_now.success",
    target: id,
    after: {
      outcome,
      external_post_id: adapterResult.externalPostId,
      has_permalink: Boolean(permalink),
    },
  });

  await notifyDiscordPublishResult({
    outcome,
    post: updated as MarketingPostRow,
    permalink,
  });

  return {
    ok: true,
    outcome,
    externalPermalink: permalink,
    post: updated as MarketingPostRow,
  };
}
