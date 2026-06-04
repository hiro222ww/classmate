"use client";

import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
const SNAPSHOT_KEY = "classmate_call_reload_snapshot";
const BFCACHE_SUSPEND_KEY = "classmate_call_bfcache_suspend";

export type CallReloadSnapshot = {
  savedAt: number;
  trigger: string;
  sessionId: string;
  deviceId: string;
  visibilityState: string;
  navigationType: string;
  path: string;
  userAgent: string;
  persisted?: boolean;
  lastPeerWarning: string | null;
  lastRemoteTrackEvent: string | null;
  lastHealAction: string | null;
  lastClosePeer: string | null;
  lastError: string | null;
  lastRejection: string | null;
  lastMeshSummary: string | null;
};

type ReloadContext = Pick<
  CallReloadSnapshot,
  | "lastPeerWarning"
  | "lastRemoteTrackEvent"
  | "lastHealAction"
  | "lastClosePeer"
  | "lastError"
  | "lastRejection"
  | "lastMeshSummary"
>;

const reloadContext: ReloadContext = {
  lastPeerWarning: null,
  lastRemoteTrackEvent: null,
  lastHealAction: null,
  lastClosePeer: null,
  lastError: null,
  lastRejection: null,
  lastMeshSummary: null,
};

function getNavigationType(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

function formatSnapshotLine(snapshot: Partial<CallReloadSnapshot>): string {
  return (
    `[call-lifecycle] reload-context ` +
    `trigger=${snapshot.trigger ?? "-"} ` +
    `vis=${snapshot.visibilityState ?? "-"} ` +
    `nav=${snapshot.navigationType ?? "-"} ` +
    `warn=${snapshot.lastPeerWarning ?? "-"} ` +
    `track=${snapshot.lastRemoteTrackEvent ?? "-"} ` +
    `heal=${snapshot.lastHealAction ?? "-"} ` +
    `close=${snapshot.lastClosePeer ?? "-"} ` +
    `err=${snapshot.lastError ?? "-"} ` +
    `reject=${snapshot.lastRejection ?? "-"} ` +
    `mesh=${snapshot.lastMeshSummary ?? "-"}`
  );
}

export function recordCallReloadContext(patch: Partial<ReloadContext>) {
  Object.assign(reloadContext, patch);
}

export function saveCallReloadSnapshot(params: {
  trigger: string;
  sessionId: string;
  deviceId: string;
  persisted?: boolean;
}) {
  const snapshot: CallReloadSnapshot = {
    savedAt: Date.now(),
    trigger: params.trigger,
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    visibilityState:
      typeof document !== "undefined" ? document.visibilityState : "unknown",
    navigationType: getNavigationType(),
    path:
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    persisted: params.persisted,
    ...reloadContext,
  };

  debugConsoleLog(formatSnapshotLine(snapshot));

  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export function logReloadSnapshotOnMount(params: {
  sessionId: string;
  deviceId: string;
}): CallReloadSnapshot | null {
  const nav = getNavigationType();

  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) {
      debugConsoleLog(
        `[call-lifecycle] reload-snapshot-restored present=false nav=${nav} ` +
          `trigger=- vis=- close=- track=- heal=- err=- reject=- chunk=-`
      );
      return null;
    }

    sessionStorage.removeItem(SNAPSHOT_KEY);
    const snapshot = JSON.parse(raw) as CallReloadSnapshot;
    const ageSec = Math.max(0, Math.round((Date.now() - snapshot.savedAt) / 1000));
    const chunkError =
      isLikelyChunkLoadError(snapshot.lastError ?? "") ||
      isLikelyChunkLoadError(snapshot.lastRejection ?? "");

    debugConsoleLog(
      `[call-lifecycle] reload-snapshot-restored present=true age=${ageSec}s nav=${nav} ` +
        `trigger=${snapshot.trigger} vis=${snapshot.visibilityState} prevNav=${snapshot.navigationType} ` +
        `close=${snapshot.lastClosePeer ?? "-"} track=${snapshot.lastRemoteTrackEvent ?? "-"} ` +
        `heal=${snapshot.lastHealAction ?? "-"} err=${snapshot.lastError ?? "-"} ` +
        `reject=${snapshot.lastRejection ?? "-"} chunk=${chunkError}`
    );

    return snapshot;
  } catch {
    debugConsoleLog(
      `[call-lifecycle] reload-snapshot-restored present=false nav=${nav} parseError=true`
    );
    return null;
  }
}

export function consumeCallReloadSnapshot(params: {
  sessionId: string;
  deviceId: string;
}): CallReloadSnapshot | null {
  return logReloadSnapshotOnMount(params);
}

export function clearCallBfcacheSuspend(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(BFCACHE_SUSPEND_KEY);
  } catch {
    // ignore
  }
}

export function markCallBfcacheSuspend(sessionId: string): void {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  if (!sid) return;
  try {
    sessionStorage.setItem(BFCACHE_SUSPEND_KEY, sid);
  } catch {
    // ignore
  }
}

export function consumeCallBfcacheSuspend(
  expectedSessionId: string
): boolean {
  if (typeof window === "undefined") return false;
  const sid = String(expectedSessionId ?? "").trim();
  if (!sid) return false;
  try {
    const value = sessionStorage.getItem(BFCACHE_SUSPEND_KEY);
    sessionStorage.removeItem(BFCACHE_SUSPEND_KEY);
    return value === sid;
  } catch {
    return false;
  }
}

export function isLikelyChunkLoadError(message: string): boolean {
  return /chunk|dynamically imported module|Loading CSS/i.test(message);
}
