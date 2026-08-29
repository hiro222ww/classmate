import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveApiActor } from "@/lib/actorIdentity";
import {
  normalizeClassVoteDeviceId,
  normalizeOptionalClassId,
  normalizeSessionId,
  parsePromoteRpcResult,
} from "@/lib/sessionClassVote";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VoteBody = {
  sessionId?: unknown;
  session_id?: unknown;
  deviceId?: unknown;
  device_id?: unknown;
  classId?: unknown;
  class_id?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as VoteBody;
    const sessionId = normalizeSessionId(body.sessionId ?? body.session_id);
    const deviceId = normalizeClassVoteDeviceId(
      body.deviceId ?? body.device_id
    );
    const requestedClassId = normalizeOptionalClassId(
      body.classId ?? body.class_id
    );

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "invalid_sessionId" },
        { status: 400 }
      );
    }
    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId required" },
        { status: 400 }
      );
    }

    const actorResult = await resolveApiActor({ req, deviceId });
    const userId = actorResult.ok ? actorResult.actor.userId || null : null;

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("sessions")
      .select("id, class_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_lookup_failed",
          detail: sessionErr.message,
        },
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

    if (requestedClassId && requestedClassId !== classId) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_class_mismatch",
          sessionClassId: classId,
          requestedClassId,
        },
        { status: 409 }
      );
    }

    const { data: sessionMember, error: memberErr } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", sessionId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_member_check_failed",
          detail: memberErr.message,
        },
        { status: 500 }
      );
    }
    if (!sessionMember) {
      return NextResponse.json(
        { ok: false, error: "not_session_member" },
        { status: 403 }
      );
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("session_class_votes")
      .upsert(
        {
          session_id: sessionId,
          device_id: deviceId,
          user_id: userId,
          voted_at: new Date().toISOString(),
        },
        { onConflict: "session_id,device_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { ok: false, error: "vote_upsert_failed", detail: upsertErr.message },
        { status: 500 }
      );
    }

    void supabaseAdmin
      .from("product_funnel_events")
      .insert({
        event_name: "class_vote_yes",
        device_id: deviceId,
        user_id: userId,
        session_id: sessionId,
        class_id: classId,
        meta: {},
      })
      .then(({ error }) => {
        if (error) {
          console.warn(
            "[session/class-vote] funnel class_vote_yes failed",
            error.message
          );
        }
      });

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

    const { data: rpcRaw, error: rpcErr } = await supabaseAdmin.rpc(
      "promote_provisional_class_from_session",
      {
        p_session_id: sessionId,
        p_device_id: deviceId,
      }
    );

    if (rpcErr) {
      console.error("[session/class-vote] promote rpc failed", rpcErr);
      return NextResponse.json(
        {
          ok: true,
          voteCount: Number(voteCount ?? 0),
          promoted: false,
          classId,
          className: null,
          promoteError: rpcErr.message,
        },
        { status: 200 }
      );
    }

    const promote = parsePromoteRpcResult(rpcRaw);
    const promoted =
      promote.ok === true &&
      (promote.promoted === true ||
        promote.reason === "promoted" ||
        promote.reason === "already_promoted");

    let className = promote.class_name ?? null;
    let lifecycle: string | null = null;
    {
      const { data: classRow } = await supabaseAdmin
        .from("classes")
        .select("name, lifecycle")
        .eq("id", promote.class_id ?? classId)
        .maybeSingle();
      className = className || String(classRow?.name ?? "").trim() || null;
      lifecycle = String(classRow?.lifecycle ?? "").trim() || null;
    }

    if (promoted && promote.reason === "promoted") {
      void supabaseAdmin
        .from("product_funnel_events")
        .insert({
          event_name: "class_promoted",
          device_id: deviceId,
          user_id: userId,
          session_id: sessionId,
          class_id: promote.class_id ?? classId,
          meta: {
            vote_count: promote.vote_count ?? Number(voteCount ?? 0),
            class_name: className,
          },
        })
        .then(({ error }) => {
          if (error) {
            console.warn(
              "[session/class-vote] funnel class_promoted failed",
              error.message
            );
          }
        });
    }

    return NextResponse.json({
      ok: true,
      voteCount: promote.vote_count ?? Number(voteCount ?? 0),
      promoted,
      classId: promote.class_id ?? classId,
      className,
      reason: promote.reason ?? null,
      lifecycle,
    });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[session/class-vote] POST", e);
    return NextResponse.json(
      { ok: false, error: "server_error", detail },
      { status: 500 }
    );
  }
}
