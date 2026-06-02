"use client";

import {
  consumeCallBfcacheSuspend,
  consumeCallReloadSnapshot,
  isLikelyChunkLoadError,
  logReloadSnapshotOnMount,
  markCallBfcacheSuspend,
  recordCallReloadContext,
  saveCallReloadSnapshot,
  type CallReloadSnapshot,
} from "@/lib/callReloadDiagnostics";
import {
  LOCAL_LEFT_CALL_EXPLICIT_REASON,
  sanitizeLocalLeftCallAfterReload,
} from "@/lib/localCallExit";

export const LAST_FATAL_ERROR_KEY = "classmate_last_fatal_error";

export type FatalErrorSnapshot = {
  savedAt: number;
  kind: "window-error" | "unhandled-rejection";
  message: string;
  name: string;
  stack: string | null;
  chunkError: boolean;
  path: string;
  sessionId?: string;
  deviceId?: string;
};

/**
 * Navigation audit (app code that can reload or hard-navigate):
 * - app/premium/page.tsx: location.href, location.reload
 * - app/billing/page.tsx: location.href
 * - app/class/select/SelectClient.tsx: location.href
 * - app/admin/*: location.href (admin only)
 * - components/DevModeSwitcher.tsx: location.href
 * - app/call/CallClient.tsx: router.push/replace (exit, profile, removed_from_session)
 * - app/room/RoomClient.tsx: router.replace (auto-call, rematch, removed)
 * - app/HomeClient.tsx, ProfileClient, etc.: router.push/replace (not on /call)
 * No window.location.reload in call/room/voice paths.
 */
export function getCurrentPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

export function isCallPath(pathname?: string): boolean {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  return path === "/call" || path.startsWith("/call/");
}

export function getNavigationType(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

export function logNavigationIntent(reason: string, source: string) {
  console.log(
    `[call-lifecycle] navigation-intent reason=${reason} source=${source} ` +
      `path=${getCurrentPath()} nav=${getNavigationType()}`
  );
}

export function logRouteChange(from: string, to: string, reason: string) {
  console.log(
    `[call-lifecycle] route-change from=${from} to=${to} reason=${reason} nav=${getNavigationType()}`
  );
}

export function logCallNavigationOnMount(params: {
  sessionId: string;
  deviceId: string;
}) {
  const nav = getNavigationType();
  console.log(
    `[call-lifecycle] navigation type=${nav} ` +
      `session=${compactSessionId(params.sessionId)} device=${compactDeviceId(params.deviceId)}`
  );
}

function compactSessionId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 8) return value;
  return value.slice(-8);
}

function compactDeviceId(id: string | null | undefined): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= 4) return value;
  return value.slice(-3);
}

