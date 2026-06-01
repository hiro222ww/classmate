"use client";

import { useEffect, useState } from "react";
import {
  fetchMemberProfile,
  formatGenderLabel,
  getMemberAvatarUrl,
  isValidMemberProfileTarget,
  normalizeMemberDeviceId,
  type MemberProfileTarget,
} from "@/lib/memberProfileView";
import { formatMemberDisplayName } from "@/lib/resolveDisplayName";

type MemberProfileModalProps = {
  target: MemberProfileTarget | null;
  onClose: () => void;
};

export default function MemberProfileModal({
  target,
  onClose,
}: MemberProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  useEffect(() => {
    if (!target || !isValidMemberProfileTarget(target)) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [target?.deviceId, onClose]);

  useEffect(() => {
    if (!target || !isValidMemberProfileTarget(target)) {
      setLoading(false);
      setError("");
      setDisplayName("");
      setPhotoPath(null);
      setAge(null);
      setGender(null);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError("");
    setDisplayName(
      formatMemberDisplayName({ display_name: target.displayName })
    );
    setPhotoPath(target.photoPath ?? null);
    setAge(null);
    setGender(null);

    void fetchMemberProfile(target)
      .then((profile) => {
        if (cancelled) return;

        if (!profile) {
          setError("プロフィールを取得できませんでした");
          return;
        }

        setDisplayName(profile.display_name);
        setPhotoPath(profile.photo_path);
        setAge(profile.age);
        setGender(formatGenderLabel(profile.gender));
      })
      .catch(() => {
        if (!cancelled) {
          setError("プロフィールを取得できませんでした");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target || !isValidMemberProfileTarget(target)) return null;

  const isSelf =
    normalizeMemberDeviceId(target.deviceId) ===
    normalizeMemberDeviceId(target.viewerDeviceId);
  const avatarUrl = getMemberAvatarUrl(photoPath);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-profile-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.45)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          borderRadius: 18,
          background: "#fff",
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
          padding: 20,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h2
            id="member-profile-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 900 }}
          >
            プロフィール
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: 999,
              width: 36,
              height: 36,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <img
            src={avatarUrl}
            alt={displayName}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/default-avatar.jpg";
            }}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #e5e7eb",
              background: "#f3f4f6",
            }}
          />

          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: "#111827",
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {displayName}
            {isSelf ? "（あなた）" : ""}
          </div>
        </div>

        {loading ? (
          <p style={{ marginTop: 18, fontSize: 13, color: "#6b7280" }}>
            読み込み中…
          </p>
        ) : null}

        {error ? (
          <p
            style={{
              marginTop: 18,
              fontSize: 13,
              color: "#b91c1c",
              fontWeight: 700,
            }}
          >
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <dl
            style={{
              marginTop: 18,
              display: "grid",
              gap: 12,
            }}
          >
            {age != null ? (
              <div>
                <dt style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  年齢
                </dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#111827",
                  }}
                >
                  {age}歳
                </dd>
              </div>
            ) : null}

            {gender ? (
              <div>
                <dt style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  性別
                </dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#111827",
                  }}
                >
                  {gender}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
