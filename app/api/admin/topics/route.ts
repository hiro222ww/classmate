// app/api/admin/topics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

type TopicRow = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
  is_archived?: boolean;
  created_at?: string;
};

function bad(status: number, error: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}
function ok(body: Record<string, any> = {}) {
  return NextResponse.json({ ok: true, ...body });
}

function getSupabase() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

function toNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTopicInput(t: any) {
  const topic_key = String(t?.topic_key ?? "").trim();
  const title = String(t?.title ?? "").trim();
  const description = typeof t?.description === "string" ? t.description : "";
  const is_sensitive = Boolean(t?.is_sensitive);
  const min_age = toNum(t?.min_age, 0);
  const monthly_price = toNum(t?.monthly_price, 0);
  return { topic_key, title, description, is_sensitive, min_age, monthly_price };
}

/**
 * ★ デフォルトボード(classes)を作る
 * - name は title そのまま（「雑談」を付けない）
 * - 既に同topic_keyのボードがあれば作らない
 */
async function ensureDefaultBoard(
  supabase: ReturnType<typeof getSupabase>,
  topic: { topic_key: string; title: string; description: string; is_sensitive: boolean; min_age: number },
  opts?: { world_key?: string | null }
) {
  const topic_key = topic.topic_key;

  const { data: exists, error: exErr } = await supabase
    .from("classes")
    .select("id")
    .eq("topic_key", topic_key)
    .limit(1);

  if (exErr) throw new Error(exErr.message);

  if (!exists || exists.length === 0) {
    const cls: any = {
      name: topic.title, // ★ここ：雑談を付けない
      description: topic.description || "",
      world_key: opts?.world_key ?? null,
      topic_key,
      min_age: topic.min_age ?? 0,
      is_sensitive: topic.is_sensitive ?? false,
      is_user_created: false,
    };

    const { error: cInsErr } = await supabase.from("classes").insert(cls);
    if (cInsErr) throw new Error(`class create failed: ${cInsErr.message}`);
  }
}

export async function POST(req: Request) {
  try {
    if (!ADMIN_PASSWORD) return bad(500, "ADMIN_PASSWORD is not set");
    if (!SUPABASE_URL) return bad(500, "SUPABASE_URL is not set");
    if (!SERVICE_ROLE) return bad(500, "SUPABASE_SERVICE_ROLE_KEY is not set");

    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "").trim();
    const mode = String(body?.mode ?? "").trim();

    if (!password || password !== ADMIN_PASSWORD) return bad(401, "invalid password");
    if (!mode) return bad(400, "mode is required");

    const supabase = getSupabase();

    // ===== list =====
    if (mode === "list") {
      const showArchived = Boolean(body?.show_archived);

      let q = supabase
        .from("topics")
        .select("topic_key,title,description,is_sensitive,min_age,monthly_price,is_archived,created_at")
        .order("is_archived", { ascending: true })
        .order("monthly_price", { ascending: true })
        .order("created_at", { ascending: true });

      if (!showArchived) q = q.eq("is_archived", false);

      const { data, error } = await q;
      if (error) return bad(500, error.message);

      return ok({ topics: (data ?? []) as TopicRow[] });
    }

    // ===== create (topics + default class) =====
    if (mode === "create") {
      const t = body?.topic ?? {};
      const { topic_key, title, description, is_sensitive, min_age, monthly_price } = normalizeTopicInput(t);

      if (!topic_key) return bad(400, "topic.topic_key is required");
      if (!title) return bad(400, "topic.title is required");

      const row: any = {
        topic_key,
        title,
        description,
        is_sensitive,
        min_age,
        monthly_price,
        is_archived: false,
      };

      const { data: insTopic, error: insErr } = await supabase
        .from("topics")
        .insert(row)
        .select("topic_key,title,description,is_sensitive,min_age,monthly_price,is_archived,created_at")
        .maybeSingle();

      if (insErr) return bad(500, insErr.message);

      try {
        await ensureDefaultBoard(
          supabase,
          { topic_key, title, description, is_sensitive, min_age },
          { world_key: body?.default_world_key ?? null }
        );
      } catch (e: any) {
        return bad(500, e?.message ?? "class create failed", { inserted_topic: insTopic ?? null });
      }

      return ok({ inserted_topic: insTopic ?? null });
    }

    // ===== update =====
    if (mode === "update") {
      const topic_key = String(body?.topic_key ?? "").trim();
      const patch = (body?.patch ?? {}) as Partial<TopicRow>;
      if (!topic_key) return bad(400, "topic_key is required");

      const updatePatch: any = {};
      if (typeof patch.title === "string") updatePatch.title = patch.title;
      if (typeof patch.description === "string") updatePatch.description = patch.description;
      if (typeof patch.is_sensitive === "boolean") updatePatch.is_sensitive = patch.is_sensitive;
      if (typeof patch.min_age === "number") updatePatch.min_age = patch.min_age;
      if (typeof patch.monthly_price === "number") updatePatch.monthly_price = patch.monthly_price;

      const { error } = await supabase.from("topics").update(updatePatch).eq("topic_key", topic_key);
      if (error) return bad(500, error.message);

      return ok();
    }

    // ===== archive / unarchive =====
    if (mode === "archive" || mode === "unarchive") {
      const topic_key = String(body?.topic_key ?? "").trim();
      if (!topic_key) return bad(400, "topic_key is required");

      const is_archived = mode === "archive";
      const { error } = await supabase.from("topics").update({ is_archived }).eq("topic_key", topic_key);
      if (error) return bad(500, error.message);

      return ok();
    }

    // ===== delete (hard delete) =====
    // ルール:
    // - archived のものだけ削除OK
    // - 自動生成の classes(is_user_created=false) は先に削除してOK
    // - それでも classes が残る（ユーザー作成など）なら削除不可
    if (mode === "delete") {
      const topic_key = String(body?.topic_key ?? "").trim();
      if (!topic_key) return bad(400, "topic_key is required");

      // 1) topic exists + archived?
      const { data: t, error: tErr } = await supabase
        .from("topics")
        .select("topic_key,is_archived")
        .eq("topic_key", topic_key)
        .maybeSingle();

      if (tErr) return bad(500, tErr.message);
      if (!t) return bad(404, "topic not found");
      if (!t.is_archived) return bad(400, "topic must be archived before delete", { code: "must_archive_first" });

      // 2) 自動生成ボードは消す（is_user_created=false のものだけ）
      const { error: delAutoErr } = await supabase
        .from("classes")
        .delete()
        .eq("topic_key", topic_key)
        .eq("is_user_created", false);

      if (delAutoErr) return bad(500, `delete default classes failed: ${delAutoErr.message}`);

      // 3) まだ classes が残ってたら削除不可（事故防止）
      const { count, error: cErr } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("topic_key", topic_key);

      if (cErr) return bad(500, cErr.message);
      if ((count ?? 0) > 0) {
        return bad(400, "topic is used by classes; cannot delete", { code: "topic_in_use", count });
      }

      // 4) topics delete
      const { error: dErr } = await supabase.from("topics").delete().eq("topic_key", topic_key);
      if (dErr) return bad(500, dErr.message);

      return ok();
    }

    return bad(400, `unknown mode: ${mode}`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "admin topics failed" }, { status: 500 });
  }
}
