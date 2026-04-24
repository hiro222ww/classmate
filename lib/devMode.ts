export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * 開発機能UIを表示するか
 * - ローカルでは NEXT_PUBLIC_DEV_MODE=true で有効
 * - 本番では基本 hidden のまま
 */
export function isDevFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === "true";
}

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
 * URL の ?dev= を最優先で使う
 * これは本番でも効かせる
 */
export function getDevUserKeyFromUrl(): string {
  if (!isBrowser()) return "";

  const params = new URLSearchParams(window.location.search);
  return (params.get("dev") ?? "").trim();
}

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
 * 実際のページ識別は URL の ?dev= のみ使う
 * localStorage の stored dev は UI 初期値用であって、
 * 本人判定には使わない
 */
export function getDevUserKey(): string {
  if (!isBrowser()) return "";
  return getDevUserKeyFromUrl();
}

export function getDevDeviceId(): string {
  const key = getDevUserKey();
  if (!key) return "";
  return `test-device-${key}`;
}

export function isDevMode(): boolean {
  return !!getDevUserKey();
}