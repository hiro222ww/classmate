import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySupabaseAccessToken } from "@/lib/requestIdentity";
import { isValidDeviceUuid } from "@/lib/deviceIdValidation";
import {
  PAGE_VISIT_REFERRER_MAX_LEN,
  PAGE_VISIT_SERVER_DEDUPE_MS,
  PAGE_VISIT_UA_MAX_LEN,
  isBotUserAgent,
  isWithinDedupeWindow,
  normalizePageVisitPath,
  shouldTrackPagePath,
  truncatePageVisitText,
} from "@/lib/pageVisit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ok(body: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...body });
}

export async function POST(req: Request) {
  try {
    const ua = truncatePageVisitText(
      req.headers.get("user-agent"),
      PAGE_VISIT_UA_MAX_LEN
    );
    if (isBotUserAgent(ua)) {
      return ok({ skipped: "bot" });
    }

    const body = await req.json().catch(() => ({}));
    const path = normalizePageVisitPath(body.path ?? body.pathname);
    if (!shouldTrackPagePath(path)) {
      return ok({ skipped: "path" });
    }

    const deviceRaw = String(body.deviceId ?? body.device_id ?? "").trim();
    const deviceId = isValidDeviceUuid(deviceRaw) ? deviceRaw : null;
    const referrer = truncatePageVisitText(
      body.referrer ?? body.referer,
      PAGE_VISIT_REFERRER_MAX_LEN
    );

    let userId: string | null = null;
    const authHeader = req.headers.get("authorization") ?? "";
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (tokenMatch?.[1]) {
      const verified = await verifySupabaseAccessToken(tokenMatch[1]);
      if (verified.user?.id) {
        userId = verified.user.id;
      }
    }

    if (!userId && !deviceId) {
      // Still record anonymous path-only visits lightly; dedupe uses path+UA short.
      // Prefer having at least one visitor key when possible.
    }

    const since = new Date(Date.now() - PAGE_VISIT_SERVER_DEDUPE_MS).toISOString();
    let recentQuery = supabaseAdmin
      .from("page_visits")
      .select("id, visited_at")
      .eq("path", path)
      .gte("visited_at", since)
      .order("visited_at", { ascending: false })
      .limit(1);

    if (userId) {
      recentQuery = recentQuery.eq("user_id", userId);
    } else if (deviceId) {
      recentQuery = recentQuery.eq("device_id", deviceId).is("user_id", null);
    } else {
      // No identity: skip insert to avoid unattributable flood
      return ok({ skipped: "no_visitor_key" });
    }

    const { data: recentRows, error: recentError } = await recentQuery;
    if (recentError) {
      console.warn("[page-visit] dedupe lookup failed", recentError.message);
    } else {
      const prev = recentRows?.[0]?.visited_at ?? null;
      if (
        isWithinDedupeWindow({
          previousVisitedAt: prev,
          windowMs: PAGE_VISIT_SERVER_DEDUPE_MS,
        })
      ) {
        return ok({ deduped: true });
      }
    }

    const { error: insertError } = await supabaseAdmin.from("page_visits").insert({
      user_id: userId,
      device_id: deviceId,
      path,
      referrer,
      user_agent: ua,
    });

    if (insertError) {
      console.warn("[page-visit] insert failed", insertError.message);
      // Do not break UX
      return ok({ skipped: "insert_failed" });
    }

    return ok({ recorded: true });
  } catch (e) {
    console.warn("[page-visit] unexpected", e);
    return ok({ skipped: "error" });
  }
}
