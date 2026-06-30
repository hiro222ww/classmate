"use client";

import { useEffect } from "react";
import {
  isCapacitorNativeApp,
  navigateToWebAuthCallback,
} from "@/lib/capacitorClient";

/**
 * iOS/Capacitor: Google OAuth 後の classmate://auth/callback を受け取り、
 * WebView 内の https://classmate-room.com/auth/callback へ遷移する。
 * 通常 Web ブラウザでは何もしない。
 */
export default function CapacitorAuthReturnBoot() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let removeListener: (() => void) | undefined;

    void (async () => {
      const { App } = await import("@capacitor/app");

      const handleReturnUrl = (url: string) => {
        navigateToWebAuthCallback(url);
      };

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        handleReturnUrl(launch.url);
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        handleReturnUrl(event.url);
      });
      removeListener = () => {
        void listener.remove();
      };
    })();

    return () => {
      removeListener?.();
    };
  }, []);

  return null;
}
