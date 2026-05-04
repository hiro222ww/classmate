import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messageId, deviceId } = await req.json();

    if (!messageId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "missing_params" },
        { status: 400 }
      );
    }

    const deletedAt = new Date().toISOString();

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("room_messages")
      .select("id, device_id, image_path")
      .eq("id", messageId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: "fetch_failed" },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    if (existing.device_id !== deviceId) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    if (existing.image_path) {
      await supabaseAdmin.storage
        .from("room-message-images")
        .remove([existing.image_path]);
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("room_messages")
      .update({
        deleted_at: deletedAt,
        message: "",
        image_path: null,
        message_type: "text",
      })
      .eq("id", messageId)
      .select(
        "id, session_id, device_id, display_name, message, image_path, message_type, deleted_at, created_at"
      )
      .maybeSingle();

    if (updateErr || !updated) {
      return NextResponse.json(
        { ok: false, error: "update_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: updated });
  } catch (e) {
    console.error("[messages/delete] failed", e);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}