"use client";

import { useEffect, useState } from "react";
import {
  isDevFeatureEnabled,
  isAdminUnlocked,
  unlockAdmin,
  lockAdmin,
  getDevUserKeyFromUrl,
  getStoredDevUserKey,
  setDevUserKey,
} from "@/lib/devMode";

export function DevModeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [dev, setDev] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);

    const unlocked = isAdminUnlocked();
    setAdminUnlocked(unlocked);

    const fromUrl = getDevUserKeyFromUrl();
    const stored = unlocked ? getStoredDevUserKey() : "";
    setDev(fromUrl || stored || "");
  }, []);

  if (!isDevFeatureEnabled()) return null;
  if (!mounted) return null;

  function handleUnlock() {
    const ok = unlockAdmin(password);

    if (!ok) {
      setError("パスワード違う");
      return;
    }

    setError("");
    setPassword("");
    setAdminUnlocked(true);

    const fromUrl = getDevUserKeyFromUrl();
    const stored = getStoredDevUserKey();
    setDev(fromUrl || stored || "");
  }

  function handleLock() {
    lockAdmin();
    setAdminUnlocked(false);
    setPassword("");
    setError("");
    setDev("");
  }

  function handleDevChange(v: string) {
    setDev(v);
    setDevUserKey(v);

    const url = new URL(window.location.href);

    if (v) {
      url.searchParams.set("dev", v);
    } else {
      url.searchParams.delete("dev");
    }

    window.location.href = url.toString();
  }

  const currentLabel = dev ? `dev=${dev}` : "通常";

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 9999,
        background: "#111",
        color: "#fff",
        padding: 12,
        borderRadius: 12,
        display: "grid",
        gap: 8,
        minWidth: 220,
        boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>DEV</span>
        {adminUnlocked ? (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: "#22c55e",
              color: "#052e16",
              fontWeight: 900,
            }}
          >
            {currentLabel}
          </span>
        ) : null}
      </div>

      {!adminUnlocked ? (
        <>
          <input
            type="password"
            placeholder="ADMIN_PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleUnlock();
              }
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#222",
              color: "#fff",
            }}
          />
          <button
            onClick={handleUnlock}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#333",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            開発モード解除
          </button>
          {error ? (
            <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#d1d5db" }}>
            現在: <b>{currentLabel}</b>
          </div>

          <select
            value={dev}
            onChange={(e) => handleDevChange(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#222",
              color: "#fff",
            }}
          >
            <option value="">通常</option>
            <option value="1">dev=1</option>
            <option value="2">dev=2</option>
            <option value="3">dev=3</option>
            <option value="4">dev=4</option>
            <option value="5">dev=5</option>
          </select>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <button
              onClick={() => handleDevChange("")}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#222",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              通常に戻す
            </button>

            <button
              onClick={handleLock}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #7f1d1d",
                background: "#3f0d0d",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ロック
            </button>
          </div>
        </>
      )}
    </div>
  );
}