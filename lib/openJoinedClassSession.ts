import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expireStaleRecruitmentSessions } from "@/lib/expireRecruitmentSessions";
import {
  evaluateOpenJoinedSessionReuse,
  type OpenJoinedSessionInvalidReason,
} from "@/lib/recruitment";
import { tailMatchId } from "@/lib/matchJoinLogging";

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
};

type ResolveErr = {
  ok: false;
  response: NextResponse;
};

async function countSessionMembers(sessionId: string, deviceId: string) {
  const { data, error } = await supabase
    .from("session_members")
    .select("device_id")
    .eq("session_id", sessionId);

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "session_member_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  const ids = (data ?? [])
    .map((row) => String(row.device_id ?? "").trim())
    .filter(Boolean);

  return {
    ok: true as const,
    memberCount: ids.length,
    deviceIsSessionMember: ids.includes(deviceId),
  };
}

async function createFormingSession(params: {
  classId: string;
  className: string;
  requestedCapacity: number;
  reason: OpenJoinedSessionInvalidReason;
}) {
  console.log(
    `[match-join] create-new-session reason=existing_session_${params.reason} ` +
      `class=${tailMatchId(params.classId)}`
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

  const membersRes = await countSessionMembers(params.sessionId, deviceId);
  if (!membersRes.ok) return membersRes;

  const evaluation = evaluateOpenJoinedSessionReuse({
    sessionStatus: params.sessionStatus,
    sessionCreatedAt: params.sessionCreatedAt,
    matchDeadlineAt: params.matchDeadlineAt,
    memberCount: membersRes.memberCount,
    deviceIsSessionMember: membersRes.deviceIsSessionMember,
    recruitmentSessionTtlMinutes: params.recruitmentSessionTtlMinutes,
  });

  if (evaluation.reusable) {
    return {
      ok: true,
      sessionId: params.sessionId,
      sessionStatus: params.sessionStatus,
      sessionCreatedAt: params.sessionCreatedAt,
      createdNewSession: false,
      reused: true,
    };
  }

  const reason = evaluation.reason ?? "unknown";
  console.log(
    `[match-join] existing-session invalid reason=${reason} ` +
      `session=${tailMatchId(params.sessionId)} class=${tailMatchId(params.classId)} ` +
      `status=${params.sessionStatus} members=${membersRes.memberCount}`
  );

  const created = await createFormingSession({
    classId: params.classId,
    className: params.className,
    requestedCapacity: params.requestedCapacity,
    reason,
  });

  if (!created.ok) return created;

  return {
    ok: true,
    sessionId: created.sessionId,
    sessionStatus: created.sessionStatus,
    sessionCreatedAt: created.sessionCreatedAt,
    createdNewSession: true,
    reused: false,
  };
}
