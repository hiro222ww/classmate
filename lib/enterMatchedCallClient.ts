import { markAutoCallOnce } from "@/lib/autoCallOnce";
import { withDev } from "@/lib/withDev";

/** Immediate call entry after match-join (solo allowed). Shared by home CTA and theme select. */
export function buildMatchedCallPath(classId: string, sessionId: string): string {
  const cid = String(classId ?? "").trim();
  const sid = String(sessionId ?? "").trim();
  return withDev(
    `/call?sessionId=${encodeURIComponent(sid)}&classId=${encodeURIComponent(cid)}`
  );
}

export function buildMatchedRoomPath(
  classId: string,
  sessionId: string,
  opts?: { openJoinedClass?: boolean; autojoin?: boolean }
): string {
  const cid = String(classId ?? "").trim();
  const sid = String(sessionId ?? "").trim();
  const autojoin = opts?.autojoin === false ? "0" : "1";
  return withDev(
    `/room?autojoin=${autojoin}&classId=${encodeURIComponent(cid)}` +
      `&sessionId=${encodeURIComponent(sid)}` +
      (opts?.openJoinedClass ? "&openJoinedClass=1" : "")
  );
}

/**
 * Prepare + return href for post-match call entry.
 * Home CTA and /class/select theme join must use this (topicKey differs only upstream).
 */
export function prepareMatchedCallEntry(params: {
  classId: string;
  sessionId: string;
  deviceId: string;
}): { ok: true; callPath: string } | { ok: false; error: string } {
  const classId = String(params.classId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  if (!classId || !sessionId) {
    return { ok: false, error: "match_join_missing_ids" };
  }
  if (!deviceId) {
    return { ok: false, error: "device_id_missing" };
  }
  markAutoCallOnce(sessionId, deviceId);
  return { ok: true, callPath: buildMatchedCallPath(classId, sessionId) };
}

export function resolveMatchJoinSessionIds(json: Record<string, unknown> | null | undefined): {
  classId: string;
  sessionId: string;
} {
  const row = Array.isArray(json?.data) ? (json.data[0] as Record<string, unknown>) : json;
  const classId = String(
    json?.classId ?? json?.class_id ?? row?.classId ?? row?.class_id ?? ""
  ).trim();
  const sessionId = String(
    json?.sessionId ??
      json?.session_id ??
      row?.sessionId ??
      row?.session_id ??
      ""
  ).trim();
  return { classId, sessionId };
}
