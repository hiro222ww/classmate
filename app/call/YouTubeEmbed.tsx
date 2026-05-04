"use client";

type Props = {
  url: string;
};

function extractYouTubeId(input: string) {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);

    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").split("?")[0];
    }

    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;

      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.replace("/shorts/", "").split("/")[0];
      }

      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.replace("/embed/", "").split("/")[0];
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default function YouTubeEmbed({ url }: Props) {
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          background: "#fef2f2",
          color: "#991b1b",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        YouTubeのURLを認識できません
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        borderRadius: 18,
        overflow: "hidden",
        background: "#000",
        aspectRatio: "16 / 9",
      }}
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
      />
    </div>
  );
}