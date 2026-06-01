"use client";

const SNAPSHOT_KEY = "classmate_call_reload_snapshot";

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

  console.log(formatSnapshotLine(snapshot));

  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export function consumeCallReloadSnapshot(params: {
  sessionId: string;
  deviceId: string;
}): CallReloadSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;

    sessionStorage.removeItem(SNAPSHOT_KEY);
    const snapshot = JSON.parse(raw) as CallReloadSnapshot;

    console.log(
      `[call-lifecycle] reload-snapshot restored age=${Math.round((Date.now() - snapshot.savedAt) / 1000)}s ` +
        `prevSession=${snapshot.sessionId.slice(-8)} prevDevice=${snapshot.deviceId.slice(-3)} ` +
        `trigger=${snapshot.trigger} vis=${snapshot.visibilityState} nav=${snapshot.navigationType}`
    );
    console.log(formatSnapshotLine(snapshot));
    console.log("[call-lifecycle] reload-snapshot detail", snapshot);

    if (
      snapshot.sessionId &&
      snapshot.sessionId !== params.sessionId &&
      snapshot.deviceId === params.deviceId
    ) {
      console.warn("[call-lifecycle] reload-snapshot session mismatch", {
        snapshotSessionId: snapshot.sessionId,
        currentSessionId: params.sessionId,
      });
    }

    return snapshot;
  } catch {
    return null;
  }
}

export function isLikelyChunkLoadError(message: string): boolean {
  return /chunk|dynamically imported module|Loading CSS/i.test(message);
}
