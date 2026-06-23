"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCurrentClass } from "@/lib/fetchCurrentClass";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";

export function useCurrentClass(deviceId: string) {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CurrentClassSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = String(deviceId ?? "").trim();
    if (!id) {
      setLoading(false);
      setCurrent(null);
      setError(null);
      return;
    }

    setLoading(true);
    const result = await fetchCurrentClass(id);
    setLoading(false);
    setError(result.ok ? null : result.error ?? "current_class_failed");
    setCurrent(result.current);
  }, [deviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    current,
    error,
    hasMembership: Boolean(current),
    refresh,
  };
}
