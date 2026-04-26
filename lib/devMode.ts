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
 */
export function isAdminUnlocked(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem("classmate_admin_unlocked") === "1";
}

export function unlockAdmin(password: string): boolean {
  if (!isBrowser()) return false;

  const correct = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";
  if (!correct) return false;

  if (password === correct) {
    localStorage.setItem("classmate_admin_unlocked", "1");
    return true;
  }

  return false;
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
 * dev用deviceId生成
 */
export function getDevDeviceId(): string {
  const key = getDevUserKey();
  if (!key) return "";
  return `test-device-${key}`;
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