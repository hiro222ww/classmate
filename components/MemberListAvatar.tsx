"use client";

import { useEffect, useMemo, useState } from "react";
import { debugVoiceThrottle } from "@/lib/debugVoiceLog";
import { isDefaultAvatarSrc } from "@/lib/defaultAvatar";
import { getMemberAvatarUrl } from "@/lib/memberProfileView";
import { DefaultAvatarMark } from "@/components/ui/DefaultAvatarMark";

type MemberListAvatarProps = {
  photoPath?: string | null;
  avatarUrl?: string | null;
  label: string;
  sizePx: number;
  isMe?: boolean;
  eager?: boolean;
};

function resolvePhotoSrc(
  avatarUrl: string | null | undefined,
  photoPath: string | null | undefined
): string | null {
  const direct = String(avatarUrl ?? "").trim();
  if (direct) {
    return isDefaultAvatarSrc(direct) ? null : direct;
  }
  const path = String(photoPath ?? "").trim();
  if (!path) return null;
  const resolved = getMemberAvatarUrl(path);
  return isDefaultAvatarSrc(resolved) ? null : resolved;
}

export default function MemberListAvatar({
  photoPath,
  avatarUrl,
  label,
  sizePx,
  isMe = false,
  eager = false,
}: MemberListAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [avatarUrl, photoPath]);

  const photoSrc = useMemo(
    () => (failed ? null : resolvePhotoSrc(avatarUrl, photoPath)),
    [avatarUrl, failed, photoPath]
  );
  const showPhoto = Boolean(photoSrc) && loaded;

  return (
    <div
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: "50%",
        background: "var(--cm-blue-soft, #e7f2ff)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
        border: isMe ? "2px solid #22c55e" : "1px solid #d1d5db",
        position: "relative",
      }}
      aria-label={label || undefined}
    >
      <DefaultAvatarMark title={label ? `${label}のアバター` : undefined} />
      {photoSrc ? (
        <img
          src={photoSrc}
          alt={label}
          width={sizePx}
          height={sizePx}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!failed) {
              debugVoiceThrottle(
                `avatar-fail:${label.slice(0, 12)}`,
                10_000,
                "members",
                "avatar_load_failed",
                {
                  label: label.slice(0, 24),
                  hasPhoto: Boolean(photoPath),
                }
              );
            }
            setFailed(true);
            setLoaded(false);
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: showPhoto ? 1 : 0,
          }}
        />
      ) : null}
    </div>
  );
}
