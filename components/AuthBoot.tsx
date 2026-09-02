"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { bootstrapAuthSession, isAuthCallbackInProgress } from "@/lib/authClient";
import { shouldSkipAuthBootstrapForPath } from "@/lib/adminChromePath";

export default function AuthBoot() {
  const pathname = usePathname();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (shouldSkipAuthBootstrapForPath(pathname)) return;
    if (isAuthCallbackInProgress()) return;

    startedRef.current = true;

    const deviceId = getDeviceId();
    if (!deviceId) return;

    void bootstrapAuthSession(deviceId)
      .then((result) => {
        if (
          !result.ok &&
          result.action === "restore_login" &&
          typeof window !== "undefined"
        ) {
          try {
            sessionStorage.setItem(
              "classmate_auth_restore_hint",
              JSON.stringify({
                at: Date.now(),
                error: result.error,
                message: result.message ?? null,
              })
            );
          } catch {
            // ignore storage errors
          }
        }
      })
      .catch((error) => {
        console.error("[auth] bootstrap failed", error);
      });
  }, [pathname]);

  return null;
}
