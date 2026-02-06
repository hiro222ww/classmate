// app/api/class/transfer/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const deviceId = String(body.deviceId ?? "");
    const newClassId = String(body.newClassId ?? "");

    if (!deviceId || !newClassId) {
      return NextResponse.json({ error: "missing_fields", deviceId, newClassId }, { status: 400 });
    }

    // ✅ まず本当に class が存在するか
    const { data: cls, error: clsErr } = await supabase
      .from("classes")
      .select("id,name,topic_key,world_key")
      .eq("id", newClassId)
      .maybeSingle();

    if (clsErr) {
      return NextResponse.json({ error: "db_error", where: "classes_lookup", detail: clsErr.message }, { status: 500 });
    }
    if (!cls) {
      return NextResponse.json({ error: "class_not_found", newClassId }, { status: 404 });
    }

    // ✅ transfer 実行（あなたのRPCに合わせる）
    const { data, error } = await supabase.rpc("transfer_class", {
      p_device_id: deviceId,
      p_new_class_id: newClassId,
    });

    if (error) {
      // よくある例: class_slots_limit / topic_not_owned など
      return NextResponse.json({ error: error.message, hint: error.hint ?? null }, { status: 400 });
    }

    return NextResponse.json({ ok: true, class: cls, result: data ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: "server_error", message: e?.message ?? String(e) }, { status: 500 });
  }
}
