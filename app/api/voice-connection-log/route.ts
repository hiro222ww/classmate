import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionId = String(body.sessionId ?? "").trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const remoteDeviceId = String(body.remoteDeviceId ?? "").trim() || null;

    const route = String(body.route ?? "unknown").trim();
    const localCandidateType =
      String(body.localCandidateType ?? "").trim() || null;
    const remoteCandidateType =
      String(body.remoteCandidateType ?? "").trim() || null;
    const voiceRoute = String(body.voiceRoute ?? "").trim() || null;

    if (!sessionId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "sessionId_and_deviceId_required" },
        { status: 400 }
      );
    }

    const safeRoute =
      route === "p2p" || route === "turn" || route === "unknown"
        ? route
        : "unknown";

    const { error } = await supabaseAdmin.from("voice_connection_logs").insert({
      session_id: sessionId,
      device_id: deviceId,
      remote_device_id: remoteDeviceId,
      route: safeRoute,
      local_candidate_type: localCandidateType,
      remote_candidate_type: remoteCandidateType,
      voice_route: voiceRoute,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown_error" },
      { status: 500 }
    );
  }
}