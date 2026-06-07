import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CLASS_LEAVE_CONFIRMED_SOURCE } from "@/lib/classLeaveSource";
import { closeEmptySessionIfNeeded } from "@/lib/sessionLifecycle";

/**
 * Explicit class leave (Home UI).
 * - Deletes session_members for all sessions in the class.
 * - Deletes class_presence for the class.
 * - Deletes class_memberships.
 * Not triggered by pagehide/reload/bfcache.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const deviceId = String(body?.deviceId ?? "").trim();
    const classId = String(body?.classId ?? "").trim();
    const source = String(body?.source ?? "").trim();

    if (source !== CLASS_LEAVE_CONFIRMED_SOURCE) {
      console.log("[home-leave] blocked reason=missing_confirmed_source", {
        classId: classId ? classId.slice(-6) : "-",
        source: source || "-",
      });
      return NextResponse.json(
        { ok: false, error: "missing_confirmed_source" },
        { status: 403 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "device_id_missing" },
        { status: 400 }
      );
    }

    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "class_id_missing" },
        { status: 400 }
      );
    }

    const { data: membership, error: findErr } = await supabaseAdmin
      .from("class_memberships")
      .select("class_id")
      .eq("device_id", deviceId)
      .eq("class_id", classId)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "membership_lookup_failed",
          detail: findErr.message,
        },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { ok: false, error: "not_member" },
        { status: 400 }
      );
    }

    const { data: sessions, error: sessionsErr } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("class_id", classId);

    if (sessionsErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "sessions_lookup_failed",
          detail: sessionsErr.message,
        },
        { status: 500 }
      );
    }

    const sessionIds = (sessions ?? [])
      .map((s) => String(s.id ?? "").trim())
      .filter(Boolean);

    const closedSessionIds: string[] = [];

    let sessionMembersRemoved = 0;

    if (sessionIds.length > 0) {
      const { data: removedMemberRows, error: sessionMembersErr } =
        await supabaseAdmin
          .from("session_members")
          .delete()
          .eq("device_id", deviceId)
          .in("session_id", sessionIds)
          .select("session_id");

      if (sessionMembersErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "session_members_delete_failed",
            detail: sessionMembersErr.message,
          },
          { status: 500 }
        );
      }

      sessionMembersRemoved = removedMemberRows?.length ?? 0;

      for (const sessionId of sessionIds) {
        const closeRes = await closeEmptySessionIfNeeded(
          supabaseAdmin,
          sessionId
        );
        if (closeRes.closed) {
          closedSessionIds.push(sessionId);
        }
      }
    }

    const { data: removedPresenceRows, error: presenceErr } = await supabaseAdmin
      .from("class_presence")
      .delete()
      .eq("device_id", deviceId)
      .eq("class_id", classId)
      .select("class_id");

    if (presenceErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "presence_delete_failed",
          detail: presenceErr.message,
        },
        { status: 500 }
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from("class_memberships")
      .delete()
      .eq("device_id", deviceId)
      .eq("class_id", classId);

    if (delErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "leave_failed",
          detail: delErr.message,
        },
        { status: 500 }
      );
    }

    const presenceRemoved = removedPresenceRows?.length ?? 0;

    console.log(
      `[home-leave] success class=${classId.slice(-6)} device=${deviceId.slice(-6)} source=${source}`
    );
    console.log(
      `[class-leave] cleanup session_members_removed=${sessionMembersRemoved} ` +
        `presence_removed=${presenceRemoved} class=${classId.slice(-6)} device=${deviceId.slice(-6)}`
    );
    console.log(
      `[class-leave] membership-updated class=${classId.slice(-6)} status=left device=${deviceId.slice(-6)}`
    );

    return NextResponse.json({
      ok: true,
      classId,
      removedSessionIds: sessionIds,
      closedSessionIds,
      sessionMembersRemoved,
      presenceRemoved,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: e?.message ?? "unknown_error",
      },
      { status: 500 }
    );
  }
}
