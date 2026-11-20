// lib/devMode.ts

export const DEVICE_ID_KEY = "classmate_device_id";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * 開発機能を有効にするか
 * - ローカルのみ true
 * - 本番は false
 */
export function isDevFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === "true";
}

/**
 * 管理者ロック（dev切り替えUI用）
 * ※ API/管理画面の権限は httpOnly Cookie（classmate_admin）側。
 *   localStorage は DEV UI 表示専用で、requireAdmin を満たさない。
 */
export function isAdminUnlocked(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem("classmate_admin_unlocked") === "1";
}

/**
 * DEV UI 解除。パスワード照合はサーバーの /api/admin/login のみ。
 * NEXT_PUBLIC_* に管理者パスワードを埋め込まない。
 */
export async function unlockAdmin(password: string): Promise<boolean> {
  if (!isBrowser()) return false;

  const trimmed = String(password ?? "").trim();
  if (!trimmed) return false;

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: trimmed }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!res.ok || !json?.ok) return false;
    localStorage.setItem("classmate_admin_unlocked", "1");
    return true;
  } catch {
    return false;
  }
}

export function lockAdmin() {
  if (!isBrowser()) return;
  localStorage.removeItem("classmate_admin_unlocked");
  localStorage.removeItem("classmate_dev_user");
}

/**
 * URLの ?dev= を取得
 * 👉 重要：devモード有効時のみ使う
 */
export function getDevUserKeyFromUrl(): string {
  if (!isBrowser()) return "";
  if (!isDevFeatureEnabled()) return "";

  const params = new URLSearchParams(window.location.search);
  return (params.get("dev") ?? "").trim();
}

/**
 * UI用（選択状態保存）
 * 👉 本人判定には使わない
 */
export function getStoredDevUserKey(): string {
  if (!isBrowser()) return "";
  if (!isDevFeatureEnabled()) return "";
  if (!isAdminUnlocked()) return "";

  return (localStorage.getItem("classmate_dev_user") ?? "").trim();
}

export function setDevUserKey(v: string) {
  if (!isBrowser()) return;
  if (!isDevFeatureEnabled()) return;
  if (!isAdminUnlocked()) return;

  const next = String(v ?? "").trim();

  if (next) {
    localStorage.setItem("classmate_dev_user", next);
  } else {
    localStorage.removeItem("classmate_dev_user");
  }
}

export function clearDevUserKey() {
  if (!isBrowser()) return;
  localStorage.removeItem("classmate_dev_user");
}

/**
 * 実際の本人判定
 * 👉 URLの ?dev= のみ使用
 */
export function getDevUserKey(): string {
  if (!isBrowser()) return "";
  return getDevUserKeyFromUrl();
}

/**
 * ?dev= の値から E2E / dev 用 deviceId を解決
 * - "1" -> test-device-1
 * - "webrtc1" / "webrtc-1" -> webrtc-test-device-1（WebRTC E2E 専用・既存 test-device と分離）
 */
export function resolveDevDeviceIdFromKey(key: string): string {
  const k = String(key ?? "").trim();
  if (!k) return "";

  const webrtcMatch = k.match(/^webrtc-?(\d+)$/i);
  if (webrtcMatch) {
    return `webrtc-test-device-${webrtcMatch[1]}`;
  }

  return `test-device-${k}`;
}

/**
 * dev用deviceId生成
 */
export function getDevDeviceId(): string {
  const key = getDevUserKey();
  if (!key) return "";
  return resolveDevDeviceIdFromKey(key);
}

export function isDevMode(): boolean {
  return !!getDevUserKey();
}

/**
 * 通常deviceId
 */
export function getOrCreateDeviceId(): string {
  if (!isBrowser()) return "";

  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/**
 * メイン入口
 */
export function getDeviceId(): string {
  if (!isBrowser()) return "";

  // ✅ dev優先
  const devId = getDevDeviceId();
  if (devId) return devId;

  // ✅ 通常ユーザー
  return getOrCreateDeviceId();
}

export function clearDeviceId() {
  if (!isBrowser()) return;
  localStorage.removeItem(DEVICE_ID_KEY);
}
