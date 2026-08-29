import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildClassVoteStatusView,
  normalizeClassVoteDeviceId,
  normalizeSessionId,
} from "@/lib/sessionClassVote";
import { ensureSessionMembersLockedIfDue } from "@/lib/sessionJoinLock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = normalizeSessionId(searchParams.get("sessionId"));
    const deviceId = normalizeClassVoteDeviceId(
      searchParams.get("deviceId") ?? searchParams.get("device_id")
    );

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "invalid_sessionId" },
        { status: 400 }
      );
    }

    await ensureSessionMembersLockedIfDue(sessionId);

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sessions")
      .select("id, class_id, members_locked_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json(
        { ok: false, error: "session_lookup_failed", detail: sessionErr.message },
        { status: 500 }
      );
    }
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "session_not_found" },
        { status: 404 }
      );
    }

    const classId = String(session.class_id ?? "").trim();
    if (!classId) {
      return NextResponse.json(
        { ok: false, error: "session_class_missing" },
        { status: 400 }
      );
    }

    const { data: classRow, error: classErr } = await supabaseAdmin
      .from("classes")
      .select("id, name, lifecycle, promoted_from_session_id")
      .eq("id", classId)
      .maybeSingle();

    if (classErr) {
      return NextResponse.json(
        { ok: false, error: "class_lookup_failed", detail: classErr.message },
        { status: 500 }
      );
    }
    if (!classRow) {
      return NextResponse.json(
        { ok: false, error: "class_not_found" },
        { status: 404 }
      );
    }

    const { count: voteCount, error: voteErr } = await supabaseAdmin
      .from("session_class_votes")
      .select("device_id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (voteErr) {
      return NextResponse.json(
        { ok: false, error: "vote_count_failed", detail: voteErr.message },
        { status: 500 }
      );
    }

    let selfVoted = false;
    if (deviceId) {
      const { data: selfVote, error: selfErr } = await supabaseAdmin
        .from("session_class_votes")
        .select("device_id")
        .eq("session_id", sessionId)
        .eq("device_id", deviceId)
        .maybeSingle();
      if (selfErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "self_vote_lookup_failed",
            detail: selfErr.message,
          },
          { status: 500 }
        );
      }
      selfVoted = Boolean(selfVote);
    }

    const { count: memberCount, error: memberCountErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (memberCountErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "member_count_failed",
          detail: memberCountErr.message,
        },
        { status: 500 }
      );
    }

    const lifecycle = String(classRow.lifecycle ?? "").trim() || null;
    const promotedFrom = classRow.promoted_from_session_id
      ? String(classRow.promoted_from_session_id)
      : null;
    const promoted = lifecycle === "official" && promotedFrom === sessionId;

    const view = buildClassVoteStatusView({
      voteCount: Number(voteCount ?? 0),
      selfVoted,
      promoted,
      classId,
      className: String(classRow.name ?? "").trim() || null,
      lifecycle,
      membersLocked: Boolean(session.members_locked_at),
      memberCount: Number(memberCount ?? 0),
    });

    return NextResponse.json(
      {
        ok: true,
        sessionId,
        voteCount: view.voteCount,
        selfVoted: view.selfVoted,
        promoted: view.promoted,
        classId: view.classId,
        className: view.className,
        lifecycle: view.lifecycle,
        membersLocked: view.membersLocked,
        memberCount: Number(memberCount ?? 0),
        canShowVoteUi: view.canShowVoteUi,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[session/class-vote-status]", e);
    return NextResponse.json(
      { ok: false, error: "server_error", detail },
      { status: 500 }
    );
  }
}
