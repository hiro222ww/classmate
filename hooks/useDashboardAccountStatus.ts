"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export function useDashboardAccountStatus(_deviceId: string) {
  const { ready, loggedIn, accountLabel, refresh: refreshAuth } = useAuth();
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  const refreshAdmin = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      setAdminAuthenticated(res.ok && json?.authenticated === true);
    } catch {
      setAdminAuthenticated(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await refreshAuth({ soft: true });
    await refreshAdmin();
  }, [refreshAuth, refreshAdmin]);

  useEffect(() => {
    void refreshAdmin();
  }, [refreshAdmin, loggedIn]);

  return { ready, loggedIn, accountLabel, adminAuthenticated, refresh };
}
