"use client";

import { useEffect, useRef } from "react";
import {
  isCapacitorNativeApp,
  isNativeAuthCallbackUrl,
  navigateToWebAuthCallback,
  retryPendingNativeAuthReturn,
} from "@/lib/capacitorClient";
import { closeCapacitorOAuthBrowser } from "@/lib/capacitorOAuthBrowser";
import { markAppShellContext } from "@/lib/appShellContext";

/**
 * iOS/Capacitor: Google OAuth 後の classmate://auth/callback を受け取り、
 * WebView 内の https://classmate-room.com/auth/callback へ遷移する。
 * ネイティブ WebView.load は使わず、ここだけで橋渡しする（二重 load 防止）。
 */
export default function CapacitorAuthReturnBoot() {
  const handledLaunchRef = useRef(false);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    markAppShellContext();

    let removeListener: (() => void) | undefined;

    const handleReturnUrl = (url: string, source: string) => {
      if (!isNativeAuthCallbackUrl(url)) return;
      console.info("[oauth-return] received", source, url);
      void closeCapacitorOAuthBrowser();
      navigateToWebAuthCallback(url);
    };

    const retryPendingReturn = (source: string) => {
      if (retryPendingNativeAuthReturn()) {
        console.info("[oauth-return] retried pending url", source);
      }
    };

    void (async () => {
      const { App } = await import("@capacitor/app");

      const launch = await App.getLaunchUrl();
      if (launch?.url && !handledLaunchRef.current) {
        handledLaunchRef.current = true;
        handleReturnUrl(launch.url, "getLaunchUrl");
      } else {
        retryPendingReturn("mount");
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        handleReturnUrl(event.url, "appUrlOpen");
      });

      const stateListener = await App.addListener("appStateChange", (state) => {
        if (state.isActive) {
          retryPendingReturn("appStateChange");
        }
      });

      removeListener = () => {
        void listener.remove();
        void stateListener.remove();
      };
    })();

    return () => {
      removeListener?.();
    };
  }, []);

  return null;
}
