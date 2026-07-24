import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isExistingSessionMember } from "@/lib/admissionMembership";
import { moderateChatText } from "@/lib/chatModeration";
import {
  MESSAGE_HISTORY_LIMIT,
  checkMessageRateLimit,
  validateMessageText,
} from "@/lib/messageLimits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = String(searchParams.get("sessionId") ?? "").trim();
    const deviceId = String(searchParams.get("deviceId") ?? "").trim();
    const limitRaw = Number(searchParams.get("limit") ?? MESSAGE_HISTORY_LIMIT);
    const limit = Math.min(
      Math.max(1, Number.isFinite(limitRaw) ? limitRaw : MESSAGE_HISTORY_LIMIT),
      MESSAGE_HISTORY_LIMIT
    );

    if (!sessionId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "missing_params" },
        { status: 400 }
      );
    }

    const member = await isExistingSessionMember(deviceId, sessionId);
    if (!member) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("room_messages")
      .select(
        "id, session_id, device_id, display_name, message, image_path, message_type, deleted_at, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "fetch_failed" },
        { status: 500 }
      );
    }

    const messages = [...(data ?? [])].reverse();
    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error("[session/messages] GET failed", e);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId ?? "").trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const displayNameRaw = String(body.displayName ?? "").trim();
    const validation = validateMessageText(body.message);

    if (!sessionId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "missing_params" },
        { status: 400 }
      );
    }

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: validation.error,
          message: validation.message,
        },
        { status: 400 }
      );
    }

    if (!checkMessageRateLimit(`session:${sessionId}:${deviceId}`)) {
      return NextResponse.json(
        {
          ok: false,
          error: "rate_limited",
          message: "送信が早すぎます。少し待ってから再送してください",
        },
        { status: 429 }
      );
    }

    const member = await isExistingSessionMember(deviceId, sessionId);
    if (!member) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const moderation = await moderateChatText(validation.text);
    if (!moderation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: moderation.block
            ? "contact_exchange_blocked"
            : "contact_exchange_warning",
          message: moderation.message,
        },
        { status: 400 }
      );
    }

    const displayName =
      displayNameRaw && displayNameRaw !== "You"
        ? displayNameRaw.slice(0, 40)
        : "参加者";

    const { data, error } = await supabaseAdmin
      .from("room_messages")
      .insert({
        session_id: sessionId,
        device_id: deviceId,
        display_name: displayName,
        message: validation.text,
        message_type: "text",
      })
      .select(
        "id, session_id, device_id, display_name, message, image_path, message_type, deleted_at, created_at"
      )
      .single();

    if (error || !data) {
      console.warn("[session/messages] insert failed", error);
      return NextResponse.json(
        { ok: false, error: "insert_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: data });
  } catch (e) {
    console.error("[session/messages] POST failed", e);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}
