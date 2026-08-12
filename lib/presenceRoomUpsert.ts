/**
 * Server-only shared class_presence upsert with room-downgrade guard.
 * All non-client room writers should go through this helper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logPresenceScreenWrite } from "@/lib/presenceScreenWriteLog";
import {
  decideRoomPresenceOverwrite,
  formatPresenceScreenIgnoreLog,
} from "@/lib/presenceRoomOverwriteGuard";

export type GuardedPresenceUpsertParams = {
  classId: string;
  deviceId: string;
  sessionId?: string | null;
  screen: string;
  status: string;
  source: string;
  reason: string;
  explicitLeave?: boolean;
  visibilityState?: string;
  pathname?: string;
  /** Optional client (tests / alternate admin client). Defaults to supabaseAdmin. */
  sb?: SupabaseClient;
};

export type GuardedPresenceUpsertResult =
  | {
      ok: true;
      applied: true;
    }
  | {
      ok: true;
      applied: false;
      ignored: true;
      reason: string;
    }
  | {
      ok: false;
      error: string;
    };

async function lookupSessionMemberInCall(
  sb: SupabaseClient,
  sessionId: string,
  deviceId: string
): Promise<boolean | null> {
  const { data, error } = await sb
    .from("session_members")
    .select("is_in_call")
    .eq("session_id", sessionId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.warn(
      `[presence-guard] in_call lookup failed source=lookup device=${deviceId.slice(-6)}`,
      error.message
    );
    return null;
  }
  if (!data) return null;
  return data.is_in_call === true;
}

/**
 * Upsert class_presence. Non-explicit screen=room is ignored when the same
 * device+session is already session_members.is_in_call=true.
 */
export async function upsertClassPresenceGuarded(
  params: GuardedPresenceUpsertParams
): Promise<GuardedPresenceUpsertResult> {
  const sb = params.sb ?? supabaseAdmin;
  const classId = String(params.classId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim() || null;
  const screen = String(params.screen ?? "").trim() || "home";
  const status = String(params.status ?? "").trim() || "offline";
  const source = String(params.source ?? "").trim() || "unattributed";
  const reason = String(params.reason ?? "").trim() || "unspecified";
  const explicitLeave = params.explicitLeave === true;
  const visibilityState = String(params.visibilityState ?? "server").trim();
  const pathname = String(params.pathname ?? "-").trim();

  if (!classId || !deviceId) {
    return { ok: false, error: "missing_params" };
  }

  let sessionMemberInCall: boolean | null = null;
  if (screen === "room" && sessionId && !explicitLeave) {
    sessionMemberInCall = await lookupSessionMemberInCall(
      sb,
      sessionId,
      deviceId
    );
  }

  const overwrite = decideRoomPresenceOverwrite({
    screen,
    source,
    explicitLeave,
    sessionId,
    sessionMemberInCall,
  });

  if (overwrite.ignore) {
    console.log(
      formatPresenceScreenIgnoreLog({
        source,
        reason: overwrite.reason ?? "session_member_in_call",
        sessionId,
        deviceId,
        visibilityState,
        pathname,
      })
    );
    return {
      ok: true,
      applied: false,
      ignored: true,
      reason: overwrite.reason ?? "session_member_in_call",
    };
  }

  if (screen === "room") {
    logPresenceScreenWrite({
      source,
      reason,
      screen: "room",
      classId,
      sessionId,
      deviceId,
      visibilityState,
      pathname,
      explicitLeave,
    });
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    class_id: classId,
    device_id: deviceId,
    screen,
    status,
    last_seen_at: now,
    updated_at: now,
  };
  if (sessionId) {
    payload.session_id = sessionId;
  }

  const { error } = await sb.from("class_presence").upsert(payload, {
    onConflict: "class_id,device_id",
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, applied: true };
}
