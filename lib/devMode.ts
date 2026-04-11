// lib/devMode.ts

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isDevFeatureEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_MODE === "true"
  );
}

// 管理者ロック状態
export function isAdminUnlocked(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem("classmate_admin_unlocked") === "1";
}

// パスワードで解除
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

// ロック
export function lockAdmin() {
  if (!isBrowser()) return;
  localStorage.removeItem("classmate_admin_unlocked");
}

// URLの ?dev=1 を読む
export function getDevUserKeyFromUrl(): string {
  if (!isBrowser()) return "";
  if (!isDevFeatureEnabled()) return "";

  const params = new URLSearchParams(window.location.search);
  return (params.get("dev") ?? "").trim();
}

// 保存済み dev user を読む
export function getStoredDevUserKey(): string {
  if (!isBrowser()) return "";
  if (!isDevFeatureEnabled()) return "";
  if (!isAdminUnlocked()) return "";

  return (localStorage.getItem("classmate_dev_user") ?? "").trim();
}

// 現在の dev user を返す
// 優先順位: URL > localStorage
export function getDevUserKey(): string {
  if (!isBrowser()) return "";
  if (!isDevFeatureEnabled()) return "";

  const fromUrl = getDevUserKeyFromUrl();
  if (fromUrl) {
    if (isAdminUnlocked()) {
      localStorage.setItem("classmate_dev_user", fromUrl);
    }
    return fromUrl;
  }

  return getStoredDevUserKey();
}

// dev user を保存
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

// dev user を消す
export function clearDevUserKey() {
  if (!isBrowser()) return;
  localStorage.removeItem("classmate_dev_user");
}

// 仮想 deviceId
export function getDevDeviceId(): string {
  const key = getDevUserKey();
  if (!key) return "";
  return `test-device-${key}`;
}

// dev モード判定
export function isDevMode(): boolean {
  return !!getDevUserKey();
}