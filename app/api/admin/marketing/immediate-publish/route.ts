import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { adminActorFromRequest, writeAdminAuditLog } from "@/lib/adminAuditLog";
import {
  isImmediatePublishEnabled,
  setImmediatePublishEnabled,
} from "@/lib/marketing/immediatePublishSettings";
import { getBufferConnectionStatus } from "@/lib/marketing/bufferConfig";
import { isMarketingBufferPublishForceOff } from "@/lib/marketing/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read/toggle DB-backed immediate publish gate (no Vercel redeploy). */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const enabled = await isImmediatePublishEnabled();
  const buffer = getBufferConnectionStatus();
  return NextResponse.json({
    ok: true,
    enabled,
    forceOff: isMarketingBufferPublishForceOff(),
    credentialsPresent: buffer.credentialsPresent,
  });
}

export async function PATCH(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (isMarketingBufferPublishForceOff()) {
    return NextResponse.json(
      {
        ok: false,
        error: "force_off",
        detail: "MARKETING_BUFFER_PUBLISH_FORCE_OFF=1 blocks enabling.",
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "enabled_boolean_required" },
      { status: 400 }
    );
  }

  const before = await isImmediatePublishEnabled();
  const saved = await setImmediatePublishEnabled(body.enabled);
  if (!saved.ok) {
    return NextResponse.json(
      { ok: false, error: "save_failed", detail: saved.error },
      { status: 500 }
    );
  }

  await writeAdminAuditLog({
    actor: adminActorFromRequest(req),
    action: "marketing.immediate_publish_gate",
    after: { enabled: body.enabled, before },
  });

  return NextResponse.json({
    ok: true,
    enabled: body.enabled,
  });
}
