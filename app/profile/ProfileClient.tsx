"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { isDevFeatureEnabled } from "@/lib/devMode";
import { supabase } from "@/lib/supabaseClient";

type Gender = "male" | "female";

type Profile = {
  device_id: string;
  display_name: string;
  birth_date: string;
  gender: Gender;
  photo_path: string | null;
};

type ProfileResponse = {
  ok?: boolean;
  profile?: Profile | null;
  error?: string;
  message?: string;
};

function isValidISODateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = s.split("-").map((n) => Number(n));
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

function calcAge(birthDate: string): number | null {
  if (!birthDate || !isValidISODateString(birthDate)) return null;

  const today = new Date();
  const birth = new Date(birthDate);

  let age = today.getFullYear() - birth.getFullYear();
  const mm = today.getMonth() - birth.getMonth();
  if (mm < 0 || (mm === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getDisplayNameStorageKeys(deviceId: string) {
  const normalized = String(deviceId ?? "").trim();

  if (!normalized) {
    return {
      scoped: "classmate_display_name",
      legacy: "display_name",
    };
  }

  return {
    scoped: `classmate_display_name:${normalized}`,
    legacy: `display_name:${normalized}`,
  };
}

function writeStoredDisplayName(deviceId: string, name: string) {
  if (typeof window === "undefined") return;

  const normalizedName = String(name ?? "").trim();
  const { scoped, legacy } = getDisplayNameStorageKeys(deviceId);

  localStorage.setItem(scoped, normalizedName);
  localStorage.setItem(legacy, normalizedName);
}

function getAvatarUrl(photoPath?: string | null) {
  let normalized = String(photoPath ?? "").trim();

  if (!normalized) return "/default-avatar.jpg";

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return normalized;
  }

  if (normalized.startsWith("profile-photos/")) {
    normalized = normalized.replace(/^profile-photos\//, "");
  }

  if (normalized.startsWith("avatars/")) {
    normalized = normalized.replace(/^avatars\//, "");
  }

  const { data } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(normalized);

  const publicUrl = data?.publicUrl?.trim();
  if (!publicUrl) return "/default-avatar.jpg";

  return `${publicUrl}?t=${encodeURIComponent(normalized)}`;
}

export default function ProfileClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchKey = searchParams.toString();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `dev=${encodeURIComponent(dev)}` : "";

  const withDev = (path: string) => {
    if (!devQuery) return path;
    return `${path}${path.includes("?") ? "&" : "?"}${devQuery}`;
  };

  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [guardianConsent, setGuardianConsent] = useState(false);

  const [termsAgreed, setTermsAgreed] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const age = useMemo(() => calcAge(birthDate), [birthDate]);
  const isMinor = age !== null && age < 18;
  const isAdult = age !== null && age >= 18;
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const canSubmit =
    displayName.trim().length > 0 &&
    isValidISODateString(birthDate) &&
    (gender === "male" || gender === "female") &&
    isAdult &&
    termsAgreed &&
    !submitting;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const id = getDeviceId();

      if (cancelled) return;

      setDeviceId(id);
      setLoading(true);
      setErrorMsg("");
      setDisplayName("");
      setBirthDate("");
      setGender("male");
      setGuardianConsent(false);
      setTermsAgreed(false);
      setPhotoFile(null);
      setPhotoPath(null);

      try {
        const res = await fetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const json = (await res.json().catch(() => null)) as ProfileResponse | null;
        const profile = json?.profile ?? null;

        if (cancelled || !profile) return;

        setDisplayName(profile.display_name ?? "");
        setBirthDate(
          isValidISODateString(profile.birth_date) ? profile.birth_date : ""
        );
        setGender((profile.gender as Gender) ?? "male");
        setPhotoPath(profile.photo_path ?? null);

        console.log("[profile] loaded profile", {
          requestedDeviceId: id,
          returnedDeviceId: profile.device_id ?? null,
          displayName: profile.display_name ?? null,
          photo_path: profile.photo_path ?? null,
          dev,
        });
      } catch (e) {
        console.error("[profile] load failed", e);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [searchKey, dev]);

  const localPreviewUrl = useMemo(() => {
    if (!photoFile) return "";
    return URL.createObjectURL(photoFile);
  }, [photoFile]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const previewUrl = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;
    if (photoPath) return getAvatarUrl(photoPath);
    return "/default-avatar.jpg";
  }, [localPreviewUrl, photoPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!displayName.trim()) {
      setErrorMsg("ニックネームを入力してください。");
      return;
    }

    if (!isValidISODateString(birthDate)) {
      setErrorMsg("生年月日を正しく入力してください。");
      return;
    }

    if (gender !== "male" && gender !== "female") {
      setErrorMsg("性別を選択してください。");
      return;
    }

    if (!isAdult) {
      setErrorMsg("現在は18歳以上の方のみご利用いただけます。");
      return;
    }

    if (!termsAgreed) {
      setErrorMsg("利用規約への同意が必要です。");
      return;
    }

    if (!deviceId) {
      setErrorMsg("deviceId の取得に失敗しました。");
      return;
    }

    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("device_id", deviceId);
      fd.append("display_name", displayName.trim());
      fd.append("birth_date", birthDate);
      fd.append("gender", gender);
      fd.append("terms_agreed", termsAgreed ? "true" : "false");
      fd.append("guardian_consent", isMinor && guardianConsent ? "true" : "false");

      if (photoFile) {
        fd.append("photo", photoFile);
      }

      const res = await fetch("/api/profile", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        setErrorMsg(`保存に失敗しました。${msg ? `（${msg}）` : ""}`);
        return;
      }

      const json = await res.json().catch(() => null);

      const nextPhotoPath =
        String(json?.profile?.photo_path ?? "").trim() ||
        String(json?.photo_path ?? "").trim() ||
        photoPath ||
        null;

      console.log("[profile] submit ok", {
        deviceId,
        nextPhotoPath,
      });

      setPhotoPath(nextPhotoPath);
      setPhotoFile(null);

      writeStoredDisplayName(deviceId, displayName.trim());

      alert("プロフィールを保存しました");
      router.push(withDev("/class/select"));
    } catch (e) {
      console.error("[profile] submit failed", e);
      setErrorMsg("保存に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      {isDevFeatureEnabled() && (
        <div
          style={{
            padding: 10,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            borderRadius: 10,
            fontSize: 12,
            color: "#92400e",
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 800 }}>DEV STATUS</div>
          <div>dev: {dev || "-"}</div>
          <div>deviceId: {deviceId || "-"}</div>
          <div>photoPath: {photoPath || "-"}</div>
          <div>hasPhotoFile: {photoFile ? "yes" : "no"}</div>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: 10,
            border: "1px solid #f5c2c7",
            background: "#f8d7da",
            borderRadius: 10,
          }}
        >
          <p style={{ margin: 0, color: "#842029" }}>{errorMsg}</p>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>ニックネーム（必須）</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例：たろう"
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          required
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>生年月日（必須）</label>
        <input
          type="date"
          value={birthDate}
          onChange={(e) => {
            setBirthDate(e.target.value);
            setGuardianConsent(false);
            setErrorMsg("");
          }}
          max={todayISO}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          required
        />

        {age !== null && <p style={{ margin: 0, color: "#555" }}>年齢：{age}歳</p>}

        {isMinor && (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 10,
              borderRadius: 12,
              border: "1px solid #ffeeba",
              background: "#fff3cd",
            }}
          >
            <div style={{ fontWeight: 800, color: "#664d03" }}>
              現在は18歳以上のみ利用できます
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#664d03",
              }}
            >
              <input
                type="checkbox"
                checked={guardianConsent}
                onChange={(e) => setGuardianConsent(e.target.checked)}
              />
              保護者の同意を得ています（将来用）
            </label>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>性別（必須）</label>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          required
        >
          <option value="male">男性</option>
          <option value="female">女性</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>プロフィール写真（任意）</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            setPhotoFile(next);
          }}
        />

        <img
          src={previewUrl}
          alt="preview"
          onError={(e) => {
            console.log("[profile preview ng]", {
              photoPath,
              previewUrl,
            });
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/default-avatar.jpg";
          }}
          onLoad={() => {
            console.log("[profile preview ok]", {
              photoPath,
              previewUrl,
            });
          }}
          style={{
            width: 120,
            height: 120,
            objectFit: "cover",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#f3f4f6",
          }}
        />
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "#fafafa",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            lineHeight: 1.6,
          }}
        >
          <input
            type="checkbox"
            checked={termsAgreed}
            onChange={(e) => setTermsAgreed(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <Link href="/terms" target="_blank" style={{ textDecoration: "underline" }}>
              利用規約
            </Link>
            に同意します
          </span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: "10px 14px",
            border: "none",
            borderRadius: 10,
            background: canSubmit ? "#111" : "#ccc",
            color: "#fff",
            fontWeight: 800,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "保存中..." : "保存する"}
        </button>

        <button
          type="button"
          onClick={() => router.push(withDev("/class/select"))}
          style={{
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: 10,
            background: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          戻る
        </button>
      </div>
    </form>
  );
}