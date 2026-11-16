import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { publishMarketingPost } from "@/lib/marketing/publishPost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Schedule/send an approved marketing post via Buffer (or manual stub).
 * Does not call Buffer unless MARKETING_BUFFER_PUBLISH_ENABLED=1.
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? body.postId ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const result = await publishMarketingPost({
      postId: id,
      retry: body.retry === true,
    });

    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "already_sent" || result.error === "already_published"
            ? 409
            : result.error === "manual_only" ||
                result.error === "buffer_not_configured" ||
                result.error === "buffer_publish_disabled"
              ? 503
              : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "publish_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
