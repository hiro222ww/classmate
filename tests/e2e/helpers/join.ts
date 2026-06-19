import type { Page } from "@playwright/test";
import { BASE_URL } from "./config";

export type MatchJoinResult = {
  ok: boolean;
  status: number;
  classId?: string;
  sessionId?: string;
  error?: string;
  message?: string;
};

export async function apiMatchJoin(params: {
  deviceId: string;
  minAge?: number;
  maxAge?: number;
}): Promise<MatchJoinResult> {
  const res = await fetch(`${BASE_URL}/api/class/match-join-v2`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: params.deviceId,
      worldKey: "default",
      topicKey: null,
      capacity: 5,
      minAge: params.minAge ?? 0,
      maxAge: params.maxAge ?? 130,
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ok: res.ok && json.ok === true,
    status: res.status,
    classId: String(json.classId ?? ""),
    sessionId: String(json.sessionId ?? ""),
    error: String(json.error ?? ""),
    message: String(json.message ?? ""),
  };
}

export async function apiSessionJoin(params: {
  deviceId: string;
  classId: string;
  sessionId: string;
  displayName?: string;
}) {
  const res = await fetch(`${BASE_URL}/api/session/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceId: params.deviceId,
      classId: params.classId,
      sessionId: params.sessionId,
      displayName: params.displayName ?? "E2E",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ok: res.ok && json.ok === true,
    status: res.status,
    error: String(json.error ?? ""),
  };
}

export async function waitForEnabledEnterButton(page: Page) {
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.some(
      (b) =>
        (b.textContent?.trim() === "入る" ||
          b.textContent?.trim() === "今すぐ入る") &&
        !b.disabled
    );
  }, undefined, { timeout: 60_000 });
}

export async function clickFirstEnterButton(page: Page) {
  const quick = page.getByRole("button", { name: "今すぐ入る", exact: true });
  if ((await quick.count()) > 0 && (await quick.isEnabled())) {
    await quick.click();
    return;
  }
  const enter = page.locator("button", { hasText: /^(入る|今すぐ入る)$/ }).first();
  await enter.click();
}

export function attachJoinListeners(page: Page) {
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("[match-join]") ||
      text.includes("[session-join]") ||
      text.includes("[home-entry]") ||
      text.includes("[device]") ||
      text.includes("[profile]") ||
      text.includes("[match-prefs]") ||
      text.includes("[room-entry]") ||
      text.includes("[call-entry]") ||
      text.includes("[mic]") ||
      text.includes("[voice-entry]") ||
      text.includes("[voice-cleanup]")
    ) {
      logs.push(text);
    }
  });
  return logs;
}
