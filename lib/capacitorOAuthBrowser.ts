"use client";

import { Capacitor } from "@capacitor/core";
import {
  completeNativeOAuthReturn,
  isCapacitorNativeApp,
} from "@/lib/capacitorClient";
import { ClassmateOAuth } from "@/lib/classmateOAuthNative";

let oauthBrowserOpen = false;
let browserFinishedListenerAttached = false;

export type CapacitorOAuthBrowserResult = {
  ok: boolean;
  cancelled?: boolean;
  message?: string;
};

function finishOAuthBrowserFlow() {
  oauthBrowserOpen = false;
  window.dispatchEvent(new CustomEvent("classmate-oauth-browser-finished"));
}

function attachBrowserFinishedListener() {
  if (browserFinishedListenerAttached || typeof window === "undefined") return;
  browserFinishedListenerAttached = true;

  void import("@capacitor/browser").then(({ Browser }) => {
    void Browser.addListener("browserFinished", () => {
      finishOAuthBrowserFlow();
      console.info("[oauth-return] in-app browser closed by user");
    });
  });
}

async function openOAuthWithBrowserPlugin(
  url: string
): Promise<CapacitorOAuthBrowserResult> {
  const { Browser } = await import("@capacitor/browser");
  attachBrowserFinishedListener();

  oauthBrowserOpen = true;
  console.info("[oauth-start] open Capacitor Browser", url);
  await Browser.open({ url });
  return { ok: true };
}

async function openOAuthWithNativeSession(
  url: string
): Promise<CapacitorOAuthBrowserResult> {
  oauthBrowserOpen = true;
  console.info("[oauth-start] open ASWebAuthenticationSession", url);

  try {
    const result = await ClassmateOAuth.startOAuth({ url });

    if (result.cancelled) {
      console.info("[oauth-return] oauth cancelled by user");
      finishOAuthBrowserFlow();
      return { ok: true, cancelled: true };
    }

    const callbackUrl = String(result.callbackUrl ?? "").trim();
    if (!callbackUrl) {
      finishOAuthBrowserFlow();
      return {
        ok: false,
        message: "認証結果を受け取れませんでした。",
      };
    }

    console.info("[oauth-return] native session callback", callbackUrl);
    const completed = await completeNativeOAuthReturn(callbackUrl);
    finishOAuthBrowserFlow();

    if (!completed) {
      return {
        ok: false,
        message: "ログイン処理に失敗しました。もう一度お試しください。",
      };
    }

    return { ok: true };
  } catch (error) {
    finishOAuthBrowserFlow();
    console.error("[oauth-start] native oauth session failed", error);
    throw error;
  }
}

/** Capacitor 上で Google OAuth を開く（iOS: ASWebAuthenticationSession） */
export async function openCapacitorOAuthBrowser(
  url: string
): Promise<CapacitorOAuthBrowserResult> {
  if (!isCapacitorNativeApp()) return { ok: false };

  if (oauthBrowserOpen) {
    console.info("[oauth-start] oauth flow already in progress");
    return { ok: true };
  }

  if (Capacitor.getPlatform() === "ios") {
    return openOAuthWithNativeSession(url);
  }

  try {
    return await openOAuthWithBrowserPlugin(url);
  } catch (error) {
    oauthBrowserOpen = false;
    console.error("[oauth-start] browser open failed", error);
    throw error;
  }
}

/** OAuth 完了後にアプリ内ブラウザを閉じる（Android Browser 用） */
export async function closeCapacitorOAuthBrowser(): Promise<void> {
  if (!isCapacitorNativeApp() || !oauthBrowserOpen) return;

  if (Capacitor.getPlatform() === "ios") {
    try {
      await ClassmateOAuth.cancelOAuth();
    } catch {
      // ignore
    }
    finishOAuthBrowserFlow();
    return;
  }

  oauthBrowserOpen = false;

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    console.info("[oauth-return] closed in-app browser");
  } catch {
    // already closed
  }
}

export function isCapacitorOAuthBrowserOpen(): boolean {
  return oauthBrowserOpen;
}
