/**
 * Call-page presence publish rules for background → foreground resume.
 * Display SoT remains fresh class_presence (screen=call + session match).
 */

export type CallPresenceScreen = "call" | "room";

export function shouldPublishCallPresence(params: {
  documentHidden: boolean;
  selfLeftCall: boolean;
}): boolean {
  if (params.documentHidden) return false;
  if (params.selfLeftCall) return false;
  return true;
}

/**
 * Presence effect cleanup must not POST screen=room.
 * Remount / StrictMode / dep churn races were overwriting a fresh screen=call
 * resume. Explicit leave and Room/Home clients own room/home presence.
 */
export function shouldPostRoomPresenceOnCallEffectCleanup(): boolean {
  return false;
}

export function buildCallActivePresenceBody(params: {
  classId: string;
  deviceId: string;
  sessionId: string;
}): {
  classId: string;
  deviceId: string;
  screen: "call";
  sessionId: string;
} {
  return {
    classId: String(params.classId ?? "").trim(),
    deviceId: String(params.deviceId ?? "").trim(),
    screen: "call",
    sessionId: String(params.sessionId ?? "").trim(),
  };
}

export function isCallForegroundResumeEvent(params: {
  type: "visibilitychange" | "pageshow" | "focus";
  visibilityState?: DocumentVisibilityState | string;
}): boolean {
  if (params.type === "visibilitychange") {
    return params.visibilityState === "visible";
  }
  return params.type === "pageshow" || params.type === "focus";
}
