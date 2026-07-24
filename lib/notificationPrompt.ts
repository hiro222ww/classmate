/**
 * Shared helpers for deciding when to show the notification soft-ask prompt.
 * SSR-safe: all browser APIs are gated.
 */

export const NOTIFICATION_PROMPT_STORAGE_KEY = "classmate_notification_prompt_v1";
export const NOTIFICATION_PROMPT_DEFER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type NotificationPermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export type NotificationPromptStoredState = {
  deferredUntil?: number;
  lastShownAt?: number;
};

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  const permission = Notification.permission;
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPhone|iPad|iPod/i.test(ua);
  const webkit = /WebKit/i.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iOS && webkit && notChrome;
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)");
  if (media?.matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/** iOS Web Push requires home-screen / standalone install. */
export function canUseWebPushOnThisClient(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (isIosSafari() && !isStandaloneDisplayMode()) return false;
  return true;
}

export function readNotificationPromptState(): NotificationPromptStoredState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NOTIFICATION_PROMPT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NotificationPromptStoredState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeNotificationPromptState(
  next: NotificationPromptStoredState
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_PROMPT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

export function markNotificationPromptDeferred(now = Date.now()) {
  const prev = readNotificationPromptState();
  writeNotificationPromptState({
    ...prev,
    deferredUntil: now + NOTIFICATION_PROMPT_DEFER_MS,
    lastShownAt: now,
  });
}

export function shouldShowNotificationSoftAsk(params: {
  isLineInAppBrowser: boolean;
  isNativeApp: boolean;
  permission: NotificationPermissionState;
  canUsePush: boolean;
  deferredUntil?: number | null;
  now?: number;
}): boolean {
  if (params.isNativeApp) return false;
  if (params.isLineInAppBrowser) return false;
  if (!params.canUsePush) return false;
  if (params.permission !== "default") return false;
  const now = params.now ?? Date.now();
  if (params.deferredUntil != null && now < params.deferredUntil) return false;
  return true;
}
