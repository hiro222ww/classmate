import { getPublishAdapter } from "@/lib/marketing/adapters";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { MarketingPostRow } from "@/lib/marketing/types";

export type PublishMarketingPostResult = {
  ok: boolean;
  error?: string;
  detail?: string;
  retryable?: boolean;
  post?: MarketingPostRow;
  scheduledOnly?: boolean;
};

/**
 * Send an approved/scheduled post via the active adapter (Buffer or manual).
 * Never double-sends when external_post_id is already set.
 */
export async function publishMarketingPost(params: {
  postId: string;
  /** Force retry even if previous attempt failed (still blocked if already has external id). */
  retry?: boolean;
}): Promise<PublishMarketingPostResult> {
  const id = String(params.postId ?? "").trim();
  if (!id) return { ok: false, error: "id_required" };

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
    external_due_at?: string | null;
    publish_attempts?: number | null;
  };

  if (post.external_post_id) {
    return {
      ok: false,
      error: "already_sent",
      detail: `external_post_id=${post.external_post_id}`,
      post: post as MarketingPostRow,
    };
  }

  if (post.status === "published" && post.external_status === "sent") {
    return { ok: false, error: "already_published", post: post as MarketingPostRow };
  }

  if (post.status !== "approved" && post.status !== "scheduled") {
    return {
      ok: false,
      error: "not_approvable",
      detail: `status=${post.status}`,
    };
  }

  const adapter = getPublishAdapter(post.channel);
  const attempt = Number(post.publish_attempts ?? 0) + 1;

  await supabaseAdmin
    .from("marketing_posts")
    .update({
      publish_attempts: attempt,
      publish_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("external_post_id", null);

  const result = await adapter.publish({
    postId: id,
    bodyText: post.body_text,
    trackingUrl: post.tracking_url,
    scheduledAt: post.scheduled_at,
  });

  if (!result.ok) {
    const nextStatus =
      result.error === "manual_only" || result.error === "buffer_not_configured"
        ? post.status
        : result.error === "buffer_publish_disabled"
          ? post.status
          : "failed";

    const { data: updated } = await supabaseAdmin
      .from("marketing_posts")
      .update({
        status: nextStatus,
        publish_error: [result.error, result.detail].filter(Boolean).join(": "),
        external_status:
          result.error === "manual_only" ||
          result.error === "buffer_not_configured" ||
          result.error === "buffer_publish_disabled"
            ? null
            : "error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("external_post_id", null)
      .select("*")
      .maybeSingle();

    return {
      ok: false,
      error: result.error,
      detail: result.detail,
      retryable: Boolean(result.retryable),
      post: (updated as MarketingPostRow) ?? (post as MarketingPostRow),
    };
  }

  const scheduledOnly = Boolean(result.scheduledOnly);
  const patch = {
    external_post_id: result.externalPostId ?? null,
    external_status: scheduledOnly ? "scheduled" : "sent",
    external_due_at: result.dueAt ?? post.scheduled_at ?? null,
    status: scheduledOnly ? "scheduled" : "published",
    published_at: scheduledOnly ? null : new Date().toISOString(),
    scheduled_at: result.dueAt ?? post.scheduled_at,
    publish_error: null,
    updated_at: new Date().toISOString(),
  };

  // Atomic-ish: only update if still no external_post_id (double-send guard).
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("marketing_posts")
    .update(patch)
    .eq("id", id)
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
      detail: "Another process may have published this post.",
    };
  }

  return {
    ok: true,
    scheduledOnly,
    post: updated as MarketingPostRow,
  };
}
