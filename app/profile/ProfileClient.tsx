"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device";

type Gender = "male" | "female";

type Profile = {
  device_id: string;
  display_name: string;
  birth_date: string; // YYYY-MM-DD
  gender: Gender;
  photo_path: string | null;
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

export default function ProfileClient() {
  const router = useRouter();

  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState(""); // YYYY-MM-DD
  const [gender, setGender] = useState<Gender>("male");
  const [guardianConsent, setGuardianConsent] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const age = useMemo(() => calcAge(birthDate), [birthDate]);
  const isMinor = age !== null && age < 18;

  // ★今は成人のみ
  const isAdult = age !== null && age >= 18;

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const canSubmit =
    displayName.trim().length > 0 &&
    isValidISODateString(birthDate) &&
    (gender === "male" || gender === "female") &&
    isAdult && // ★成人のみ利用
    !submitting;

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    (async () => {
      try {
        const res = await fetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
          method: "GET",
        });

        if (res.ok) {
          const data: Profile | null = await res.json();
          if (data) {
            setDisplayName(data.display_name ?? "");
            setBirthDate(isValidISODateString(data.birth_date) ? data.birth_date : "");
            setGender((data.gender as Gender) ?? "male");
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!displayName.trim()) {
      setErrorMsg("ニックネームを入力してください。");
      return;
    }
    if (!isValidISODateString(birthDate)) {
      setErrorMsg("生年月日は「YYYY-MM-DD」の形式で入力してください。");
      return;
    }
    if (gender !== "male" && gender !== "female") {
      setErrorMsg("性別を選択してください。");
      return;
    }

    // ★ここが成人限定の本体（UIは未成年表示を残すが、保存は不可）
    if (!isAdult) {
      setErrorMsg("現在は18歳以上の方のみご利用いただけます。");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("device_id", deviceId);
      fd.append("display_name", displayName.trim());
      fd.append("birth_date", birthDate);
      fd.append("gender", gender);

      // 未成年UIは残すため、値は送る（将来に備える）
      fd.append("guardian_consent", isMinor && guardianConsent ? "true" : "false");

      if (photoFile) fd.append("photo", photoFile);

      const res = await fetch("/api/profile", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        setErrorMsg(`保存に失敗しました。${msg ? `（${msg}）` : ""}`);
        return;
      }

      alert("プロフィールを保存しました");
      // 次の導線：テーマ/転校に行かせたいならここを変更
      router.push("/class/select");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>読み込み中...</p>;

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      {errorMsg && (
        <div style={{ padding: 10, border: "1px solid #f5c2c7", background: "#f8d7da", borderRadius: 10 }}>
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

        {/* 未成年UIは残す */}
        {isMinor && (
          <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 12, border: "1px solid #ffeeba", background: "#fff3cd" }}>
            <div style={{ fontWeight: 800, color: "#664d03" }}>
              現在は18歳以上のみ利用できます
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#664d’03" as any }}>
              <input
                type="checkbox"
                checked={guardianConsent}
                onChange={(e) => setGuardianConsent(e.target.checked)}
              />
              保護者の同意を得ています（将来のためのUI）
            </label>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              ※ 未成年向け機能は準備中です。公開時は安全設計（年齢ゾーン分離等）を入れます。
            </div>
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
        <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
        {photoPreviewUrl && (
          <img
            src={photoPreviewUrl}
            alt="preview"
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: 12,
              border: "1px solid #ddd",
            }}
          />
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "none",
          background: canSubmit ? "#111" : "#999",
          color: "#fff",
          fontWeight: 800,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {submitting ? "保存中..." : "保存"}
      </button>

      {!isAdult && birthDate && (
        <p style={{ margin: 0, fontSize: 12, color: "#842029" }}>
          ※ 現在は18歳以上のみ利用できます。
        </p>
      )}
    </form>
  );
}
