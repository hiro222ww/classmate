// app/api/admin/classes/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function assertAdmin(req: Request) {
  const pass = req.headers.get("x-admin-passcode") || "";
  const expected = process.env.ADMIN_PASSCODE || "";
  return Boolean(expected) && pass === expected;
}

// topic_key で紐づく classes を取得・編集する簡易API
export async function POST(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const topic_key = String(body?.topic_key ?? "").trim();
  if (!topic_key) return NextResponse.json({ error: "topic_key is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("classes")
    .select("id, name, description, topic_key, world_key, is_sensitive, min_age")
    .eq("topic_key", topic_key)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ classes: data ?? [] });
}

export async function PATCH(req: Request) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.description !== undefined) patch.description = String(body.description);
  if (body.world_key !== undefined) patch.world_key = body.world_key; // string|null

  const { data, error } = await supabaseAdmin
    .from("classes")
    .update(patch)
    .eq("id", id)
    .select("id, name, description, topic_key, world_key")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated_class: data });
}
