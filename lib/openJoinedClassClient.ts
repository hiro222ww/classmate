"use client";

import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";
import {
  readHomeClassSessionHint,
  storeHomeClassSessionHint,
} from "@/lib/homeClassSessionHint";
import { buildMatchJoinRequestBody } from "@/lib/matchJoinRequest";
import { resolveMatchJoinUserMessage } from "@/lib/matchJoinUserMessage";

export type OpenJoinedClassResult =
  | { ok: true; roomPath: string }
  | { ok: false; message: string };

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function buildRoomPath(
  classId: string,
  sessionId: string,
  withDev: (path: string) => string,
  openJoinedClass = true
) {
  const params = new URLSearchParams({
    autojoin: "1",
    classId,
    sessionId,
  });
  if (openJoinedClass) params.set("openJoinedClass", "1");
  return withDev(`/room?${params.toString()}`);
}

async function tryOpenWithHintSession(params: {
  deviceId: string;
  classId: string;
  hintSessionId: string;
  withDev: (path: string) => string;
}): Promise<string | null> {
  const { deviceId, classId, hintSessionId, withDev } = params;
  try {
    const qs = new URLSearchParams({
      sessionId: hintSessionId,
      classId,
      lite: "1",
      fast: "1",
      viewerDeviceId: deviceId,
    });

    const res = await fetch(`/api/session/status?${qs.toString()}`, {
      cache: "no-store",
    });
    const json = await readJsonSafe(res);
    if (!res.ok || !json?.ok) return null;

    const members = Array.isArray(json.members) ? json.members : [];
    const selfIn =
      members.some(
        (member: { device_id?: string }) =>
          String(member.device_id ?? "").trim() === deviceId
      ) || json.viewerState?.inSessionMembers === true;

    if (!selfIn || members.length < 1) return null;

    const sessionStatus = String(json.session?.status ?? "")
      .trim()
      .toLowerCase();
    if (
      sessionStatus === "closed" ||
      sessionStatus === "expired" ||
      sessionStatus === "ended"
    ) {
      return null;
    }

    storeHomeClassSessionHint(classId, hintSessionId, sessionStatus);
    return buildRoomPath(classId, hintSessionId, withDev);
  } catch {
    return null;
  }
}

function resolveOpenClassError(json: Record<string, unknown>): string {
  const code = String(json?.error ?? "").trim();
  if (!code) return "クラスに入れませんでした。もう一度お試しください。";

  if (code === "class_slots_limit") {
    return `クラス参加上限に達しています。現在のプランでは最大 ${
      json?.classSlots ?? "指定"
    } クラスまで参加できます。`;
  }

  if (
    code === "match_deadline_passed" ||
    code === "recruitment_closed" ||
    code === "session_closed"
  ) {
    return (
      (typeof json?.message === "string" && json.message) ||
      (code === "session_closed"
        ? "このセッションは終了しています"
        : "このクラスは現在募集していません")
    );
  }

  if (code === "membership_left") {
    return "このクラスからは退出済みです。もう一度参加してください。";
  }

  if (code === "admission_closed") {
    return (
      (typeof json?.message === "string" && json.message) ||
      "現在は入校受付時間外です。"
    );
  }

  return resolveMatchJoinUserMessage(code);
}

/**
 * Web 版 Home の openClass と同系統の復帰処理。
 * sessionId を match-join-v2 で解決してから /room へ遷移する。
 */
export async function openJoinedClassFromSnapshot(options: {
  deviceId: string;
  current: CurrentClassSnapshot;
  withDev: (path: string) => string;
}): Promise<OpenJoinedClassResult> {
  const { deviceId, current, withDev } = options;
  const classId = String(current.classId ?? "").trim();
  if (!classId) {
    return {
      ok: false,
      message: "今のクラスが見つかりません。もう一度参加してください。",
    };
  }

  if (!deviceId) {
    return {
      ok: false,
      message: "端末情報を取得できませんでした。",
    };
  }

  let hintSessionId =
    String(current.sessionId ?? "").trim() ||
    readHomeClassSessionHint(classId) ||
    "";

  if (hintSessionId) {
    const roomPath = await tryOpenWithHintSession({
      deviceId,
      classId,
      hintSessionId,
      withDev,
    });
    if (roomPath) {
      return { ok: true, roomPath };
    }
  }

  const openBody = buildMatchJoinRequestBody({
    deviceId,
    openJoinedClassId: classId,
    sessionId: hintSessionId || null,
    topicKey: current.topicKey,
    worldKey: current.worldKey ?? "default",
    capacity: 5,
  });

  const res = await fetch("/api/class/match-join-v2", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await buildDeviceAuthHeaders(deviceId)),
    },
    body: JSON.stringify(openBody),
    cache: "no-store",
  });

  const json = await readJsonSafe(res);
  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      message: resolveOpenClassError(json),
    };
  }

  const row = Array.isArray(json?.data) ? json.data[0] : json;
  const resolvedClassId = String(
    json?.classId ?? json?.class_id ?? row?.classId ?? row?.class_id ?? ""
  ).trim();
  const sessionId = String(
    json?.sessionId ??
      json?.session_id ??
      row?.sessionId ??
      row?.session_id ??
      ""
  ).trim();

  if (!resolvedClassId || !sessionId) {
    return {
      ok: false,
      message: "今のクラスが見つかりません。もう一度参加してください。",
    };
  }

  const resolvedStatus = String(
    json?.sessionStatus ?? json?.session_status ?? ""
  )
    .trim()
    .toLowerCase();
  if (
    resolvedStatus === "closed" ||
    resolvedStatus === "expired" ||
    resolvedStatus === "ended"
  ) {
    return {
      ok: false,
      message: "このセッションは終了しています。もう一度参加してください。",
    };
  }

  storeHomeClassSessionHint(resolvedClassId, sessionId, resolvedStatus);
  return {
    ok: true,
    roomPath: buildRoomPath(resolvedClassId, sessionId, withDev),
  };
}
