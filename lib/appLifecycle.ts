"use client";

import { markCallBfcacheSuspend } from "@/lib/callReloadDiagnostics";
import { isRetryableNetworkError } from "@/lib/retryableFetch";
import { debugConsoleLog } from "@/lib/debugVoiceLog";

const INSTANCE_KEY = "classmate_app_instance_id";
const BOOT_KEY = "classmate_app_boot_count";

let globalInstalled = false;

function compactPath(): string {
  if (typeof window === "undefined") return "-";
  const path = window.location.pathname || "-";
  const q = window.location.search || "";
  return q ? `${path}${q.length > 48 ? `${q.slice(0, 48)}…` : q}` : path;
}

function getNavigationType(): string {
  if (typeof performance === "undefined") return "unknown";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "unknown";
}

function ensureInstanceId(): string {
  if (typeof window === "undefined") return "-";
  try {
    let id = sessionStorage.getItem(INSTANCE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(INSTANCE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function nextBootCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const prev = Number.parseInt(sessionStorage.getItem(BOOT_KEY) ?? "0", 10);
    const next = Number.isFinite(prev) ? prev + 1 : 1;
    sessionStorage.setItem(BOOT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

function hasSessionStorageRestoreHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem("classmate_call_reload_snapshot") != null ||
      sessionStorage.getItem("classmate_call_bfcache_suspend") != null
    );
  } catch {
    return false;
  }
}

/** Always-on compact lifecycle line (low frequency). */
export function logAppLife(
  event: string,
  extra?: Record<string, string | number | boolean | null | undefined>
) {
  const instance = ensureInstanceId();
  let boot = "-";
  try {
    boot = sessionStorage.getItem(BOOT_KEY) ?? "-";
  } catch {
    boot = "-";
  }

  const parts = [
    `[app-life] ${event}`,
    `instance=${instance}`,
    `boot=${boot}`,
    `path=${compactPath()}`,
    `nav=${getNavigationType()}`,
    `vis=${typeof document !== "undefined" ? document.visibilityState : "-"}`,
    `online=${typeof navigator !== "undefined" ? navigator.onLine : "-"}`,
  ];

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v == null || v === "") continue;
      parts.push(`${k}=${String(v)}`);
    }
  }

  console.info(parts.join(" "));
}

export function logAppLifeRoute(from: string, to: string, reason = "next") {
  logAppLife("route-change", {
    from: from.slice(0, 80),
    to: to.slice(0, 80),
    reason,
  });
}

export function recordAppBoot() {
  const instance = ensureInstanceId();
  const boot = nextBootCount();
  logAppLife("boot", {
    instance,
    boot,
    sessionStorageRestored: hasSessionStorageRestoreHint(),
  });
}

export function isLikelyBenignRejection(message: string): boolean {
  if (isRetryableNetworkError({ message, name: "TypeError" })) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes("load failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network")
  );
}

export function installAppLifecycle(): () => void {
  if (typeof window === "undefined") return () => {};
  if (globalInstalled) return () => {};
  globalInstalled = true;

  recordAppBoot();

  const onPageHide = (event: PageTransitionEvent) => {
    logAppLife("pagehide", { persisted: event.persisted });
    if (event.persisted && isCallLikePath()) {
      const sid =
        new URLSearchParams(window.location.search).get("sessionId") ?? "";
      if (sid) markCallBfcacheSuspend(sid);
    }
  };

  const onPageShow = (event: PageTransitionEvent) => {
    logAppLife("pageshow", { persisted: event.persisted });
  };

  const onVisibility = () => {
    logAppLife("visibilitychange", { state: document.visibilityState });
  };

  const onBeforeUnload = () => {
    logAppLife("beforeunload");
  };

  const onOnline = () => logAppLife("online");
  const onOffline = () => logAppLife("offline");

  const onError = (event: ErrorEvent) => {
    const message = event.message ?? "";
    if (isLikelyBenignRejection(message)) {
      debugConsoleLog(`[app-life] window-error-suppressed msg=${message.slice(0, 120)}`);
      return;
    }
    logAppLife("window-error", {
      name: event.error?.name ?? "Error",
      msg: message.slice(0, 120),
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "");
    if (isLikelyBenignRejection(message)) {
      debugConsoleLog(
        `[app-life] unhandled-rejection-suppressed msg=${message.slice(0, 120)}`
      );
      return;
    }
    logAppLife("unhandled-rejection", {
      name: reason instanceof Error ? reason.name : typeof reason,
      msg: message.slice(0, 120),
    });
  };

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    globalInstalled = false;
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

function isCallLikePath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/call" || p.startsWith("/call/") || p === "/room";
}

export function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Throttle background sync while on call/room and tab hidden. */
export function getBackgroundSyncIntervalMs(visibleMs: number, hiddenMs: number): number {
  return isDocumentHidden() ? hiddenMs : visibleMs;
}
