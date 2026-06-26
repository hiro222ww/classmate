"use client";

import { useCallback, useEffect, useState } from "react";
import {
  accountStatusLabel,
  isLoggedInAccount,
} from "@/lib/authAccount";
import { bootstrapAuthSession, fetchAuthStatus } from "@/lib/authClient";
import { supabaseAuthClient } from "@/lib/authClient";
import { getDeviceId } from "@/lib/device";

export function useDashboardAccountStatus(deviceId: string) {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [accountLabel, setAccountLabel] = useState("Google でログイン");
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  const refresh = useCallback(async () => {
    const id = String(getDeviceId() ?? deviceId ?? "").trim();
    if (!id) {
      setLoggedIn(false);
      setAccountLabel("Google でログイン");
      setAdminAuthenticated(false);
      setReady(true);
      return;
    }

    try {
      await bootstrapAuthSession(id);
      const json = await fetchAuthStatus(id);
      if (json) {
        const status = {
          isAnonymous: Boolean(json.isAnonymous),
          hasLinkedEmail: Boolean(json.hasLinkedEmail),
          email: json.email ?? null,
        };
        const ok = isLoggedInAccount(status);
        setLoggedIn(ok);
        setAccountLabel(ok ? accountStatusLabel(status) : "Google でログイン");
      } else {
        setLoggedIn(false);
        setAccountLabel("Google でログイン");
      }
    } catch {
      setLoggedIn(false);
      setAccountLabel("Google でログイン");
    }

    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      setAdminAuthenticated(res.ok && json?.authenticated === true);
    } catch {
      setAdminAuthenticated(false);
    } finally {
      setReady(true);
    }
  }, [deviceId]);

  useEffect(() => {
    setReady(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseAuthClient.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        void refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return { ready, loggedIn, accountLabel, adminAuthenticated, refresh };
}
