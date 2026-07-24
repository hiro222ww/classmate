"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";
import { withDev } from "@/lib/withDev";

export function useRequireAccount(returnTo: string) {
  const router = useRouter();
  const { ready, loggedIn, status } = useAuth();

  useEffect(() => {
    if (status === "loading") return;
    if (!loggedIn) {
      router.replace(withDev(buildShellAwareLoginUrl(returnTo)));
    }
  }, [status, loggedIn, returnTo, router]);

  return { ready, loggedIn, status };
}
