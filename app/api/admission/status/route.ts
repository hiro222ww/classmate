import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function inWindow(now: string, open: string, close: string) {
  // 通常
  if (open < close) {
    return now >= open && now < close;
  }

  // 日跨ぎ
  return now >= open || now < close;
}

export async function GET() {
  try {
    const now = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Tokyo",
      })
    );

    const day = now.getDay();

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    const current = `${hh}:${mm}:${ss}`;

    const { data, error } = await supabase
      .from("admission_windows")
      .select("*")
      .eq("enabled", true)
      .eq("day_of_week", day);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "admission_lookup_failed",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    const windows = data ?? [];

// 有効な受付時間が1つもない場合は、制限OFFとして常時入校OK
if (windows.length === 0) {
  return NextResponse.json({
    ok: true,
    open: true,
    admissionWindowEnabled: false,
    current,
    window: null,
    text: "入校受付中！",
  });
}

const matched = windows.find((w: any) =>
  inWindow(current, w.open_time, w.close_time)
);

return NextResponse.json({
  ok: true,
  open: Boolean(matched),
  admissionWindowEnabled: true,
  current,
  window: matched ?? null,
  text: matched
    ? "入校受付中！"
    : "ただいま入校受付時間外です",
});
  } catch (e: any) {
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