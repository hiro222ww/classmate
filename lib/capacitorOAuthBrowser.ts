"use client";

import { isCapacitorNativeApp } from "@/lib/capacitorClient";

let oauthBrowserOpen = false;

/** Capacitor 上で Google OAuth をアプリ内ブラウザで開く（外部 Safari 回避） */
export async function openCapacitorOAuthBrowser(url: string): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  const { Browser } = await import("@capacitor/browser");
  if (oauthBrowserOpen) {
    console.info("[oauth-start] browser already open");
    return true;
  }

  oauthBrowserOpen = true;
  console.info("[oauth-start] open in-app browser", url);

  try {
    await Browser.open({ url });
    return true;
  } catch (error) {
    oauthBrowserOpen = false;
    console.error("[oauth-start] browser open failed", error);
    throw error;
  }
}

/** OAuth 完了・キャンセル後にアプリ内ブラウザを閉じる */
export async function closeCapacitorOAuthBrowser(): Promise<void> {
  if (!isCapacitorNativeApp()) return;

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    console.info("[oauth-return] closed in-app browser");
  } catch {
    // already closed
  } finally {
    oauthBrowserOpen = false;
  }
}

export function isCapacitorOAuthBrowserOpen(): boolean {
  return oauthBrowserOpen;
}
