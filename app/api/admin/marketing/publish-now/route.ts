import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminActorFromRequest } from "@/lib/adminAuditLog";
import { approveAndPublishNow } from "@/lib/marketing/approveAndPublishNow";
import { isImmediatePublishEnabled } from "@/lib/marketing/immediatePublishSettings";
import { getBufferConnectionStatus } from "@/lib/marketing/bufferConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Approve (if needed) + Buffer shareNow for exactly one post.
 * Never invoked by Cron. Dry-run supported for Preview/CI.
 */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const enabled = await isImmediatePublishEnabled();
  const buffer = getBufferConnectionStatus();
  return NextResponse.json({
    ok: true,
    immediatePublishEnabled: enabled,
    buffer: {
      credentialsPresent: buffer.credentialsPresent,
      channelIdConfigured: buffer.channelIdConfigured,
      // Do not expose env publish gate value as "connected" for this path
      note: buffer.note,
    },
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? body.postId ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const dryRun = body.dryRun === true;
    const forceCharter = body.forceCharter === true;

    const result = await approveAndPublishNow({
      postId: id,
      actor: adminActorFromRequest(req),
      dryRun,
      forceCharter,
    });

    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "already_sent" ||
              result.error === "in_flight_or_sent" ||
              result.error === "result_unknown_no_auto_retry"
            ? 409
            : result.error === "immediate_publish_disabled" ||
                result.error === "charter_needs_review"
              ? 403
              : result.error === "result_unknown"
                ? 502
                : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "publish_now_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
