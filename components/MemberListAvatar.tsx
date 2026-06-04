"use client";

import { useMemo, useState } from "react";
import { debugVoiceThrottle } from "@/lib/debugVoiceLog";
import { getMemberAvatarUrl } from "@/lib/memberProfileView";

type MemberListAvatarProps = {
  photoPath?: string | null;
  avatarUrl?: string | null;
  label: string;
  sizePx: number;
  isMe?: boolean;
  eager?: boolean;
};

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

  const src = useMemo(() => {
    if (failed) return "/default-avatar.jpg";
    const direct = String(avatarUrl ?? "").trim();
    if (direct) return direct;
    return getMemberAvatarUrl(photoPath);
  }, [avatarUrl, failed, photoPath]);

  const initial = (label.trim()[0] ?? "?").toUpperCase();

  return (
    <div
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: "50%",
        background: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(11, Math.round(sizePx * 0.34)),
        fontWeight: 900,
        color: "#6b7280",
        overflow: "hidden",
        flexShrink: 0,
        border: isMe ? "2px solid #22c55e" : "1px solid #d1d5db",
        position: "relative",
      }}
    >
      {!loaded && !failed ? (
        <span aria-hidden style={{ userSelect: "none" }}>
          {initial}
        </span>
      ) : null}
      <img
        src={src}
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
          setLoaded(true);
        }}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          position: loaded ? "relative" : "absolute",
          inset: 0,
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  );
}
