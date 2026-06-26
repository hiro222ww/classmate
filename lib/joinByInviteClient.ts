"use client";

import {
  bootstrapAuthSession,
  getAuthAccessToken,
  isAuthCallbackInProgress,
} from "@/lib/authClient";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getDeviceId } from "@/lib/device";
import { DEVICE_SECRET_HEADER } from "@/lib/deviceSecret";
import { getOrCreateDeviceSecret } from "@/lib/deviceSecretClient";
import { logInviteJoinClient } from "@/lib/inviteDiagnostics";
import type { JoinByInviteResult } from "@/lib/joinByInviteTypes";

export type InviteJoinClientResult =
  | { ok: true; data: JoinByInviteResult & { ok: true } }
  | {
      ok: false;
      data: JoinByInviteResult & { ok: false };
      parseError?: boolean;
    };

let authBootstrapPromise: Promise<{ ok: boolean; error?: string }> | null = null;

export async function waitForInviteAuthReady(
  deviceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isAuthCallbackInProgress()) {
    return { ok: false, error: "auth_callback_in_progress" };
  }

  if (!authBootstrapPromise) {
    authBootstrapPromise = bootstrapAuthSession(deviceId).then((result) => ({
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    }));
  }

  const boot = await authBootstrapPromise;
  authBootstrapPromise = null;

  if (!boot.ok) {
    console.warn("[invite-join] auth bootstrap skipped", {
      deviceId: deviceId.slice(-6),
      error: boot.error ?? "unknown",
    });
  }

  const token = await getAuthAccessToken();
  if (!token) {
    console.info("[invite-join] continuing with device identity only", {
      deviceId: deviceId.slice(-6),
    });
  }

  return { ok: true };
}

export function resetInviteAuthBootstrapLock() {
  authBootstrapPromise = null;
}

async function fetchJoinByInvite(params: {
  classId: string;
  sessionId: string;
  deviceId: string;
  reregisterDevice?: boolean;
  signal?: AbortSignal;
  useAuth?: boolean;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-device-id": params.deviceId,
  };

  const deviceSecret = getOrCreateDeviceSecret();
  if (deviceSecret) {
    headers[DEVICE_SECRET_HEADER] = deviceSecret;
  }

  if (params.useAuth !== false) {
    const token = await getAuthAccessToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
  }

  return fetch("/api/class/join-by-invite", {
    method: "POST",
    headers,
    body: JSON.stringify({
      classId: params.classId,
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      reregisterDevice: params.reregisterDevice === true,
    }),
    cache: "no-store",
    signal: params.signal,
  });
}

export async function callJoinByInviteApi(params: {
  classId: string;
  sessionId: string;
  deviceId: string;
  reregisterDevice?: boolean;
  signal?: AbortSignal;
  useAuth?: boolean;
}): Promise<InviteJoinClientResult> {
  const res = await fetchJoinByInvite(params);

  let json: JoinByInviteResult | null = null;
  let parseError = false;

  try {
    json = (await res.json()) as JoinByInviteResult;
  } catch {
    parseError = true;
    json = null;
  }

  if (parseError || !json || typeof json !== "object") {
    return {
      ok: false,
      parseError: true,
      data: {
        ok: false,
        code: "server_error",
        message:
          "参加処理の応答を読み取れませんでした。ページを再読み込みしてください。",
        requestId: "unknown",
      },
    };
  }

  if (!res.ok || !json.ok) {
    return {
      ok: false,
      data: json.ok
        ? {
            ok: false,
            code: "server_error",
            message: "参加に失敗しました",
            requestId: json.requestId ?? "unknown",
          }
        : json,
    };
  }

  return { ok: true, data: json };
}

export async function runInviteJoinWithAuth(params: {
  classId: string;
  sessionId: string;
  deviceId?: string;
  signal?: AbortSignal;
  onAuthReady?: () => void;
  onRequestStart?: () => void;
}): Promise<InviteJoinClientResult> {
  const deviceId = String(params.deviceId ?? getDeviceId() ?? "").trim();
  if (!deviceId) {
    return {
      ok: false,
      data: {
        ok: false,
        code: "auth_required",
        message: "端末IDの準備ができていません。ページを再読み込みしてください。",
        requestId: "client",
      },
    };
  }

  logInviteJoinClient("start", {
    classId: params.classId,
    sessionId: params.sessionId,
    deviceId,
    step: "auth_wait",
  });

  const authReady = await waitForInviteAuthReady(deviceId);
  if (!authReady.ok) {
    logInviteJoinClient("failed", {
      classId: params.classId,
      sessionId: params.sessionId,
      deviceId,
      step: "auth_wait",
      error: authReady.error,
    });
    return {
      ok: false,
      data: {
        ok: false,
        code: "auth_required",
        message: "認証の準備ができていません。ページを再読み込みしてください。",
        requestId: "client",
        detail: authReady.error,
      },
    };
  }

  params.onAuthReady?.();

  logInviteJoinClient("step", {
    classId: params.classId,
    sessionId: params.sessionId,
    deviceId,
    step: "join_request",
  });

  params.onRequestStart?.();

  let result = await callJoinByInviteApi({
    classId: params.classId,
    sessionId: params.sessionId,
    deviceId,
    signal: params.signal,
  });

  if (
    !result.ok &&
    (result.data.code === "reregister_device" ||
      result.data.code === "restore_login")
  ) {
    logInviteJoinClient("step", {
      classId: params.classId,
      sessionId: params.sessionId,
      deviceId,
      step: "device_identity_retry",
      error: result.data.code,
    });
    resetInviteAuthBootstrapLock();
    result = await callJoinByInviteApi({
      classId: params.classId,
      sessionId: params.sessionId,
      deviceId,
      reregisterDevice: true,
      useAuth: false,
      signal: params.signal,
    });
  }

  if (
    !result.ok &&
    result.data.code === "reregister_device" &&
    result.data.action === "reregister_device"
  ) {
    logInviteJoinClient("step", {
      classId: params.classId,
      sessionId: params.sessionId,
      deviceId,
      step: "reregister_device_retry",
    });
    resetInviteAuthBootstrapLock();
    await bootstrapAuthSession(deviceId);
    result = await callJoinByInviteApi({
      classId: params.classId,
      sessionId: params.sessionId,
      deviceId,
      reregisterDevice: true,
      signal: params.signal,
    });
  }

  logInviteJoinClient(result.ok ? "success" : "failed", {
    classId: params.classId,
    sessionId: params.sessionId,
    deviceId,
    step: "join_response",
    error: result.ok ? undefined : result.data.code,
  });

  if (result.ok) {
    console.info(
      `[invite-join] client redirect=${result.data.redirectTo} code=${result.data.code} requestId=${result.data.requestId}`
    );
  } else {
    console.warn(
      `[invite-join] client failed code=${result.data.code} requestId=${result.data.requestId} action=${result.data.action ?? "-"}`
    );
  }

  return result;
}
