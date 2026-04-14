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

  const params = new URLSearchParams(window.location.search);
  const hasDevInUrl = params.has("dev");

  if (hasDevInUrl) return null;

  function handleUnlock() {
    const ok = unlockAdmin(password);

    if (!ok) {
      setError("パスワード違う");
      return;
    }

    setError("");
    setPassword("");
    setAdminUnlocked(true);
    setDev(getStoredDevUserKey());
  }

  function handleLock() {
    lockAdmin();
    setAdminUnlocked(false);
    setDev("");
    setError("");
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
        minWidth: 180,
        boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ fontWeight: 900 }}>DEV</div>

      {!adminUnlocked ? (
        <>
          <input
            type="password"
            placeholder="ADMIN_PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

          <button
            onClick={handleLock}
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
            ロック
          </button>
        </>
      )}
    </div>
  );
}