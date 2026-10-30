"use client";

import { useMemo, useState } from "react";
import { getMemberAvatarUrl } from "@/lib/memberProfileView";

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
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initial = (label.trim()[0] ?? "?").toUpperCase();

  const src = useMemo(() => {
    if (failed) return "/default-avatar.jpg";
    const direct = String(avatarUrl ?? "").trim();
    if (direct) return direct;
    return getMemberAvatarUrl(photoPath);
  }, [avatarUrl, failed, photoPath]);

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
        fontSize: Math.max(11, Math.round(sizePx * 0.34)),
        fontWeight: 900,
        color: "var(--cm-muted, #64748b)",
        overflow: "hidden",
        flexShrink: 0,
        border: isMe
          ? "2px solid var(--cm-online, #12a879)"
          : "1px solid var(--cm-border, #e5eaf2)",
        position: "relative",
      }}
      aria-hidden={!label}
    >
      {!loaded ? <span>{initial}</span> : null}
      <img
        src={src}
        alt=""
        width={sizePx}
        height={sizePx}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!failed) setFailed(true);
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  );
}
