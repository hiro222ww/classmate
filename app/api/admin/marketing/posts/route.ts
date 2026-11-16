import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isMarketingPostStatus,
  type MarketingPostStatus,
} from "@/lib/marketing/types";
import { truncateForX } from "@/lib/marketing/utm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const status = String(searchParams.get("status") ?? "").trim();
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? 50) || 50, 1),
      200
    );

    let query = supabaseAdmin
      .from("marketing_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && isMarketingPostStatus(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      // Table may not exist yet before migration is applied.
      return NextResponse.json(
        {
          ok: false,
          error: "marketing_posts_failed",
          detail: error.message,
          migrationHint:
            "Apply supabase/migrations/20261116120000_marketing_ai_posts.sql when ready.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, posts: data ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "marketing_posts_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.body_text === "string") {
      patch.body_text = truncateForX(body.body_text);
    }
    if (typeof body.purpose === "string") patch.purpose = body.purpose.trim();
    if (typeof body.target_audience === "string") {
      patch.target_audience = body.target_audience.trim();
    }
    if (typeof body.cta === "string") patch.cta = body.cta.trim();
    if (typeof body.rejection_reason === "string") {
      patch.rejection_reason = body.rejection_reason.trim();
    }
    if (typeof body.scheduled_at === "string" || body.scheduled_at === null) {
      patch.scheduled_at = body.scheduled_at;
    }

    if (typeof body.status === "string" && isMarketingPostStatus(body.status)) {
      const status = body.status as MarketingPostStatus;
      patch.status = status;
      if (status === "rejected") {
        patch.rejected_at = new Date().toISOString();
      }
      if (status === "approved") {
        patch.rejected_at = null;
        patch.rejection_reason = null;
        patch.publish_error = null;
      }
      if (status === "scheduled" && !patch.scheduled_at && !body.scheduled_at) {
        return NextResponse.json(
          { ok: false, error: "scheduled_at_required" },
          { status: 400 }
        );
      }
      if (status === "published") {
        // Phase 1: manual mark only — no auto SNS publish.
        patch.published_at = new Date().toISOString();
        patch.publish_error = null;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_posts")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "update_failed", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, post: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "update_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("marketing_posts")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "delete_failed", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "delete_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
