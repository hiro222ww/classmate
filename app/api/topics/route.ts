import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ========= env ========= */

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

/* ========= types ========= */

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

/* ========= utils ========= */

function bad(status: number, error: string, extra?: Record<string, any>) {
  console.error("[topics] bad", { status, error, ...(extra ?? {}) });

  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}), topics: [] },
    { status }
  );
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
  return {
    topic_key: String(t?.topic_key ?? "").trim(),
    title: String(t?.title ?? "").trim(),
    description: typeof t?.description === "string" ? t.description : "",
    is_sensitive: Boolean(t?.is_sensitive),
    min_age: toNum(t?.min_age, 0),
    monthly_price: toNum(t?.monthly_price, 0),
  };
}

/* =========================================================
   🟢 フロント用（これが今回の本命）
========================================================= */

export async function GET() {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return bad(500, "env_not_set");
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("topics")
      .select(
        "topic_key,title,description,is_sensitive,min_age,monthly_price,is_archived,created_at"
      )
      .eq("is_archived", false)
      .order("monthly_price", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return bad(500, error.message, { where: "topics_get" });
    }

    return ok({
      topics: (data ?? []) as TopicRow[],
    });
  } catch (e: any) {
    return bad(500, e?.message ?? "topics_failed", { where: "catch" });
  }
}

/* =========================================================
   🔒 管理用（既存そのまま）
========================================================= */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "").trim();
    const mode = String(body?.mode ?? "").trim();

    if (!ADMIN_PASSWORD) return bad(500, "ADMIN_PASSWORD not set");
    if (!SUPABASE_URL) return bad(500, "SUPABASE_URL not set");
    if (!SERVICE_ROLE) return bad(500, "SERVICE_ROLE not set");

    if (!password || password !== ADMIN_PASSWORD) {
      return bad(401, "invalid password");
    }

    if (!mode) return bad(400, "mode required");

    const supabase = getSupabase();

    /* ===== list ===== */
    if (mode === "list") {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) return bad(500, error.message);

      return ok({ topics: data ?? [] });
    }

    /* ===== create ===== */
    if (mode === "create") {
      const t = normalizeTopicInput(body?.topic);

      if (!t.topic_key) return bad(400, "topic_key required");
      if (!t.title) return bad(400, "title required");

      const { error } = await supabase.from("topics").insert({
        ...t,
        is_archived: false,
      });

      if (error) return bad(500, error.message);

      return ok();
    }

    /* ===== update ===== */
    if (mode === "update") {
      const topic_key = String(body?.topic_key ?? "").trim();
      const patch = body?.patch ?? {};

      if (!topic_key) return bad(400, "topic_key required");

      const { error } = await supabase
        .from("topics")
        .update(patch)
        .eq("topic_key", topic_key);

      if (error) return bad(500, error.message);

      return ok();
    }

    /* ===== archive ===== */
    if (mode === "archive" || mode === "unarchive") {
      const topic_key = String(body?.topic_key ?? "").trim();
      if (!topic_key) return bad(400, "topic_key required");

      const { error } = await supabase
        .from("topics")
        .update({ is_archived: mode === "archive" })
        .eq("topic_key", topic_key);

      if (error) return bad(500, error.message);

      return ok();
    }

    /* ===== delete ===== */
    if (mode === "delete") {
      const topic_key = String(body?.topic_key ?? "").trim();
      if (!topic_key) return bad(400, "topic_key required");

      const { error } = await supabase
        .from("topics")
        .delete()
        .eq("topic_key", topic_key);

      if (error) return bad(500, error.message);

      return ok();
    }

    return bad(400, `unknown mode: ${mode}`);
  } catch (e: any) {
    return bad(500, e?.message ?? "topics_failed");
  }
}