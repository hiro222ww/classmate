"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveAvatarPhotoSrc } from "@/lib/avatarUrl";

const AVATAR_LOAD_RETRY_LIMIT = 1;
const AVATAR_LOAD_RETRY_MS = 700;

/**
 * Resolve avatar img src with soft failure handling.
 * - Prefer photoPath over avatarUrl (see resolveAvatarPhotoSrc).
 * - Retry once on transient load errors (e.g. brief 404 after upload).
 * - Only permanently fall back to the default mark after retries are exhausted.
 * - Changing photoPath/avatarUrl resets failure state.
 * - iOS Safari may skip `onLoad` for HTTP-cached images; `imgRef` + complete
 *   check marks those as loaded so opacity is not stuck at 0.
 */
export function useAvatarPhotoSrc(params: {
  photoPath?: string | null;
  avatarUrl?: string | null;
}) {
  const { photoPath = null, avatarUrl = null } = params;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const imgNodeRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setRetryCount(0);
    setRetryNonce(0);
    retryCountRef.current = 0;
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [avatarUrl, photoPath]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const baseSrc = useMemo(
    () => resolveAvatarPhotoSrc({ photoPath, avatarUrl }),
    [avatarUrl, photoPath]
  );

  const photoSrc = useMemo(() => {
    if (failed || !baseSrc) return null;
    if (retryNonce <= 0) return baseSrc;
    const sep = baseSrc.includes("?") ? "&" : "?";
    return `${baseSrc}${sep}r=${retryNonce}`;
  }, [baseSrc, failed, retryNonce]);

  const markLoadedIfComplete = useCallback((node: HTMLImageElement | null) => {
    if (!node) return;
    // Cached images on iOS Safari often skip the load event.
    if (node.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!photoSrc) return;
    markLoadedIfComplete(imgNodeRef.current);
  }, [photoSrc, markLoadedIfComplete]);

  const imgRef = useCallback(
    (node: HTMLImageElement | null) => {
      imgNodeRef.current = node;
      markLoadedIfComplete(node);
    },
    [markLoadedIfComplete]
  );

  const showPhoto = Boolean(photoSrc) && loaded;

  const onLoad = () => {
    setLoaded(true);
  };

  const onError = () => {
    setLoaded(false);
    if (retryCountRef.current < AVATAR_LOAD_RETRY_LIMIT) {
      retryCountRef.current += 1;
      const next = retryCountRef.current;
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
      }
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setRetryCount(next);
        setRetryNonce((n) => n + 1);
      }, AVATAR_LOAD_RETRY_MS);
      return;
    }
    setFailed(true);
  };

  return { photoSrc, showPhoto, onLoad, onError, failed, retryCount, imgRef };
}
