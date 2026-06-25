"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { isDevFeatureEnabled } from "@/lib/devMode";
import { supabase } from "@/lib/supabaseClient";
import {
  isUserProfileComplete,
  isValidProfileGender,
} from "@/lib/profileClient";
import {
  adultOnlyUserMessage,
  guardianConsentRequiredMessage,
  resolveMinorsEnabledFromSettings,
  ADULT_AGE_THRESHOLD,
} from "@/lib/agePolicyRules";
import {
  buildProfileEditPath,
  sanitizeReturnTo,
} from "@/lib/profileNavigation";
import {
  LegalConsentCheckbox,
  LegalDocumentLinks,
} from "@/components/LegalDocumentLinks";
import Link from "next/link";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

type Gender = "male" | "female" | "";

type LegalConsentInfo = {
  valid?: boolean;
  needs_reconsent?: boolean;
  version?: string | null;
};

type Profile = {
  device_id: string;
  display_name: string;
  birth_date: string;
  gender: Gender;
  photo_path: string | null;
  hobbies?: string | null;
  bio?: string | null;
  show_age?: boolean | null;
  legal_consent?: LegalConsentInfo | null;
};

type ProfileResponse = {
  ok?: boolean;
  profile?: Profile | null;
  error?: string;
  message?: string;
};

