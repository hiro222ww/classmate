"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { fetchAuthStatus } from "@/lib/authClient";
import { isLoggedInAccount } from "@/lib/authAccount";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { withDev } from "@/lib/withDev";

export function useRequireAccount(returnTo: string) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const deviceId = getDeviceId();
        if (!deviceId) {
          if (!cancelled) {
            setLoggedIn(false);
            router.replace(withDev(buildShellAwareLoginUrl(returnTo)));
            setReady(true);
          }
          return;
        }

        const status = await fetchAuthStatus(deviceId);
        const ok = isLoggedInAccount(status);
        if (!cancelled) {
          setLoggedIn(ok);
          if (!ok) {
            router.replace(withDev(buildShellAwareLoginUrl(returnTo)));
          }
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setLoggedIn(false);
          router.replace(withDev(buildShellAwareLoginUrl(returnTo)));
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [returnTo, router]);

  return { ready, loggedIn };
}
