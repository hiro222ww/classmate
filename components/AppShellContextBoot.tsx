"use client";

import { useEffect } from "react";
import { markAppShellContext } from "@/lib/appShellContext";

/** Capacitor 起動後も Room/Call 遷移でアプリ文脈を維持する */
export default function AppShellContextBoot() {
  useEffect(() => {
    markAppShellContext();
  }, []);

  return null;
}
