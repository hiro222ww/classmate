import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  assertClassMembership,
  buildCancelMeetingPlanMessage,
  buildSetMeetingPlanMessage,
  cancelActiveMeetingPlans,
  fetchActiveMeetingPlan,
  jstDatetimeLocalInputToIso,
  normalizeMeetingClassId,
  normalizeMeetingDeviceId,
  postMeetingPlanSystemMessage,
  toMeetingPlanPublic,
} from "@/lib/meetingPlan";
import { emitMeetingPlanEvent } from "@/lib/notificationEvents";

export const dynamic = "force-dynamic";

function badRequest(error: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}) },
    { status: 400 }
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = normalizeMeetingDeviceId(
      searchParams.get("device_id") ?? searchParams.get("deviceId")
    );
    const classId = normalizeMeetingClassId(
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

    const planRes = await fetchActiveMeetingPlan(classId);
    if (!planRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "meeting_plan_lookup_failed",
          detail: planRes.error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      plan: planRes.plan ? toMeetingPlanPublic(planRes.plan) : null,
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
    const deviceId = normalizeMeetingDeviceId(body?.device_id ?? body?.deviceId);
    const classId = normalizeMeetingClassId(body?.class_id ?? body?.classId);
    const scheduledAtRaw = String(
      body?.scheduled_at ?? body?.scheduledAt ?? ""
    ).trim();

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 401 }
      );
    }

    if (!classId) {
      return badRequest("class_id_missing");
    }

    if (!scheduledAtRaw) {
      return badRequest("scheduled_at_missing");
    }

    const scheduledAtIso =
      scheduledAtRaw.includes("T") && !scheduledAtRaw.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(scheduledAtRaw)
        ? jstDatetimeLocalInputToIso(scheduledAtRaw)
        : new Date(scheduledAtRaw).toISOString();

    if (!scheduledAtIso || !Number.isFinite(new Date(scheduledAtIso).getTime())) {
      return badRequest("scheduled_at_invalid");
    }

    const membership = await assertClassMembership(deviceId, classId);
    if (!membership.ok) {
      return NextResponse.json(
        { ok: false, error: membership.error, detail: membership.detail },
        { status: membership.status }
      );
    }

    const existing = await fetchActiveMeetingPlan(classId);
    if (!existing.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "meeting_plan_lookup_failed",
          detail: existing.error.message,
        },
        { status: 500 }
      );
    }

    const isUpdate = Boolean(existing.plan);

    const cancelRes = await cancelActiveMeetingPlans(classId);
    if (!cancelRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "meeting_plan_cancel_failed",
          detail: cancelRes.error?.message,
        },
        { status: 500 }
      );
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("class_meeting_plans")
      .insert({
        class_id: classId,
        scheduled_at: scheduledAtIso,
        note: body?.note ? String(body.note).trim() : null,
        created_by_device_id: deviceId,
      })
      .select(
        "id, class_id, scheduled_at, note, created_by_device_id, created_at, canceled_at"
      )
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        {
          ok: false,
          error: "meeting_plan_insert_failed",
          detail: insertErr?.message,
        },
        { status: 500 }
      );
    }

    const systemMessage = await buildSetMeetingPlanMessage(
      deviceId,
      scheduledAtIso,
      isUpdate
    );
    await postMeetingPlanSystemMessage({
      deviceId,
      classId,
      message: systemMessage,
    });

    await emitMeetingPlanEvent({
      classId,
      actorDeviceId: deviceId,
      meetingPlanId: inserted.id,
      message: systemMessage,
      scheduledAt: scheduledAtIso,
      isUpdate,
    });

    return NextResponse.json({
      ok: true,
      plan: toMeetingPlanPublic(inserted),
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
    const deviceId = normalizeMeetingDeviceId(body?.device_id ?? body?.deviceId);
    const classId = normalizeMeetingClassId(body?.class_id ?? body?.classId);

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

    const existing = await fetchActiveMeetingPlan(classId);
    if (!existing.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "meeting_plan_lookup_failed",
          detail: existing.error.message,
        },
        { status: 500 }
      );
    }

    if (!existing.plan) {
      return NextResponse.json({ ok: true, canceled: false });
    }

    const cancelRes = await cancelActiveMeetingPlans(classId);
    if (!cancelRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "meeting_plan_cancel_failed",
          detail: cancelRes.error?.message,
        },
        { status: 500 }
      );
    }

    const systemMessage = await buildCancelMeetingPlanMessage();
    await postMeetingPlanSystemMessage({
      deviceId,
      classId,
      message: systemMessage,
    });

    return NextResponse.json({ ok: true, canceled: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: message },
      { status: 500 }
    );
  }
}
