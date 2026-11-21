import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listImprovementProposals,
  setProposalStatus,
  type ProposalStatus,
} from "@/lib/marketing/proposals";
import { getAdminNotifyChannelCapability } from "@/lib/marketing/adminNotify";
import {
  isMarketingAdminNotifyEnabled,
  getMarketingWeeklyCronScheduleHint,
} from "@/lib/marketing/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "open") as
    | ProposalStatus
    | "open"
    | "all";
  const proposals = await listImprovementProposals({ status, limit: 80 });
  return NextResponse.json({
    ok: true,
    proposals,
    notifyEnabled: isMarketingAdminNotifyEnabled(),
    notifyCapability: getAdminNotifyChannelCapability(),
    weeklyScheduleHint: getMarketingWeeklyCronScheduleHint(),
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: "accept" | "hold" | "reject";
    note?: string;
  } | null;

  const id = String(body?.id ?? "").trim();
  const action = body?.action;
  if (!id || !action) {
    return NextResponse.json(
      { ok: false, error: "id_and_action_required" },
      { status: 400 }
    );
  }

  const statusMap = {
    accept: "accepted",
    hold: "held",
    reject: "rejected",
  } as const;
  const status = statusMap[action];
  if (!status) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const result = await setProposalStatus({
    id,
    status,
    reviewNote: body?.note ?? null,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json({ ok: true, proposal: result.proposal });
}
