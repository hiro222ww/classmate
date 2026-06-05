import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Phase = "start" | "fallback" | "connected" | "failed";
type Route = "p2p" | "turn" | "unknown";

function safePhase(v: unknown): Phase {
  const s = String(v ?? "").trim();
  if (s === "start" || s === "fallback" || s === "connected" || s === "failed") {
    return s;
  }
  return "connected";
}

function safeRoute(v: unknown): Route {
  const s = String(v ?? "").trim();

  if (s === "turn" || s === "relay") {
    return "turn";
  }

  if (s === "p2p" || s === "host" || s === "srflx") {
    return "p2p";
  }

  return "unknown";
}

function safeOs(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();

  if (
    s === "windows" ||
    s === "mac" ||
    s === "ios" ||
    s === "android" ||
    s === "unknown"
  ) {
    return s;
  }

  return "unknown";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionId = String(body.sessionId ?? "").trim();
    const deviceId = String(body.deviceId ?? "").trim();
    const remoteDeviceId = String(body.remoteDeviceId ?? "").trim() || null;

    if (!sessionId || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "sessionId_and_deviceId_required" },
        { status: 400 }
      );
    }

    const phase = safePhase(body.phase);
    const route = safeRoute(body.route);
    const os = safeOs(body.os);

    const memberCountRaw = Number(body.memberCount);
    const memberCount = Number.isFinite(memberCountRaw)
      ? memberCountRaw
      : null;

    const localCandidateType =
      String(body.localCandidateType ?? "").trim() || null;

    const remoteCandidateType =
      String(body.remoteCandidateType ?? "").trim() || null;

    const voiceRoute = String(body.voiceRoute ?? "").trim() || null;

    const connectionState =
      String(body.connectionState ?? "").trim() ||
      (phase === "connected"
        ? "connected"
        : phase === "failed"
          ? "failed"
          : "connecting");

    const timeToConnectMsRaw = Number(body.timeToConnectMs);
    const timeToConnectMs = Number.isFinite(timeToConnectMsRaw)
      ? timeToConnectMsRaw
      : null;

    const usedTurn =
      route === "turn" ||
      localCandidateType === "relay" ||
      remoteCandidateType === "relay";

    const { error } = await supabaseAdmin.from("voice_connection_logs").insert({
      session_id: sessionId,
      device_id: deviceId,
      remote_device_id: remoteDeviceId,
      phase,
      route,
      used_turn: usedTurn,
      connection_state: connectionState,
      time_to_connect_ms: timeToConnectMs,
      local_candidate_type: localCandidateType,
      remote_candidate_type: remoteCandidateType,
      voice_route: voiceRoute,
      os,
      member_count: memberCount,
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