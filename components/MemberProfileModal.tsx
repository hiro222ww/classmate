"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  fetchMemberProfile,
  getMemberAvatarUrl,
  isValidMemberProfileTarget,
  normalizeMemberDeviceId,
  type MemberProfileTarget,
} from "@/lib/memberProfileView";
import {
  formatOptionalProfileText,
  formatProfileAgeLabel,
  formatProfileGenderLabel,
  PROFILE_UNSET_LABEL,
} from "@/lib/profileClient";
import { withDev } from "@/lib/withDev";
import {
  buildCurrentPathReturnTo,
  buildProfileEditPath,
  sanitizeReturnTo,
} from "@/lib/profileNavigation";

type MemberProfileModalProps = {
  target: MemberProfileTarget | null;
  onClose: () => void;
  returnTo?: string;
};

export default function MemberProfileModal({
  target,
  onClose,
  returnTo,
}: MemberProfileModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [age, setAge] = useState<number | null>(null);
  const [showAgeSetting, setShowAgeSetting] = useState(true);
  const [gender, setGender] = useState<string | null>(null);
  const [hobbies, setHobbies] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);

  const profileEditHref = useMemo(() => {
    const safeReturnTo = sanitizeReturnTo(
      returnTo ?? buildCurrentPathReturnTo(pathname, searchParams.toString())
    );
    return withDev(buildProfileEditPath(safeReturnTo));
  }, [pathname, returnTo, searchParams]);

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
      setShowAgeSetting(true);
      setGender(null);
      setHobbies(null);
      setBio(null);
      setProfileComplete(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError("");
    setDisplayName(
      String(target.displayName ?? "").trim() || PROFILE_UNSET_LABEL
    );
    setPhotoPath(target.photoPath ?? null);
    setAge(null);
    setShowAgeSetting(true);
    setGender(null);
    setHobbies(null);
    setBio(null);
    setProfileComplete(false);

    void fetchMemberProfile(target)
      .then((profile) => {
        if (cancelled) return;

        if (!profile) {
          setError("プロフィールを取得できませんでした");
          setDisplayName(PROFILE_UNSET_LABEL);
          return;
        }

        const complete = profile.profile_complete;
        setProfileComplete(complete);
        setDisplayName(
          String(profile.display_name ?? "").trim() || PROFILE_UNSET_LABEL
        );
        setPhotoPath(profile.photo_path);
        setAge(profile.age);
        setShowAgeSetting(profile.show_age !== false);
        setGender(profile.gender);
        setHobbies(profile.hobbies);
        setBio(profile.bio);
      })
      .catch(() => {
        if (!cancelled) {
          setError("プロフィールを取得できませんでした");
          setDisplayName(PROFILE_UNSET_LABEL);
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
  const ageLabel = formatProfileAgeLabel(age);
  const genderLabel = formatProfileGenderLabel(gender, profileComplete);
  const hobbiesLabel = formatOptionalProfileText(hobbies);
  const bioLabel = formatOptionalProfileText(bio);
  const showAgeRow = isSelf ? showAgeSetting : age != null;
  const showGenderRow = isSelf || genderLabel !== PROFILE_UNSET_LABEL;
  const showHobbiesRow =
    isSelf || (hobbiesLabel !== PROFILE_UNSET_LABEL && Boolean(hobbies?.trim()));
  const showBioRow =
    isSelf || (bioLabel !== PROFILE_UNSET_LABEL && Boolean(bio?.trim()));
  const unsetStyle = { color: "#6b7280" as const };
  const setStyle = { color: "#111827" as const };

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

        {!loading ? (
          <dl
            style={{
              marginTop: 18,
              display: "grid",
              gap: 12,
            }}
          >
            {showAgeRow ? (
              <div>
                <dt style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  年齢
                </dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    fontSize: 15,
                    fontWeight: 800,
                    ...(ageLabel === PROFILE_UNSET_LABEL ? unsetStyle : setStyle),
                  }}
                >
                  {ageLabel}
                </dd>
              </div>
            ) : null}

            {showGenderRow ? (
              <div>
                <dt style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  性別
                </dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    fontSize: 15,
                    fontWeight: 800,
                    ...(genderLabel === PROFILE_UNSET_LABEL ? unsetStyle : setStyle),
                  }}
                >
                  {genderLabel}
                </dd>
              </div>
            ) : null}

            {showHobbiesRow ? (
              <div>
                <dt style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  趣味
                </dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    ...(hobbiesLabel === PROFILE_UNSET_LABEL ? unsetStyle : setStyle),
                  }}
                >
                  {hobbiesLabel}
                </dd>
              </div>
            ) : null}

            {showBioRow ? (
              <div>
                <dt style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                  ひとこと
                </dt>
                <dd
                  style={{
                    margin: "4px 0 0",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    ...(bioLabel === PROFILE_UNSET_LABEL ? unsetStyle : setStyle),
                  }}
                >
                  {bioLabel}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {isSelf && !loading ? (
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(profileEditHref);
              }}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {profileComplete ? "プロフィールを編集" : "プロフィールを登録"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
