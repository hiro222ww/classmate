// app/api/class/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
  try {
    if (!SUPABASE_URL) return bad(500, "SUPABASE_URL is not set");
    if (!ANON_KEY) return bad(500, "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });

    // worlds
    const { data: worlds, error: wErr } = await supabase
      .from("worlds")
      .select("world_key,title,description,is_sensitive,min_age")
      .order("world_key", { ascending: true });

    if (wErr) return bad(500, `worlds: ${wErr.message}`);

    // topics（非表示はユーザーには出さない）
    const { data: topics, error: tErr } = await supabase
      .from("topics")
      .select("topic_key,title,description,is_sensitive,min_age,monthly_price")
      .eq("is_archived", false)
      .order("monthly_price", { ascending: true })
      .order("created_at", { ascending: true });

    if (tErr) return bad(500, `topics: ${tErr.message}`);

    // classes（ボード）
    const { data: classes, error: cErr } = await supabase
      .from("classes")
      .select("id,name,description,world_key,topic_key,min_age,is_sensitive,is_user_created,created_at")
      .order("created_at", { ascending: true });

    if (cErr) return bad(500, `classes: ${cErr.message}`);

    return NextResponse.json({
      ok: true,
      worlds: worlds ?? [],
      topics: topics ?? [],
      classes: classes ?? [],
    });
  } catch (e: any) {
    return bad(500, e?.message ?? "class list failed");
  }
}
