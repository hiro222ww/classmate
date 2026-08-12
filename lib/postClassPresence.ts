import {
  currentPathname,
  currentVisibilityState,
  logPresenceScreenWrite,
} from "@/lib/presenceScreenWriteLog";

export type PostClassPresenceParams = {
  classId: string;
  deviceId: string;
  sessionId?: string | null;
  screen: "call" | "room" | "home";
  source: string;
  reason: string;
  explicitLeave?: boolean;
  signal?: AbortSignal;
};

/**
 * Client POST to /api/class/presence with attribution fields for prod diagnosis.
 * Logs screen=room writes before the request.
 */
export async function postClassPresence(
  params: PostClassPresenceParams
): Promise<Response | null> {
  const classId = String(params.classId ?? "").trim();
  const deviceId = String(params.deviceId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim() || null;
  const screen = params.screen;
  if (!classId || !deviceId) return null;

  if (params.signal?.aborted) return null;

  if (screen === "room") {
    logPresenceScreenWrite({
      source: params.source,
      reason: params.reason,
      screen: "room",
      classId,
      sessionId,
      deviceId,
      visibilityState: currentVisibilityState(),
      pathname: currentPathname(),
      explicitLeave: params.explicitLeave === true,
    });
  }

  try {
    return await fetch("/api/class/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId,
        deviceId,
        sessionId,
        screen,
        source: params.source,
        reason: params.reason,
        visibilityState: currentVisibilityState(),
        pathname: currentPathname(),
        explicitLeave: params.explicitLeave === true,
      }),
      cache: "no-store",
      signal: params.signal,
    });
  } catch (error) {
    if (
      params.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return null;
    }
    return null;
  }
}
