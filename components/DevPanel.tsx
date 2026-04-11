"use client";

import { getDevUserKey, isDevMode } from "@/lib/devMode";

type DevPanelProps = {
  deviceId?: string;
  classId?: string;
  sessionId?: string;
  memberCount?: number;
  status?: string;
};

export function DevPanel({
  deviceId,
  classId,
  sessionId,
  memberCount,
  status,
}: DevPanelProps) {
  if (!isDevMode()) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        background: "#111",
        color: "#fff",
        padding: 12,
        borderRadius: 12,
        fontSize: 12,
        lineHeight: 1.6,
        maxWidth: 280,
        boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6 }}>DEV PANEL</div>
      <div>dev: {getDevUserKey() || "-"}</div>
      <div>device: {deviceId || "-"}</div>
      <div>class: {classId || "-"}</div>
      <div>session: {sessionId || "-"}</div>
      <div>members: {memberCount ?? "-"}</div>
      <div>status: {status || "-"}</div>
    </div>
  );
}