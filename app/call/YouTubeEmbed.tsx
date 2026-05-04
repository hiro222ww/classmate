"use client";

type Props = {
  url: string;
};

function extractYouTubeId(url: string) {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "");
    }

    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }

    return null;
  } catch {
    return null;
  }
}

export default function YouTubeEmbed({ url }: Props) {
  const videoId = extractYouTubeId(url);

  if (!videoId) return null;

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
        }}
      />
    </div>
  );
}