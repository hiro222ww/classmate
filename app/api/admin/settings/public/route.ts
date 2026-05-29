import { NextResponse } from "next/server";
import {
  evaluateGlobalJoinWindow,
  loadGlobalJoinWindowFromAppSettings,
} from "@/lib/admissionWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const joinWindow = await loadGlobalJoinWindowFromAppSettings();
    const status = evaluateGlobalJoinWindow(joinWindow);

    return NextResponse.json({
      ok: true,
      global_join_window: joinWindow,
      join_open: status.open,
      open: status.open,
      admissionWindowEnabled: status.admissionWindowEnabled,
      current: status.current,
      window: status.window,
      text: status.text,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
