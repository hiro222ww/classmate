"use client";

import { isDevMode, getDevUserKey } from "@/lib/devMode";

export function DevBanner() {
  if (!isDevMode()) return null;

  const dev = getDevUserKey();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 28,
        background: "linear-gradient(90deg, #ef4444, #f59e0b)",
        color: "#fff",
        fontWeight: 900,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        letterSpacing: 1,
      }}
    >
      🚧 DEV MODE {dev ? `(${dev})` : ""}
    </div>
  );
}