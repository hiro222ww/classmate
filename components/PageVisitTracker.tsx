"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import {
  PAGE_VISIT_CLIENT_DEDUPE_MS,
  isBotUserAgent,
  normalizePageVisitPath,
  shouldTrackPagePath,
} from "@/lib/pageVisit";

const STORAGE_PREFIX = "cm_page_visit:";

function clientDedupeKey(path: string) {
  return `${STORAGE_PREFIX}${path}`;
}

function shouldSendClient(path: string, nowMs: number): boolean {
  try {
    const raw = sessionStorage.getItem(clientDedupeKey(path));
    const prev = Number(raw ?? "");
    if (Number.isFinite(prev) && nowMs - prev < PAGE_VISIT_CLIENT_DEDUPE_MS) {
      return false;
    }
    sessionStorage.setItem(clientDedupeKey(path), String(nowMs));
  } catch {
    // ignore storage failures
  }
  return true;
}

async function recordVisit(pathname: string) {
  const path = normalizePageVisitPath(pathname);
  if (!shouldTrackPagePath(path)) return;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (isBotUserAgent(ua)) return;

  const nowMs = Date.now();
  if (!shouldSendClient(path, nowMs)) return;

  const deviceId = getDeviceId();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (deviceId) {
    Object.assign(headers, await buildDeviceAuthHeaders(deviceId));
  }

  const referrer =
    typeof document !== "undefined" ? String(document.referrer || "") : "";

  await fetch("/api/page-visit", {
    method: "POST",
    headers,
    body: JSON.stringify({
      path,
      deviceId: deviceId || undefined,
      referrer: referrer || undefined,
    }),
    keepalive: true,
    cache: "no-store",
  }).catch(() => {
    // ignore network errors
  });
}

export default function PageVisitTracker() {
  const pathname = usePathname();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    const path = normalizePageVisitPath(pathname);
    if (!path || path === lastPathRef.current) return;
    lastPathRef.current = path;
    void recordVisit(path);
  }, [pathname]);

  return null;
}
