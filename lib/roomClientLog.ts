import { isDebugLogEnabled, logError, logInfo, logWarn } from "@/lib/debugLog";

export { logError, logInfo, logWarn };

/** RoomClient verbose diagnostics — debug flag only. */
export function roomLog(...args: unknown[]) {
  if (!isDebugLogEnabled()) return;
  console.log(...args);
}
