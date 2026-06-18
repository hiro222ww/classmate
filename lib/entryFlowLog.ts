import { isDebugLogEnabled } from "@/lib/debugLog";
import { tailDeviceId } from "@/lib/deviceIdValidation";

function log(line: string) {
  if (!isDebugLogEnabled()) return;
  console.log(line);
}

export function logHomeEntryStart(deviceId: string) {
  log(`[home-entry] start device=${tailDeviceId(deviceId)}`);
}

export function logDeviceEnsureStart(deviceId: string) {
  log(`[device] ensure-start device=${tailDeviceId(deviceId)}`);
}

export function logDeviceEnsureSuccess(deviceId: string, source: string) {
  log(`[device] ensure-success device=${tailDeviceId(deviceId)} source=${source}`);
}

export function logDeviceEnsureFailed(deviceId: string, reason: string) {
  log(`[device] ensure-failed device=${tailDeviceId(deviceId)} reason=${reason}`);
}

export function logProfileExists(deviceId: string, exists: boolean) {
  log(`[profile] exists=${exists} device=${tailDeviceId(deviceId)}`);
}

export function logMatchPrefsGet(
  deviceId: string,
  outcome: "default" | "profile_required" | "saved" | "failed"
) {
  log(`[match-prefs] get ${outcome} device=${tailDeviceId(deviceId)}`);
}

export function logMatchJoinClientStart(deviceId: string) {
  log(`[match-join] start device=${tailDeviceId(deviceId)}`);
}

export function logMatchJoinClientSuccess(
  deviceId: string,
  classId: string,
  sessionId: string
) {
  log(
    `[match-join] success class=${tailDeviceId(classId)} session=${tailDeviceId(sessionId)} device=${tailDeviceId(deviceId)}`
  );
}

export function logMatchJoinClientFailed(
  deviceId: string,
  code: string,
  message?: string
) {
  log(
    `[match-join] failed code=${code} message=${String(message ?? "-").slice(0, 120)} device=${tailDeviceId(deviceId)}`
  );
}

export function logSessionJoinClient(
  deviceId: string,
  outcome: "success" | "failed",
  detail?: string
) {
  log(
    `[session-join] ${outcome} device=${tailDeviceId(deviceId)}` +
      (detail ? ` detail=${detail.slice(0, 120)}` : "")
  );
}

export function logRoomEntryClient(
  deviceId: string,
  outcome: "success" | "failed",
  detail?: string
) {
  log(
    `[room-entry] ${outcome} device=${tailDeviceId(deviceId)}` +
      (detail ? ` detail=${detail.slice(0, 120)}` : "")
  );
}

export function logCallEntryBlocked(deviceId: string, reason: string) {
  log(`[call-entry] blocked reason=${reason} device=${tailDeviceId(deviceId)}`);
}
