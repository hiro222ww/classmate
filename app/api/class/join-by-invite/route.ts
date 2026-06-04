import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatPostgresError, postgresErrorBody } from "@/lib/postgresError";
import { getBillableMembershipSnapshot } from "@/lib/classMembershipSlots";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getClassSlots(deviceId: string) {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("class_slots")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "entitlements_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    classSlots: Math.max(1, Number(data?.class_slots ?? 1)),
  };
}

async function ensureMembership(params: {
  deviceId: string;
  classId: string;
  classSlots: number;
}) {
  const { deviceId, classId, classSlots } = params;

  const billableRes = await getBillableMembershipSnapshot(supabase, deviceId);
  if (!billableRes.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: billableRes.error,
        },
        { status: 500 }
      ),
    };
  }

  const ids = billableRes.snapshot.billableClassIds;

  if (ids.includes(classId)) {
    return {
      ok: true as const,
      alreadyJoined: true,
      currentCount: ids.length,
    };
  }

  if (ids.length >= classSlots) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "class_slots_limit",
          currentCount: ids.length,
          totalMembershipCount: billableRes.snapshot.totalCount,
          legacyMembershipCount: billableRes.snapshot.legacyCount,
          classSlots,
        },
        { status: 400 }
      ),
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("class_memberships")
    .upsert(
      {
        device_id: deviceId,
        class_id: classId,
      },
      {
        onConflict: "device_id,class_id",
        ignoreDuplicates: true,
      }
    )
    .select("device_id,class_id");

  if (insErr) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "membership_upsert_failed",
          detail: insErr.message,
          code: (insErr as any)?.code ?? null,
          hint: (insErr as any)?.hint ?? null,
          details: (insErr as any)?.details ?? null,
        },
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    alreadyJoined: false,
    inserted: inserted ?? [],
    currentCount: ids.length + 1,
  };
}

function tailId(value: string) {
  const v = String(value ?? "").trim();
  if (!v) return "-";
  return v.length <= 6 ? v : v.slice(-6);
}

async function ensureClassPresence(params: {
  classId: string;
  sessionId: string;
  deviceId: string;
  sessionStatus: string;
}) {
  const now = new Date().toISOString();
  const status =
    params.sessionStatus === "active" ? "active" : "waiting";

  const { error } = await supabase.from("class_presence").upsert(
    {
      class_id: params.classId,
      device_id: params.deviceId,
      session_id: params.sessionId,
      screen: "room",
      status,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "class_id,device_id" }
  );

  if (error) {
    console.warn(
      `[invite-presence] upsert failed class=${tailId(params.classId)} ` +
        `session=${tailId(params.sessionId)} device=${tailId(params.deviceId)} ` +
        `error=${error.message}`
    );
    return { ok: false as const, error };
  }

  console.log(
    `[invite-presence] upsert screen=room class=${tailId(params.classId)} ` +
      `session=${tailId(params.sessionId)} device=${tailId(params.deviceId)} ok=true`
  );

  return { ok: true as const };
}

async function ensureSessionMember(params: {
  sessionId: string;
  deviceId: string;
}) {
  const { sessionId, deviceId } = params;

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "profile_lookup_failed",
          detail: profileError.message,
        },
        { status: 500 }
      ),
    };
  }

  const displayName = String(profile?.display_name ?? "").trim() || "参加者";

  const { error } = await supabase.from("session_members").upsert(
    {
      session_id: sessionId,
      device_id: deviceId,
      display_name: displayName,
      joined_at: new Date().toISOString(),
      is_in_call: false,
    },
    {
      onConflict: "session_id,device_id",
    }
  );

  if (error) {
    console.error("[join-by-invite] session_member_upsert_failed", {
      sessionId,
      deviceId,
      displayName,
      ...formatPostgresError(error),
    });

    return {
      ok: false as const,
      response: NextResponse.json(
        postgresErrorBody("session_member_upsert_failed", error, {
          sessionId,
          deviceId,
        }),
        { status: 500 }
      ),
    };
  }

  return {
    ok: true as const,
    displayName,
    photoPath: null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const classId = String(body?.classId ?? "").trim();
    const sessionId = String(body?.sessionId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    console.log("[join-by-invite] body =", body);
    console.log("[join-by-invite] classId =", classId);
    console.log("[join-by-invite] sessionId =", sessionId);
    console.log("[join-by-invite] deviceId =", deviceId);

    if (!classId || !sessionId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params",
          required: ["classId", "sessionId", "deviceId"],
        },
        { status: 400 }
      );
    }

    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("id,name")
      .eq("id", classId)
      .maybeSingle();

    if (classError) {
      console.error("[join-by-invite] class lookup failed", classError);

      return NextResponse.json(
        {
          ok: false,
          error: "class_lookup_failed",
          detail: classError.message,
        },
        { status: 500 }
      );
    }

    if (!klass) {
      return NextResponse.json(
        {
          ok: false,
          error: "class_not_found",
          classId,
        },
        { status: 404 }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id,class_id,status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_lookup_failed",
          detail: sessionError.message,
        },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_not_found",
          sessionId,
        },
        { status: 404 }
      );
    }

    if (String(session.class_id) !== classId) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_class_mismatch",
          classId,
          sessionClassId: session.class_id,
        },
        { status: 400 }
      );
    }

    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;

    const membershipRes = await ensureMembership({
      deviceId,
      classId,
      classSlots: slotsRes.classSlots,
    });

    if (!membershipRes.ok) {
      console.warn(
        `[invite-join] failed step=membership error=membership_upsert`
      );
      return membershipRes.response;
    }

    console.log(
      `[invite-join] membership-upsert ok=true alreadyJoined=${membershipRes.alreadyJoined}`
    );

    const sessionMemberRes = await ensureSessionMember({
      sessionId,
      deviceId,
    });

    if (!sessionMemberRes.ok) {
      console.warn(
        `[invite-join] failed step=session_member error=session_member_upsert`
      );
      return sessionMemberRes.response;
    }

    console.log("[invite-join] session-member-upsert ok=true");

    await ensureClassPresence({
      classId,
      sessionId,
      deviceId,
      sessionStatus: String(session.status ?? "forming"),
    });

    console.log(
      `[invite-join] success class=${tailId(classId)} session=${tailId(sessionId)} ` +
        `device=${tailId(deviceId)}`
    );

    return NextResponse.json({
      ok: true,
      classId,
      sessionId,
      className: String(klass.name ?? "").trim() || "クラス",
      alreadyJoined: membershipRes.alreadyJoined,
      currentCount: membershipRes.currentCount,
      classSlots: slotsRes.classSlots,
      displayName: sessionMemberRes.displayName,
      photoPath: sessionMemberRes.photoPath,
    });
  } catch (e: any) {
    console.error(
      `[invite-join] failed step=server error=${e?.message ?? String(e)}`
    );

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}