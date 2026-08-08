"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  DEFAULT_OPS_TEST_FLAGS,
  type OpsTestFlags,
  normalizeOpsTestFlags,
} from "@/lib/opsTestModeShared";

export function useDashboardAccountStatus(_deviceId: string) {
  const { ready, loggedIn, accountLabel, refresh: refreshAuth } = useAuth();
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [opsTestFlags, setOpsTestFlags] = useState<OpsTestFlags>({
    ...DEFAULT_OPS_TEST_FLAGS,
  });

  const refreshAdmin = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const authenticated = res.ok && json?.authenticated === true;
      setAdminAuthenticated(authenticated);
      setOpsTestFlags(
        authenticated
          ? normalizeOpsTestFlags(json?.opsTest)
          : { ...DEFAULT_OPS_TEST_FLAGS }
      );
    } catch {
      setAdminAuthenticated(false);
      setOpsTestFlags({ ...DEFAULT_OPS_TEST_FLAGS });
    }
  }, []);

  const refresh = useCallback(async () => {
    await refreshAuth({ soft: true });
    await refreshAdmin();
  }, [refreshAuth, refreshAdmin]);

  useEffect(() => {
    void refreshAdmin();
  }, [refreshAdmin, loggedIn]);

  return {
    ready,
    loggedIn,
    accountLabel,
    adminAuthenticated,
    opsTestFlags,
    refresh,
  };
}
