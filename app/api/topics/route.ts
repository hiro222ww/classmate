// app/api/admin/topics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function deny(msg = "forbidden") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const password = String(body.password ?? "");
    if (!process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "ADMIN_PASSWORD not set" }, { status: 500 });
    }
    if (password !== process.env.ADMIN_PASSWORD) return deny();

    const mode = String(body.mode ?? "list");

    if (mode === "list") {
      const { data, error } = await supabase
        .from("topics")
        .select("topic_key,title,description,is_sensitive,min_age,monthly_price")
        .order("min_age", { ascending: true })
        .order("monthly_price", { ascending: true })
        .order("title", { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // monthly_price null対策
      const topics = (data ?? []).map((t: any) => ({
        ...t,
        monthly_price: typeof t.monthly_price === "number" ? t.monthly_price : 0,
      }));

      return NextResponse.json({ topics });
    }

    if (mode === "update") {
      const topic_key = String(body.topic_key ?? "");
      const patch = body.patch ?? {};
      if (!topic_key) return NextResponse.json({ error: "missing_topic_key" }, { status: 400 });

      // 安全のため、許可する列だけ通す
      const allowed: any = {};
      if (typeof patch.title === "string") allowed.title = patch.title;
      if (typeof patch.description === "string") allowed.description = patch.description;
      if (typeof patch.is_sensitive === "boolean") allowed.is_sensitive = patch.is_sensitive;
      if (Number.isFinite(patch.min_age)) allowed.min_age = Number(patch.min_age);

      if (Number.isFinite(patch.monthly_price)) {
        const mp = Number(patch.monthly_price);
        const ok = mp === 0 || mp === 400 || mp === 800 || mp === 1200;
        if (!ok) return NextResponse.json({ error: "invalid_monthly_price" }, { status: 400 });
        allowed.monthly_price = mp;
      }

      const { error } = await supabase
        .from("topics")
        .update(allowed)
        .eq("topic_key", topic_key);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown_mode" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
