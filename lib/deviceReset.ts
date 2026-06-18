import { DEVICE_ID_KEY, createDeviceUuid } from "@/lib/device";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

const LOCAL_PREFIX = "classmate_";
const SESSION_PREFIX = "classmate_";

function clearStorageByPrefix(
  storage: Storage,
  prefix: string
): number {
  let cleared = 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    storage.removeItem(key);
    cleared += 1;
  }
  return cleared;
}

function clearClassmateCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

export type DeviceResetResult = {
  clearedLocalKeys: number;
  clearedSessionKeys: number;
  newDeviceId: string;
};

/**
 * Clears Classmate-related browser state and issues a fresh device id.
 * Caller must show a confirmation dialog before invoking.
 */
export function resetClassmateDeviceState(): DeviceResetResult {
  if (typeof window === "undefined") {
    return { clearedLocalKeys: 0, clearedSessionKeys: 0, newDeviceId: "" };
  }

  let clearedLocalKeys = 0;
  let clearedSessionKeys = 0;

  try {
    clearedLocalKeys = clearStorageByPrefix(localStorage, LOCAL_PREFIX);
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    clearedLocalKeys += 1;
  } catch {
    /* ignore */
  }

  try {
    clearedSessionKeys = clearStorageByPrefix(sessionStorage, SESSION_PREFIX);
  } catch {
    /* ignore */
  }

  clearClassmateCookie(ADMIN_COOKIE_NAME);

  const id = createDeviceUuid();

  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* ignore */
  }

  return { clearedLocalKeys, clearedSessionKeys, newDeviceId: id };
}

export const DEVICE_RESET_CONFIRM_MESSAGE =
  "端末情報をリセットすると、このブラウザに保存されているClassmateの参加履歴や設定が消えます。続行しますか？";
