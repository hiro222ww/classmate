import type { BrowserContext, Page } from "@playwright/test";
import { DEVICE_ID_KEY } from "@/lib/device";

export function createTestDeviceUuid(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000001";
}

export async function seedEmptyBrowserState(context: BrowserContext) {
  await context.clearCookies();
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function seedLegacyDeviceId(
  context: BrowserContext,
  legacyId = "1710000000-abc123"
) {
  await context.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [DEVICE_ID_KEY, legacyId] as const
  );
}

export async function readStoredDeviceId(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    DEVICE_ID_KEY
  );
}

export async function ensureTestProfile(
  baseURL: string,
  deviceId: string,
  displayName: string
) {
  const form = new FormData();
  form.append("device_id", deviceId);
  form.append("display_name", displayName);
  form.append("birth_date", "2000-01-01");
  form.append("gender", "male");

  const res = await fetch(`${baseURL}/api/profile`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`profile_create_failed:${res.status}:${text.slice(0, 200)}`);
  }
}
