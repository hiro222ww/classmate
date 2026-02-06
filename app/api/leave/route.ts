import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { error: dErr } = await supabase
      .from("session_members")
      .delete()
      .eq("session_id", sessionId)
      .eq("display_name", name);

    if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 });

    const { count, error: cErr } = await supabase
      .from("session_members")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

    const remaining = count ?? 0;

    if (remaining === 0) {
      const { error: uErr } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", sessionId);
      if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, remaining, closed: remaining === 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "leave failed" }, { status: 500 });
  }
}
