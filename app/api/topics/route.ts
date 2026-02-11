// app/api/topics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function ok(topics: any[]) {
  return NextResponse.json({ ok: true, topics }, { status: 200 });
}
function ng(error: string) {
  // “真っ白”防止：失敗でもJSONで topics:[] を返す
  return NextResponse.json({ ok: false, error, topics: [] }, { status: 200 });
}

export async function GET() {
  try {
    if (!SUPABASE_URL) return ng("SUPABASE_URL is not set");
    if (!ANON_KEY) return ng("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("topics")
      .select("topic_key,title,description,is_sensitive,min_age,monthly_price,is_archived,created_at")
      .eq("is_archived", false)
      .order("monthly_price", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return ng(error.message);
    return ok(data ?? []);
  } catch (e: any) {
    return ng(e?.message ?? "topics api failed");
  }
}
