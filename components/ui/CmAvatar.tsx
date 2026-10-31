"use client";

import { useEffect, useMemo, useState } from "react";
import { isDefaultAvatarSrc } from "@/lib/defaultAvatar";
import { getMemberAvatarUrl } from "@/lib/memberProfileView";
import { DefaultAvatarMark } from "@/components/ui/DefaultAvatarMark";

type CmAvatarProps = {
  label: string;
  sizePx?: number;
  photoPath?: string | null;
  avatarUrl?: string | null;
  isMe?: boolean;
  className?: string;
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

export function CmAvatar({
  label,
  sizePx = 40,
  photoPath = null,
  avatarUrl = null,
  isMe = false,
  className,
}: CmAvatarProps) {
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
      className={["cm-avatar", className].filter(Boolean).join(" ")}
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
        border: isMe
          ? "2px solid var(--cm-online, #12a879)"
          : "1px solid var(--cm-border, #e5eaf2)",
        position: "relative",
      }}
      aria-label={label || undefined}
      aria-hidden={!label}
    >
      <DefaultAvatarMark
        className="cm-avatar-default"
        title={label ? `${label}のアバター` : undefined}
      />
      {photoSrc ? (
        <img
          src={photoSrc}
          alt=""
          width={sizePx}
          height={sizePx}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
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
