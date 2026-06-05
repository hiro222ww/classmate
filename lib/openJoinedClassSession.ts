import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateOpenJoinedSessionReuse,
  type OpenJoinedSessionInvalidReason,
} from "@/lib/recruitment";
import { tailMatchId } from "@/lib/matchJoinLogging";
import {
  listClassSessionsWithMembers,
  logClassSessionsDebug,
  pickCanonicalOpenJoinedSession,
} from "@/lib/classSessionSelection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ResolveParams = {
  classId: string;
  className: string;
  sessionId: string;
  sessionStatus: string;
  sessionCreatedAt: string | null;
  matchDeadlineAt: string | null;
  deviceId: string;
  requestedCapacity: number;
  recruitmentSessionTtlMinutes: number | null;
};

type ResolveOk = {
  ok: true;
  sessionId: string;
  sessionStatus: string;
  sessionCreatedAt: string | null;
  createdNewSession: boolean;
  reused: boolean;
  selectionReason: string;
};

type ResolveErr = {
  ok: false;
  response: NextResponse;
};

async function createFormingSession(params: {
  classId: string;
  className: string;
  requestedCapacity: number;
  reason: OpenJoinedSessionInvalidReason | "no_valid_active_session";
}) {
  console.log(
    `[class-session] create-new reason=${params.reason} class=${tailMatchId(params.classId)}`
  );

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      class_id: params.classId,
      topic: params.className,
      status: "forming",
      capacity: params.requestedCapacity,
    })
    .select("id,status,created_at")
    .single();

  if (error || !data?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "forced_session_create_failed",
          detail: error?.message ?? "create_failed",
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    sessionId: String(data.id),
    sessionStatus: String(data.status ?? "forming"),
    sessionCreatedAt: data.created_at ?? null,
  };
}

export async function resolveOpenJoinedClassSession(
  params: ResolveParams
): Promise<ResolveOk | ResolveErr> {
  const deviceId = String(params.deviceId ?? "").trim();

  await expireStaleRecruitmentSessions(supabase, {
    classIds: [params.classId],
    ttlMinutes: params.recruitmentSessionTtlMinutes,
  });

  const classSessions = await listClassSessionsWithMembers(
    supabase,
    params.classId,
    deviceId
  );

  const canonical = pickCanonicalOpenJoinedSession({
    sessions: classSessions,
    deviceId,
    matchDeadlineAt: params.matchDeadlineAt,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    preferredSessionId: params.sessionId,
  });

  if (canonical) {
    logClassSessionsDebug(params.classId, classSessions, {
      selectedSessionId: canonical.sessionId,
      reason: canonical.reason,
    });
    console.log(
      `[class-session] selected session=${tailMatchId(canonical.sessionId)} ` +
        `reason=${canonical.reason} members=${canonical.memberCount} ` +
        `class=${tailMatchId(params.classId)}`
    );

    return {
      ok: true,
      sessionId: canonical.sessionId,
      sessionStatus: canonical.sessionStatus,
      sessionCreatedAt: canonical.sessionCreatedAt,
      createdNewSession: false,
      reused: true,
      selectionReason: canonical.reason,
    };
  }

  logClassSessionsDebug(params.classId, classSessions);

  const rpcSession = classSessions.find((row) => row.id === params.sessionId);
  if (rpcSession) {
    const evaluation = evaluateOpenJoinedSessionReuse({
      sessionStatus: params.sessionStatus,
      sessionCreatedAt: params.sessionCreatedAt,
      matchDeadlineAt: params.matchDeadlineAt,
      memberCount: rpcSession.memberCount,
      deviceIsSessionMember: rpcSession.deviceIsMember,
      recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
    });

    if (evaluation.reusable) {
      console.log(
        `[class-session] selected session=${tailMatchId(params.sessionId)} ` +
          `reason=reuse_rpc_session class=${tailMatchId(params.classId)}`
      );
      return {
        ok: true,
        sessionId: params.sessionId,
        sessionStatus: params.sessionStatus,
        sessionCreatedAt: params.sessionCreatedAt,
        createdNewSession: false,
        reused: true,
        selectionReason: "reuse_rpc_session",
      };
    }

    console.log(
      `[match-join] existing-session invalid reason=${evaluation.reason ?? "unknown"} ` +
        `session=${tailMatchId(params.sessionId)} class=${tailMatchId(params.classId)} ` +
        `status=${params.sessionStatus} members=${rpcSession.memberCount}`
    );
  }

  const created = await createFormingSession({
    classId: params.classId,
    className: params.className,
    requestedCapacity: params.requestedCapacity,
    reason: "no_valid_active_session",
  });

  if (!created.ok) return created;

  return {
    ok: true,
    sessionId: created.sessionId,
    sessionStatus: created.sessionStatus,
    sessionCreatedAt: created.sessionCreatedAt,
    createdNewSession: true,
    reused: false,
    selectionReason: "create_new_no_valid_active_session",
  };
}
