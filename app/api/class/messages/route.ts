import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertClassMembership } from "@/lib/meetingPlan";
import { resolveDisplayName } from "@/lib/resolveDisplayName";
import { MESSAGE_HISTORY_LIMIT } from "@/lib/messageLimits";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const classId = String(body.classId ?? "").trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const limitRaw = Number(body.limit ?? MESSAGE_HISTORY_LIMIT);
    const limit = Math.min(
      Math.max(1, Number.isFinite(limitRaw) ? limitRaw : MESSAGE_HISTORY_LIMIT),
      MESSAGE_HISTORY_LIMIT
    );

    if (!classId) {
      return NextResponse.json({ error: "classId required" }, { status: 400 });
    }

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    const membership = await assertClassMembership(deviceId, classId);
    if (!membership.ok) {
      return NextResponse.json(
        { error: membership.error },
        { status: membership.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("class_messages")
      .select("id, class_id, device_id, message, msg_type, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = [...(data ?? [])].reverse();
    const deviceIds = Array.from(
      new Set(rows.map((r) => String(r.device_id ?? "").trim()).filter(Boolean))
    );

    const nameByDevice = new Map<string, string>();
    if (deviceIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("device_id, display_name")
        .in("device_id", deviceIds);

      for (const profile of profiles ?? []) {
        const id = String(
          (profile as { device_id?: string }).device_id ?? ""
        ).trim();
        if (!id) continue;
        const resolved = resolveDisplayName({
          profileDisplayName: (profile as { display_name?: string | null })
            .display_name,
        });
        nameByDevice.set(id, resolved.displayName);
      }
    }

    const messages = rows.map((row) => {
      const id = String(row.device_id ?? "").trim();
      return {
        ...row,
        display_name: nameByDevice.get(id) || "参加者",
      };
    });

    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    console.error("[class/messages] failed", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
