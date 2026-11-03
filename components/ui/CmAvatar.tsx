"use client";

import { DefaultAvatarMark } from "@/components/ui/DefaultAvatarMark";
import { useAvatarPhotoSrc } from "@/hooks/useAvatarPhotoSrc";

type CmAvatarProps = {
  label: string;
  sizePx?: number;
  photoPath?: string | null;
  avatarUrl?: string | null;
  isMe?: boolean;
  className?: string;
};

export function CmAvatar({
  label,
  sizePx = 40,
  photoPath = null,
  avatarUrl = null,
  isMe = false,
  className,
}: CmAvatarProps) {
  const { photoSrc, showPhoto, onLoad, onError, imgRef } = useAvatarPhotoSrc({
    photoPath,
    avatarUrl,
  });

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
          ref={imgRef}
          src={photoSrc}
          alt=""
          width={sizePx}
          height={sizePx}
          decoding="async"
          onLoad={onLoad}
          onError={onError}
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
