"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { fetchSelfProfile } from "@/lib/fetchCurrentClass";

/**
 * Shared self photo_path for account menus / headers.
 * Clears on device change so auth switches cannot leak another user's image.
 */
export function useSelfProfilePhoto(deviceId?: string | null) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (idOverride?: string) => {
    const id = String(idOverride || deviceId || getDeviceId() || "").trim();
    if (!id) {
      setPhotoPath(null);
      setDisplayName(null);
      setLoaded(true);
      return;
    }
    const result = await fetchSelfProfile(id);
    if (!result.ok) {
      setPhotoPath(null);
      setDisplayName(null);
      setLoaded(true);
      return;
    }
    const path = String(result.profile?.photo_path ?? "").trim() || null;
    const name = String(result.profile?.display_name ?? "").trim() || null;
    setPhotoPath(path);
    setDisplayName(name);
    setLoaded(true);
  }, [deviceId]);

  useEffect(() => {
    setLoaded(false);
    setPhotoPath(null);
    setDisplayName(null);
    void reload();
  }, [reload]);

  return { photoPath, displayName, loaded, reload };
}