const MAX_PHOTO_MB = 8;
const TARGET_PHOTO_SIZE = 1024;
const TARGET_PHOTO_QUALITY = 0.82;

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

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }

  if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
    throw new Error(
      `画像が大きすぎます。${MAX_PHOTO_MB}MB以下の画像を選んでください。`
    );
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const img = new Image();
    img.src = imageUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    });

    const originalWidth = img.naturalWidth || img.width;
    const originalHeight = img.naturalHeight || img.height;

    if (!originalWidth || !originalHeight) {
      throw new Error("画像サイズを取得できませんでした。");
    }

    const scale = Math.min(
      1,
      TARGET_PHOTO_SIZE / Math.max(originalWidth, originalHeight)
    );

    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("画像の圧縮に失敗しました。");
    }

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", TARGET_PHOTO_QUALITY);
    });

    if (!blob) {
      throw new Error("画像の圧縮に失敗しました。");
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "profile";
    const compressedName = `${baseName}.jpg`;

    return new File([blob], compressedName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
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

  const returnTo = useMemo(
    () => sanitizeReturnTo(searchParams.get("returnTo")),
    [searchParams]
  );

  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [hobbies, setHobbies] = useState("");
  const [bio, setBio] = useState("");
  const [showAge, setShowAge] = useState(true);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [needsLegalConsent, setNeedsLegalConsent] = useState(true);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoInfo, setPhotoInfo] = useState("");

  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [minorsEnabled, setMinorsEnabled] = useState(false);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

  const age = useMemo(() => calcAge(birthDate), [birthDate]);
  const isMinor = age !== null && age < ADULT_AGE_THRESHOLD;
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const legalConsentOk = !needsLegalConsent || legalAgreed;

  const canSubmit =
    displayName.trim().length > 0 &&
    isValidISODateString(birthDate) &&
    (gender === "male" || gender === "female") &&
    legalConsentOk &&
    !compressing &&
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
      setGender("");
      setHobbies("");
      setBio("");
      setShowAge(true);
      setHasExistingProfile(false);
      setGuardianConsent(false);
      setLegalAgreed(false);
      setNeedsLegalConsent(true);
      setPhotoFile(null);
      setPhotoPath(null);
      setPhotoInfo("");

      try {
        const [profileRes, settingsRes] = await Promise.all([
          authenticatedFetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
            method: "GET",
            cache: "no-store",
          }),
          fetch("/api/settings", { cache: "no-store" }),
        ]);

        if (!settingsRes.ok) {
          setMinorsEnabled(false);
        } else {
          const settingsJson = (await settingsRes.json().catch(() => null)) as {
            minors_enabled?: boolean;
            settings?: { minors_enabled?: boolean };
          } | null;

          setMinorsEnabled(resolveMinorsEnabledFromSettings(settingsJson));
        }

        if (!profileRes.ok) return;

        const json = (await profileRes.json().catch(() => null)) as ProfileResponse | null;
        const profile = json?.profile ?? null;

        if (cancelled) return;

        if (!profile) {
          setNeedsLegalConsent(true);
          return;
        }

        setHasExistingProfile(isUserProfileComplete(profile));
        setNeedsLegalConsent(profile.legal_consent?.valid !== true);
        setDisplayName(profile.display_name ?? "");
        setBirthDate(
          isValidISODateString(profile.birth_date) ? profile.birth_date : ""
        );
        setGender(
          isValidProfileGender(profile.gender) ? profile.gender : ""
        );
        setHobbies(String(profile.hobbies ?? "").trim());
        setBio(String(profile.bio ?? "").trim());
        setShowAge(profile.show_age !== false);
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
        if (!cancelled) {
          setErrorMsg("プロフィールの読み込みに失敗しました。時間をおいて再度お試しください。");
        }
      } finally {
        if (!cancelled) setLoading(false);
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

  async function handlePhotoChange(file: File | null) {
    setErrorMsg("");
    setPhotoInfo("");

    if (!file) {
      setPhotoFile(null);
      return;
    }

    setCompressing(true);

    try {
      const beforeSize = file.size;
      const compressed = await compressImageFile(file);
      setPhotoFile(compressed);

      setPhotoInfo(
        `画像を圧縮しました：${formatBytes(beforeSize)} → ${formatBytes(
          compressed.size
        )}`
      );
    } catch (e: any) {
      console.error("[profile] photo compress failed", e);
      setPhotoFile(null);
      setErrorMsg(e?.message ?? "画像の処理に失敗しました。");
    } finally {
      setCompressing(false);
    }
  }

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

    if (!legalConsentOk) {
      setErrorMsg(
        "利用規約、プライバシーポリシー、コミュニティガイドラインへの同意が必要です。"
      );
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
      fd.append("hobbies", hobbies.trim());
      fd.append("bio", bio.trim());
      fd.append("show_age", showAge ? "true" : "false");
      fd.append("terms_agreed", needsLegalConsent && legalAgreed ? "true" : "false");
      fd.append("privacy_agreed", needsLegalConsent && legalAgreed ? "true" : "false");
      fd.append(
        "guidelines_agreed",
        needsLegalConsent && legalAgreed ? "true" : "false"
      );
      fd.append("guardian_consent", isMinor && guardianConsent ? "true" : "false");

      if (photoFile) {
        fd.append("photo", photoFile);
      }

      const res = await authenticatedFetch("/api/profile", {
        method: "POST",
        body: fd,
      });

      const raw = await res.text().catch(() => "");
      let json: any = null;

      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        if (
          json?.error === "minors_disabled" ||
          json?.error === "adult_only"
        ) {
          setErrorMsg(json?.message || adultOnlyUserMessage());
          return;
        }

        if (json?.error === "guardian_consent_required") {
          setErrorMsg(json?.message || guardianConsentRequiredMessage());
          return;
        }

        if (json?.error === "legal_consent_required") {
          setErrorMsg(
            "利用規約、プライバシーポリシー、コミュニティガイドラインへの同意が必要です。"
          );
          return;
        }

        const serverMsg =
          json?.message ||
          json?.error ||
          raw ||
          "サーバー側で保存に失敗しました。";

        setErrorMsg(`保存に失敗しました。${serverMsg}`);
        return;
      }

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
      setPhotoInfo("");
      setNeedsLegalConsent(false);
      setLegalAgreed(false);

      writeStoredDisplayName(deviceId, displayName.trim());

      alert("プロフィールを保存しました");
      router.push(withDev(returnTo));
    } catch (e: any) {
      console.error("[profile] submit failed", e);
      setErrorMsg(e?.message ?? "保存に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, opacity: 0.7, fontSize: 13, lineHeight: 1.6 }}>
        {hasExistingProfile
          ? "登録済みのプロフィールを更新できます。"
          : "ニックネーム・生年月日・性別を登録してください。"}
      </p>

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
          <div>photoFileSize: {photoFile ? formatBytes(photoFile.size) : "-"}</div>
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

      <p style={{ margin: 0, opacity: 0.7, fontSize: 13, lineHeight: 1.6 }}>
        {minorsEnabled !== true ? (
          adultOnlyUserMessage()
        ) : (
          <>
            {guardianConsentRequiredMessage()}
            <br />
            保護者の同意を得たうえでご利用ください。
          </>
        )}
      </p>

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
        <p style={{ margin: 0, color: "#6b7280", fontSize: 12, lineHeight: 1.6 }}>
          プロフィールには生年月日ではなく、年齢のみ表示されます。
        </p>

        {isMinor && minorsEnabled !== true && (
          <div
            style={{
              display: "grid",
              gap: 8,
              padding: 10,
              borderRadius: 12,
              border: "1px solid #f5c2c7",
              background: "#f8d7da",
            }}
          >
            <div style={{ fontWeight: 800, color: "#842029" }}>
              {adultOnlyUserMessage()}
            </div>
            <p style={{ margin: 0, color: "#842029", fontSize: 13, lineHeight: 1.6 }}>
              今後の運用状況に応じて受付を開始する可能性があります。
            </p>
          </div>
        )}

        {isMinor && minorsEnabled === true && (
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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#664d03",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={guardianConsent}
                onChange={(e) => setGuardianConsent(e.target.checked)}
              />
              保護者の同意を得ています
            </label>
          </div>
        )}
      </div>

      <div
        style={{
          padding: 12,
          border: "1px solid #e5e7eb",
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
            fontWeight: 700,
          }}
        >
          <input
            type="checkbox"
            checked={showAge}
            onChange={(e) => setShowAge(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            プロフィールに年齢を表示する
            <span
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 12,
                color: "#6b7280",
                fontWeight: 600,
              }}
            >
              OFFにすると、プロフィール詳細では年齢が表示されません。
            </span>
          </span>
        </label>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>趣味（任意）</label>
        <textarea
          value={hobbies}
          onChange={(e) => setHobbies(e.target.value)}
          placeholder="例：読書、散歩、ゲーム"
          rows={3}
          maxLength={500}
          style={{
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 8,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>ひとこと / 自己紹介（任意）</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="例：はじめまして。よろしくお願いします。"
          rows={4}
          maxLength={500}
          style={{
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 8,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>性別（必須）</label>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          required
        >
          <option value="">選択してください</option>
          <option value="male">男性</option>
          <option value="female">女性</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontWeight: 700 }}>プロフィール写真（任意）</label>
        <input
          type="file"
          accept="image/*"
          disabled={compressing || submitting}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            void handlePhotoChange(next);
            e.currentTarget.value = "";
          }}
        />

        {compressing ? (
          <p style={{ margin: 0, color: "#555", fontSize: 13 }}>
            画像を圧縮しています...
          </p>
        ) : null}

        {photoInfo ? (
          <p style={{ margin: 0, color: "#166534", fontSize: 13, fontWeight: 700 }}>
            {photoInfo}
          </p>
        ) : null}

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
          display: "grid",
          gap: 12,
        }}
      >
        {needsLegalConsent ? (
          <>
            {hasExistingProfile ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#92400e" }}>
                規約・ポリシーが更新されました。引き続きご利用いただくには、以下への同意が必要です。
              </p>
            ) : null}
            <LegalConsentCheckbox checked={legalAgreed} onChange={setLegalAgreed} />
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "#4b5563" }}>
            規約・ポリシー
          </p>
        )}
        <LegalDocumentLinks compact />
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
          <Link href={withDev("/settings")}>アカウント設定</Link>
        </p>
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
          {compressing ? "画像処理中..." : submitting ? "保存中..." : hasExistingProfile ? "更新する" : "保存する"}
        </button>

        <button
          type="button"
          onClick={() => router.push(withDev(returnTo))}
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