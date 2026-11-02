"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { fetchSelfProfile } from "@/lib/fetchCurrentClass";

/**
 * Shared self photo_path for account menus / headers.
 *
 * Rules:
 * - Classmate `photo_path` is the source of truth (not derived avatar_url).
 * - Never clear a known-good photo while a refresh is in flight.
 * - Ignore stale responses so an older null/error cannot overwrite a newer hit.
 * - Only clear on device identity change (auth/device switch).
 */
export function useSelfProfilePhoto(deviceId?: string | null) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fetchGenRef = useRef(0);
  const deviceKey = String(deviceId ?? "").trim();

  const reload = useCallback(async (idOverride?: string) => {
    const id = String(idOverride || deviceKey || getDeviceId() || "").trim();
    const gen = ++fetchGenRef.current;

    if (!id) {
      if (gen !== fetchGenRef.current) return;
      setPhotoPath(null);
      setDisplayName(null);
      setLoaded(true);
      return;
    }

    const result = await fetchSelfProfile(id);
    if (gen !== fetchGenRef.current) return;

    if (!result.ok) {
      // Keep last good photo on transient fetch failure.
      setLoaded(true);
      return;
    }

    const path = String(result.profile?.photo_path ?? "").trim() || null;
    const name = String(result.profile?.display_name ?? "").trim() || null;
    // Successful empty photo must not wipe a known-good path (stale/partial
    // profile rows). Clear only on deviceKey change in the effect below.
    setPhotoPath((prev) => path || prev || null);
    setDisplayName((prev) => name || prev || null);
    setLoaded(true);
  }, [deviceKey]);

  useEffect(() => {
    fetchGenRef.current += 1;
    setLoaded(false);
    // Clear only when the device identity changes so another user's image
    // cannot linger — not on every reload() call.
    setPhotoPath(null);
    setDisplayName(null);
    void reload();
  }, [deviceKey, reload]);

  return { photoPath, displayName, loaded, reload };
}
