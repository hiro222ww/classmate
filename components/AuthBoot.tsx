"use client";

import { useEffect, useRef } from "react";
import { getDeviceId } from "@/lib/device";
import { bootstrapAuthSession } from "@/lib/authClient";

export default function AuthBoot() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const deviceId = getDeviceId();
    if (!deviceId) return;

    void bootstrapAuthSession(deviceId).catch((error) => {
      console.error("[auth] bootstrap failed", error);
    });
  }, []);

  return null;
}
