"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "@/lib/device";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import type { CurrentClassSnapshot } from "@/lib/currentClassTypes";

export type JoinedClassRow = {
  classId: string;
  name: string;
  topicKey: string | null;
  worldKey: string | null;
  topicTitle: string | null;
  statusLabel: string;
  sessionId: string | null;
};

export function joinedClassToSnapshot(row: JoinedClassRow): CurrentClassSnapshot {
  return {
    classId: row.classId,
    name: row.name,
    topicKey: row.topicKey,
    worldKey: row.worldKey,
    topicTitle: row.topicTitle,
    statusLabel: row.statusLabel,
    sessionId: row.sessionId,
    joinedAt: null,
  };
}

function mapApiRow(row: Record<string, unknown>): JoinedClassRow | null {
  const classId = String(row.class_id ?? row.id ?? "").trim();
  if (!classId) return null;
  return {
    classId,
    name: String(row.name ?? "").trim() || "所属クラス",
    topicKey: String(row.topic_key ?? "").trim() || null,
    worldKey: String(row.world_key ?? "").trim() || null,
    topicTitle: String(row.topic_title ?? "").trim() || null,
    statusLabel: String(row.status_label ?? "").trim() || "所属中",
    sessionId: String(row.session_id ?? "").trim() || null,
  };
}

/**
 * Lite mine-class list via `/api/class/mine?lite=1` (same contract as MineClient).
 */
export function useJoinedClasses(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<JoinedClassRow[]>([]);
  const [error, setError] = useState("");
  const deviceIdRef = useRef("");

  const reload = useCallback(async (idOverride?: string) => {
    const id = String(idOverride || deviceIdRef.current || getDeviceId()).trim();
    if (!id) {
      setLoading(false);
      setError("端末情報を取得できませんでした。");
      setClasses([]);
      return;
    }

    deviceIdRef.current = id;
    setDeviceId(id);
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ deviceId: id, lite: "1" });
      const res = await fetch(`/api/class/mine?${qs.toString()}`, {
        cache: "no-store",
        headers: await buildDeviceAuthHeaders(id),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json.classes)) {
        setClasses([]);
        setError("所属クラスを読み込めませんでした。");
        return;
      }

      const next = (json.classes as Record<string, unknown>[])
        .map(mapApiRow)
        .filter(Boolean) as JoinedClassRow[];
      setClasses(next);
    } catch {
      setClasses([]);
      setError("所属クラスを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void reload(getDeviceId());
  }, [enabled, reload]);

  return {
    deviceId,
    loading,
    classes,
    error,
    reload,
    setError,
  };
}
