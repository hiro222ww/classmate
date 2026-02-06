import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const WAIT_MS = 3 * 60 * 1000; // 3分

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = String(searchParams.get("sessionId") ?? "").trim();
    if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("id, topic, status, capacity, created_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
    if (!session) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });

    const { data: members, error: mErr } = await supabase
      .from("session_members")
      .select("display_name, joined_at")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true });

    if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });

    const memberCount = (members ?? []).length;
    const now = Date.now();
    const createdAt = new Date(session.created_at).getTime();

    // ✅ forming → active / closed（開始判定だけ）
    if (session.status === "forming") {
      const waited = now - createdAt;

      const shouldStart =
        memberCount >= session.capacity || (waited >= WAIT_MS && memberCount >= 2);

      const shouldClose = waited >= WAIT_MS && memberCount < 2;

      if (shouldStart) {
        const { error: uErr } = await supabase
          .from("sessions")
          .update({ status: "active" })
          .eq("id", sessionId)
          .eq("status", "forming");
        if (!uErr) session.status = "active";
      } else if (shouldClose) {
        const { error: cErr } = await supabase
          .from("sessions")
          .update({ status: "closed" })
          .eq("id", sessionId)
          .eq("status", "forming");
        if (!cErr) session.status = "closed";
      }
    }

    // ✅ activeは自動で閉じない（8分終了なし）
    return NextResponse.json({
      ok: true,
      session,
      members: members ?? [],
      memberCount,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "status failed" }, { status: 500 });
  }
}