export function saveFatalError(snapshot: FatalErrorSnapshot) {
  const line =
    snapshot.kind === "window-error"
      ? `[app-error] window-error chunk=${snapshot.chunkError} name=${snapshot.name} msg=${snapshot.message.slice(0, 160)}`
      : `[app-error] unhandled-rejection chunk=${snapshot.chunkError} name=${snapshot.name} msg=${snapshot.message.slice(0, 160)}`;

  if (snapshot.kind === "window-error") {
    recordCallReloadContext({ lastError: line });
  } else {
    recordCallReloadContext({ lastRejection: line });
  }

  console.error(line);

  try {
    sessionStorage.setItem(LAST_FATAL_ERROR_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

export function consumeReloadErrorContext(params: {
  sessionId: string;
  deviceId: string;
}): FatalErrorSnapshot | null {
  const nav = getNavigationType();
  if (nav !== "reload") return null;

  try {
    const raw = sessionStorage.getItem(LAST_FATAL_ERROR_KEY);
    if (!raw) {
      console.log(
        `[call-lifecycle] reload-error-context present=false nav=${nav} ` +
          `session=${compactSessionId(params.sessionId)} device=${compactDeviceId(params.deviceId)}`
      );
      return null;
    }

    sessionStorage.removeItem(LAST_FATAL_ERROR_KEY);
    const snapshot = JSON.parse(raw) as FatalErrorSnapshot;
    console.log(
      `[call-lifecycle] reload-error-context present=true kind=${snapshot.kind} ` +
        `name=${snapshot.name} chunk=${snapshot.chunkError} ` +
        `msg=${snapshot.message.slice(0, 120)} path=${snapshot.path}`
    );
    return snapshot;
  } catch {
    console.log(
      `[call-lifecycle] reload-error-context present=false nav=${nav} parseError=true`
    );
    return null;
  }
}

export function restoreCallSessionAfterReload(params: {
  sessionId: string;
  deviceId: string;
}): {
  reloadSnapshot: CallReloadSnapshot | null;
  leftCallSanitized: ReturnType<typeof sanitizeLocalLeftCallAfterReload>;
} {
  logCallNavigationOnMount(params);
  const reloadSnapshot = logReloadSnapshotOnMount(params);
  consumeReloadErrorContext(params);
  const leftCallSanitized = sanitizeLocalLeftCallAfterReload(
    params.sessionId,
    params.deviceId
  );

  if (leftCallSanitized.cleared && leftCallSanitized.previousReason) {
    console.log(
      `[call-lifecycle] reload-restore-ignore-local-exit ` +
        `previousReason=${leftCallSanitized.previousReason}`
    );
  }

  return { reloadSnapshot, leftCallSanitized };
}

export function shouldSkipCallLifecycleExit(): boolean {
  return isCallPath();
}

export function installCallLifecycleDiagnostics(params: {
  sessionId: string;
  deviceId: string;
  onBfcacheRestore?: (args: { sessionId: string; deviceId: string }) => void;
}) {
  const { sessionId, deviceId, onBfcacheRestore } = params;

  const onError = (event: ErrorEvent) => {
    const message = event.message ?? "";
    const chunkError = isLikelyChunkLoadError(message);
    saveFatalError({
      savedAt: Date.now(),
      kind: "window-error",
      message,
      name: event.error?.name ?? "ErrorEvent",
      stack: event.error?.stack ?? null,
      chunkError,
      path: getCurrentPath(),
      sessionId,
      deviceId,
    });
    console.error("[call-lifecycle] window-error", {
      message: event.message,
      chunkError,
      filename: event.filename ?? null,
      lineno: event.lineno ?? null,
      stack: event.error?.stack ?? null,
      sessionId,
      deviceId,
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const chunkError = isLikelyChunkLoadError(message);
    saveFatalError({
      savedAt: Date.now(),
      kind: "unhandled-rejection",
      message,
      name: reason instanceof Error ? reason.name : typeof reason,
      stack: reason instanceof Error ? reason.stack ?? null : null,
      chunkError,
      path: getCurrentPath(),
      sessionId,
      deviceId,
    });
    console.error("[call-lifecycle] unhandled-rejection", {
      message,
      chunkError,
      stack: reason instanceof Error ? reason.stack : null,
      sessionId,
      deviceId,
    });
  };

  const onPageHide = (event: PageTransitionEvent) => {
    if (shouldSkipCallLifecycleExit()) {
      if (event.persisted) {
        console.log(
          `[call-lifecycle] pagehide-skip-exit persisted=true ` +
            `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
        );
        markCallBfcacheSuspend(sessionId);
      } else {
        console.log(
          `[call-lifecycle] pagehide-skip-exit persisted=false ` +
            `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
        );
      }
      return;
    }

    if (event.persisted) {
      console.log(
        `[call-lifecycle] pagehide-skip-exit persisted=true ` +
          `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
      );
      markCallBfcacheSuspend(sessionId);
      return;
    }

    saveCallReloadSnapshot({
      trigger: "pagehide",
      sessionId,
      deviceId,
      persisted: event.persisted,
    });
  };

  const onPageShow = (event: PageTransitionEvent) => {
    console.log(
      `[call-lifecycle] pageshow persisted=${event.persisted} ` +
        `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
    );

    if (event.persisted && consumeCallBfcacheSuspend(sessionId)) {
      console.log(
        `[call-lifecycle] bfcache-restore action=resume_call ` +
          `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
      );
      onBfcacheRestore?.({ sessionId, deviceId });
    }
  };

  const onVisibilityChange = () => {
    const visibilityState = document.visibilityState;
    if (visibilityState === "hidden" && shouldSkipCallLifecycleExit()) {
      console.log(
        `[call-lifecycle] hidden-skip-exit vis=hidden ` +
          `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)} ` +
          `path=${getCurrentPath()}`
      );
      return;
    }

    console.log(
      `[call-lifecycle] visibilitychange vis=${visibilityState} ` +
        `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
    );
  };

  const onBeforeUnload = () => {
    if (shouldSkipCallLifecycleExit()) {
      console.log(
        `[call-lifecycle] beforeunload-skip-snapshot ` +
          `session=${compactSessionId(sessionId)} device=${compactDeviceId(deviceId)}`
      );
      return;
    }

    saveCallReloadSnapshot({
      trigger: "beforeunload",
      sessionId,
      deviceId,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}

export { consumeCallReloadSnapshot } from "@/lib/callReloadDiagnostics";

const CALL_MUTE_PREFERENCE_PREFIX = "classmate_call_mute_preference";
const CALL_MIC_EVER_UNMUTED_PREFIX = "classmate_call_mic_ever_unmuted";
const CALL_ENTRY_SEEN_PREFIX = "classmate_call_entry_seen";
const LEGACY_CALL_MUTE_KEY_PREFIX = "classmate_call_muted";

function compactCallScopeId(id: string | null | undefined, tail = 8): string {
  const value = String(id ?? "").trim();
  if (!value) return "-";
  if (value.length <= tail) return value;
  return value.slice(-tail);
}

export function callEntrySeenKey(sessionId: string, deviceId: string): string {
  return `${CALL_ENTRY_SEEN_PREFIX}:${String(sessionId ?? "").trim()}:${String(deviceId ?? "").trim()}`;
}

export function isCallEntrySeen(sessionId: string, deviceId: string): boolean {
  if (typeof window === "undefined") return false;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return false;
  try {
    return sessionStorage.getItem(callEntrySeenKey(sid, did)) === "1";
  } catch {
    return false;
  }
}

export function markCallEntrySeen(sessionId: string, deviceId: string) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return;
  try {
    sessionStorage.setItem(callEntrySeenKey(sid, did), "1");
  } catch {
    // ignore
  }
}

export function callMuteStorageKey(sessionId: string, deviceId: string): string {
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  return `${CALL_MUTE_PREFERENCE_PREFIX}:${sid}:${did}`;
}

function legacyCallMuteStorageKey(sessionId: string): string {
  return `${LEGACY_CALL_MUTE_KEY_PREFIX}:${String(sessionId ?? "").trim()}`;
}

function parseMutePreferenceRaw(raw: string | null): boolean | null {
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
}

export function callMicEverUnmutedKey(sessionId: string, deviceId: string): string {
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  return `${CALL_MIC_EVER_UNMUTED_PREFIX}:${sid}:${did}`;
}

export function hasCallMicEverUnmuted(
  sessionId: string,
  deviceId: string
): boolean {
  if (typeof window === "undefined") return false;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return false;
  try {
    return sessionStorage.getItem(callMicEverUnmutedKey(sid, did)) === "1";
  } catch {
    return false;
  }
}

export function markCallMicEverUnmuted(sessionId: string, deviceId: string) {
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return;
  try {
    sessionStorage.setItem(callMicEverUnmutedKey(sid, did), "1");
  } catch {
    // ignore
  }
}

/** releaseMicOnMute applies only before the user has unmuted once this session. */
export function shouldReleaseMicOnMute(params: {
  policyReleaseMicOnMute: boolean;
  sessionId: string;
  deviceId: string;
  userMuted: boolean;
}): boolean {
  if (!params.policyReleaseMicOnMute) return false;
  if (!params.userMuted) return false;
  if (hasCallMicEverUnmuted(params.sessionId, params.deviceId)) return false;
  return true;
}

export function readCallMutePreference(
  sessionId: string,
  deviceId: string
): boolean | null {
  if (typeof window === "undefined") return null;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return null;

  try {
    const current = parseMutePreferenceRaw(
      sessionStorage.getItem(callMuteStorageKey(sid, did))
    );
    if (current != null) return current;

    return parseMutePreferenceRaw(
      sessionStorage.getItem(legacyCallMuteStorageKey(sid))
    );
  } catch {
    return null;
  }
}

export type CallMuteInitReason =
  | "initial_call_entry_safety_mute"
  | "reload_restore"
  | "reload_restore_default_muted"
  | "remount_restore_default_muted"
  | "bfcache_restore"
  | "bfcache_restore_default_muted";

export function logCallMuteDecision(params: {
  sessionId: string;
  deviceId: string;
  nav: string;
  stored: boolean | null;
  isFirstCallEntry: boolean;
  decision: boolean;
  reason: CallMuteInitReason;
}) {
  console.log(
    `[local-mic] mute-decision session=${compactCallScopeId(params.sessionId)} ` +
      `device=${compactCallScopeId(params.deviceId, 4)} nav=${params.nav} ` +
      `stored=${params.stored ?? "-"} isFirstCallEntry=${params.isFirstCallEntry} ` +
      `decision=${params.decision ? "muted" : "unmuted"} reason=${params.reason}`
  );
}

export function resolveCallEntryUserMuted(
  sessionId: string,
  deviceId: string,
  options?: { navigationContext?: "default" | "bfcache" }
): {
  userMuted: boolean;
  reason: CallMuteInitReason;
  stored: boolean | null;
  isFirstCallEntry: boolean;
} {
  const stored = readCallMutePreference(sessionId, deviceId);
  const nav = getNavigationType();
  const entrySeen = isCallEntrySeen(sessionId, deviceId);
  const isReloadLike =
    nav === "reload" ||
    nav === "back_forward" ||
    options?.navigationContext === "bfcache";
  const isFirstCallEntry = !entrySeen && !isReloadLike;

  if (stored !== null) {
    const reason: CallMuteInitReason = isReloadLike
      ? options?.navigationContext === "bfcache"
        ? "bfcache_restore"
        : "reload_restore"
      : "reload_restore";

    if (resolved.stored === false && isReloadLike) {
      markCallMicEverUnmuted(sessionId, deviceId);
      console.log(
        `[local-mic] prevent-safety-mute-on-reload stored=false reason=${reason}`
      );
    }

    logCallMuteDecision({
      sessionId,
      deviceId,
      nav,
      stored,
      isFirstCallEntry: false,
      decision: stored,
      reason,
    });

    return {
      userMuted: stored,
      stored,
      reason,
      isFirstCallEntry: false,
    };
  }

  if (entrySeen || isReloadLike) {
    const reason: CallMuteInitReason = isReloadLike
      ? options?.navigationContext === "bfcache"
        ? "bfcache_restore_default_muted"
        : "reload_restore_default_muted"
      : "remount_restore_default_muted";

    logCallMuteDecision({
      sessionId,
      deviceId,
      nav,
      stored: null,
      isFirstCallEntry: false,
      decision: true,
      reason,
    });

    return {
      userMuted: true,
      stored: null,
      reason,
      isFirstCallEntry: false,
    };
  }

  markCallEntrySeen(sessionId, deviceId);

  logCallMuteDecision({
    sessionId,
    deviceId,
    nav,
    stored: null,
    isFirstCallEntry: true,
    decision: true,
    reason: "initial_call_entry_safety_mute",
  });

  return {
    userMuted: true,
    stored: null,
    reason: "initial_call_entry_safety_mute",
    isFirstCallEntry: true,
  };
}

export function writeCallMutePreference(
  sessionId: string,
  deviceId: string,
  isMuted: boolean,
  options?: { source?: "user_click" }
) {
  if (options?.source !== "user_click") return;
  if (typeof window === "undefined") return;
  const sid = String(sessionId ?? "").trim();
  const did = String(deviceId ?? "").trim();
  if (!sid || !did) return;
  try {
    sessionStorage.setItem(
      callMuteStorageKey(sid, did),
      isMuted ? "1" : "0"
    );
    markCallEntrySeen(sid, did);
  } catch {
    // ignore
  }
}
