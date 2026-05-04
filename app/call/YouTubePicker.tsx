"use client";

import { useState } from "react";
import YouTubeEmbed from "./YouTubeEmbed";

type YouTubeItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
};

export default function YouTubePicker() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<YouTubeItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? "search_failed");
      }

      setItems(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "検索に失敗しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>一緒に見る</div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="YouTubeを検索"
          style={{
            flex: 1,
            minWidth: 220,
            border: "1px solid #d1d5db",
            borderRadius: 999,
            padding: "10px 12px",
          }}
        />

        <button
          type="button"
          onClick={() => void search()}
          disabled={!query.trim() || loading}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #111",
            background: !query.trim() || loading ? "#9ca3af" : "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: !query.trim() || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "検索中…" : "検索"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 10,
            color: "#991b1b",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {error}
        </div>
      ) : null}

      {selectedVideoId ? (
        <YouTubeEmbed url={`https://www.youtube.com/watch?v=${selectedVideoId}`} />
      ) : null}

      {items.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {items.map((item) => (
            <button
              key={item.videoId}
              type="button"
              onClick={() => setSelectedVideoId(item.videoId)}
              style={{
                textAlign: "left",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                background:
                  selectedVideoId === item.videoId ? "#eff6ff" : "#fff",
                padding: 8,
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 9",
                    objectFit: "cover",
                    borderRadius: 10,
                    display: "block",
                    background: "#000",
                  }}
                />
              ) : null}

              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  fontWeight: 900,
                  lineHeight: 1.35,
                  color: "#111827",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {item.title}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#6b7280",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.channelTitle}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 16,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            color: "#6b7280",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          検索して動画を選ぶと、ここで一緒に見られます。
        </div>
      )}
    </section>
  );
}