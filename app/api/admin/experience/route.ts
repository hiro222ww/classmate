import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  createExperienceEvent,
  getExperienceAdminSnapshot,
  setExperienceFeatureEnabled,
  updateExperienceEvent,
} from "@/lib/experience/admin";
import type { ExperienceEventStatus } from "@/lib/experience/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const snapshot = await getExperienceAdminSnapshot();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "load_failed", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();

    if (action === "set_feature") {
      const enabled = Boolean(body?.enabled);
      const res = await setExperienceFeatureEnabled(enabled);
      if (!res.ok) {
        return NextResponse.json(res, { status: 500 });
      }
      return NextResponse.json({ ok: true, featureEnabled: enabled });
    }

    if (action === "create") {
      const res = await createExperienceEvent({
        title: body?.title,
        startsAtJst: String(body?.startsAtJst ?? body?.starts_at_jst ?? ""),
        endsAtJst: String(body?.endsAtJst ?? body?.ends_at_jst ?? ""),
        maxMembers: body?.maxMembers ?? body?.max_members,
      });
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "update") {
      const statusRaw = String(body?.status ?? "").trim();
      const status = (["scheduled", "cancelled", "ended"] as const).includes(
        statusRaw as ExperienceEventStatus
      )
        ? (statusRaw as ExperienceEventStatus)
        : undefined;
      const res = await updateExperienceEvent({
        id: String(body?.id ?? ""),
        title: body?.title,
        startsAtJst: body?.startsAtJst ?? body?.starts_at_jst,
        endsAtJst: body?.endsAtJst ?? body?.ends_at_jst,
        maxMembers: body?.maxMembers ?? body?.max_members,
        status,
      });
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === "cancel") {
      const res = await updateExperienceEvent({
        id: String(body?.id ?? ""),
        status: "cancelled",
      });
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "admin_failed", detail: message },
      { status: 500 }
    );
  }
}
