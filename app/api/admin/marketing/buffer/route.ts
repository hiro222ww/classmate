import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getBufferConnectionStatus } from "@/lib/marketing/bufferConfig";
import { probeBufferConnection } from "@/lib/marketing/bufferChannels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Buffer connection / channel listing (read-only).
 * Never returns the access token. Never creates posts.
 *
 * GET /api/admin/marketing/buffer
 * GET /api/admin/marketing/buffer?probe=1&match=classmate0401
 */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const probe = searchParams.get("probe") === "1";
    const match = String(
      searchParams.get("match") ?? "classmate0401"
    ).trim();

    const status = getBufferConnectionStatus();

    if (!probe) {
      return NextResponse.json({
        ok: true,
        buffer: status,
        hint: "Add ?probe=1 to call Buffer GraphQL and list channels (no publish).",
      });
    }

    const result = await probeBufferConnection({ matchHandle: match });

    return NextResponse.json({
      ok: result.ok,
      buffer: status,
      apiReachable: result.apiReachable,
      error: result.error,
      detail: result.detail,
      organizations: result.organizations,
      channels: result.channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        service: ch.service,
        displayName: ch.displayName,
        descriptor: ch.descriptor,
        externalLink: ch.externalLink,
        isDisconnected: ch.isDisconnected,
        isLocked: ch.isLocked,
      })),
      match: result.match,
      publishCompatibility: result.publishCompatibility,
      nextSteps: result.ok
        ? [
            result.match?.suggestedChannelId
              ? `BUFFER_CHANNEL_ID=${result.match.suggestedChannelId} を .env.local に設定`
              : "一覧から classmate0401 (service=twitter) の id を BUFFER_CHANNEL_ID に設定",
            "MARKETING_BUFFER_PUBLISH_ENABLED は 0 のまま（投稿はまだしない）",
            "開発サーバーを再起動して /admin/marketing で再確認",
          ]
        : [
            "BUFFER_ACCESS_TOKEN を .env.local に設定し、サーバーを再起動してください",
          ],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "buffer_probe_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
