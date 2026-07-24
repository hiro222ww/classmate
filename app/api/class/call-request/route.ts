import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertClassMembership,
  buildCreateCallRequestMessage,
  CALL_REQUEST_TTL_MS,
  cancelCallRequestById,
  DEFAULT_CALL_REQUEST_MESSAGE,
  fetchActiveCallRequest,
  normalizeCallRequestClassId,
  normalizeCallRequestDeviceId,
  postCallRequestSystemMessage,
  toCallRequestPublic,
} from "@/lib/callRequest";
import { emitCallRequestCreatedEvent } from "@/lib/notificationEvents";
import { dispatchNotificationWebPush } from "@/lib/webPushServer";
import { dispatchNotificationEmail } from "@/lib/emailNotifications";
import { resolveDisplayName } from "@/lib/resolveDisplayName";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function badRequest(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 400 }
  );
}

async function toPublicResponse(
  row: NonNullable<Awaited<ReturnType<typeof fetchActiveCallRequest>>["request"]>,
  viewerDeviceId: string
) {
  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("display_name")
    .eq("device_id", row.created_by_device_id)
    .maybeSingle();

  const resolved = resolveDisplayName({
    profileDisplayName: (data as { display_name?: string | null } | null)
      ?.display_name,
  }).displayName;

  return toCallRequestPublic(
    row,
    resolved || "クラスメート",
    viewerDeviceId
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = normalizeCallRequestDeviceId(
      searchParams.get("device_id") ?? searchParams.get("deviceId")
    );
    const classId = normalizeCallRequestClassId(
      searchParams.get("class_id") ?? searchParams.get("classId")
    );

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!classId) {
      return badRequest("class_id_missing");
    }

    const membership = await assertClassMembership(deviceId, classId);
    if (!membership.ok) {
      return NextResponse.json(
        { ok: false, error: membership.error, detail: membership.detail },
        { status: membership.status }
      );
    }

    const requestRes = await fetchActiveCallRequest(classId);
    if (!requestRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "call_request_lookup_failed",
          detail: requestRes.error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      request: requestRes.request
        ? await toPublicResponse(requestRes.request, deviceId)
        : null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = normalizeCallRequestDeviceId(
      body?.device_id ?? body?.deviceId
    );
    const classId = normalizeCallRequestClassId(body?.class_id ?? body?.classId);
    const message = String(body?.message ?? DEFAULT_CALL_REQUEST_MESSAGE).trim();

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!classId) {
      return badRequest("class_id_missing");
    }

    const membership = await assertClassMembership(deviceId, classId);
    if (!membership.ok) {
      return NextResponse.json(
        { ok: false, error: membership.error, detail: membership.detail },
        { status: membership.status }
      );
    }

    const existing = await fetchActiveCallRequest(classId);
    if (!existing.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "call_request_lookup_failed",
          detail: existing.error.message,
        },
        { status: 500 }
      );
    }

    if (existing.request) {
      return NextResponse.json({
        ok: true,
        request: await toPublicResponse(existing.request, deviceId),
        reused: true,
      });
    }

    const expiresAt = new Date(Date.now() + CALL_REQUEST_TTL_MS).toISOString();
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("class_call_requests")
      .insert({
        class_id: classId,
        created_by_device_id: deviceId,
        message: message || DEFAULT_CALL_REQUEST_MESSAGE,
        expires_at: expiresAt,
      })
      .select(
        "id, class_id, created_by_device_id, message, created_at, expires_at, canceled_at"
      )
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        {
          ok: false,
          error: "call_request_insert_failed",
          detail: insertErr?.message,
        },
        { status: 500 }
      );
    }

    const systemMessage = await buildCreateCallRequestMessage(deviceId);
    await postCallRequestSystemMessage({
      deviceId,
      classId,
      message: systemMessage,
    });

    const publicRequest = await toPublicResponse(inserted, deviceId);
    const eventRes = await emitCallRequestCreatedEvent({
      classId,
      actorDeviceId: deviceId,
      callRequestId: inserted.id,
      message: systemMessage,
      expiresAt,
      displayLabel: publicRequest.display_label,
    });

    if (eventRes.ok && eventRes.id) {
      await dispatchNotificationWebPush(eventRes.id);
      await dispatchNotificationEmail(eventRes.id);
    }

    return NextResponse.json({
      ok: true,
      request: publicRequest,
      reused: false,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = normalizeCallRequestDeviceId(
      body?.device_id ?? body?.deviceId
    );
    const classId = normalizeCallRequestClassId(body?.class_id ?? body?.classId);

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!classId) {
      return badRequest("class_id_missing");
    }

    const membership = await assertClassMembership(deviceId, classId);
    if (!membership.ok) {
      return NextResponse.json(
        { ok: false, error: membership.error, detail: membership.detail },
        { status: membership.status }
      );
    }

    const existing = await fetchActiveCallRequest(classId);
    if (!existing.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "call_request_lookup_failed",
          detail: existing.error.message,
        },
        { status: 500 }
      );
    }

    if (!existing.request) {
      return NextResponse.json({ ok: true, canceled: false });
    }

    if (existing.request.created_by_device_id !== deviceId) {
      return NextResponse.json(
        { ok: false, error: "not_call_request_owner" },
        { status: 403 }
      );
    }

    const cancelRes = await cancelCallRequestById(existing.request.id);
    if (!cancelRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "call_request_cancel_failed",
          detail: cancelRes.error?.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, canceled: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}
