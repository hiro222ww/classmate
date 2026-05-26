import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";

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

function normalizeMode(v: any) {
  const s = String(v ?? "").trim();

  if (s === "closed" || s === "scheduled" || s === "always_open") {
    return s;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const denied = requireAdmin(req);
    if (denied) return denied;

    if (!SUPABASE_URL) return bad(500, "SUPABASE_URL is not set");
    if (!SERVICE_ROLE) return bad(500, "SUPABASE_SERVICE_ROLE_KEY is not set");

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "").trim();

    if (!mode) return bad(400, "mode is required");

    const supabase = getSupabase();

    if (mode === "get") {
      const { data: settings, error: sErr } = await supabase
        .from("admission_settings")
        .select("id,mode,message,updated_at")
        .eq("id", 1)
        .maybeSingle();

      if (sErr) return bad(500, sErr.message);

      const { data: windows, error: wErr } = await supabase
        .from("admission_windows")
        .select("id,enabled,day_of_week,open_time,close_time,label,created_at")
        .order("day_of_week", { ascending: true })
        .order("open_time", { ascending: true });

      if (wErr) return bad(500, wErr.message);

      return ok({
        settings,
        windows: windows ?? [],
      });
    }

    if (mode === "set_mode") {
      const admissionMode = normalizeMode(body?.admission_mode);

      if (!admissionMode) {
        return bad(400, "admission_mode must be closed, scheduled, or always_open");
      }

      const message =
        typeof body?.message === "string" ? body.message : null;

      const { data, error } = await supabase
        .from("admission_settings")
        .upsert(
          {
            id: 1,
            mode: admissionMode,
            message,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("id,mode,message,updated_at")
        .maybeSingle();

      if (error) return bad(500, error.message);

      return ok({ settings: data });
    }

    if (mode === "replace_windows") {
      const windows = Array.isArray(body?.windows) ? body.windows : [];

      const cleaned = windows.map((w: any) => ({
        enabled: Boolean(w?.enabled),
        day_of_week: Number(w?.day_of_week),
        open_time: String(w?.open_time ?? "").trim(),
        close_time: String(w?.close_time ?? "").trim(),
        label:
          typeof w?.label === "string" && w.label.trim()
            ? w.label.trim()
            : null,
      }));

      for (const w of cleaned) {
        if (!Number.isInteger(w.day_of_week) || w.day_of_week < 0 || w.day_of_week > 6) {
          return bad(400, "day_of_week must be 0-6");
        }

        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(w.open_time)) {
          return bad(400, "open_time must be HH:mm or HH:mm:ss");
        }

        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(w.close_time)) {
          return bad(400, "close_time must be HH:mm or HH:mm:ss");
        }
      }

      const { error: delErr } = await supabase
        .from("admission_windows")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (delErr) return bad(500, delErr.message);

      if (cleaned.length === 0) {
        return ok({ windows: [] });
      }

      const { data, error } = await supabase
        .from("admission_windows")
        .insert(cleaned)
        .select("id,enabled,day_of_week,open_time,close_time,label,created_at");

      if (error) return bad(500, error.message);

      return ok({ windows: data ?? [] });
    }

    return bad(400, `unknown mode: ${mode}`);
  } catch (e: any) {
    return bad(500, e?.message ?? "admin admission failed");
  }
}