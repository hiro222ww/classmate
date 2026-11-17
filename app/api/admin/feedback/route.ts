import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listClustersForAdmin,
  listFeedbackForAdmin,
  setClusterStatus,
  setFeedbackStatus,
} from "@/lib/feedback/service";
import type { FeedbackStatus } from "@/lib/feedback/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "open") as
    | FeedbackStatus
    | "open"
    | "all";
  const view = url.searchParams.get("view") || "items";

  try {
    if (view === "clusters") {
      const clusters = await listClustersForAdmin({ status, limit: 80 });
      return NextResponse.json({ ok: true, clusters });
    }
    const items = await listFeedbackForAdmin({ status, limit: 100 });
    // Admin needs raw text; never expose via public routes.
    return NextResponse.json({ ok: true, items });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "feedback_list_failed";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        migrationHint:
          "Apply supabase/migrations/20261117200000_user_feedback.sql",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    target?: "item" | "cluster";
    id?: string;
    action?: "accept" | "hold" | "resolve" | "dismiss";
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
    resolve: "resolved",
    dismiss: "dismissed",
  } as const;
  const status = statusMap[action];
  if (!status) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  if (body?.target === "cluster") {
    const result = await setClusterStatus({ id, status });
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const result = await setFeedbackStatus({
    id,
    status,
    adminNote: body?.note ?? null,
  });
  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.error === "safety_requires_note" ? 400 : 500,
    });
  }
  return NextResponse.json({ ok: true, feedback: result.feedback });
}
