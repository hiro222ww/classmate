"use client";

import { isCapacitorNativeApp } from "@/lib/capacitorClient";

let oauthBrowserOpen = false;
let browserFinishedListenerAttached = false;

function attachBrowserFinishedListener() {
  if (browserFinishedListenerAttached || typeof window === "undefined") return;
  browserFinishedListenerAttached = true;

  void import("@capacitor/browser").then(({ Browser }) => {
    void Browser.addListener("browserFinished", () => {
      oauthBrowserOpen = false;
      console.info("[oauth-return] in-app browser closed by user");
      window.dispatchEvent(new CustomEvent("classmate-oauth-browser-finished"));
    });
  });
}

/** Capacitor 上で Google OAuth をアプリ内ブラウザで開く（外部 Safari 回避） */
export async function openCapacitorOAuthBrowser(url: string): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  const { Browser } = await import("@capacitor/browser");
  attachBrowserFinishedListener();

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

/** OAuth 完了後にアプリ内ブラウザを閉じる（開いていないときは何もしない） */
export async function closeCapacitorOAuthBrowser(): Promise<void> {
  if (!isCapacitorNativeApp() || !oauthBrowserOpen) return;

  oauthBrowserOpen = false;

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    console.info("[oauth-return] closed in-app browser");
  } catch {
    // already closed by iOS after classmate:// redirect
  }
}

export function isCapacitorOAuthBrowserOpen(): boolean {
  return oauthBrowserOpen;
}
