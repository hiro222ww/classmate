"use client";

import { Capacitor } from "@capacitor/core";
import {
  isCapacitorNativeApp,
  navigateToWebAuthCallback,
} from "@/lib/capacitorClient";
import { ClassmateOAuth } from "@/lib/classmateOAuthNative";

let oauthBrowserOpen = false;
let browserFinishedListenerAttached = false;

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

async function openOAuthWithBrowserPlugin(url: string): Promise<boolean> {
  const { Browser } = await import("@capacitor/browser");
  attachBrowserFinishedListener();

  oauthBrowserOpen = true;
  console.info("[oauth-start] open Capacitor Browser", url);
  await Browser.open({ url });
  return true;
}

async function openOAuthWithNativeSession(url: string): Promise<boolean> {
  oauthBrowserOpen = true;
  console.info("[oauth-start] open ASWebAuthenticationSession", url);

  try {
    const result = await ClassmateOAuth.startOAuth({ url });

    if (result.cancelled) {
      console.info("[oauth-return] oauth cancelled by user");
      finishOAuthBrowserFlow();
      return true;
    }

    const callbackUrl = String(result.callbackUrl ?? "").trim();
    if (!callbackUrl) {
      finishOAuthBrowserFlow();
      return false;
    }

    console.info("[oauth-return] native session callback", callbackUrl);
    navigateToWebAuthCallback(callbackUrl);
    finishOAuthBrowserFlow();
    return true;
  } catch (error) {
    finishOAuthBrowserFlow();
    console.error("[oauth-start] native oauth session failed", error);
    throw error;
  }
}

/** Capacitor 上で Google OAuth を開く（iOS: ASWebAuthenticationSession） */
export async function openCapacitorOAuthBrowser(url: string): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  if (oauthBrowserOpen) {
    console.info("[oauth-start] oauth flow already in progress");
    return true;
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
