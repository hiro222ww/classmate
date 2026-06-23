"use client";

import { markAutoCallOnce } from "@/lib/autoCallOnce";
import { buildMatchJoinRequestBody } from "@/lib/matchJoinRequest";
import { resolveMatchJoinUserMessage } from "@/lib/matchJoinUserMessage";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";

export type OpenJoinedClassResult =
  | { ok: true; classId: string; sessionId: string; roomUrl: string }
  | { ok: false; error: string; message?: string };

export async function openJoinedClassRoom(params: {
  deviceId: string;
  current: Pick<
    CurrentClassSnapshot,
    "classId" | "sessionId" | "topicKey" | "worldKey"
  >;
  devQuery?: string;
}): Promise<OpenJoinedClassResult> {
  const deviceId = String(params.deviceId ?? "").trim();
  const classId = String(params.current.classId ?? "").trim();

  if (!deviceId || !classId) {
    return { ok: false, error: "missing_ids" };
  }

  const body = buildMatchJoinRequestBody({
    deviceId,
    openJoinedClassId: classId,
    sessionId: params.current.sessionId,
    topicKey: params.current.topicKey,
    worldKey: params.current.worldKey ?? "default",
    capacity: 5,
  });

  const res = await fetch("/api/class/match-join-v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      error: String(json?.error ?? "match_join_failed"),
      message: resolveMatchJoinUserMessage(
        String(json?.error ?? "server_error")
      ),
    };
  }

  const sessionId = String(json.sessionId ?? json.session_id ?? "").trim();
  if (!sessionId) {
    return { ok: false, error: "match_join_missing_session" };
  }

  markAutoCallOnce(sessionId, deviceId);

  const devQuery = String(params.devQuery ?? "").trim();
  const roomUrl =
    `/room?autojoin=1&classId=${encodeURIComponent(classId)}` +
    `&sessionId=${encodeURIComponent(sessionId)}` +
    `&openJoinedClass=1` +
    (devQuery ? `&${devQuery}` : "");

  return { ok: true, classId, sessionId, roomUrl };
}
