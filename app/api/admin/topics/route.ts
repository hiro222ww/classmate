// app/api/admin/topics/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function assertAdmin(req: Request) {
  const pass = req.headers.get("x-admin-passcode") || "";
  const expected = process.env.ADMIN_PASSCODE || "";
  return Boolean(expected) && pass === expected;
}

const ALLOWED_PRICES = new Set([0, 400, 800, 1200]);

export async function GET(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error, count } = await supabaseAdmin
    .from("topics")
    .select("topic_key, title, description, is_sensitive, min_age, monthly_price", { count: "exact" })
    .order("topic_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ topics: data ?? [], count: count ?? null });
}

export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  const topic_key = String(body?.topic_key ?? "").trim();
  const title = String(body?.title ?? "").trim();
  if (!topic_key) return NextResponse.json({ error: "topic_key is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const monthly_price = Number(body?.monthly_price ?? 0);
  if (!ALLOWED_PRICES.has(monthly_price)) {
    return NextResponse.json({ error: "monthly_price must be 0/400/800/1200" }, { status: 400 });
  }

  const is_sensitive = Boolean(body?.is_sensitive);
  const min_age = Number(body?.min_age ?? (is_sensitive ? 18 : 0));

  const topicRow = {
    topic_key,
    title,
    description: String(body?.description ?? ""),
    is_sensitive,
    min_age,
    monthly_price,
  };

  const insTopic = await supabaseAdmin
    .from("topics")
    .insert(topicRow)
    .select("topic_key, title, description, monthly_price, is_sensitive, min_age")
    .single();

  if (insTopic.error) {
    return NextResponse.json({ error: insTopic.error.message }, { status: 500 });
  }

  const createDefault = Boolean(body?.create_default_class);
  let classCreated = false;
  let classWarning: string | null = null;

  if (createDefault) {
    const default_class_name = String(body?.default_class_name ?? `【新】${title}`).trim();
    const default_class_description = String(body?.default_class_description ?? `テーマ「${title}」のボード`).trim();
    const default_world_key =
      body?.default_world_key === undefined ? null : (body.default_world_key as string | null);

    const classRow: any = {
      name: default_class_name,
      description: default_class_description,
      world_key: default_world_key,
      topic_key,
      min_age,
      is_sensitive,
      is_user_created: true,
    };

    const insClass = await supabaseAdmin.from("classes").insert(classRow).select("id").single();
    if (insClass.error) classWarning = insClass.error.message;
    else classCreated = true;
  }

  return NextResponse.json({
    ok: true,
    inserted_topic: insTopic.data,
    class_created: classCreated,
    class_warning: classWarning,
  });
}

export async function PATCH(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const topic_key = String(body?.topic_key ?? "").trim();
  if (!topic_key) return NextResponse.json({ error: "topic_key is required" }, { status: 400 });

  const patch: Record<string, any> = {};

  // ✅ 追加：タイトル・説明も編集可能に
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.description !== undefined) patch.description = String(body.description);

  if (body.monthly_price !== undefined) {
    const p = Number(body.monthly_price);
    if (!ALLOWED_PRICES.has(p)) {
      return NextResponse.json({ error: "monthly_price must be 0/400/800/1200" }, { status: 400 });
    }
    patch.monthly_price = p;
  }
  if (body.is_sensitive !== undefined) patch.is_sensitive = Boolean(body.is_sensitive);
  if (body.min_age !== undefined) patch.min_age = Number(body.min_age);

  const upd = await supabaseAdmin
    .from("topics")
    .update(patch)
    .eq("topic_key", topic_key)
    .select("topic_key, title, description, monthly_price, is_sensitive, min_age")
    .single();

  if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated_topic: upd.data });
}

export async function DELETE(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const topic_key = String(body?.topic_key ?? "").trim();
  if (!topic_key) return NextResponse.json({ error: "topic_key is required" }, { status: 400 });

  const delClasses = await supabaseAdmin.from("classes").delete().eq("topic_key", topic_key).select("id");
  if (delClasses.error) {
    return NextResponse.json({ error: `classes delete failed: ${delClasses.error.message}` }, { status: 500 });
  }

  const delTopics = await supabaseAdmin.from("topics").delete().eq("topic_key", topic_key).select("topic_key");
  if (delTopics.error) {
    return NextResponse.json({ error: `topics delete failed: ${delTopics.error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted_topic_key: topic_key,
    deleted_classes_count: delClasses.data?.length ?? 0,
    deleted_topics_count: delTopics.data?.length ?? 0,
  });
}
