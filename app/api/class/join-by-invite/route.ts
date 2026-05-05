import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { data: memberships, error } = await supabase
    .from("class_memberships")
    .select("class_id")
    .eq("device_id", deviceId);

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "memberships_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      ),
    };
  }

  const ids = (memberships ?? [])
    .map((x: any) => String(x.class_id ?? "").trim())
    .filter(Boolean);

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const classId = String(body?.classId ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();

    console.log("[join-by-invite] body =", body);
    console.log("[join-by-invite] classId =", classId);
    console.log("[join-by-invite] deviceId =", deviceId);

    if (!classId || !deviceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params",
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

    const slotsRes = await getClassSlots(deviceId);
    if (!slotsRes.ok) return slotsRes.response;

    const membershipRes = await ensureMembership({
      deviceId,
      classId,
      classSlots: slotsRes.classSlots,
    });

    if (!membershipRes.ok) return membershipRes.response;

    return NextResponse.json({
      ok: true,
      classId,
      className: String(klass.name ?? "").trim() || "クラス",
      alreadyJoined: membershipRes.alreadyJoined,
      currentCount: membershipRes.currentCount,
      classSlots: slotsRes.classSlots,
    });
  } catch (e: any) {
    console.error("[join-by-invite] server error =", e);

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