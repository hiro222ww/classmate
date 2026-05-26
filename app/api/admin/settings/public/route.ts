import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JoinWindow = {
  enabled: boolean;
  start: string;
  end: string;
};

const DEFAULT_JOIN_WINDOW: JoinWindow = {
  enabled: false,
  start: "21:00",
  end: "21:30",
};

function minutesOfDay(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function getJstMinutesNow() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

function isInWindow(nowMin: number, startMin: number, endMin: number) {
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin <= endMin;
  }

  return nowMin >= startMin || nowMin <= endMin;
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "global_join_window")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const joinWindow: JoinWindow = {
    ...DEFAULT_JOIN_WINDOW,
    ...(data?.value ?? {}),
  };

  const startMin = minutesOfDay(joinWindow.start);
  const endMin = minutesOfDay(joinWindow.end);
  const nowMin = getJstMinutesNow();

  const open =
    !joinWindow.enabled ||
    startMin === null ||
    endMin === null ||
    isInWindow(nowMin, startMin, endMin);

  return NextResponse.json({
    ok: true,
    global_join_window: joinWindow,
    join_open: open,
  });
}