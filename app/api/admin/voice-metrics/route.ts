import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VoiceRoute = "host" | "srflx" | "relay" | "turn" | "p2p" | "unknown";

type VoiceConnectionLogRow = {
  route: VoiceRoute | string | null;
  used_turn: boolean | null;
  connection_state: string | null;
  time_to_connect_ms: number | null;
  os: string | null;
  member_count: number | null;
  phase: string | null;
  created_at: string | null;
};

function isTurnRow(r: VoiceConnectionLogRow) {
  const route = String(r.route ?? "").trim();
  return r.used_turn === true || route === "relay" || route === "turn";
}

function isP2pRow(r: VoiceConnectionLogRow) {
  const route = String(r.route ?? "").trim();
  return route === "host" || route === "srflx" || route === "p2p";
}

function isFailedRow(r: VoiceConnectionLogRow) {
  const state = String(r.connection_state ?? "").trim();
  const phase = String(r.phase ?? "").trim();

  return (
    state === "failed" ||
    state === "disconnected" ||
    phase === "failed" ||
    phase === "disconnected"
  );
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseAdmin
    .from("voice_connection_logs")
    .select(
      "route, used_turn, connection_state, time_to_connect_ms, os, member_count, phase, created_at"
    )
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as VoiceConnectionLogRow[];

  const total = rows.length;
  const turn = rows.filter(isTurnRow).length;
  const p2p = rows.filter(isP2pRow).length;
  const failed = rows.filter(isFailedRow).length;
  const unknown = Math.max(0, total - turn - p2p);

  const connectedRows = rows.filter((r) => {
    const state = String(r.connection_state ?? "").trim();
    const phase = String(r.phase ?? "").trim();
    const ms = Number(r.time_to_connect_ms ?? 0);

    return (
      (state === "connected" || phase === "connected") &&
      Number.isFinite(ms) &&
      ms > 0
    );
  });

  const avgConnectMs =
    connectedRows.length > 0
      ? Math.round(
          connectedRows.reduce(
            (sum, r) => sum + Number(r.time_to_connect_ms ?? 0),
            0
          ) / connectedRows.length
        )
      : 0;

  const hourlyMap = new Map<
    string,
    {
      hour: string;
      total: number;
      turn: number;
      p2p: number;
      failed: number;
      unknown: number;
      avgConnectMs: number;
      _connectSum: number;
      _connectCount: number;
    }
  >();

  for (const row of rows) {
    if (!row.created_at) continue;

    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;

    const hour = `${String(d.getHours()).padStart(2, "0")}:00`;

    const current =
      hourlyMap.get(hour) ??
      {
        hour,
        total: 0,
        turn: 0,
        p2p: 0,
        failed: 0,
        unknown: 0,
        avgConnectMs: 0,
        _connectSum: 0,
        _connectCount: 0,
      };

    current.total += 1;

    if (isTurnRow(row)) current.turn += 1;
    else if (isP2pRow(row)) current.p2p += 1;
    else current.unknown += 1;

    if (isFailedRow(row)) current.failed += 1;

    const state = String(row.connection_state ?? "").trim();
    const phase = String(row.phase ?? "").trim();
    const ms = Number(row.time_to_connect_ms ?? 0);

    if (
      (state === "connected" || phase === "connected") &&
      Number.isFinite(ms) &&
      ms > 0
    ) {
      current._connectSum += ms;
      current._connectCount += 1;
    }

    hourlyMap.set(hour, current);
  }

  const hourly = Array.from(hourlyMap.values()).map((h) => ({
    hour: h.hour,
    total: h.total,
    turn: h.turn,
    p2p: h.p2p,
    failed: h.failed,
    unknown: h.unknown,
    turnRate: h.total > 0 ? Math.round((h.turn / h.total) * 1000) / 10 : 0,
    failRate: h.total > 0 ? Math.round((h.failed / h.total) * 1000) / 10 : 0,
    avgConnectMs:
      h._connectCount > 0 ? Math.round(h._connectSum / h._connectCount) : 0,
  }));

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
      hourly,
    },
  });
}