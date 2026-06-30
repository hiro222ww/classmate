"use client";

import { useEffect, useRef } from "react";
import {
  isCapacitorNativeApp,
  isNativeAuthCallbackUrl,
  navigateToWebAuthCallback,
} from "@/lib/capacitorClient";

/**
 * iOS/Capacitor: Google OAuth 後の classmate://auth/callback を受け取り、
 * WebView 内の https://classmate-room.com/auth/callback へ遷移する。
 * ネイティブ WebView.load は使わず、ここだけで橋渡しする（二重 load 防止）。
 */
export default function CapacitorAuthReturnBoot() {
  const handledLaunchRef = useRef(false);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let removeListener: (() => void) | undefined;

    const handleReturnUrl = (url: string, source: string) => {
      if (!isNativeAuthCallbackUrl(url)) return;
      console.info("[oauth-return] received", source, url);
      navigateToWebAuthCallback(url);
    };

    void (async () => {
      const { App } = await import("@capacitor/app");

      const launch = await App.getLaunchUrl();
      if (launch?.url && !handledLaunchRef.current) {
        handledLaunchRef.current = true;
        handleReturnUrl(launch.url, "getLaunchUrl");
      }

      const listener = await App.addListener("appUrlOpen", (event) => {
        handleReturnUrl(event.url, "appUrlOpen");
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
