import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function handle() {
  try {
    const [worldsRes, topicsRes, classesRes] = await Promise.all([
      supabase
        .from("worlds")
        .select("world_key,title,description,is_sensitive,min_age")
        .order("min_age", { ascending: true })
        .order("title", { ascending: true }),

      supabase
        .from("topics")
        .select("topic_key,title,description,is_sensitive,min_age,monthly_price")
        .order("min_age", { ascending: true })
        .order("monthly_price", { ascending: true })
        .order("title", { ascending: true }),

      supabase
        .from("classes")
        .select("id,name,description,world_key,topic_key,min_age,is_sensitive,is_user_created,created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (worldsRes.error || topicsRes.error || classesRes.error) {
      return NextResponse.json(
        {
          error: "db_error",
          detail: {
            worlds: worldsRes.error?.message ?? null,
            topics: topicsRes.error?.message ?? null,
            classes: classesRes.error?.message ?? null,
          },
        },
        { status: 500 }
      );
    }

    const topics = (topicsRes.data ?? []).map((t: any) => ({
      ...t,
      monthly_price: typeof t.monthly_price === "number" ? t.monthly_price : 0,
    }));

    return NextResponse.json({
      worlds: worldsRes.data ?? [],
      topics,
      classes: classesRes.data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return handle();
}
export async function POST() {
  return handle();
}
