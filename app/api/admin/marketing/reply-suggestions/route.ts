import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  listReplySuggestions,
  loadReplyExposureComparison,
  patchReplySuggestion,
  upsertReplySuggestion,
  type ReplySuggestionMetrics,
  type ReplySuggestionStatus,
} from "@/lib/marketing/replySuggestions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Human-curated X reply suggestions.
 * Never posts to X / never sends DMs. AI drafts only.
 */
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "open") as
    | ReplySuggestionStatus
    | "open"
    | "all";
  const compareDays = Number(url.searchParams.get("compareDays") || "0");

  const listed = await listReplySuggestions({ status, limit: 80 });
  if (!listed.ok) {
    return NextResponse.json(listed, { status: 500 });
  }

  let comparison = null;
  if (compareDays > 0) {
    const cmp = await loadReplyExposureComparison({ rangeDays: compareDays });
    if (cmp.ok) comparison = cmp;
  }

  return NextResponse.json({
    ok: true,
    suggestions: listed.suggestions,
    comparison,
    safety: {
      autoReply: false,
      autoDm: false,
      humanMustPostManually: true,
    },
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    sourceUrl?: string;
    selectionReason?: string;
    sourceBody?: string;
    forceRegenerate?: boolean;
  } | null;

  const result = await upsertReplySuggestion({
    sourceUrl: String(body?.sourceUrl ?? ""),
    selectionReason: body?.selectionReason,
    sourceBody: body?.sourceBody,
    forceRegenerate: body?.forceRegenerate === true,
  });

  if (!result.ok) {
    const status =
      result.error === "source_body_required"
        ? 422
        : result.error === "invalid_x_status_url" ||
            result.error === "selection_reason_required"
          ? 400
          : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    action?: "posted" | "skipped" | "ready" | "select_draft" | "regenerate";
    selectedDraftIndex?: number;
    skipReason?: string;
    metrics?: ReplySuggestionMetrics;
    selectionReason?: string;
    sourceBody?: string;
    sourceUrl?: string;
  } | null;

  const id = String(body?.id ?? "").trim();
  if (!id && body?.action !== "regenerate") {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  if (body?.action === "regenerate") {
    const result = await upsertReplySuggestion({
      sourceUrl: String(body.sourceUrl ?? ""),
      selectionReason: body.selectionReason,
      sourceBody: body.sourceBody,
      forceRegenerate: true,
    });
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.error === "source_body_required" ? 422 : 500,
      });
    }
    return NextResponse.json(result);
  }

  const result = await patchReplySuggestion({
    id,
    action: body?.action,
    selectedDraftIndex: body?.selectedDraftIndex,
    skipReason: body?.skipReason,
    metrics: body?.metrics,
    selectionReason: body?.selectionReason,
    sourceBody: body?.sourceBody,
  });

  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.error === "not_found" ? 404 : 400,
    });
  }
  return NextResponse.json(result);
}
