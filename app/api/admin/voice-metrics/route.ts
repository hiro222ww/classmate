import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type VoiceRoute = "host" | "srflx" | "relay" | "turn" | "p2p" | "unknown";

type VoiceConnectionLogRow = {
  route: VoiceRoute | string | null;
  used_turn: boolean | null;
  connection_state: string | null;
  time_to_connect_ms: number | null;
  os: string | null;
  member_count: number | null;
  created_at: string | null;
};

export async function GET() {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseAdmin
    .from("voice_connection_logs")
    .select(
      "route, used_turn, connection_state, time_to_connect_ms, os, member_count, created_at"
    )
    .gte("created_at", since.toISOString());

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as VoiceConnectionLogRow[];

  const total = rows.length;

  const turn = rows.filter((r) => {
    const route = String(r.route ?? "").trim();
    return r.used_turn === true || route === "relay" || route === "turn";
  }).length;

  const p2p = rows.filter((r) => {
    const route = String(r.route ?? "").trim();
    return route === "host" || route === "srflx" || route === "p2p";
  }).length;

  const failed = rows.filter((r) => {
    const state = String(r.connection_state ?? "").trim();
    return state === "failed" || state === "disconnected";
  }).length;

  const unknown = Math.max(0, total - turn - p2p);

  const connectedRows = rows.filter((r) => {
    const state = String(r.connection_state ?? "").trim();
    const ms = Number(r.time_to_connect_ms ?? 0);

    return state === "connected" && Number.isFinite(ms) && ms > 0;
  });

  const avgConnectMs =
    connectedRows.length > 0
      ? Math.round(
          connectedRows.reduce((sum, r) => {
            return sum + Number(r.time_to_connect_ms ?? 0);
          }, 0) / connectedRows.length
        )
      : 0;

  return NextResponse.json({
    ok: true,
    metrics: {
      total,
      turn,
      p2p,
      unknown,
      failed,
      turnRate: total > 0 ? Math.round((turn / total) * 1000) / 10 : 0,
      failRate: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0,
      avgConnectMs,
    },
  });
}